// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title AgentPaymaster - Gas Sponsorship for AI Agents (ERC-4337 Simplified)
/// @notice Allows approved AI agents to execute calls with sponsored gas.
contract AgentPaymaster is ReentrancyGuard {
    address public admin;
    mapping(address => bool) public approvedAgents;
    uint256 public totalSponsored;

    event GasSponsored(address indexed agent, address indexed target, uint256 gasUsed, uint256 gasCost);
    event AgentApproved(address indexed agent);
    event AgentRevoked(address indexed agent);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    receive() external payable {}

    function approveAgent(address agent) external onlyAdmin {
        approvedAgents[agent] = true;
        emit AgentApproved(agent);
    }

    function revokeAgent(address agent) external onlyAdmin {
        approvedAgents[agent] = false;
        emit AgentRevoked(agent);
    }

    uint256 constant GAS_OVERHEAD = 30000;

    /// @notice Execute a call on behalf of an approved agent, sponsoring gas
    function sponsoredCall(address target, bytes calldata data)
        external nonReentrant returns (bytes memory)
    {
        require(approvedAgents[msg.sender], "Agent not approved");
        require(target != address(this), "Cannot call self");
        uint256 gasBefore = gasleft();
        (bool success, bytes memory result) = target.call(data);
        require(success, "Sponsored call failed");
        uint256 gasUsed = gasBefore - gasleft();
        uint256 gasCost = (gasUsed + GAS_OVERHEAD) * tx.gasprice;
        totalSponsored += gasCost;
        emit GasSponsored(msg.sender, target, gasUsed, gasCost);
        return result;
    }

    function withdraw(uint256 amount) external onlyAdmin {
        require(address(this).balance >= amount, "Insufficient balance");
        (bool ok, ) = admin.call{value: amount}("");
        require(ok, "Transfer failed");
    }

    function balance() external view returns (uint256) {
        return address(this).balance;
    }
}
