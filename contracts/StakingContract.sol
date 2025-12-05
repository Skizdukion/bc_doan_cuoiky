// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./VNDC.sol";

/**
 * @title StakingContract
 * @dev Staking contract with lock tiers and reward emission
 * @notice Supports multiple staking tiers with different APY and lock periods
 */
contract StakingContract is Ownable, ReentrancyGuard {
    using SafeERC20 for VNDC;

    VNDC public immutable token;
    
    // Staking tiers
    struct Tier {
        uint256 lockDuration;  // Lock duration in seconds
        uint256 apy;           // APY in basis points (100 = 1%)
        uint256 minStake;      // Minimum stake amount
    }

    // Stake information
    struct Stake {
        address staker;
        uint256 amount;
        uint256 startTime;
        uint256 lockDuration;
        uint256 tier;
        uint256 apy;
        uint256 claimedRewards;
        bool active;
    }

    // Tier configurations
    mapping(uint256 => Tier) public tiers;
    uint256 public constant TIER_COUNT = 3;

    // Staking state
    mapping(address => uint256[]) public userStakes;  // User address => stake IDs
    mapping(uint256 => Stake) public stakes;          // Stake ID => Stake info
    uint256 public totalStakes;
    uint256 public totalStaked;
    
    // Reward pool
    uint256 public rewardPool;                        // Total reward tokens available
    uint256 public constant EARLY_WITHDRAWAL_PENALTY = 5000; // 50% in basis points
    uint256 public constant MIN_STAKE = 1000 * 10**18; // 1000 tokens minimum

    // Dynamic APY Boost System (Monotonically Decreasing)
    // APY boost increases when TVL/totalSupply ratio is LOW
    // Higher ratio = Lower boost (monotonically decreasing)
    uint256 public constant MAX_APY_BOOST_MULTIPLIER = 20000; // 2x cap in basis points
    uint256 public currentAPYBoostMultiplier;         // Boost multiplier (basis points, 10000 = 1x)
    bool public apyBoostActive;                       // Whether APY boost is currently active
    uint256 public apyBoostStartTime;                 // When boost was last updated
    uint256 public constant APY_BOOST_UPDATE_INTERVAL = 1 days; // Update boost every day

    // Events
    event StakeCreated(
        uint256 indexed stakeId,
        address indexed staker,
        uint256 amount,
        uint256 tier,
        uint256 lockDuration
    );
    event StakeUnstaked(
        uint256 indexed stakeId,
        address indexed staker,
        uint256 amount,
        uint256 rewards,
        bool earlyWithdrawal
    );
    event RewardsClaimed(
        uint256 indexed stakeId,
        address indexed staker,
        uint256 amount
    );
    event RewardsCompounded(
        uint256 indexed stakeId,
        address indexed staker,
        uint256 amount
    );
    event RewardPoolFunded(address indexed funder, uint256 amount);
    event TierUpdated(uint256 tier, uint256 lockDuration, uint256 apy, uint256 minStake);
    event APYBoostUpdated(uint256 tvlRatio, uint256 boostMultiplier, uint256 newTier1APY, uint256 newTier2APY, uint256 newTier3APY);

    /**
     * @dev Constructor
     * @param _token Address of VNDC token contract
     */
    constructor(address _token) {
        require(_token != address(0), "StakingContract: Invalid token address");
        token = VNDC(_token);

        // Initialize tiers
        // Tier 1: 1 month lock, 8% APY
        tiers[1] = Tier({
            lockDuration: 30 days,
            apy: 800,  // 8% = 800 basis points
            minStake: MIN_STAKE
        });

        // Tier 2: 3 months lock, 12% APY
        tiers[2] = Tier({
            lockDuration: 90 days,
            apy: 1200, // 12% = 1200 basis points
            minStake: MIN_STAKE
        });

        // Tier 3: 6 months lock, 18% APY
        tiers[3] = Tier({
            lockDuration: 180 days,
            apy: 1800, // 18% = 1800 basis points
            minStake: MIN_STAKE
        });

        // Initialize boost system
        currentAPYBoostMultiplier = 10000; // 1x (no boost initially)
        apyBoostActive = false;
    }

    /**
     * @dev Fund the reward pool
     * @param _amount Amount of tokens to add to reward pool
     */
    function fundRewardPool(uint256 _amount) external {
        require(_amount > 0, "StakingContract: Invalid amount");
        token.safeTransferFrom(msg.sender, address(this), _amount);
        rewardPool += _amount;
        emit RewardPoolFunded(msg.sender, _amount);
    }

    /**
     * @dev Stake tokens
     * @param _amount Amount of tokens to stake
     * @param _tier Staking tier (1, 2, or 3)
     */
    function stake(uint256 _amount, uint256 _tier) external nonReentrant {
        require(_tier >= 1 && _tier <= TIER_COUNT, "StakingContract: Invalid tier");
        require(_amount >= tiers[_tier].minStake, "StakingContract: Below minimum stake");
        require(rewardPool > 0, "StakingContract: Reward pool empty");

        Tier memory tier = tiers[_tier];
        
        // Transfer tokens from staker
        token.safeTransferFrom(msg.sender, address(this), _amount);

        // Create stake
        uint256 stakeId = totalStakes;
        stakes[stakeId] = Stake({
            staker: msg.sender,
            amount: _amount,
            startTime: block.timestamp,
            lockDuration: tier.lockDuration,
            tier: _tier,
            apy: tier.apy,
            claimedRewards: 0,
            active: true
        });

        userStakes[msg.sender].push(stakeId);
        totalStakes++;
        totalStaked += _amount;

        // Update APY boost based on current TVL ratio
        _updateAPYBoost();

        emit StakeCreated(stakeId, msg.sender, _amount, _tier, tier.lockDuration);
    }

    /**
     * @dev Unstake tokens
     * @param _stakeId ID of the stake to unstake
     */
    function unstake(uint256 _stakeId) external nonReentrant {
        Stake storage stakeInfo = stakes[_stakeId];
        
        require(stakeInfo.staker == msg.sender, "StakingContract: Not stake owner");
        require(stakeInfo.active, "StakingContract: Stake not active");

        uint256 rewards = calculateRewards(_stakeId);
        bool earlyWithdrawal = block.timestamp < stakeInfo.startTime + stakeInfo.lockDuration;

        // Apply penalty if early withdrawal
        if (earlyWithdrawal) {
            uint256 penalty = (rewards * EARLY_WITHDRAWAL_PENALTY) / 10000;
            rewards = rewards - penalty;
        }

        // Update state
        stakeInfo.active = false;
        totalStaked -= stakeInfo.amount;

        // Update APY boost based on current TVL ratio
        _updateAPYBoost();

        // Transfer staked amount
        token.safeTransfer(msg.sender, stakeInfo.amount);

        // Transfer rewards if any
        if (rewards > 0 && rewardPool >= rewards) {
            rewardPool -= rewards;
            stakeInfo.claimedRewards += rewards;
            token.safeTransfer(msg.sender, rewards);
        }

        emit StakeUnstaked(_stakeId, msg.sender, stakeInfo.amount, rewards, earlyWithdrawal);
    }

    /**
     * @dev Claim rewards without unstaking
     * @param _stakeId ID of the stake
     */
    function claimRewards(uint256 _stakeId) external nonReentrant {
        Stake storage stakeInfo = stakes[_stakeId];
        
        require(stakeInfo.staker == msg.sender, "StakingContract: Not stake owner");
        require(stakeInfo.active, "StakingContract: Stake not active");

        uint256 rewards = calculateRewards(_stakeId);
        require(rewards > 0, "StakingContract: No rewards to claim");
        require(rewardPool >= rewards, "StakingContract: Insufficient reward pool");

        rewardPool -= rewards;
        stakeInfo.claimedRewards += rewards;
        token.safeTransfer(msg.sender, rewards);

        emit RewardsClaimed(_stakeId, msg.sender, rewards);
    }

    /**
     * @dev Compound rewards (add rewards to stake)
     * @param _stakeId ID of the stake
     */
    function compoundRewards(uint256 _stakeId) external nonReentrant {
        Stake storage stakeInfo = stakes[_stakeId];
        
        require(stakeInfo.staker == msg.sender, "StakingContract: Not stake owner");
        require(stakeInfo.active, "StakingContract: Stake not active");

        uint256 rewards = calculateRewards(_stakeId);
        require(rewards > 0, "StakingContract: No rewards to compound");
        require(rewardPool >= rewards, "StakingContract: Insufficient reward pool");

        rewardPool -= rewards;
        stakeInfo.claimedRewards += rewards;
        stakeInfo.amount += rewards;
        totalStaked += rewards;

        emit RewardsCompounded(_stakeId, msg.sender, rewards);
    }

    /**
     * @dev Calculate rewards for a stake
     * @param _stakeId ID of the stake
     * @return Rewards amount
     */
    function calculateRewards(uint256 _stakeId) public view returns (uint256) {
        Stake memory stakeInfo = stakes[_stakeId];
        
        if (!stakeInfo.active) {
            return 0;
        }

        uint256 timeElapsed = block.timestamp - stakeInfo.startTime;
        uint256 monthsElapsed = timeElapsed / 30 days;
        
        // Get effective APY (with boost if active)
        uint256 effectiveAPY = getEffectiveAPY(stakeInfo.tier);
        
        // Calculate monthly reward: amount * (APY / 12) / 100
        // APY is in basis points, so divide by 10000
        uint256 monthlyReward = (stakeInfo.amount * effectiveAPY) / (12 * 10000);
        uint256 totalRewards = monthlyReward * monthsElapsed;

        // Subtract already claimed rewards
        return totalRewards > stakeInfo.claimedRewards ? totalRewards - stakeInfo.claimedRewards : 0;
    }

    /**
     * @dev Get effective APY for a tier (with boost based on TVL ratio)
     * @param _tier Tier number
     * @return Effective APY in basis points
     */
    function getEffectiveAPY(uint256 _tier) public view returns (uint256) {
        require(_tier >= 1 && _tier <= TIER_COUNT, "StakingContract: Invalid tier");
        
        uint256 baseAPY = tiers[_tier].apy;
        
        // Always apply current boost multiplier (updated based on TVL ratio)
        return (baseAPY * currentAPYBoostMultiplier) / 10000;
    }

    /**
     * @dev Get pending rewards for a stake
     * @param _stakeId ID of the stake
     * @return Pending rewards amount
     */
    function getPendingRewards(uint256 _stakeId) external view returns (uint256) {
        return calculateRewards(_stakeId);
    }

    /**
     * @dev Get stake information
     * @param _stakeId ID of the stake
     */
    function getStakeInfo(uint256 _stakeId) 
        external 
        view 
        returns (
            address staker,
            uint256 amount,
            uint256 startTime,
            uint256 lockDuration,
            uint256 tier,
            uint256 apy,
            uint256 claimedRewards,
            bool active,
            uint256 unlockTime,
            uint256 pendingRewards
        ) 
    {
        Stake memory stakeInfo = stakes[_stakeId];
        uint256 rewards = calculateRewards(_stakeId);
        uint256 unlock = stakeInfo.startTime + stakeInfo.lockDuration;
        return (
            stakeInfo.staker,
            stakeInfo.amount,
            stakeInfo.startTime,
            stakeInfo.lockDuration,
            stakeInfo.tier,
            stakeInfo.apy,
            stakeInfo.claimedRewards,
            stakeInfo.active,
            unlock,
            rewards
        );
    }

    /**
     * @dev Get all stake IDs for a user
     * @param _user User address
     * @return Array of stake IDs
     */
    function getUserStakes(address _user) external view returns (uint256[] memory) {
        return userStakes[_user];
    }

    /**
     * @dev Update tier configuration (owner only)
     * @param _tier Tier number (1, 2, or 3)
     * @param _lockDuration Lock duration in seconds
     * @param _apy APY in basis points
     * @param _minStake Minimum stake amount
     */
    function updateTier(
        uint256 _tier,
        uint256 _lockDuration,
        uint256 _apy,
        uint256 _minStake
    ) external onlyOwner {
        require(_tier >= 1 && _tier <= TIER_COUNT, "StakingContract: Invalid tier");
        require(_lockDuration > 0, "StakingContract: Invalid lock duration");
        require(_apy > 0, "StakingContract: Invalid APY");
        
        tiers[_tier] = Tier({
            lockDuration: _lockDuration,
            apy: _apy,
            minStake: _minStake
        });

        emit TierUpdated(_tier, _lockDuration, _apy, _minStake);
    }

    /**
     * @dev Get tier information
     * @param _tier Tier number
     */
    function getTier(uint256 _tier) 
        external 
        view 
        returns (
            uint256 lockDuration,
            uint256 apy,
            uint256 minStake
        ) 
    {
        require(_tier >= 1 && _tier <= TIER_COUNT, "StakingContract: Invalid tier");
        Tier memory tier = tiers[_tier];
        return (tier.lockDuration, tier.apy, tier.minStake);
    }

    /**
     * @dev Get contract statistics
     */
    function getStats() 
        external 
        view 
        returns (
            uint256 _totalStakes,
            uint256 _totalStaked,
            uint256 _rewardPool
        ) 
    {
        return (totalStakes, totalStaked, rewardPool);
    }

    /**
     * @dev Update APY boost based on current TVL/totalSupply ratio
     * Monotonically Decreasing: Lower ratio = Higher boost
     * Called automatically on stake/unstake
     */
    function _updateAPYBoost() internal {
        uint256 mintedSupply = token.totalSupply();
        if (mintedSupply == 0) {
            currentAPYBoostMultiplier = 10000; // 1x (no boost)
            return;
        }

        // Calculate TVL ratio: totalStaked / totalSupply (in basis points)
        uint256 tvlRatio = (totalStaked * 10000) / mintedSupply;

        // Calculate boost multiplier based on ratio (monotonically decreasing)
        // Lower ratio = Higher boost
        currentAPYBoostMultiplier = _calculateBoostMultiplier(tvlRatio);
        
        // Update timestamp
        apyBoostStartTime = block.timestamp;
        apyBoostActive = currentAPYBoostMultiplier > 10000;

        emit APYBoostUpdated(
            tvlRatio,
            currentAPYBoostMultiplier,
            (tiers[1].apy * currentAPYBoostMultiplier) / 10000,
            (tiers[2].apy * currentAPYBoostMultiplier) / 10000,
            (tiers[3].apy * currentAPYBoostMultiplier) / 10000
        );
    }

    /**
     * @dev Calculate boost multiplier based on TVL ratio (monotonically decreasing)
     * @param tvlRatio TVL ratio in basis points (totalStaked * 10000 / totalSupply)
     * @return Boost multiplier in basis points
     * 
     * Ratio < 10% (1000 bp): 2.0x boost (highest - encourage staking)
     * Ratio 10-20% (1000-2000 bp): 1.75x boost
     * Ratio 20-30% (2000-3000 bp): 1.5x boost
     * Ratio 30-40% (3000-4000 bp): 1.25x boost
     * Ratio >= 40% (>=4000 bp): 1.0x boost (no boost - enough staking)
     */
    function _calculateBoostMultiplier(uint256 tvlRatio) internal pure returns (uint256) {
        if (tvlRatio < 1000) {
            // TVL < 10% of supply: Maximum boost
            return MAX_APY_BOOST_MULTIPLIER; // 2.0x
        }
        if (tvlRatio < 2000) {
            // TVL 10-20% of supply: High boost
            return 17500; // 1.75x
        }
        if (tvlRatio < 3000) {
            // TVL 20-30% of supply: Medium boost
            return 15000; // 1.5x
        }
        if (tvlRatio < 4000) {
            // TVL 30-40% of supply: Low boost
            return 12500; // 1.25x
        }
        // TVL >= 40% of supply: No boost
        return 10000; // 1.0x (no boost)
    }

    /**
     * @dev Manually update APY boost (public function for external calls)
     */
    function updateAPYBoost() external {
        _updateAPYBoost();
    }

    /**
     * @dev Get APY boost status
     */
    function getAPYBoostStatus() 
        external 
        view 
        returns (
            bool active,
            uint256 multiplier,
            uint256 tvlRatio,
            uint256 totalStakedAmount,
            uint256 totalSupplyAmount
        ) 
    {
        uint256 mintedSupply = token.totalSupply();
        uint256 ratio = mintedSupply > 0 ? (totalStaked * 10000) / mintedSupply : 0;
        
        return (
            apyBoostActive,
            currentAPYBoostMultiplier,
            ratio,
            totalStaked,
            mintedSupply
        );
    }
}

