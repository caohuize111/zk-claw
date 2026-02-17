// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./EntryPoint.sol";

/// @title MockAccount - Test helper for EntryPoint (simplified ERC-4337)
/// @notice Implements IAccount for testing. Can be configured to accept or reject validation.
contract MockAccount is IAccount {
    address public entryPointAddr;
    bool public shouldReject;
    uint256 public lastValue;

    constructor(address _entryPoint) {
        entryPointAddr = _entryPoint;
    }

    function setShouldReject(bool _reject) external {
        shouldReject = _reject;
    }

    function validateUserOp(
        EntryPoint.PackedUserOperation calldata,
        bytes32
    ) external override returns (uint256 validationData) {
        return shouldReject ? 1 : 0;
    }

    /// @notice Simple function to test callData execution
    function setValue(uint256 val) external {
        lastValue = val;
    }

    receive() external payable {}
}
