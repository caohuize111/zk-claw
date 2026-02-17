// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title EntryPoint - Simplified ERC-4337 EntryPoint for agent operations
/// @notice Validates and executes PackedUserOperations via IAccount.validateUserOp
contract EntryPoint {

    struct PackedUserOperation {
        address sender;
        uint256 nonce;
        bytes callData;
        uint256 callGasLimit;
        uint256 verificationGasLimit;
        bytes signature;
    }

    mapping(address => uint256) public nonces;

    event UserOperationEvent(bytes32 indexed userOpHash, address indexed sender, bool success);

    /// @notice Execute a batch of user operations
    function handleOps(PackedUserOperation[] calldata ops) external {
        for (uint256 i = 0; i < ops.length; i++) {
            PackedUserOperation calldata op = ops[i];

            // Verify nonce
            require(op.nonce == nonces[op.sender], "Invalid nonce");

            // Compute userOpHash
            bytes32 userOpHash = getUserOpHash(op);

            // Validate via IAccount
            uint256 validationData = IAccount(op.sender).validateUserOp(op, userOpHash);
            require(validationData == 0, "Validation failed");

            // Execute callData on sender
            bool success;
            if (op.callData.length > 0) {
                (success, ) = op.sender.call{gas: op.callGasLimit}(op.callData);
            } else {
                success = true;
            }

            // Increment nonce
            nonces[op.sender]++;

            emit UserOperationEvent(userOpHash, op.sender, success);
        }
    }

    /// @notice Compute the hash of a user operation
    function getUserOpHash(PackedUserOperation calldata op) public view returns (bytes32) {
        return keccak256(abi.encode(
            op.sender,
            op.nonce,
            keccak256(op.callData),
            op.callGasLimit,
            op.verificationGasLimit,
            address(this),
            block.chainid
        ));
    }

    /// @notice Get the current nonce for a sender
    function getNonce(address sender) external view returns (uint256) {
        return nonces[sender];
    }
}

/// @dev Interface that account contracts must implement
interface IAccount {
    function validateUserOp(
        EntryPoint.PackedUserOperation calldata userOp,
        bytes32 userOpHash
    ) external returns (uint256 validationData);
}
