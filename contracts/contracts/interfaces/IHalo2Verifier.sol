// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev The EZKL-generated Halo2Verifier.sol declares verifyProof as `public`.
///      Solidity allows `public` functions to satisfy `external` interface declarations,
///      so this interface is compatible with the auto-generated implementation as-is.
interface IHalo2Verifier {
    function verifyProof(
        bytes calldata proof,
        uint256[] calldata instances
    ) external returns (bool);
}
