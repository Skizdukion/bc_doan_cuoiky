// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title LPTimelock
 * @dev Locks LP tokens for a specified period (12 months)
 * @notice LP tokens are locked and can only be unlocked after the lock period expires
 */
contract LPTimelock is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct LockInfo {
        address lpToken;      // LP token address
        uint256 amount;       // Amount of LP tokens locked
        uint256 unlockTime;   // Timestamp when tokens can be unlocked
        address beneficiary;  // Address that will receive tokens after unlock
        bool unlocked;        // Whether tokens have been unlocked
    }

    // Mapping from lock ID to lock info
    mapping(uint256 => LockInfo) public locks;
    uint256 public lockCount;
    
    // Default lock duration: 12 months
    uint256 public constant DEFAULT_LOCK_DURATION = 365 days;

    event TokensLocked(
        uint256 indexed lockId,
        address indexed lpToken,
        uint256 amount,
        uint256 unlockTime,
        address indexed beneficiary
    );

    event TokensUnlocked(
        uint256 indexed lockId,
        address indexed lpToken,
        uint256 amount,
        address indexed beneficiary
    );

    /**
     * @dev Constructor
     */
    constructor() {}

    /**
     * @dev Lock LP tokens for 12 months
     * @param _lpToken Address of the LP token contract
     * @param _amount Amount of LP tokens to lock
     * @param _beneficiary Address that will receive tokens after unlock
     * @return lockId The ID of the created lock
     */
    function lock(
        address _lpToken,
        uint256 _amount,
        address _beneficiary
    ) external onlyOwner nonReentrant returns (uint256) {
        require(_lpToken != address(0), "LPTimelock: Invalid LP token address");
        require(_amount > 0, "LPTimelock: Amount must be greater than 0");
        require(_beneficiary != address(0), "LPTimelock: Invalid beneficiary address");

        // Transfer LP tokens from owner to this contract
        IERC20 lpToken = IERC20(_lpToken);
        lpToken.safeTransferFrom(msg.sender, address(this), _amount);

        // Calculate unlock time (12 months from now)
        uint256 unlockTime = block.timestamp + DEFAULT_LOCK_DURATION;

        // Create lock
        uint256 lockId = lockCount;
        locks[lockId] = LockInfo({
            lpToken: _lpToken,
            amount: _amount,
            unlockTime: unlockTime,
            beneficiary: _beneficiary,
            unlocked: false
        });

        lockCount++;

        emit TokensLocked(lockId, _lpToken, _amount, unlockTime, _beneficiary);

        return lockId;
    }

    /**
     * @dev Lock LP tokens with custom lock duration
     * @param _lpToken Address of the LP token contract
     * @param _amount Amount of LP tokens to lock
     * @param _beneficiary Address that will receive tokens after unlock
     * @param _lockDuration Lock duration in seconds
     * @return lockId The ID of the created lock
     */
    function lockWithDuration(
        address _lpToken,
        uint256 _amount,
        address _beneficiary,
        uint256 _lockDuration
    ) external onlyOwner nonReentrant returns (uint256) {
        require(_lpToken != address(0), "LPTimelock: Invalid LP token address");
        require(_amount > 0, "LPTimelock: Amount must be greater than 0");
        require(_beneficiary != address(0), "LPTimelock: Invalid beneficiary address");
        require(_lockDuration > 0, "LPTimelock: Lock duration must be greater than 0");

        // Transfer LP tokens from owner to this contract
        IERC20 lpToken = IERC20(_lpToken);
        lpToken.safeTransferFrom(msg.sender, address(this), _amount);

        // Calculate unlock time
        uint256 unlockTime = block.timestamp + _lockDuration;

        // Create lock
        uint256 lockId = lockCount;
        locks[lockId] = LockInfo({
            lpToken: _lpToken,
            amount: _amount,
            unlockTime: unlockTime,
            beneficiary: _beneficiary,
            unlocked: false
        });

        lockCount++;

        emit TokensLocked(lockId, _lpToken, _amount, unlockTime, _beneficiary);

        return lockId;
    }

    /**
     * @dev Unlock LP tokens after lock period expires
     * @param _lockId The ID of the lock to unlock
     */
    function unlock(uint256 _lockId) external nonReentrant {
        LockInfo storage lockInfo = locks[_lockId];
        
        require(lockInfo.lpToken != address(0), "LPTimelock: Lock does not exist");
        require(!lockInfo.unlocked, "LPTimelock: Tokens already unlocked");
        require(block.timestamp >= lockInfo.unlockTime, "LPTimelock: Lock period not expired");

        // Mark as unlocked
        lockInfo.unlocked = true;

        // Transfer LP tokens to beneficiary
        IERC20 lpToken = IERC20(lockInfo.lpToken);
        lpToken.safeTransfer(lockInfo.beneficiary, lockInfo.amount);

        emit TokensUnlocked(_lockId, lockInfo.lpToken, lockInfo.amount, lockInfo.beneficiary);
    }

    /**
     * @dev Get lock information
     * @param _lockId The ID of the lock
     * @return LockInfo struct containing lock details
     */
    function getLockInfo(uint256 _lockId) external view returns (LockInfo memory) {
        return locks[_lockId];
    }

    /**
     * @dev Get total number of locks
     * @return Total number of locks created
     */
    function getLockCount() external view returns (uint256) {
        return lockCount;
    }

    /**
     * @dev Check if a lock can be unlocked
     * @param _lockId The ID of the lock
     * @return True if lock can be unlocked, false otherwise
     */
    function canUnlock(uint256 _lockId) external view returns (bool) {
        LockInfo memory lockInfo = locks[_lockId];
        
        if (lockInfo.lpToken == address(0)) {
            return false; // Lock doesn't exist
        }
        
        if (lockInfo.unlocked) {
            return false; // Already unlocked
        }
        
        return block.timestamp >= lockInfo.unlockTime;
    }
}

