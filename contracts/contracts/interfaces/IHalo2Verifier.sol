// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IHalo2Verifier {
    function verify(
        bytes calldata proof,
        uint256[] calldata instances
    ) external view returns (bool);
}
