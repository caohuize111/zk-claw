// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "./interfaces/IBAP578.sol";
import "./agent/ERC6551Registry.sol";

/// @title NFA - Non-Fungible Agent (BAP-578 Full Implementation)
/// @notice Implements the BAP-578 agent NFT standard with lifecycle management,
///         native BNB funding, metadata, logic execution, Merkle-verified learning,
///         and reputation tracking for ZK-verified inference.
/// @dev Extended with ZK-Claw specific PredictionProfile and learning verification.
contract NFA is ERC721Enumerable, ReentrancyGuard, Pausable, Ownable, IBAP578 {

    // ─── Constants ───────────────────────────────────────────────
    uint256 public constant MAX_AGENTS_PER_ADDRESS = 3;

    // ─── BAP-578 Core State ─────────────────────────────────────
    uint256 private _nextTokenId;
    string private _baseTokenURI;

    mapping(uint256 => AgentState) private _agentStates;
    mapping(uint256 => AgentMetadata) private _agentMetadata;
    mapping(uint256 => address) private _logicAddresses;
    mapping(uint256 => uint256) private _agentBalances;
    uint256 public totalAgentBalances;
    mapping(address => uint256) public mintCount;

    // ─── ZK-Claw Extension: Prediction Profile ──────────────────
    struct PredictionProfile {
        uint256 totalPredictions;
        uint256 correctPredictions;
        bytes32 learningRoot;       // Merkle root of learning/inference history
        uint256 reputationScore;    // basis points: (correct * 10000) / total
    }

    struct LearningMetrics {
        uint256 totalInteractions;
        uint256 successfulOutcomes;
        bytes32 learningRoot;
        uint256 lastUpdated;
    }

    mapping(uint256 => PredictionProfile) private _profiles;
    mapping(uint256 => LearningMetrics) private _learningMetrics;

    // ─── Gateway Authorization ────────────────────────────────────
    address public gatewayAddress;

    // ─── ERC-6551 Token Bound Accounts ──────────────────────────
    ERC6551Registry public tbaRegistry;
    mapping(uint256 => address) public tokenBoundAccounts;

    // ─── Events ─────────────────────────────────────────────────
    event AgentMinted(uint256 indexed tokenId, string name, address indexed owner);
    event VaultUpdated(uint256 indexed tokenId, string vaultURI, bytes32 vaultHash);
    event ReputationUpdated(uint256 indexed tokenId, uint256 newScore);
    event LearningRootUpdated(uint256 indexed tokenId, bytes32 newRoot);
    event LearningInteractionRecorded(uint256 indexed tokenId, uint256 totalInteractions);
    event TBACreated(uint256 indexed tokenId, address indexed tbaAddress);

    // ─── Modifiers ──────────────────────────────────────────────
    modifier onlyTokenOwner(uint256 tokenId) {
        require(ownerOf(tokenId) == msg.sender, "Not token owner");
        _;
    }

    modifier onlyActiveAgent(uint256 tokenId) {
        require(_agentStates[tokenId] == AgentState.ACTIVE, "Agent not active");
        _;
    }

    modifier onlyLogicOrOwner(uint256 tokenId) {
        require(
            msg.sender == _logicAddresses[tokenId] || ownerOf(tokenId) == msg.sender,
            "Not authorized"
        );
        _;
    }

    // ─── Constructor ────────────────────────────────────────────
    constructor() ERC721("ZK-Claw NFA", "ZKCLAW") Ownable(msg.sender) {}

    // ═══════════════════════════════════════════════════════════════
    // MINTING (BAP-578)
    // ═══════════════════════════════════════════════════════════════

    /// @notice Mint a new agent NFT (max 3 per address, free)
    function mint(AgentMetadata calldata metadata)
        external
        whenNotPaused
        nonReentrant
        returns (uint256)
    {
        require(mintCount[msg.sender] < MAX_AGENTS_PER_ADDRESS, "Max agents per address reached");
        require(bytes(metadata.name).length > 0, "Name required");

        uint256 tokenId = _nextTokenId++;
        mintCount[msg.sender]++;
        _safeMint(msg.sender, tokenId);

        _agentMetadata[tokenId] = metadata;
        _agentStates[tokenId] = AgentState.ACTIVE;

        // Auto-create Token Bound Account if registry is set
        if (address(tbaRegistry) != address(0)) {
            address tba = tbaRegistry.createAccount(address(this), tokenId);
            tokenBoundAccounts[tokenId] = tba;
            emit TBACreated(tokenId, tba);
        }

        emit AgentMinted(tokenId, metadata.name, msg.sender);
        return tokenId;
    }

    function getMintCount(address account) external view returns (uint256) {
        return mintCount[account];
    }

    // ═══════════════════════════════════════════════════════════════
    // AGENT LIFECYCLE (BAP-578)
    // ═══════════════════════════════════════════════════════════════

    function pauseAgent(uint256 tokenId) external onlyTokenOwner(tokenId) {
        require(_agentStates[tokenId] == AgentState.ACTIVE, "Agent not active");
        _agentStates[tokenId] = AgentState.PAUSED;
        emit AgentPaused(tokenId);
    }

    function unpauseAgent(uint256 tokenId) external onlyTokenOwner(tokenId) {
        require(_agentStates[tokenId] == AgentState.PAUSED, "Agent not paused");
        _agentStates[tokenId] = AgentState.ACTIVE;
        emit AgentUnpaused(tokenId);
    }

    /// @notice Permanently terminate an agent (irreversible). Funds can still be withdrawn.
    function terminateAgent(uint256 tokenId) external onlyTokenOwner(tokenId) {
        require(_agentStates[tokenId] != AgentState.TERMINATED, "Already terminated");
        _agentStates[tokenId] = AgentState.TERMINATED;
        emit AgentTerminated(tokenId);
    }

    function getState(uint256 tokenId) external view returns (AgentState) {
        _requireOwned(tokenId);
        return _agentStates[tokenId];
    }

    // ═══════════════════════════════════════════════════════════════
    // FUNDING (BAP-578) - Native BNB
    // ═══════════════════════════════════════════════════════════════

    /// @notice Fund an active agent with native BNB (anyone can fund)
    function fundAgent(uint256 tokenId) external payable onlyActiveAgent(tokenId) {
        require(msg.value > 0, "Amount must be > 0");
        _agentBalances[tokenId] += msg.value;
        totalAgentBalances += msg.value;
        emit AgentFunded(tokenId, msg.value);
    }

    /// @notice Withdraw BNB from an agent (token owner only, works when terminated)
    function withdrawFromAgent(uint256 tokenId, uint256 amount)
        external
        onlyTokenOwner(tokenId)
        nonReentrant
    {
        require(amount > 0, "Amount must be > 0");
        require(_agentBalances[tokenId] >= amount, "Insufficient agent balance");
        _agentBalances[tokenId] -= amount;
        totalAgentBalances -= amount;
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "BNB transfer failed");
        emit AgentWithdrawn(tokenId, amount);
    }

    function getAgentBalance(uint256 tokenId) external view returns (uint256) {
        _requireOwned(tokenId);
        return _agentBalances[tokenId];
    }

    // ═══════════════════════════════════════════════════════════════
    // METADATA (BAP-578)
    // ═══════════════════════════════════════════════════════════════

    function getAgentMetadata(uint256 tokenId) external view returns (AgentMetadata memory) {
        _requireOwned(tokenId);
        return _agentMetadata[tokenId];
    }

    function updateAgentMetadata(uint256 tokenId, AgentMetadata calldata metadata)
        external
        onlyTokenOwner(tokenId)
    {
        _agentMetadata[tokenId] = metadata;
        emit MetadataUpdated(tokenId);
    }

    function updateVault(uint256 tokenId, string calldata newVaultURI, bytes32 newVaultHash)
        external
        onlyTokenOwner(tokenId)
    {
        _agentMetadata[tokenId].vaultURI = newVaultURI;
        _agentMetadata[tokenId].vaultHash = newVaultHash;
        emit VaultUpdated(tokenId, newVaultURI, newVaultHash);
    }

    // ═══════════════════════════════════════════════════════════════
    // LOGIC ADDRESS & EXECUTION (BAP-578)
    // ═══════════════════════════════════════════════════════════════

    function setLogicAddress(uint256 tokenId, address logic) external onlyTokenOwner(tokenId) {
        _logicAddresses[tokenId] = logic;
        emit LogicAddressUpdated(tokenId, logic);
    }

    function getLogicAddress(uint256 tokenId) external view returns (address) {
        return _logicAddresses[tokenId];
    }

    /// @notice Execute an action via the agent's logic contract
    function executeAction(uint256 tokenId, bytes calldata data)
        external
        onlyTokenOwner(tokenId)
        onlyActiveAgent(tokenId)
        nonReentrant
        returns (bytes memory)
    {
        address logic = _logicAddresses[tokenId];
        require(logic != address(0), "No logic address set");
        (bool success, bytes memory result) = logic.call(data);
        require(success, "Action execution failed");
        emit ActionExecuted(tokenId, result);
        return result;
    }

    // ═══════════════════════════════════════════════════════════════
    // ZK-CLAW: REPUTATION & PREDICTION PROFILE
    // ═══════════════════════════════════════════════════════════════

    /// @notice Increment reputation after a verified ZK inference (logic contract or gateway)
    /// @dev Increments both totalPredictions and correctPredictions, since a verified
    ///      ZK inference is by definition a correct prediction.
    function incrementReputation(uint256 tokenId) external {
        require(
            msg.sender == _logicAddresses[tokenId] || msg.sender == gatewayAddress,
            "Not authorized"
        );
        PredictionProfile storage p = _profiles[tokenId];
        p.totalPredictions += 1;
        p.correctPredictions += 1;
        // Update score: basis points = (correct * 10000) / total
        if (p.totalPredictions > 0) {
            p.reputationScore = (p.correctPredictions * 10000) / p.totalPredictions;
        }
        emit ReputationUpdated(tokenId, p.reputationScore);
    }

    /// @notice Record a correct prediction (logic contract or gateway)
    function recordCorrectPrediction(uint256 tokenId) external {
        require(
            msg.sender == _logicAddresses[tokenId] || msg.sender == gatewayAddress,
            "Not authorized"
        );
        PredictionProfile storage p = _profiles[tokenId];
        require(p.correctPredictions < p.totalPredictions, "Cannot exceed total predictions");
        p.correctPredictions += 1;
        if (p.totalPredictions > 0) {
            p.reputationScore = (p.correctPredictions * 10000) / p.totalPredictions;
        }
        emit ReputationUpdated(tokenId, p.reputationScore);
    }

    function getProfile(uint256 tokenId) external view returns (PredictionProfile memory) {
        return _profiles[tokenId];
    }

    // ═══════════════════════════════════════════════════════════════
    // ZK-CLAW: MERKLE-VERIFIED LEARNING MODULE
    // ═══════════════════════════════════════════════════════════════

    /// @notice Update learning state root (logic contract or owner)
    function updateLearningRoot(uint256 tokenId, bytes32 newRoot)
        external
        onlyLogicOrOwner(tokenId)
    {
        _profiles[tokenId].learningRoot = newRoot;

        LearningMetrics storage lm = _learningMetrics[tokenId];
        lm.learningRoot = newRoot;
        lm.lastUpdated = block.timestamp;

        emit LearningRootUpdated(tokenId, newRoot);
    }

    /// @notice Verify a leaf against the learning Merkle root
    /// @param tokenId The agent token ID
    /// @param proof The Merkle proof path
    /// @param leaf The leaf hash to verify
    /// @return valid True if the leaf is part of the agent's learning tree
    function verifyLearning(
        uint256 tokenId,
        bytes32[] calldata proof,
        bytes32 leaf
    ) external view returns (bool valid) {
        bytes32 root = _profiles[tokenId].learningRoot;
        if (root == bytes32(0)) return false;
        return MerkleProof.verify(proof, root, leaf);
    }

    /// @notice Record an interaction for learning metrics (logic contract or owner)
    function recordInteraction(uint256 tokenId, bool successful)
        external
        onlyLogicOrOwner(tokenId)
    {
        LearningMetrics storage lm = _learningMetrics[tokenId];
        lm.totalInteractions += 1;
        if (successful) {
            lm.successfulOutcomes += 1;
        }
        lm.lastUpdated = block.timestamp;
        emit LearningInteractionRecorded(tokenId, lm.totalInteractions);
    }

    function getLearningMetrics(uint256 tokenId) external view returns (LearningMetrics memory) {
        return _learningMetrics[tokenId];
    }

    // ═══════════════════════════════════════════════════════════════
    // IDENTITY HELPERS (for ERC-8004 registry integration)
    // ═══════════════════════════════════════════════════════════════

    /// @notice Check if spender is owner or approved for the agent
    function isAuthorizedOrOwner(address spender, uint256 agentId) external view returns (bool) {
        address tokenOwner = ownerOf(agentId);
        return _isAuthorized(tokenOwner, spender, agentId);
    }

    // ═══════════════════════════════════════════════════════════════
    // TOKEN URI
    // ═══════════════════════════════════════════════════════════════

    function setBaseURI(string memory baseURI) external onlyOwner {
        _baseTokenURI = baseURI;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        if (bytes(_baseTokenURI).length == 0) {
            return "";
        }
        return string(abi.encodePacked(_baseTokenURI, Strings.toString(tokenId), ".json"));
    }

    // ═══════════════════════════════════════════════════════════════
    // ADMIN
    // ═══════════════════════════════════════════════════════════════

    function setGateway(address _gateway) external onlyOwner {
        gatewayAddress = _gateway;
    }

    function setTBARegistry(address _registry) external onlyOwner {
        tbaRegistry = ERC6551Registry(_registry);
    }

    function getTokenBoundAccount(uint256 tokenId) external view returns (address) {
        return tokenBoundAccounts[tokenId];
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    function totalAgents() external view returns (uint256) {
        return _nextTokenId;
    }

    /// @notice Withdraw surplus BNB not belonging to agent balances
    function withdrawSurplus(uint256 amount) external onlyOwner nonReentrant {
        require(amount > 0, "Amount must be > 0");
        uint256 balance = address(this).balance;
        require(balance >= totalAgentBalances, "Balance inconsistency");
        uint256 available = balance - totalAgentBalances;
        require(amount <= available, "Exceeds available surplus");
        (bool success, ) = owner().call{value: amount}("");
        require(success, "BNB transfer failed");
    }

    // ═══════════════════════════════════════════════════════════════
    // GATEWAY WITHDRAW (for auto-payout on claim decisions)
    // ═══════════════════════════════════════════════════════════════

    /// @notice Allow gateway to withdraw from agent balance for auto-payout
    function gatewayWithdraw(uint256 tokenId, uint256 amount, address to) external nonReentrant {
        require(msg.sender == gatewayAddress, "Only gateway");
        require(amount > 0, "Amount must be > 0");
        require(_agentBalances[tokenId] >= amount, "Insufficient agent balance");
        _agentBalances[tokenId] -= amount;
        totalAgentBalances -= amount;
        (bool success, ) = to.call{value: amount}("");
        require(success, "BNB transfer failed");
        emit AgentWithdrawn(tokenId, amount);
    }

    /// @dev Accept BNB transfers
    receive() external payable {}
}
