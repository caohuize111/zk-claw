// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import "../interfaces/IHalo2Verifier.sol";

/// @title ZKClawGatewayV2 - UUPS upgradeable version of ZKClawGateway
/// @notice Demonstrates upgradeability pattern for the gateway.
///         Uses initialize() instead of constructor for proxy compatibility.
contract ZKClawGatewayV2 is Initializable, UUPSUpgradeable {

    // ── BN254 Field Constants ──
    uint256 constant BN254_P = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    uint256 constant HALF_P = BN254_P / 2;

    struct InferenceRecord {
        uint256 agentId;
        bytes32 proofHash;
        uint256 timestamp;
        bool verified;
        uint8 decision;
    }

    IHalo2Verifier public verifier;
    address public nfa;
    address public validationRegistry;
    address public depinOracle;
    address public admin;

    InferenceRecord[] public records;
    uint256 public totalVerifications;

    event InferenceSubmitted(uint256 indexed agentId, uint256 indexed recordIndex, bytes32 proofHash, bool verified, uint8 decision);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _verifier,
        address _nfa,
        address _validationRegistry,
        address _depinOracle
    ) public initializer {
        verifier = IHalo2Verifier(_verifier);
        nfa = _nfa;
        validationRegistry = _validationRegistry;
        depinOracle = _depinOracle;
        admin = msg.sender;
    }

    /// @notice Simplified submitVerifiedInference for upgrade demonstration
    function submitVerifiedInference(
        bytes calldata proof,
        uint256[] calldata publicInstances,
        uint256 agentId
    ) external {
        bytes32 proofHash = keccak256(proof);

        bool verified = false;
        if (address(verifier) != address(0)) {
            try verifier.verifyProof(proof, publicInstances) returns (bool result) {
                verified = result;
            } catch {}
        }

        uint8 decision = _extractDecision(publicInstances);

        uint256 recordIndex = records.length;
        records.push(InferenceRecord({
            agentId: agentId,
            proofHash: proofHash,
            timestamp: block.timestamp,
            verified: verified,
            decision: decision
        }));
        totalVerifications++;

        emit InferenceSubmitted(agentId, recordIndex, proofHash, verified, decision);
    }

    function version() public pure returns (string memory) {
        return "2.0.0";
    }

    function totalRecords() external view returns (uint256) {
        return records.length;
    }

    /// @notice Extract decision from EZKL public instances using BN254 signed comparison
    /// @dev EZKL represents negative logits as p - |value| (field wrap-around).
    ///      Values > HALF_P are negative. We compare signed values to determine decision.
    function _extractDecision(uint256[] calldata pi) internal pure returns (uint8) {
        if (pi.length < 6) return 0;
        int256 out0 = pi[4] > HALF_P ? int256(pi[4]) - int256(BN254_P) : int256(pi[4]);
        int256 out1 = pi[5] > HALF_P ? int256(pi[5]) - int256(BN254_P) : int256(pi[5]);
        return out1 > out0 ? 1 : 0;
    }

    function _authorizeUpgrade(address) internal override {
        require(msg.sender == admin, "Only admin");
    }
}
