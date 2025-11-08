// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./VNDC.sol";

/**
 * @title TokenSale
 * @dev ICO contract with soft cap, hard cap, and refund mechanism
 * @notice Fixed price token sale accepting ETH payments
 */
contract TokenSale is Ownable, ReentrancyGuard, Pausable {
    VNDC public immutable token;
    
    // Sale parameters
    uint256 public constant SOFT_CAP = 50 ether; // 50 ETH
    uint256 public constant HARD_CAP = 200 ether; // 200 ETH
    uint256 public constant TOKEN_PRICE = 2_000_000 * 10**18; // 2M tokens per ETH (with 18 decimals)
    uint256 public constant MIN_PURCHASE = 0.01 ether;
    uint256 public constant MAX_PURCHASE = 10 ether;
    
    // Sale timing
    uint256 public saleStartTime;
    uint256 public saleEndTime;
    bool public saleActive;
    
    // Sale state
    uint256 public totalRaised;
    uint256 public totalTokensSold;
    bool public softCapReached;
    bool public hardCapReached;
    bool public fundsWithdrawn;
    
    // Contributor tracking
    mapping(address => uint256) public contributions;
    mapping(address => bool) public whitelist;
    bool public whitelistEnabled;
    
    // Events
    event TokensPurchased(address indexed buyer, uint256 ethAmount, uint256 tokenAmount);
    event RefundClaimed(address indexed contributor, uint256 amount);
    event FundsWithdrawn(address indexed owner, uint256 amount);
    event SaleStarted(uint256 startTime, uint256 endTime);
    event SaleEnded(bool softCapReached);
    event WhitelistUpdated(address indexed user, bool status);
    event WhitelistToggled(bool enabled);

    /**
     * @dev Constructor
     * @param _token Address of VNDC token contract
     */
    constructor(address _token) {
        require(_token != address(0), "TokenSale: Invalid token address");
        token = VNDC(_token);
        whitelistEnabled = false;
    }

    /**
     * @dev Start the token sale
     * @param _saleStartTime Start timestamp of the sale
     * @param _saleEndTime End timestamp of the sale
     * @param _whitelistEnabled Whether whitelist is required
     */
    function startSale(
        uint256 _saleStartTime,
        uint256 _saleEndTime,
        bool _whitelistEnabled
    ) external onlyOwner {
        require(!saleActive, "TokenSale: Sale already active");
        require(_saleStartTime >= block.timestamp - 1, "TokenSale: Invalid start time"); // Allow current or future block
        require(_saleEndTime > _saleStartTime, "TokenSale: Invalid end time");
        require(token.balanceOf(address(this)) >= (HARD_CAP * TOKEN_PRICE) / 1 ether, "TokenSale: Insufficient tokens");

        saleStartTime = _saleStartTime;
        saleEndTime = _saleEndTime;
        saleActive = true;
        whitelistEnabled = _whitelistEnabled;

        emit SaleStarted(_saleStartTime, _saleEndTime);
        emit WhitelistToggled(_whitelistEnabled);
    }

    /**
     * @dev Buy tokens with ETH
     * @notice Main purchase function
     */
    function buyTokens() external payable nonReentrant whenNotPaused {
        require(saleActive, "TokenSale: Sale not active");
        require(block.timestamp >= saleStartTime && block.timestamp <= saleEndTime, "TokenSale: Sale not in progress");
        require(!hardCapReached, "TokenSale: Hard cap reached");
        require(msg.value >= MIN_PURCHASE, "TokenSale: Below minimum purchase");
        require(msg.value <= MAX_PURCHASE, "TokenSale: Exceeds maximum purchase");
        require(!whitelistEnabled || whitelist[msg.sender], "TokenSale: Not whitelisted");
        
        // Check if purchase would exceed hard cap
        require(totalRaised + msg.value <= HARD_CAP, "TokenSale: Would exceed hard cap");
        
        // Check individual contribution limit
        require(contributions[msg.sender] + msg.value <= MAX_PURCHASE, "TokenSale: Exceeds individual limit");

        uint256 tokenAmount = (msg.value * TOKEN_PRICE) / 1 ether;
        
        // Check if we have enough tokens
        require(token.balanceOf(address(this)) >= tokenAmount, "TokenSale: Insufficient tokens");

        contributions[msg.sender] += msg.value;
        totalRaised += msg.value;
        totalTokensSold += tokenAmount;

        // Transfer tokens to buyer
        require(token.transfer(msg.sender, tokenAmount), "TokenSale: Token transfer failed");

        // Check if soft cap is reached
        if (!softCapReached && totalRaised >= SOFT_CAP) {
            softCapReached = true;
        }

        // Check if hard cap is reached
        if (totalRaised >= HARD_CAP) {
            hardCapReached = true;
            saleActive = false;
            emit SaleEnded(true);
        }

        emit TokensPurchased(msg.sender, msg.value, tokenAmount);
    }

    /**
     * @dev Claim refund if soft cap not reached
     * @notice Only available after sale ends if soft cap not reached
     */
    function claimRefund() external nonReentrant {
        require(!saleActive, "TokenSale: Sale still active");
        require(block.timestamp > saleEndTime, "TokenSale: Sale not ended");
        require(!softCapReached, "TokenSale: Soft cap reached, no refunds");
        require(contributions[msg.sender] > 0, "TokenSale: No contribution to refund");

        uint256 refundAmount = contributions[msg.sender];
        contributions[msg.sender] = 0;

        (bool success, ) = payable(msg.sender).call{value: refundAmount}("");
        require(success, "TokenSale: Refund failed");

        emit RefundClaimed(msg.sender, refundAmount);
    }

    /**
     * @dev Withdraw funds after successful sale
     * @notice Only owner can withdraw, only if soft cap reached
     */
    function withdrawFunds() external onlyOwner nonReentrant {
        require(softCapReached, "TokenSale: Soft cap not reached");
        require(!fundsWithdrawn, "TokenSale: Funds already withdrawn");
        require(!saleActive || hardCapReached, "TokenSale: Sale still active");

        fundsWithdrawn = true;
        uint256 amount = address(this).balance;

        (bool success, ) = payable(owner()).call{value: amount}("");
        require(success, "TokenSale: Withdrawal failed");

        emit FundsWithdrawn(owner(), amount);
    }

    /**
     * @dev End sale manually (owner only)
     * @notice Can be used to end sale before end time
     */
    function endSale() external onlyOwner {
        require(saleActive, "TokenSale: Sale not active");
        saleActive = false;
        emit SaleEnded(softCapReached);
    }

    /**
     * @dev Add/remove addresses from whitelist
     * @param users Array of user addresses
     * @param status Array of whitelist status (true = whitelisted)
     */
    function setWhitelist(address[] calldata users, bool[] calldata status) external onlyOwner {
        require(users.length == status.length, "TokenSale: Arrays length mismatch");
        
        for (uint256 i = 0; i < users.length; i++) {
            whitelist[users[i]] = status[i];
            emit WhitelistUpdated(users[i], status[i]);
        }
    }

    /**
     * @dev Toggle whitelist requirement
     * @param _enabled Whether whitelist is required
     */
    function toggleWhitelist(bool _enabled) external onlyOwner {
        whitelistEnabled = _enabled;
        emit WhitelistToggled(_enabled);
    }

    /**
     * @dev Return remaining tokens to owner if sale ends unsuccessfully
     * @notice Only if soft cap not reached and sale ended
     */
    function returnRemainingTokens() external onlyOwner {
        require(!saleActive, "TokenSale: Sale still active");
        require(block.timestamp > saleEndTime, "TokenSale: Sale not ended");
        require(!softCapReached, "TokenSale: Cannot return tokens after successful sale");

        uint256 remainingTokens = token.balanceOf(address(this));
        if (remainingTokens > 0) {
            require(token.transfer(owner(), remainingTokens), "TokenSale: Token return failed");
        }
    }

    /**
     * @dev Get sale information
     */
    function getSaleInfo() external view returns (
        uint256 _totalRaised,
        uint256 _totalTokensSold,
        bool _softCapReached,
        bool _hardCapReached,
        bool _saleActive,
        uint256 _saleStartTime,
        uint256 _saleEndTime
    ) {
        return (
            totalRaised,
            totalTokensSold,
            softCapReached,
            hardCapReached,
            saleActive,
            saleStartTime,
            saleEndTime
        );
    }

    /**
     * @dev Get user contribution
     */
    function getUserContribution(address user) external view returns (uint256) {
        return contributions[user];
    }
}

