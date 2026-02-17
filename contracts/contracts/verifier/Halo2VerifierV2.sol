// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Halo2VerifierReusable.sol";

/// @title Halo2VerifierV2 - Thin wrapper around EZKL's reusable verifier
/// @notice Stores the VKA (Verification Key Artifact) and exposes the same
///         verifyProof(bytes,uint256[]) interface as the V1 monolithic verifier.
///         This allows deploying verifiers for circuits whose monolithic verifier
///         would exceed the 24KB EIP-170 limit.
/// @dev The reusable verifier itself is ~10.6KB. Each circuit only needs a
///      new wrapper with its VKA registered. Total deployment: wrapper + reusable < 24KB.
contract Halo2VerifierV2 {
    Halo2VerifierReusable public immutable reusableVerifier;
    bytes32[] public vka;
    bytes32 public vkaDigest;

    constructor(address _reusable, bytes32[] memory _vka) {
        reusableVerifier = Halo2VerifierReusable(_reusable);
        vka = _vka;
        // Register VKA on the reusable verifier
        vkaDigest = reusableVerifier.registerVka(_vka);
    }

    /// @notice Verify a proof -- same interface as V1 monolithic verifier
    /// @dev Uses low-level call because the reusable verifier returns raw assembly
    ///      data (not standard ABI-encoded), which would cause a high-level call to revert.
    function verifyProof(bytes calldata proof, uint256[] calldata instances) external returns (bool) {
        // Copy VKA from storage to memory
        bytes32[] memory vkaMem = vka;

        // Low-level call: reusable verifier uses raw assembly return
        (bool ok, bytes memory returnData) = address(reusableVerifier).call(
            abi.encodeWithSelector(
                Halo2VerifierReusable.verifyProof.selector,
                proof, instances, vkaMem
            )
        );

        // Revert if the call itself failed (e.g., tampered proof triggers revert in assembly)
        if (!ok) {
            // Forward the revert reason
            assembly {
                revert(add(returnData, 0x20), mload(returnData))
            }
        }

        require(returnData.length >= 32, "Unexpected return data");

        // First 32 bytes of raw return: success flag (1 = true, 0 = false)
        uint256 success;
        assembly {
            success := mload(add(returnData, 0x20))
        }
        return success == 1;
    }

    /// @notice Get VKA length
    function vkaLength() external view returns (uint256) {
        return vka.length;
    }
}
