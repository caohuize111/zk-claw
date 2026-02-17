// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/// @title ValidationRegistry - ERC-8004 Compliant Validation Registry
/// @notice Pull-based validation: agent owner requests validation, validator responds (0-100, monotonic).
/// @dev References NFA (BAP-578) as the identity layer for ownership checks.
///      Follows the ERC-8004 ValidationRegistryUpgradeable interface exactly,
///      but as a non-upgradeable deployment (no UUPS proxy needed).
contract ValidationRegistry {

    // ─── Events (ERC-8004 compliant) ────────────────────────────
    event ValidationRequest(
        address indexed validatorAddress,
        uint256 indexed agentId,
        string requestURI,
        bytes32 indexed requestHash
    );

    event ValidationResponse(
        address indexed validatorAddress,
        uint256 indexed agentId,
        bytes32 indexed requestHash,
        uint8 response,
        string responseURI,
        bytes32 responseHash,
        string tag
    );

    // ─── Types ──────────────────────────────────────────────────
    struct ValidationStatus {
        address validatorAddress;
        uint256 agentId;
        uint8 response;         // 0..100
        bytes32 responseHash;
        string tag;
        uint256 lastUpdate;
        bool hasResponse;
    }

    // ─── State ──────────────────────────────────────────────────
    IERC721 public immutable nfa;

    mapping(bytes32 => ValidationStatus) private _validations;
    mapping(uint256 => bytes32[]) private _agentValidations;
    mapping(address => bytes32[]) private _validatorRequests;

    // ─── Constructor ────────────────────────────────────────────
    constructor(address _nfa) {
        require(_nfa != address(0), "bad nfa");
        nfa = IERC721(_nfa);
    }

    // ═══════════════════════════════════════════════════════════════
    // WRITE
    // ═══════════════════════════════════════════════════════════════

    /// @notice Request validation for an agent (ERC-8004 compliant)
    /// @dev Caller must be the agent owner, approved operator, or the agent's logic contract.
    function validationRequest(
        address validatorAddress,
        uint256 agentId,
        string calldata requestURI,
        bytes32 requestHash
    ) external {
        require(validatorAddress != address(0), "bad validator");
        require(_validations[requestHash].lastUpdate == 0, "exists");

        // Permission check: caller must be owner, approved, or logic contract
        _requireAuthorized(agentId);

        _validations[requestHash] = ValidationStatus({
            validatorAddress: validatorAddress,
            agentId: agentId,
            response: 0,
            responseHash: bytes32(0),
            tag: "",
            lastUpdate: block.timestamp,
            hasResponse: false
        });

        _agentValidations[agentId].push(requestHash);
        _validatorRequests[validatorAddress].push(requestHash);

        emit ValidationRequest(validatorAddress, agentId, requestURI, requestHash);
    }

    /// @notice Respond to a validation request (ERC-8004 compliant)
    /// @dev Only the designated validator can respond. Response can only increase (monotonic).
    function validationResponse(
        bytes32 requestHash,
        uint8 response,
        string calldata responseURI,
        bytes32 responseHash,
        string calldata tag
    ) external {
        ValidationStatus storage s = _validations[requestHash];
        require(s.lastUpdate > 0, "unknown");
        require(msg.sender == s.validatorAddress, "not validator");
        require(response <= 100, "resp>100");
        require(response >= s.response, "response cannot decrease");

        s.response = response;
        s.responseHash = responseHash;
        s.tag = tag;
        s.lastUpdate = block.timestamp;
        s.hasResponse = true;

        emit ValidationResponse(s.validatorAddress, s.agentId, requestHash, response, responseURI, responseHash, tag);
    }

    // ═══════════════════════════════════════════════════════════════
    // READ
    // ═══════════════════════════════════════════════════════════════

    function getValidationStatus(bytes32 requestHash)
        external
        view
        returns (
            address validatorAddress,
            uint256 agentId,
            uint8 response,
            bytes32 responseHash,
            string memory tag,
            uint256 lastUpdate
        )
    {
        ValidationStatus memory s = _validations[requestHash];
        require(s.lastUpdate > 0, "unknown");
        return (s.validatorAddress, s.agentId, s.response, s.responseHash, s.tag, s.lastUpdate);
    }

    /// @notice Get aggregated validation summary for an agent (ERC-8004 compliant)
    function getSummary(
        uint256 agentId,
        address[] calldata validatorAddresses,
        string calldata tag
    ) external view returns (uint64 count, uint8 avgResponse) {
        uint256 totalResponse;

        bytes32[] storage requestHashes = _agentValidations[agentId];

        for (uint256 i; i < requestHashes.length; i++) {
            ValidationStatus storage s = _validations[requestHashes[i]];

            // Filter by validator if specified
            bool matchValidator = (validatorAddresses.length == 0);
            if (!matchValidator) {
                for (uint256 j; j < validatorAddresses.length; j++) {
                    if (s.validatorAddress == validatorAddresses[j]) {
                        matchValidator = true;
                        break;
                    }
                }
            }

            // Filter by tag (empty = no filter)
            bool matchTag = (bytes(tag).length == 0) ||
                (keccak256(bytes(s.tag)) == keccak256(bytes(tag)));

            if (matchValidator && matchTag && s.hasResponse) {
                totalResponse += s.response;
                count++;
            }
        }

        avgResponse = count > 0 ? uint8(totalResponse / count) : 0;
    }

    function getAgentValidations(uint256 agentId) external view returns (bytes32[] memory) {
        return _agentValidations[agentId];
    }

    function getValidatorRequests(address validatorAddress) external view returns (bytes32[] memory) {
        return _validatorRequests[validatorAddress];
    }

    function getAgentValidationCount(uint256 agentId) external view returns (uint256) {
        return _agentValidations[agentId].length;
    }

    // ─── Internal ───────────────────────────────────────────────

    /// @dev Check if msg.sender is authorized to act on behalf of agentId.
    ///      Accepts: owner, approved operator, or the agent's logic contract.
    function _requireAuthorized(uint256 agentId) internal view {
        address tokenOwner = nfa.ownerOf(agentId);
        bool authorized = (msg.sender == tokenOwner) ||
            nfa.isApprovedForAll(tokenOwner, msg.sender) ||
            (nfa.getApproved(agentId) == msg.sender);

        // Also allow the agent's logic contract (ZKClawGateway)
        if (!authorized) {
            // Try to check logic address via NFA (non-standard, but needed for gateway integration)
            try INFA(address(nfa)).getLogicAddress(agentId) returns (address logic) {
                authorized = (msg.sender == logic);
            } catch {}
        }

        require(authorized, "Not authorized");
    }
}

/// @dev Minimal interface to read NFA logic address
interface INFA {
    function getLogicAddress(uint256 tokenId) external view returns (address);
}
