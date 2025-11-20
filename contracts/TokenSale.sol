// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "./VNDC.sol";

interface IDexRouter {
    function addLiquidityETH(
        address token,
        uint256 amountTokenDesired,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline
    )
        external
        payable
        returns (
            uint256 amountToken,
            uint256 amountETH,
            uint256 liquidity
        );
}

/**
 * @title TokenSale
 * @dev ICO contract with soft cap, hard cap, and automated liquidity provisioning
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

    uint256 public constant INVESTOR_SHARE_BPS = 3000; // 30% to investors
    uint256 public constant LIQUIDITY_SHARE_BPS = 3000; // 30% for liquidity
    uint256 public constant TEAM_SHARE_BPS = 4000;     // 40% to dev team/advisors
    uint256 private constant BPS_DENOMINATOR = 10000;
    
    // Sale timing
    uint256 public saleStartTime;
    uint256 public saleEndTime;
    bool public saleActive;
    
    // Sale state
    uint256 public totalRaised;
    uint256 public totalTokensSold;
    uint256 public totalInvestorAllocation;
    uint256 public totalLiquidityAllocation;
    uint256 public totalTeamAllocation;
    bool public softCapReached;
    bool public hardCapReached;
    bool public finalized;
    bool public liquidityAdded;
    
    // Contributor tracking
    mapping(address => uint256) public contributions;
    mapping(address => uint256) public purchasedTokens;
    mapping(address => bool) public whitelist;
    bool public whitelistEnabled;
    address public tokenVesting;
    address public dexRouter;
    
    // Events
    event TokensPurchased(address indexed buyer, uint256 ethAmount, uint256 tokenAmount);
    event RefundClaimed(address indexed contributor, uint256 amount);
    event SaleStarted(uint256 startTime, uint256 endTime);
    event SaleEnded(bool softCapReached);
    event WhitelistUpdated(address indexed user, bool status);
    event WhitelistToggled(bool enabled);
    event SaleFinalized(uint256 investorAllocation, uint256 liquidityAllocation, uint256 teamAllocation);
    event TokensClaimed(address indexed account, uint256 amount);
    event TokenVestingSet(address indexed vesting);
    event RouterSet(address indexed router);
    event LiquidityAdded(uint256 tokenAmount, uint256 ethAmount);

    receive() external payable {}

    /**
     * @dev Constructor
     * @param _token Address of VNDC token contract
     * @param _router Address of DEX router
     */
    constructor(address _token, address _router) {
        require(_token != address(0), "TokenSale: Invalid token address");
        require(_router != address(0), "TokenSale: Invalid router address");
        token = VNDC(_token);
        dexRouter = _router;
        whitelistEnabled = false;
    }

    /**
     * @dev Update router address (one-time)
     */
    function setDexRouter(address _router) external onlyOwner {
        require(_router != address(0), "TokenSale: Invalid router address");
        dexRouter = _router;
        emit RouterSet(_router);
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

        contributions[msg.sender] += msg.value;
        totalRaised += msg.value;
        totalTokensSold += tokenAmount;

        uint256 investorAmount = (tokenAmount * INVESTOR_SHARE_BPS) / BPS_DENOMINATOR;
        purchasedTokens[msg.sender] += investorAmount;

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
        uint256 purchased = purchasedTokens[msg.sender];
        if (purchased > 0) {
            purchasedTokens[msg.sender] = 0;
            totalTokensSold -= purchased;
        }

        (bool success, ) = payable(msg.sender).call{value: refundAmount}("");
        require(success, "TokenSale: Refund failed");

        emit RefundClaimed(msg.sender, refundAmount);
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
     * @dev Set the token vesting contract address (can only be set once)
     */
    function setTokenVesting(address _vesting) external onlyOwner {
        require(_vesting != address(0), "TokenSale: Invalid vesting address");
        require(tokenVesting == address(0), "TokenSale: Vesting already set");
        tokenVesting = _vesting;
        emit TokenVestingSet(_vesting);
    }

    /**
     * @dev Finalize the sale, mint allocations and lock liquidity funds
     */
    function finalizeSale() external onlyOwner nonReentrant {
        require(!finalized, "TokenSale: Already finalized");
        require(!saleActive, "TokenSale: Sale still active");
        require(softCapReached, "TokenSale: Soft cap not reached");
        require(tokenVesting != address(0), "TokenSale: Vesting address not set");
        require(dexRouter != address(0), "TokenSale: Router not set");

        finalized = true;

        uint256 baseAmount = totalTokensSold;
        totalInvestorAllocation = (baseAmount * INVESTOR_SHARE_BPS) / BPS_DENOMINATOR;
        totalLiquidityAllocation = (baseAmount * LIQUIDITY_SHARE_BPS) / BPS_DENOMINATOR;
        totalTeamAllocation = baseAmount - totalInvestorAllocation - totalLiquidityAllocation;

        if (totalTeamAllocation > 0) {
            token.mint(tokenVesting, totalTeamAllocation);
        }

        if (totalLiquidityAllocation > 0) {
            token.mint(address(this), totalLiquidityAllocation);
        }

        _addInitialLiquidity();

        emit SaleFinalized(totalInvestorAllocation, totalLiquidityAllocation, totalTeamAllocation);
    }

    /**
     * @dev Claim purchased tokens after sale finalization
     */
    function claimTokens() external nonReentrant {
        require(finalized, "TokenSale: Sale not finalized");
        uint256 amount = purchasedTokens[msg.sender];
        require(amount > 0, "TokenSale: No tokens to claim");

        purchasedTokens[msg.sender] = 0;
        token.mint(msg.sender, amount);

        emit TokensClaimed(msg.sender, amount);
    }

    function _addInitialLiquidity() internal {
        require(!liquidityAdded, "TokenSale: Liquidity already added");
        uint256 tokenAmount = totalLiquidityAllocation;
        uint256 ethAmount = address(this).balance;
        require(tokenAmount > 0, "TokenSale: No liquidity allocation");
        require(ethAmount > 0, "TokenSale: No ETH to add liquidity");

        token.approve(dexRouter, tokenAmount);

        IDexRouter(dexRouter).addLiquidityETH{value: ethAmount}(
            address(token),
            tokenAmount,
            tokenAmount,
            ethAmount,
            address(this),
            block.timestamp + 1800
        );

        liquidityAdded = true;
        emit LiquidityAdded(tokenAmount, ethAmount);
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

