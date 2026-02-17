// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IHalo2Verifier.sol";
import "./NFA.sol";
import "./ValidationRegistry.sol";
import "./interfaces/IDePINOracle.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title ZKClawGateway - Verifiable Intelligence Gateway for Sovereign AI Agents
/// @notice Core orchestrator: accepts ZK proofs of ML inference, verifies on-chain via
///         real EZKL Halo2Verifier, records results, and updates NFA reputation +
///         ERC-8004 validation scores.
/// @dev Integrates EZKL Halo2 verifier, BAP-578 (NFA), ERC-8004 (ValidationRegistry),
///      DePIN hardware signature verification, and BNB Greenfield storage anchoring.
contract ZKClawGateway is ReentrancyGuard {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    // ── BN254 Field Constants ──
    // EZKL uses BN254 scalar field; negative numbers wrap around p
    uint256 constant BN254_P = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    uint256 constant HALF_P = BN254_P / 2;

    // ── Normalization Parameters (x1000 precision from norm_params.json) ──
    // Used to cross-validate that ZK public instances match DePIN raw data
    int256 constant NORM_MIN_0 = -9823;   // temperature min
    int256 constant NORM_MIN_1 = 10001;   // humidity min
    int256 constant NORM_MIN_2 = 5;       // windSpeed min
    int256 constant NORM_MIN_3 = 72;      // rainfall min
    int256 constant NORM_MAX_0 = 44984;   // temperature max
    int256 constant NORM_MAX_1 = 99960;   // humidity max
    int256 constant NORM_MAX_2 = 149903;  // windSpeed max
    int256 constant NORM_MAX_3 = 299838;  // rainfall max
    uint256 constant EZKL_SCALE = 8192;   // 2^13
    uint256 constant NORM_TOLERANCE = 3;  // allow ±3 quantization error
    uint256 constant DATA_FRESHNESS_WINDOW = 1800;  // 30 minutes max staleness

    struct InferenceRecord {
        uint256 agentId;
        bytes32 proofHash;          // keccak256 of the proof bytes
        bytes32 inputHash;          // keccak256 of DePIN data
        uint256[] publicInstances;  // EZKL public instances (inputs + outputs)
        uint256 timestamp;
        bool verified;
        uint8 decision;             // 0 = normal, 1 = claim triggered
        bool dataAuthentic;         // true if DePIN data passed hardware signature check
    }

    struct StorageAnchor {
        string greenFieldURI;       // e.g., "gnfd://zk-claw-bucket/proof-0x1234"
        bytes32 contentHash;        // keccak256 of the stored content
        uint256 timestamp;
    }

    IHalo2Verifier public verifier;
    NFA public nfa;
    ValidationRegistry public validationRegistry;
    IDePINOracle public depinOracle;
    address public admin;
    address public pendingAdmin;

    InferenceRecord[] public records;
    mapping(uint256 => uint256[]) public agentRecords;  // agentId => recordIndices
    mapping(bytes32 => bool) public usedProofs;          // prevent replay
    mapping(uint256 => StorageAnchor) public recordStorage; // recordIndex => Greenfield anchor

    uint256 public totalVerifications;
    uint256 public totalClaimsTriggered;
    uint256 public totalAuthenticated;  // count of hardware-authenticated submissions

    // Auto claim payout
    mapping(uint256 => address) public claimPayoutAddresses;
    mapping(uint256 => uint256) public claimPayoutAmounts;

    // ── Crypto-Bound Device Registry (trustless inline verification) ──
    mapping(uint256 => address) public boundDevices;   // stationId => device EOA
    mapping(uint256 => uint256) public deviceNonces;   // stationId => nonce (replay protection)

    event InferenceSubmitted(
        uint256 indexed agentId,
        uint256 indexed recordIndex,
        bytes32 proofHash,
        bool verified,
        uint8 decision,
        bool dataAuthentic
    );
    event VerifierUpdated(address newVerifier);
    event ClaimPayoutTriggered(uint256 indexed agentId, address payoutAddress, uint256 amount);
    event AdminTransferInitiated(address indexed current, address indexed pending);
    event AdminTransferred(address indexed oldAdmin, address indexed newAdmin);
    event DeviceBound(uint256 indexed stationId, address indexed deviceAddress);
    event CryptoBoundInference(
        uint256 indexed agentId,
        uint256 indexed recordIndex,
        uint256 stationId,
        bytes32 dataHash
    );
    event ValidationRegistryError(uint256 indexed agentId, bytes32 proofHash, string reason);
    event DataAnchored(
        uint256 indexed recordIndex,
        string greenFieldURI,
        bytes32 contentHash
    );

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }

    constructor(
        address _verifier,
        address _nfa,
        address _validationRegistry,
        address _depinOracle
    ) {
        verifier = IHalo2Verifier(_verifier);
        nfa = NFA(payable(_nfa));
        validationRegistry = ValidationRegistry(_validationRegistry);
        depinOracle = IDePINOracle(_depinOracle);
        admin = msg.sender;
    }

    /// @notice Submit a ZK-verified ML inference result with dual trust verification
    /// @dev Checks both: (1) ZKML proof validity via Halo2Verifier, (2) DePIN data hardware signature
    /// @param proof The EZKL proof bytes
    /// @param publicInstances The public inputs/outputs from the ZKML circuit
    /// @param agentId The NFA token ID performing the inference
    /// @param stationId The DePIN station ID that provided input data
    function submitVerifiedInference(
        bytes calldata proof,
        uint256[] calldata publicInstances,
        uint256 agentId,
        uint256 stationId
    ) external nonReentrant {
        // Prevent proof replay
        bytes32 proofHash = keccak256(proof);
        require(!usedProofs[proofHash], "Proof already used");
        usedProofs[proofHash] = true;

        // Verify the ZK proof on-chain via real Halo2Verifier
        bool verified = false;
        if (address(verifier) != address(0)) {
            try verifier.verifyProof(proof, publicInstances) returns (bool result) {
                verified = result;
            } catch {
                verified = false;
            }
        }

        // Extract decision using BN254 signed comparison (Fix #5)
        uint8 decision = _extractDecision(publicInstances);

        // Check DePIN data authenticity + freshness + normalization consistency
        bytes32 inputHash = bytes32(0);
        bool dataAuthentic = false;
        if (address(depinOracle) != address(0)) {
            try depinOracle.getLatestData(stationId) returns (IDePINOracle.WeatherData memory data) {
                inputHash = data.dataHash;
                dataAuthentic = data.signatureVerified;

                // Freshness check: reject stale DePIN data
                if (data.timestamp > 0 && block.timestamp > data.timestamp + DATA_FRESHNESS_WINDOW) {
                    dataAuthentic = false;
                }

                // Cross-validate: public instances must match DePIN raw data after normalization
                if (dataAuthentic && publicInstances.length >= 4) {
                    bool normValid = _verifyNormalization(
                        publicInstances,
                        data.temperature,
                        data.humidity,
                        data.windSpeed,
                        data.rainfall
                    );
                    if (!normValid) dataAuthentic = false;
                }
            } catch {}
        }

        // Hard gate: both verifications must pass (closed loop)
        require(verified, "ZK proof verification failed");
        require(dataAuthentic, "DePIN data authentication failed");

        // Record the inference
        uint256 recordIndex = records.length;
        records.push(InferenceRecord({
            agentId: agentId,
            proofHash: proofHash,
            inputHash: inputHash,
            publicInstances: publicInstances,
            timestamp: block.timestamp,
            verified: verified,
            decision: decision,
            dataAuthentic: dataAuthentic
        }));
        agentRecords[agentId].push(recordIndex);

        totalVerifications++;
        if (decision == 1) {
            totalClaimsTriggered++;
        }
        if (dataAuthentic) {
            totalAuthenticated++;
        }

        // Update NFA reputation if verified
        if (verified) {
            try nfa.incrementReputation(agentId) {} catch {}
        }

        // Update ERC-8004 validation
        if (verified && address(validationRegistry) != address(0)) {
            bytes32 requestHash = keccak256(abi.encodePacked(
                agentId, proofHash, block.timestamp
            ));
            try validationRegistry.validationRequest(
                address(this), agentId, "zkml-inference", requestHash
            ) {} catch {
                emit ValidationRegistryError(agentId, proofHash, "validationRequest failed");
            }
            try validationRegistry.validationResponse(
                requestHash, 100, "zkml-verified", proofHash, "zkml"
            ) {} catch {
                emit ValidationRegistryError(agentId, proofHash, "validationResponse failed");
            }
        }

        // Auto claim payout: if decision is CLAIM and payout is configured, transfer from NFA
        if (decision == 1 && claimPayoutAddresses[agentId] != address(0) && claimPayoutAmounts[agentId] > 0) {
            try nfa.gatewayWithdraw(agentId, claimPayoutAmounts[agentId], claimPayoutAddresses[agentId]) {
                emit ClaimPayoutTriggered(agentId, claimPayoutAddresses[agentId], claimPayoutAmounts[agentId]);
            } catch {}
        }

        emit InferenceSubmitted(agentId, recordIndex, proofHash, verified, decision, dataAuthentic);
    }

    /// @notice Submit inference with off-chain verified proof (admin-attested fallback)
    /// @dev Admin attests that the proof was verified off-chain via EZKL
    function submitOffchainVerified(
        uint256[] calldata publicInstances,
        uint256 agentId,
        uint256 stationId
    ) external onlyAdmin nonReentrant {
        // Compute proofHash from publicInstances (Fix #6: prevent bypass)
        bytes32 proofHash = keccak256(abi.encodePacked(publicInstances));
        require(!usedProofs[proofHash], "Proof already used");
        usedProofs[proofHash] = true;

        // Compute decision from publicInstances (Fix #2: prevent admin abuse)
        uint256 decision = _extractDecision(publicInstances);

        bytes32 inputHash = bytes32(0);
        bool dataAuthentic = false;
        if (address(depinOracle) != address(0)) {
            try depinOracle.getLatestData(stationId) returns (IDePINOracle.WeatherData memory data) {
                inputHash = data.dataHash;
                dataAuthentic = data.signatureVerified;
            } catch {}
        }

        uint256 recordIndex = records.length;
        records.push(InferenceRecord({
            agentId: agentId,
            proofHash: proofHash,
            inputHash: inputHash,
            publicInstances: publicInstances,
            timestamp: block.timestamp,
            verified: true,
            decision: uint8(decision),
            dataAuthentic: dataAuthentic
        }));
        agentRecords[agentId].push(recordIndex);

        totalVerifications++;
        if (decision == 1) {
            totalClaimsTriggered++;
        }
        if (dataAuthentic) {
            totalAuthenticated++;
        }

        try nfa.incrementReputation(agentId) {} catch {}

        // Auto claim payout for offchain verified too
        if (decision == 1 && claimPayoutAddresses[agentId] != address(0) && claimPayoutAmounts[agentId] > 0) {
            try nfa.gatewayWithdraw(agentId, claimPayoutAmounts[agentId], claimPayoutAddresses[agentId]) {
                emit ClaimPayoutTriggered(agentId, claimPayoutAddresses[agentId], claimPayoutAmounts[agentId]);
            } catch {}
        }

        emit InferenceSubmitted(agentId, recordIndex, proofHash, true, uint8(decision), dataAuthentic);
    }

    // --- Greenfield Storage Anchoring ---

    /// @notice Anchor inference data to BNB Greenfield decentralized storage
    function anchorToGreenField(
        uint256 recordIndex,
        string calldata greenFieldURI,
        bytes32 contentHash
    ) external onlyAdmin {
        require(recordIndex < records.length, "Record does not exist");
        require(bytes(greenFieldURI).length > 0, "Empty URI");

        recordStorage[recordIndex] = StorageAnchor({
            greenFieldURI: greenFieldURI,
            contentHash: contentHash,
            timestamp: block.timestamp
        });

        emit DataAnchored(recordIndex, greenFieldURI, contentHash);
    }

    function isAnchored(uint256 recordIndex) external view returns (bool) {
        return recordStorage[recordIndex].timestamp > 0;
    }

    function getStorageAnchor(uint256 recordIndex) external view returns (StorageAnchor memory) {
        return recordStorage[recordIndex];
    }

    // --- Internal: BN254 Decision Extraction ---

    /// @notice Extract decision from EZKL public instances using BN254 signed comparison
    /// @dev EZKL represents negative logits as p - |value| (field wrap-around).
    ///      Values > HALF_P are negative. We compare signed values to determine decision.
    function _extractDecision(uint256[] calldata pi) internal pure returns (uint8) {
        if (pi.length < 6) return 0;
        // Convert field elements to signed integers
        int256 out0 = pi[4] > HALF_P ? int256(pi[4]) - int256(BN254_P) : int256(pi[4]);
        int256 out1 = pi[5] > HALF_P ? int256(pi[5]) - int256(BN254_P) : int256(pi[5]);
        return out1 > out0 ? 1 : 0;
    }

    // --- Internal: Normalization Cross-Validation ---

    /// @notice Verify that ZK public instances (normalized inputs) match DePIN raw data
    /// @dev DePIN oracle stores values in x100 format. We convert to x1000 to match
    ///      norm_params precision, then compute expected EZKL instances and compare.
    function _verifyNormalization(
        uint256[] calldata publicInstances,
        int256 temp100,
        uint256 humidity100,
        uint256 windSpeed100,
        uint256 rainfall100
    ) internal pure returns (bool) {
        if (publicInstances.length < 4) return false;

        // Bounds checking: reject extreme values that could cause overflow (Fix #5)
        // Values are in x100 units (e.g., temp100 = 2500 means 25.00 C)
        if (temp100 < -50_00 || temp100 > 100_00) return false;       // -50C to 100C
        if (humidity100 > 100_00) return false;                        // 0% to 100%
        if (windSpeed100 > 500_00) return false;                       // 0 to 500 km/h
        if (rainfall100 > 1000_00) return false;                       // 0 to 1000 mm

        // Convert DePIN x100 values to x1000 precision
        int256[4] memory raw = [
            temp100 * 10,
            int256(humidity100) * 10,
            int256(windSpeed100) * 10,
            int256(rainfall100) * 10
        ];

        int256[4] memory normMin = [NORM_MIN_0, NORM_MIN_1, NORM_MIN_2, NORM_MIN_3];
        int256[4] memory normMax = [NORM_MAX_0, NORM_MAX_1, NORM_MAX_2, NORM_MAX_3];

        for (uint256 i = 0; i < 4; i++) {
            int256 numerator = (raw[i] - normMin[i]) * int256(EZKL_SCALE);
            int256 denominator = normMax[i] - normMin[i];
            if (denominator == 0) return false;
            int256 expected = numerator / denominator;

            // Public instance for input is a small positive number (not BN254 wrapped)
            int256 actual = int256(publicInstances[i]);

            int256 diff = expected - actual;
            if (diff < 0) diff = -diff;
            if (uint256(diff) > NORM_TOLERANCE) return false;
        }
        return true;
    }

    // ═══════════════════════════════════════════════════════════════
    // CRYPTO-BOUND INFERENCE (Trustless End-to-End Verification)
    // ═══════════════════════════════════════════════════════════════

    /// @dev Pack DePIN weather data to avoid stack-too-deep
    struct DePINData {
        uint256 stationId;
        int256 temperature;    // Celsius * 100
        uint256 humidity;      // % * 100
        uint256 windSpeed;     // km/h * 100
        uint256 rainfall;      // mm * 100
    }

    /// @notice Register a DePIN device for crypto-bound inline verification
    function bindDevice(uint256 stationId, address deviceAddress) external onlyAdmin {
        require(deviceAddress != address(0), "Invalid device address");
        boundDevices[stationId] = deviceAddress;
        emit DeviceBound(stationId, deviceAddress);
    }

    /// @notice Trustless atomic verification: DePIN ECDSA signature + ZK proof + normalization
    ///         in a single transaction. No oracle read -- the Gateway IS the verifier.
    /// @dev This is the "holy grail" function: device signature proves data origin,
    ///      ZK proof proves honest AI inference, normalization cross-check binds them.
    function submitCryptoBoundInference(
        bytes calldata proof,
        uint256[] calldata publicInstances,
        uint256 agentId,
        DePINData calldata data,
        bytes calldata deviceSignature
    ) external nonReentrant {
        // 1. Verify device + signature + nonce
        bytes32 dataHash = _verifyCryptoBinding(data, deviceSignature);

        // 2. Prevent proof replay
        bytes32 proofHash = keccak256(proof);
        require(!usedProofs[proofHash], "Proof already used");
        usedProofs[proofHash] = true;

        // 3. Verify ZK proof on-chain via Halo2Verifier
        _requireZKProof(proof, publicInstances);

        // 4. Cross-validate normalization
        require(
            _verifyNormalization(publicInstances, data.temperature, data.humidity, data.windSpeed, data.rainfall),
            "Normalization mismatch"
        );

        // 5. Extract decision + record + side effects
        uint8 decision = _extractDecision(publicInstances);
        uint256 recordIndex = _recordInference(agentId, proofHash, dataHash, publicInstances, decision, true);

        // 6. Auto claim payout
        _handleAutoPayout(agentId, decision);

        emit CryptoBoundInference(agentId, recordIndex, data.stationId, dataHash);
        emit InferenceSubmitted(agentId, recordIndex, proofHash, true, decision, true);
    }

    /// @notice Get the current nonce for a station (callers need this to construct the data hash)
    function getDeviceNonce(uint256 stationId) external view returns (uint256) {
        return deviceNonces[stationId];
    }

    /// @dev Verify device registration, compute data hash with nonce, verify ECDSA signature
    function _verifyCryptoBinding(
        DePINData calldata data,
        bytes calldata deviceSignature
    ) internal returns (bytes32 dataHash) {
        address device = boundDevices[data.stationId];
        require(device != address(0), "Station not bound");

        uint256 nonce = deviceNonces[data.stationId];
        dataHash = keccak256(abi.encodePacked(
            data.stationId, data.temperature, data.humidity, data.windSpeed, data.rainfall, nonce
        ));
        deviceNonces[data.stationId] = nonce + 1;

        address recovered = dataHash.toEthSignedMessageHash().recover(deviceSignature);
        require(recovered == device, "Invalid device signature");
    }

    /// @dev Verify ZK proof, revert if invalid
    function _requireZKProof(bytes calldata proof, uint256[] calldata publicInstances) internal {
        bool verified = false;
        if (address(verifier) != address(0)) {
            try verifier.verifyProof(proof, publicInstances) returns (bool result) {
                verified = result;
            } catch {}
        }
        require(verified, "ZK proof verification failed");
    }

    /// @dev Record inference, update counters, reputation, and ERC-8004
    function _recordInference(
        uint256 agentId,
        bytes32 proofHash,
        bytes32 inputHash,
        uint256[] calldata publicInstances,
        uint8 decision,
        bool dataAuthentic
    ) internal returns (uint256 recordIndex) {
        recordIndex = records.length;
        records.push(InferenceRecord({
            agentId: agentId,
            proofHash: proofHash,
            inputHash: inputHash,
            publicInstances: publicInstances,
            timestamp: block.timestamp,
            verified: true,
            decision: decision,
            dataAuthentic: dataAuthentic
        }));
        agentRecords[agentId].push(recordIndex);

        totalVerifications++;
        if (decision == 1) totalClaimsTriggered++;
        if (dataAuthentic) totalAuthenticated++;

        try nfa.incrementReputation(agentId) {} catch {}

        if (address(validationRegistry) != address(0)) {
            bytes32 requestHash = keccak256(abi.encodePacked(agentId, proofHash, block.timestamp));
            try validationRegistry.validationRequest(
                address(this), agentId, "zkml-crypto-bound", requestHash
            ) {} catch {
                emit ValidationRegistryError(agentId, proofHash, "validationRequest failed");
            }
            try validationRegistry.validationResponse(
                requestHash, 100, "crypto-bound-verified", proofHash, "zkml"
            ) {} catch {
                emit ValidationRegistryError(agentId, proofHash, "validationResponse failed");
            }
        }
    }

    /// @dev Handle auto claim payout if decision == 1
    function _handleAutoPayout(uint256 agentId, uint8 decision) internal {
        if (decision == 1 && claimPayoutAddresses[agentId] != address(0) && claimPayoutAmounts[agentId] > 0) {
            try nfa.gatewayWithdraw(agentId, claimPayoutAmounts[agentId], claimPayoutAddresses[agentId]) {
                emit ClaimPayoutTriggered(agentId, claimPayoutAddresses[agentId], claimPayoutAmounts[agentId]);
            } catch {}
        }
    }

    // --- View Functions ---

    function getRecord(uint256 index) external view returns (InferenceRecord memory) {
        return records[index];
    }

    function getAgentRecordCount(uint256 agentId) external view returns (uint256) {
        return agentRecords[agentId].length;
    }

    function getAgentRecords(uint256 agentId) external view returns (uint256[] memory) {
        return agentRecords[agentId];
    }

    function getAgentScore(uint256 agentId) external view returns (uint256) {
        NFA.PredictionProfile memory profile = nfa.getProfile(agentId);
        return profile.reputationScore;
    }

    function totalRecords() external view returns (uint256) {
        return records.length;
    }

    // --- Admin ---

    function setClaimPayout(uint256 agentId, address payoutAddress, uint256 amount) external onlyAdmin {
        claimPayoutAddresses[agentId] = payoutAddress;
        claimPayoutAmounts[agentId] = amount;
    }

    function setVerifier(address _verifier) external onlyAdmin {
        verifier = IHalo2Verifier(_verifier);
        emit VerifierUpdated(_verifier);
    }

    function transferAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "Zero address");
        pendingAdmin = newAdmin;
        emit AdminTransferInitiated(admin, newAdmin);
    }

    function acceptAdmin() external {
        require(msg.sender == pendingAdmin, "Not pending admin");
        address oldAdmin = admin;
        admin = pendingAdmin;
        pendingAdmin = address(0);
        emit AdminTransferred(oldAdmin, admin);
    }
}
