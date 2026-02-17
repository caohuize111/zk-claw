// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title MockNFA - Simplified BAP-578 Non-Fungible Agent
/// @notice Implements core BAP-578 patterns: mint, executeAction, PredictionProfile, Merkle Learning
contract MockNFA is ERC721, Ownable {

    struct AgentMetadata {
        string name;
        string persona;
        string vaultURI;
        bytes32 vaultHash;
    }

    struct PredictionProfile {
        uint256 totalPredictions;
        uint256 correctPredictions;
        bytes32 learningRoot;       // Merkle Tree Learning state
        uint256 reputationScore;
    }

    uint256 private _nextTokenId;
    mapping(uint256 => AgentMetadata) public agentMetadata;
    mapping(uint256 => PredictionProfile) public profiles;
    mapping(uint256 => address) public logicAddresses;
    mapping(uint256 => bool) public isActive;

    event AgentMinted(uint256 indexed tokenId, string name, address owner);
    event LogicAddressUpdated(uint256 indexed tokenId, address newLogic);
    event ActionExecuted(uint256 indexed tokenId, bytes result);
    event ReputationIncremented(uint256 indexed tokenId, uint256 newScore);
    event LearningRootUpdated(uint256 indexed tokenId, bytes32 newRoot);

    constructor() ERC721("ZK-Claw NFA", "ZKCLAW") Ownable(msg.sender) {}

    function mint(AgentMetadata calldata metadata) external returns (uint256) {
        uint256 tokenId = _nextTokenId++;
        _mint(msg.sender, tokenId);

        agentMetadata[tokenId] = metadata;
        isActive[tokenId] = true;
        profiles[tokenId].learningRoot = bytes32(0);

        emit AgentMinted(tokenId, metadata.name, msg.sender);
        return tokenId;
    }

    function setLogicAddress(uint256 tokenId, address logic) external {
        require(ownerOf(tokenId) == msg.sender, "Not agent owner");
        require(isActive[tokenId], "Agent not active");
        logicAddresses[tokenId] = logic;
        emit LogicAddressUpdated(tokenId, logic);
    }

    function executeAction(uint256 tokenId, bytes calldata data) external returns (bytes memory) {
        require(isActive[tokenId], "Agent not active");
        address logic = logicAddresses[tokenId];
        require(logic != address(0), "No logic address set");

        (bool success, bytes memory result) = logic.delegatecall(data);
        require(success, "Action execution failed");

        emit ActionExecuted(tokenId, result);
        return result;
    }

    /// @notice Only the bound logic contract can increment reputation
    function incrementReputation(uint256 tokenId) external {
        require(msg.sender == logicAddresses[tokenId], "Only logic contract");
        profiles[tokenId].reputationScore += 1;
        profiles[tokenId].totalPredictions += 1;
        emit ReputationIncremented(tokenId, profiles[tokenId].reputationScore);
    }

    /// @notice Record a correct prediction (called by logic contract)
    function recordCorrectPrediction(uint256 tokenId) external {
        require(msg.sender == logicAddresses[tokenId], "Only logic contract");
        profiles[tokenId].correctPredictions += 1;
    }

    /// @notice Merkle Tree Learning: update learning state root
    function updateLearningRoot(uint256 tokenId, bytes32 newRoot) external {
        require(
            msg.sender == logicAddresses[tokenId] || ownerOf(tokenId) == msg.sender,
            "Not authorized"
        );
        profiles[tokenId].learningRoot = newRoot;
        emit LearningRootUpdated(tokenId, newRoot);
    }

    function getProfile(uint256 tokenId) external view returns (PredictionProfile memory) {
        return profiles[tokenId];
    }

    function getMetadata(uint256 tokenId) external view returns (AgentMetadata memory) {
        return agentMetadata[tokenId];
    }

    function totalAgents() external view returns (uint256) {
        return _nextTokenId;
    }
}
