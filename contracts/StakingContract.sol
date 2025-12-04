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

    // Dynamic APY Boost System
    uint256 public baselineTVL;                      // Baseline TVL for drop detection
    uint256 public constant TVL_DROP_THRESHOLD = 1000; // 10% = 1000 basis points
    uint256 public constant APY_BOOST_MULTIPLIER = 15000; // 1.5x = 15000 basis points (15000/10000)
    bool public apyBoostActive;                       // Whether APY boost is currently active
    uint256 public apyBoostStartTime;                 // When boost was activated
    uint256 public constant APY_BOOST_DURATION = 7 days; // Boost lasts 7 days

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
    event BaselineTVLUpdated(uint256 oldBaseline, uint256 newBaseline);
    event APYBoostActivated(uint256 tvlDropPercent, uint256 newTier1APY, uint256 newTier2APY, uint256 newTier3APY);
    event APYBoostDeactivated();

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

        // Initialize baseline TVL to 0 (will be set after first staking)
        baselineTVL = 0;
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

        // Check if we need to update baseline or trigger APY boost
        _checkAndUpdateTVL();

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

        // Check if TVL drop triggers APY boost
        _checkAndUpdateTVL();

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
     * @dev Get effective APY for a tier (with boost if active)
     * @param _tier Tier number
     * @return Effective APY in basis points
     */
    function getEffectiveAPY(uint256 _tier) public view returns (uint256) {
        require(_tier >= 1 && _tier <= TIER_COUNT, "StakingContract: Invalid tier");
        
        uint256 baseAPY = tiers[_tier].apy;
        
        // Check if boost is active and not expired
        if (apyBoostActive) {
            if (block.timestamp <= apyBoostStartTime + APY_BOOST_DURATION) {
                // Apply boost: baseAPY * 1.5
                return (baseAPY * APY_BOOST_MULTIPLIER) / 10000;
            } else {
                // Boost expired, deactivate it (will be cleaned up on next check)
                return baseAPY;
            }
        }
        
        return baseAPY;
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
     * @dev Set baseline TVL (owner only, or can be called automatically)
     * @param _baselineTVL The baseline TVL value
     */
    function setBaselineTVL(uint256 _baselineTVL) external onlyOwner {
        uint256 oldBaseline = baselineTVL;
        baselineTVL = _baselineTVL;
        emit BaselineTVLUpdated(oldBaseline, _baselineTVL);
    }

    /**
     * @dev Check TVL drop and activate APY boost if needed
     * Called automatically on stake/unstake, or can be called manually
     */
    function _checkAndUpdateTVL() internal {
        // If boost is active but expired, deactivate it
        if (apyBoostActive && block.timestamp > apyBoostStartTime + APY_BOOST_DURATION) {
            apyBoostActive = false;
            emit APYBoostDeactivated();
        }

        // If baseline is 0, set it to current TVL (first time setup)
        if (baselineTVL == 0 && totalStaked > 0) {
            baselineTVL = totalStaked;
            emit BaselineTVLUpdated(0, totalStaked);
            return;
        }

        // Don't check if baseline is not set or boost already active
        if (baselineTVL == 0 || apyBoostActive) {
            return;
        }

        // Calculate TVL drop percentage
        if (totalStaked < baselineTVL) {
            uint256 drop = baselineTVL - totalStaked;
            uint256 dropPercent = (drop * 10000) / baselineTVL; // In basis points

            // If drop >= 10% (1000 basis points), activate boost
            if (dropPercent >= TVL_DROP_THRESHOLD) {
                _activateAPYBoost();
            }
        }
    }

    /**
     * @dev Activate APY boost by updating tier APYs
     */
    function _activateAPYBoost() internal {
        require(!apyBoostActive, "StakingContract: Boost already active");

        // Calculate boosted APYs (1.5x multiplier)
        uint256 newTier1APY = (tiers[1].apy * APY_BOOST_MULTIPLIER) / 10000;
        uint256 newTier2APY = (tiers[2].apy * APY_BOOST_MULTIPLIER) / 10000;
        uint256 newTier3APY = (tiers[3].apy * APY_BOOST_MULTIPLIER) / 10000;

        // Update tiers with boosted APY
        tiers[1].apy = newTier1APY;
        tiers[2].apy = newTier2APY;
        tiers[3].apy = newTier3APY;

        // Activate boost
        apyBoostActive = true;
        apyBoostStartTime = block.timestamp;

        emit APYBoostActivated(
            ((baselineTVL - totalStaked) * 10000) / baselineTVL,
            newTier1APY,
            newTier2APY,
            newTier3APY
        );
    }

    /**
     * @dev Manually check and update TVL (public function for external calls)
     */
    function checkAndUpdateTVL() external {
        _checkAndUpdateTVL();
    }

    /**
     * @dev Get APY boost status
     */
    function getAPYBoostStatus() 
        external 
        view 
        returns (
            bool active,
            uint256 startTime,
            uint256 duration,
            uint256 timeRemaining
        ) 
    {
        if (!apyBoostActive) {
            return (false, 0, APY_BOOST_DURATION, 0);
        }

        uint256 elapsed = block.timestamp - apyBoostStartTime;
        uint256 remaining = elapsed < APY_BOOST_DURATION 
            ? APY_BOOST_DURATION - elapsed 
            : 0;

        return (apyBoostActive, apyBoostStartTime, APY_BOOST_DURATION, remaining);
    }
}

