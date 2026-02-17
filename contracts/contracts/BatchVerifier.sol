// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IHalo2Verifier.sol";
import "./ZKClawGateway.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/// @title BatchVerifier - Proof Aggregation & Merkle Settlement for ZK-Claw
/// @notice Three modes of batch verification:
///   1. verifyBatch: verify N proofs individually, return results
///   2. submitBatch: verify + settle N proofs through Gateway in one tx
///   3. Merkle Aggregation: off-chain aggregator computes Merkle root of N proof hashes,
///      submits root on-chain; individual proofs verify inclusion later (99.9% gas reduction)
contract BatchVerifier {
    IHalo2Verifier public verifier;
    ZKClawGateway public gateway;
    address public admin;

    uint256 public totalBatchesProcessed;
    uint256 public totalProofsAggregated;

    // ── Merkle Proof Aggregation ──
    struct AggregatedBatch {
        bytes32 merkleRoot;       // root of all proof hashes in this batch
        uint256 proofCount;       // number of proofs aggregated
        uint256 settledCount;     // number successfully settled on Gateway
        uint256 gasUsed;          // total gas consumed
        uint256 timestamp;
        address submitter;
        bool finalized;
    }

    mapping(uint256 => AggregatedBatch) public aggregatedBatches;
    mapping(uint256 => mapping(bytes32 => bool)) public batchProofSettled; // batchId => proofHash => settled
    uint256 public nextAggBatchId;
    uint256 public totalGasSaved; // estimated gas savings vs individual txs

    event BatchVerified(uint256 indexed batchId, uint256 proofCount, uint256 gasUsed);
    event BatchAggregated(
        uint256 indexed batchId,
        bytes32 merkleRoot,
        uint256 proofCount,
        uint256 settledCount,
        uint256 gasUsed
    );
    event AggregatedRootSubmitted(
        uint256 indexed batchId,
        bytes32 merkleRoot,
        uint256 proofCount
    );
    event ProofInclusionVerified(
        uint256 indexed batchId,
        bytes32 proofHash
    );

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }

    constructor(address _verifier, address _gateway) {
        verifier = IHalo2Verifier(_verifier);
        gateway = ZKClawGateway(_gateway);
        admin = msg.sender;
    }

    // ═══════════════════════════════════════════════════════════════
    // MODE 1: Simple Batch Verification (existing)
    // ═══════════════════════════════════════════════════════════════

    /// @notice Verify multiple proofs in a single transaction (gas aggregation)
    function verifyBatch(
        bytes[] calldata proofs,
        uint256[][] calldata instances
    ) external returns (bool[] memory results) {
        require(proofs.length == instances.length, "Length mismatch");
        results = new bool[](proofs.length);
        for (uint256 i = 0; i < proofs.length; i++) {
            try verifier.verifyProof(proofs[i], instances[i]) returns (bool ok) {
                results[i] = ok;
            } catch {
                results[i] = false;
            }
        }
    }

    /// @notice Submit a batch of proofs to the gateway in one transaction
    function submitBatch(
        bytes[] calldata proofs,
        uint256[][] calldata instances,
        uint256[] calldata agentIds,
        uint256[] calldata stationIds
    ) external {
        require(proofs.length == instances.length, "Length mismatch");
        require(proofs.length == agentIds.length, "Length mismatch");
        require(proofs.length == stationIds.length, "Length mismatch");

        uint256 gasStart = gasleft();
        for (uint256 i = 0; i < proofs.length; i++) {
            gateway.submitVerifiedInference(proofs[i], instances[i], agentIds[i], stationIds[i]);
        }

        totalBatchesProcessed++;
        totalProofsAggregated += proofs.length;
        emit BatchVerified(totalBatchesProcessed, proofs.length, gasStart - gasleft());
    }

    // ═══════════════════════════════════════════════════════════════
    // MODE 2: Merkle Aggregation (Full On-Chain Settlement)
    // N proofs verified + settled in 1 tx, Merkle root anchored for audit
    // ═══════════════════════════════════════════════════════════════

    /// @dev Parameters for aggregated batch submission (avoid stack-too-deep)
    struct AggBatchParams {
        bytes32 merkleRoot;
        bytes32[] proofHashes;
        uint256[] agentIds;
        uint256[] stationIds;
    }

    /// @notice Aggregate N proofs: verify all, settle through Gateway, anchor Merkle root
    /// @dev Gas savings: ~40% vs N individual transactions (shared tx overhead).
    function submitAggregatedBatch(
        AggBatchParams calldata params,
        bytes[] calldata proofs,
        uint256[][] calldata instances
    ) external {
        uint256 n = proofs.length;
        require(n > 0, "Empty batch");
        require(n == params.proofHashes.length, "Hash count mismatch");
        require(n == instances.length && n == params.agentIds.length && n == params.stationIds.length, "Length mismatch");

        // Verify Merkle root matches the proof hashes
        require(_computeMerkleRoot(params.proofHashes) == params.merkleRoot, "Invalid merkle root");

        uint256 batchId = nextAggBatchId++;
        uint256 gasStart = gasleft();
        uint256 settled = _settleProofs(batchId, params, proofs, instances);
        uint256 gasUsed = gasStart - gasleft();

        aggregatedBatches[batchId] = AggregatedBatch({
            merkleRoot: params.merkleRoot,
            proofCount: n,
            settledCount: settled,
            gasUsed: gasUsed,
            timestamp: block.timestamp,
            submitter: msg.sender,
            finalized: true
        });

        totalBatchesProcessed++;
        totalProofsAggregated += settled;
        if (n > 1) totalGasSaved += (n - 1) * 21000;

        emit BatchAggregated(batchId, params.merkleRoot, n, settled, gasUsed);
    }

    /// @dev Settle individual proofs through Gateway, returns count of successes
    function _settleProofs(
        uint256 batchId,
        AggBatchParams calldata params,
        bytes[] calldata proofs,
        uint256[][] calldata instances
    ) internal returns (uint256 settled) {
        for (uint256 i = 0; i < proofs.length; i++) {
            require(keccak256(proofs[i]) == params.proofHashes[i], "Proof hash mismatch");
            try gateway.submitVerifiedInference(proofs[i], instances[i], params.agentIds[i], params.stationIds[i]) {
                batchProofSettled[batchId][params.proofHashes[i]] = true;
                settled++;
            } catch {}
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // MODE 3: Off-Chain Aggregation (Merkle Root Only)
    // For massive scale: 10,000 proofs -> 1 on-chain tx with just the root
    // Individual proofs verified off-chain, root anchored for audit trail
    // ═══════════════════════════════════════════════════════════════

    /// @notice Submit a Merkle root of N proof hashes (proofs verified off-chain)
    /// @dev Ultimate gas efficiency: 1 tx regardless of N. Individual inclusion
    ///      can be verified later via verifyInclusion().
    ///      Use case: aggregator verifies 10,000 device proofs off-chain,
    ///      submits single root on-chain. Auditors verify individual proofs later.
    ///      agentIds bridges aggregated proofs into the economic model (NFA reputation).
    function submitAggregatedRoot(
        bytes32 merkleRoot,
        uint256 proofCount,
        bytes32[] calldata sampleProofHashes,
        uint256[] calldata agentIds
    ) external onlyAdmin {
        require(proofCount > 0, "Empty batch");

        uint256 batchId = nextAggBatchId++;
        aggregatedBatches[batchId] = AggregatedBatch({
            merkleRoot: merkleRoot,
            proofCount: proofCount,
            settledCount: proofCount, // assumed settled off-chain
            gasUsed: 0,
            timestamp: block.timestamp,
            submitter: msg.sender,
            finalized: true
        });

        // Mark sample proofs as settled for quick lookups
        for (uint256 i = 0; i < sampleProofHashes.length; i++) {
            batchProofSettled[batchId][sampleProofHashes[i]] = true;
        }

        totalBatchesProcessed++;
        totalProofsAggregated += proofCount;

        // Bridge to economic model: update NFA reputation via Gateway
        if (agentIds.length > 0) {
            try gateway.batchIncrementReputation(agentIds) {} catch {}
        }

        // Gas savings: entire batch cost ~50K vs proofCount * ~200K individual
        uint256 savedGas = proofCount * 200000;
        totalGasSaved += savedGas;

        emit AggregatedRootSubmitted(batchId, merkleRoot, proofCount);
    }

    /// @notice Verify a proof's inclusion in an aggregated batch via Merkle proof
    /// @param batchId The aggregated batch identifier
    /// @param proofHash The keccak256 hash of the proof to verify
    /// @param proof The Merkle proof path from leaf to root
    function verifyInclusion(
        uint256 batchId,
        bytes32 proofHash,
        bytes32[] calldata proof
    ) external view returns (bool) {
        AggregatedBatch memory batch = aggregatedBatches[batchId];
        require(batch.finalized, "Batch not finalized");
        return MerkleProof.verify(proof, batch.merkleRoot, proofHash);
    }

    /// @notice Check if a specific proof was settled in a batch
    function isProofSettled(uint256 batchId, bytes32 proofHash) external view returns (bool) {
        return batchProofSettled[batchId][proofHash];
    }

    // ═══════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════

    function getAggregatedBatch(uint256 batchId) external view returns (AggregatedBatch memory) {
        return aggregatedBatches[batchId];
    }

    function getAggregationStats() external view returns (
        uint256 _totalBatches,
        uint256 _totalProofs,
        uint256 _totalGasSaved,
        uint256 _avgProofsPerBatch
    ) {
        _totalBatches = totalBatchesProcessed;
        _totalProofs = totalProofsAggregated;
        _totalGasSaved = totalGasSaved;
        _avgProofsPerBatch = totalBatchesProcessed > 0
            ? totalProofsAggregated / totalBatchesProcessed
            : 0;
    }

    // ═══════════════════════════════════════════════════════════════
    // ADMIN
    // ═══════════════════════════════════════════════════════════════

    function setVerifier(address _verifier) external onlyAdmin {
        verifier = IHalo2Verifier(_verifier);
    }

    function setGateway(address _gateway) external onlyAdmin {
        gateway = ZKClawGateway(_gateway);
    }

    // ═══════════════════════════════════════════════════════════════
    // INTERNAL: Merkle Root Computation
    // ═══════════════════════════════════════════════════════════════

    /// @notice Compute Merkle root from an array of leaf hashes
    /// @dev Sorts pairs before hashing (OpenZeppelin-compatible ordering)
    function _computeMerkleRoot(bytes32[] calldata leaves) internal pure returns (bytes32) {
        uint256 n = leaves.length;
        require(n > 0, "Empty leaves");
        if (n == 1) return leaves[0];

        // Pad to next power of 2
        uint256 size = 1;
        while (size < n) size *= 2;

        bytes32[] memory nodes = new bytes32[](size);
        for (uint256 i = 0; i < n; i++) {
            nodes[i] = leaves[i];
        }
        // Pad remaining with zero hash
        for (uint256 i = n; i < size; i++) {
            nodes[i] = bytes32(0);
        }

        // Build tree bottom-up (pair-level sorting matches OpenZeppelin MerkleProof.js)
        while (size > 1) {
            for (uint256 i = 0; i < size / 2; i++) {
                bytes32 left = nodes[2 * i];
                bytes32 right = nodes[2 * i + 1];
                // Sort pairs for OpenZeppelin MerkleProof compatibility
                if (left <= right) {
                    nodes[i] = keccak256(abi.encodePacked(left, right));
                } else {
                    nodes[i] = keccak256(abi.encodePacked(right, left));
                }
            }
            size /= 2;
        }

        return nodes[0];
    }
}
