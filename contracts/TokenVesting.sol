// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./VNDC.sol";

/**
 * @title TokenVesting
 * @dev Vesting contract with cliff period and linear vesting
 * @notice Supports multiple beneficiaries with individual vesting schedules
 */
contract TokenVesting is Ownable, ReentrancyGuard {
    using SafeERC20 for VNDC;

    VNDC public immutable token;

    struct VestingSchedule {
        address beneficiary;
        uint256 totalAmount;
        uint256 startTime;
        uint256 cliffDuration;      // Cliff period in seconds
        uint256 vestingDuration;    // Total vesting duration in seconds
        uint256 released;           // Amount already released
        bool revocable;             // Whether vesting can be revoked
        bool revoked;               // Whether vesting has been revoked
    }

    // Mapping from beneficiary to vesting schedule
    mapping(address => VestingSchedule) public vestingSchedules;
    address[] public beneficiaries;

    // Events
    event VestingScheduleCreated(
        address indexed beneficiary,
        uint256 totalAmount,
        uint256 startTime,
        uint256 cliffDuration,
        uint256 vestingDuration
    );
    event TokensReleased(address indexed beneficiary, uint256 amount);
    event VestingRevoked(address indexed beneficiary, uint256 revokedAmount);

    /**
     * @dev Constructor
     * @param _token Address of VNDC token contract
     */
    constructor(address _token) {
        require(_token != address(0), "TokenVesting: Invalid token address");
        token = VNDC(_token);
    }

    /**
     * @dev Create a vesting schedule for a beneficiary
     * @param _beneficiary Address of the beneficiary
     * @param _totalAmount Total amount of tokens to vest
     * @param _cliffDuration Cliff period in seconds (e.g., 6 months = 15552000)
     * @param _vestingDuration Total vesting duration in seconds (e.g., 24 months = 62208000)
     * @param _revocable Whether the vesting can be revoked
     */
    function createVestingSchedule(
        address _beneficiary,
        uint256 _totalAmount,
        uint256 _cliffDuration,
        uint256 _vestingDuration,
        bool _revocable
    ) external onlyOwner {
        require(_beneficiary != address(0), "TokenVesting: Invalid beneficiary");
        require(_totalAmount > 0, "TokenVesting: Invalid amount");
        require(_vestingDuration > 0, "TokenVesting: Invalid vesting duration");
        require(vestingSchedules[_beneficiary].beneficiary == address(0), "TokenVesting: Schedule already exists");

        // Transfer tokens to this contract
        token.safeTransferFrom(msg.sender, address(this), _totalAmount);

        vestingSchedules[_beneficiary] = VestingSchedule({
            beneficiary: _beneficiary,
            totalAmount: _totalAmount,
            startTime: block.timestamp,
            cliffDuration: _cliffDuration,
            vestingDuration: _vestingDuration,
            released: 0,
            revocable: _revocable,
            revoked: false
        });

        beneficiaries.push(_beneficiary);

        emit VestingScheduleCreated(
            _beneficiary,
            _totalAmount,
            block.timestamp,
            _cliffDuration,
            _vestingDuration
        );
    }

    /**
     * @dev Create multiple vesting schedules in batch
     * @param _beneficiaries Array of beneficiary addresses
     * @param _amounts Array of total amounts
     * @param _cliffDurations Array of cliff durations
     * @param _vestingDurations Array of vesting durations
     * @param _revocable Whether vestings are revocable
     */
    function createVestingSchedulesBatch(
        address[] calldata _beneficiaries,
        uint256[] calldata _amounts,
        uint256[] calldata _cliffDurations,
        uint256[] calldata _vestingDurations,
        bool _revocable
    ) external onlyOwner {
        require(
            _beneficiaries.length == _amounts.length &&
            _amounts.length == _cliffDurations.length &&
            _cliffDurations.length == _vestingDurations.length,
            "TokenVesting: Arrays length mismatch"
        );

        uint256 totalAmount = 0;
        for (uint256 i = 0; i < _amounts.length; i++) {
            totalAmount += _amounts[i];
        }

        // Transfer all tokens at once
        token.safeTransferFrom(msg.sender, address(this), totalAmount);

        for (uint256 i = 0; i < _beneficiaries.length; i++) {
            require(_beneficiaries[i] != address(0), "TokenVesting: Invalid beneficiary");
            require(_amounts[i] > 0, "TokenVesting: Invalid amount");
            require(vestingSchedules[_beneficiaries[i]].beneficiary == address(0), "TokenVesting: Schedule already exists");

            vestingSchedules[_beneficiaries[i]] = VestingSchedule({
                beneficiary: _beneficiaries[i],
                totalAmount: _amounts[i],
                startTime: block.timestamp,
                cliffDuration: _cliffDurations[i],
                vestingDuration: _vestingDurations[i],
                released: 0,
                revocable: _revocable,
                revoked: false
            });

            beneficiaries.push(_beneficiaries[i]);

            emit VestingScheduleCreated(
                _beneficiaries[i],
                _amounts[i],
                block.timestamp,
                _cliffDurations[i],
                _vestingDurations[i]
            );
        }
    }

    /**
     * @dev Release vested tokens to beneficiary
     * @notice Can be called by beneficiary or anyone
     */
    function release() external nonReentrant {
        address beneficiary = msg.sender;
        VestingSchedule storage schedule = vestingSchedules[beneficiary];
        
        require(schedule.beneficiary != address(0), "TokenVesting: No vesting schedule");
        require(!schedule.revoked, "TokenVesting: Vesting revoked");

        uint256 vestedAmount = getVestedAmount(beneficiary);
        uint256 releasable = vestedAmount - schedule.released;

        require(releasable > 0, "TokenVesting: No tokens to release");

        schedule.released += releasable;
        token.safeTransfer(beneficiary, releasable);

        emit TokensReleased(beneficiary, releasable);
    }

    /**
     * @dev Release tokens for a specific beneficiary (anyone can call)
     * @param _beneficiary Address of the beneficiary
     */
    function releaseFor(address _beneficiary) external nonReentrant {
        VestingSchedule storage schedule = vestingSchedules[_beneficiary];
        
        require(schedule.beneficiary != address(0), "TokenVesting: No vesting schedule");
        require(!schedule.revoked, "TokenVesting: Vesting revoked");

        uint256 vestedAmount = getVestedAmount(_beneficiary);
        uint256 releasable = vestedAmount - schedule.released;

        require(releasable > 0, "TokenVesting: No tokens to release");

        schedule.released += releasable;
        token.safeTransfer(_beneficiary, releasable);

        emit TokensReleased(_beneficiary, releasable);
    }

    /**
     * @dev Revoke vesting schedule (only before cliff ends)
     * @param _beneficiary Address of the beneficiary
     */
    function revoke(address _beneficiary) external onlyOwner {
        VestingSchedule storage schedule = vestingSchedules[_beneficiary];
        
        require(schedule.beneficiary != address(0), "TokenVesting: No vesting schedule");
        require(schedule.revocable, "TokenVesting: Vesting not revocable");
        require(!schedule.revoked, "TokenVesting: Already revoked");
        
        // Can only revoke before cliff ends
        require(block.timestamp < schedule.startTime + schedule.cliffDuration, "TokenVesting: Cannot revoke after cliff");

        uint256 vestedAmount = getVestedAmount(_beneficiary);
        uint256 revokedAmount = schedule.totalAmount - vestedAmount;

        schedule.revoked = true;
        
        if (revokedAmount > 0) {
            token.safeTransfer(owner(), revokedAmount);
        }

        emit VestingRevoked(_beneficiary, revokedAmount);
    }

    /**
     * @dev Calculate vested amount for a beneficiary
     * @param _beneficiary Address of the beneficiary
     * @return Vested amount
     */
    function getVestedAmount(address _beneficiary) public view returns (uint256) {
        VestingSchedule storage schedule = vestingSchedules[_beneficiary];
        
        if (schedule.beneficiary == address(0) || schedule.revoked) {
            return 0;
        }

        uint256 currentTime = block.timestamp;
        uint256 cliffEnd = schedule.startTime + schedule.cliffDuration;
        uint256 vestingEnd = schedule.startTime + schedule.vestingDuration;

        // Before cliff: no tokens vested
        if (currentTime < cliffEnd) {
            return 0;
        }

        // After vesting period: all tokens vested
        if (currentTime >= vestingEnd) {
            return schedule.totalAmount;
        }

        // During linear vesting: calculate based on time elapsed
        uint256 timeSinceCliff = currentTime - cliffEnd;
        uint256 vestingPeriodAfterCliff = vestingEnd - cliffEnd;
        
        return (schedule.totalAmount * timeSinceCliff) / vestingPeriodAfterCliff;
    }

    /**
     * @dev Get releasable amount for a beneficiary
     * @param _beneficiary Address of the beneficiary
     * @return Releasable amount
     */
    function getReleasableAmount(address _beneficiary) external view returns (uint256) {
        VestingSchedule storage schedule = vestingSchedules[_beneficiary];
        if (schedule.beneficiary == address(0) || schedule.revoked) {
            return 0;
        }
        uint256 vestedAmount = getVestedAmount(_beneficiary);
        return vestedAmount - schedule.released;
    }

    /**
     * @dev Get vesting schedule for a beneficiary
     */
    function getVestingSchedule(address _beneficiary) 
        external 
        view 
        returns (
            address beneficiary,
            uint256 totalAmount,
            uint256 startTime,
            uint256 cliffDuration,
            uint256 vestingDuration,
            uint256 released,
            bool revocable,
            bool revoked
        ) 
    {
        VestingSchedule storage schedule = vestingSchedules[_beneficiary];
        return (
            schedule.beneficiary,
            schedule.totalAmount,
            schedule.startTime,
            schedule.cliffDuration,
            schedule.vestingDuration,
            schedule.released,
            schedule.revocable,
            schedule.revoked
        );
    }

    /**
     * @dev Get all beneficiaries
     */
    function getBeneficiaries() external view returns (address[] memory) {
        return beneficiaries;
    }

    /**
     * @dev Get number of beneficiaries
     */
    function getBeneficiariesCount() external view returns (uint256) {
        return beneficiaries.length;
    }
}

