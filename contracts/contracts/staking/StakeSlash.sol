// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title StakeSlash - Staking and slashing for DePIN station operators
/// @notice Station operators stake BNB as collateral. Authorized slashers can penalize
///         misbehaving operators by slashing a percentage of their stake.
/// @dev Slashing is currently triggered manually by authorized slashers (governance/admin).
///      Automatic slashing triggered by ZKClawGateway verification failures is planned
///      but not yet implemented.
contract StakeSlash {

    address public admin;

    mapping(address => uint256) public stakes;
    mapping(address => bool) public authorizedSlashers;

    uint256 public minStake = 0.01 ether;
    uint256 public slashPercentBps = 1000; // 10%
    uint256 public totalSlashed;

    event Staked(address indexed staker, uint256 amount, uint256 totalStake);
    event Unstaked(address indexed staker, uint256 amount, uint256 remaining);
    event Slashed(address indexed staker, uint256 amount, string reason);
    event SlasherAuthorized(address indexed slasher);
    event SlasherRevoked(address indexed slasher);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    /// @notice Stake BNB as collateral
    function stake() external payable {
        require(msg.value >= minStake, "Below minimum stake");
        stakes[msg.sender] += msg.value;
        emit Staked(msg.sender, msg.value, stakes[msg.sender]);
    }

    /// @notice Unstake BNB (partial or full)
    function unstake(uint256 amount) external {
        require(amount > 0, "Amount must be > 0");
        uint256 current = stakes[msg.sender];
        require(current >= amount, "Insufficient stake");
        uint256 remaining = current - amount;
        require(remaining >= minStake || remaining == 0, "Remaining below minimum stake");

        stakes[msg.sender] = remaining;
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "BNB transfer failed");
        emit Unstaked(msg.sender, amount, remaining);
    }

    /// @notice Authorize an address to slash stakers
    function authorizeSlasher(address slasher) external onlyAdmin {
        authorizedSlashers[slasher] = true;
        emit SlasherAuthorized(slasher);
    }

    /// @notice Revoke slashing authorization
    function revokeSlasher(address slasher) external onlyAdmin {
        authorizedSlashers[slasher] = false;
        emit SlasherRevoked(slasher);
    }

    /// @notice Slash a staker's stake
    function slash(address staker, string calldata reason) external {
        require(authorizedSlashers[msg.sender], "Not authorized slasher");
        uint256 stakeAmount = stakes[staker];
        require(stakeAmount > 0, "No stake to slash");

        uint256 slashAmount = stakeAmount * slashPercentBps / 10000;
        stakes[staker] -= slashAmount;
        totalSlashed += slashAmount;

        // If remaining stake is below minimum, slash it entirely
        if (stakes[staker] > 0 && stakes[staker] < minStake) {
            uint256 dust = stakes[staker];
            stakes[staker] = 0;
            totalSlashed += dust;
            slashAmount += dust;
        }

        emit Slashed(staker, slashAmount, reason);
    }

    /// @notice Withdraw accumulated slashed funds to admin
    function withdrawSlashed() external onlyAdmin {
        uint256 amount = totalSlashed;
        require(amount > 0, "Nothing to withdraw");
        require(address(this).balance >= amount, "Insufficient balance");
        totalSlashed = 0;
        (bool success, ) = admin.call{value: amount}("");
        require(success, "BNB transfer failed");
    }
}
