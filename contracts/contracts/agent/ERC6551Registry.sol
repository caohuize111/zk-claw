// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./ERC6551Account.sol";

/// @title ERC6551Registry - Creates Token Bound Accounts for NFA (AI Agent NFTs)
/// @notice Deploys a new ERC6551Account for each NFA tokenId.
contract ERC6551Registry {
    mapping(address => mapping(uint256 => address)) public accounts;

    event AccountCreated(address indexed account, address indexed tokenContract, uint256 indexed tokenId);

    function createAccount(address tokenContract, uint256 tokenId) external returns (address) {
        require(accounts[tokenContract][tokenId] == address(0), "Account exists");
        ERC6551Account acct = new ERC6551Account();
        acct.initialize(block.chainid, tokenContract, tokenId);
        accounts[tokenContract][tokenId] = address(acct);
        emit AccountCreated(address(acct), tokenContract, tokenId);
        return address(acct);
    }

    function getAccount(address tokenContract, uint256 tokenId) external view returns (address) {
        return accounts[tokenContract][tokenId];
    }
}
