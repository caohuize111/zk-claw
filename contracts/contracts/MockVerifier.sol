// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IHalo2Verifier.sol";

/// @title MockVerifier - Always returns true (for testing only)
contract MockVerifier is IHalo2Verifier {
    function verifyProof(
        bytes calldata,
        uint256[] calldata
    ) external pure override returns (bool) {
        return true;
    }
}
