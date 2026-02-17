// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MockValidationRegistry - Simplified ERC-8004 Validation Registry
/// @notice Pull-based validation: agent requests → validator responds (0-100, only increases)
contract MockValidationRegistry {

    struct ValidationStatus {
        address validatorAddress;
        uint256 agentId;
        uint8 response;         // 0..100
        bytes32 responseHash;
        string tag;
        uint256 lastUpdate;
        bool hasResponse;
    }

    mapping(bytes32 => ValidationStatus) public validations;
    mapping(uint256 => bytes32[]) public agentValidations;
    mapping(address => bytes32[]) public validatorRequests;

    event ValidationRequested(bytes32 indexed requestHash, address validator, uint256 agentId);
    event ValidationResponded(bytes32 indexed requestHash, uint8 response, string tag);

    function validationRequest(
        address validatorAddress,
        uint256 agentId,
        string calldata requestURI,
        bytes32 requestHash
    ) external {
        require(validations[requestHash].lastUpdate == 0, "Request already exists");

        validations[requestHash] = ValidationStatus({
            validatorAddress: validatorAddress,
            agentId: agentId,
            response: 0,
            responseHash: bytes32(0),
            tag: "",
            lastUpdate: block.timestamp,
            hasResponse: false
        });

        agentValidations[agentId].push(requestHash);
        validatorRequests[validatorAddress].push(requestHash);

        emit ValidationRequested(requestHash, validatorAddress, agentId);
    }

    function validationResponse(
        bytes32 requestHash,
        uint8 response,
        string calldata responseURI,
        bytes32 responseHash,
        string calldata tag
    ) external {
        ValidationStatus storage v = validations[requestHash];
        require(v.lastUpdate > 0, "Request does not exist");
        require(msg.sender == v.validatorAddress, "Not the validator");
        require(response <= 100, "Response must be 0-100");
        require(response >= v.response, "Response can only increase");

        v.response = response;
        v.responseHash = responseHash;
        v.tag = tag;
        v.lastUpdate = block.timestamp;
        v.hasResponse = true;

        emit ValidationResponded(requestHash, response, tag);
    }

    function getValidationStatus(bytes32 requestHash) external view returns (
        address validatorAddress,
        uint256 agentId,
        uint8 response,
        bool hasResponse,
        string memory tag
    ) {
        ValidationStatus storage v = validations[requestHash];
        return (v.validatorAddress, v.agentId, v.response, v.hasResponse, v.tag);
    }

    function getSummary(
        uint256 agentId,
        address[] calldata validatorAddresses,
        string calldata tag
    ) external view returns (uint64 count, uint8 avgResponse) {
        uint256 total = 0;
        uint256 matched = 0;

        bytes32[] storage hashes = agentValidations[agentId];
        for (uint256 i = 0; i < hashes.length; i++) {
            ValidationStatus storage v = validations[hashes[i]];
            if (!v.hasResponse) continue;

            // Filter by tag if provided
            if (bytes(tag).length > 0 && keccak256(bytes(v.tag)) != keccak256(bytes(tag))) continue;

            // Filter by validators if provided
            if (validatorAddresses.length > 0) {
                bool found = false;
                for (uint256 j = 0; j < validatorAddresses.length; j++) {
                    if (v.validatorAddress == validatorAddresses[j]) {
                        found = true;
                        break;
                    }
                }
                if (!found) continue;
            }

            total += v.response;
            matched++;
        }

        count = uint64(matched);
        avgResponse = matched > 0 ? uint8(total / matched) : 0;
    }

    function getAgentValidationCount(uint256 agentId) external view returns (uint256) {
        return agentValidations[agentId].length;
    }
}
