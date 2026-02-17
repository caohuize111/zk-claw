// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title ERC6551Account - Token Bound Account for NFA (AI Agent NFT)
/// @notice Each NFA gets its own smart contract wallet, controlled by the NFT owner.
/// @dev Storage-based approach for hackathon clarity.
contract ERC6551Account is IERC165, ReentrancyGuard {
    address public registry;
    address public entryPoint;
    uint256 public chainId;
    address public tokenContract;
    uint256 public tokenId;
    uint256 public nonce;
    bool private _initialized;

    event CallExecuted(address indexed target, uint256 value, uint256 nonce);

    receive() external payable {}

    function initialize(uint256 _chainId, address _tokenContract, uint256 _tokenId) external {
        require(!_initialized, "Already initialized");
        registry = msg.sender;
        chainId = _chainId;
        tokenContract = _tokenContract;
        tokenId = _tokenId;
        _initialized = true;
    }

    /// @notice Set the EntryPoint address for ERC-4337 account abstraction
    function setEntryPoint(address _entryPoint) external {
        require(msg.sender == owner(), "Not token owner");
        entryPoint = _entryPoint;
    }

    function owner() public view returns (address) {
        return IERC721(tokenContract).ownerOf(tokenId);
    }

    function executeCall(address to, uint256 value, bytes calldata data)
        external payable nonReentrant returns (bytes memory)
    {
        require(msg.sender == owner() || msg.sender == entryPoint, "Not authorized");
        nonce++;
        (bool success, bytes memory result) = to.call{value: value}(data);
        require(success, "Call failed");
        emit CallExecuted(to, value, nonce);
        return result;
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IERC165).interfaceId;
    }
}
