// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IHalo2Verifier.sol";

/// @title MockVerifier - Always returns true (for testing when Halo2Verifier is too large)
contract MockVerifier is IHalo2Verifier {
    function verify(
        bytes calldata,
        uint256[] calldata
    ) external pure override returns (bool) {
        return true;
    }
}
