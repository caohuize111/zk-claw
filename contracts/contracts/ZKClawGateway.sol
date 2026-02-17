// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IHalo2Verifier.sol";
import "./MockNFA.sol";
import "./MockValidationRegistry.sol";
import "./MockDePINOracle.sol";

/// @title ZKClawGateway - Verifiable Intelligence Gateway for Sovereign AI Agents
/// @notice Core orchestrator: accepts ZK proofs of ML inference, verifies on-chain,
///         records results, and updates NFA reputation + ERC-8004 validation scores.
/// @dev Integrates EZKL Halo2 verifier, BAP-578 (MockNFA), ERC-8004 (MockValidationRegistry),
///      DePIN hardware signature verification, and BNB Greenfield storage anchoring.
contract ZKClawGateway {

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
    MockNFA public nfa;
    MockValidationRegistry public validationRegistry;
    MockDePINOracle public depinOracle;
    address public admin;

    InferenceRecord[] public records;
    mapping(uint256 => uint256[]) public agentRecords;  // agentId => recordIndices
    mapping(bytes32 => bool) public usedProofs;          // prevent replay
    mapping(uint256 => StorageAnchor) public recordStorage; // recordIndex => Greenfield anchor

    uint256 public totalVerifications;
    uint256 public totalClaimsTriggered;
    uint256 public totalAuthenticated;  // count of hardware-authenticated submissions

    event InferenceSubmitted(
        uint256 indexed agentId,
        uint256 indexed recordIndex,
        bytes32 proofHash,
        bool verified,
        uint8 decision,
        bool dataAuthentic
    );
    event VerifierUpdated(address newVerifier);
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
        nfa = MockNFA(_nfa);
        validationRegistry = MockValidationRegistry(_validationRegistry);
        depinOracle = MockDePINOracle(_depinOracle);
        admin = msg.sender;
    }

    /// @notice Submit a ZK-verified ML inference result with dual trust verification
    /// @dev Checks both: (1) ZKML proof validity, (2) DePIN data hardware signature
    /// @param proof The EZKL proof bytes
    /// @param publicInstances The public inputs/outputs from the ZKML circuit
    /// @param agentId The NFA token ID performing the inference
    /// @param stationId The DePIN station ID that provided input data
    function submitVerifiedInference(
        bytes calldata proof,
        uint256[] calldata publicInstances,
        uint256 agentId,
        uint256 stationId
    ) external {
        // Prevent proof replay
        bytes32 proofHash = keccak256(proof);
        require(!usedProofs[proofHash], "Proof already used");
        usedProofs[proofHash] = true;

        // Verify the ZK proof on-chain
        bool verified = false;
        if (address(verifier) != address(0)) {
            try verifier.verifyProof(proof, publicInstances) returns (bool result) {
                verified = result;
            } catch {
                verified = false;
            }
        }

        // Extract decision from public instances
        // EZKL public instances layout: [input0, input1, input2, input3, output0, output1]
        // output0 > output1 => decision = 0 (normal), else decision = 1 (claim)
        uint8 decision = 0;
        if (publicInstances.length >= 6) {
            decision = publicInstances[5] > publicInstances[4] ? 1 : 0;
        }

        // Check DePIN data authenticity (hardware signature verification)
        bytes32 inputHash = bytes32(0);
        bool dataAuthentic = false;
        if (address(depinOracle) != address(0)) {
            try depinOracle.getLatestData(stationId) returns (MockDePINOracle.WeatherData memory data) {
                inputHash = data.dataHash;
                dataAuthentic = data.signatureVerified;
            } catch {}
        }

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
            ) {} catch {}
            try validationRegistry.validationResponse(
                requestHash, 100, "zkml-verified", proofHash, "zkml"
            ) {} catch {}
        }

        emit InferenceSubmitted(agentId, recordIndex, proofHash, verified, decision, dataAuthentic);
    }

    /// @notice Submit inference with off-chain verified proof (fallback when verifier too large)
    /// @dev Admin attests that the proof was verified off-chain via EZKL
    function submitOffchainVerified(
        bytes32 proofHash,
        uint256[] calldata publicInstances,
        uint256 agentId,
        uint256 stationId,
        uint8 decision
    ) external onlyAdmin {
        require(!usedProofs[proofHash], "Proof already used");
        usedProofs[proofHash] = true;

        bytes32 inputHash = bytes32(0);
        bool dataAuthentic = false;
        if (address(depinOracle) != address(0)) {
            try depinOracle.getLatestData(stationId) returns (MockDePINOracle.WeatherData memory data) {
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

        try nfa.incrementReputation(agentId) {} catch {}

        emit InferenceSubmitted(agentId, recordIndex, proofHash, true, decision, dataAuthentic);
    }

    // --- Greenfield Storage Anchoring ---

    /// @notice Anchor inference data to BNB Greenfield decentralized storage
    /// @dev Stores the Greenfield object URI and content hash for a given inference record.
    ///      Raw sensor data + proof artifacts stored on Greenfield; only hash on-chain.
    /// @param recordIndex The inference record to anchor
    /// @param greenFieldURI The Greenfield object URI (e.g., "gnfd://zk-claw-bucket/proof-001")
    /// @param contentHash keccak256 of the stored content for integrity verification
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

    /// @notice Check if a record has been anchored to Greenfield
    function isAnchored(uint256 recordIndex) external view returns (bool) {
        return recordStorage[recordIndex].timestamp > 0;
    }

    /// @notice Get Greenfield storage details for a record
    function getStorageAnchor(uint256 recordIndex) external view returns (StorageAnchor memory) {
        return recordStorage[recordIndex];
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
        MockNFA.PredictionProfile memory profile = nfa.getProfile(agentId);
        return profile.reputationScore;
    }

    function totalRecords() external view returns (uint256) {
        return records.length;
    }

    // --- Admin ---

    function setVerifier(address _verifier) external onlyAdmin {
        verifier = IHalo2Verifier(_verifier);
        emit VerifierUpdated(_verifier);
    }

    function transferAdmin(address newAdmin) external onlyAdmin {
        admin = newAdmin;
    }
}
