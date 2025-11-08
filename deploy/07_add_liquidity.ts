import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { Contract } from "ethers";

/**
 * Adds liquidity to the VNDC/ETH pool
 * 
 * Requirements:
 * - Uses ICO-raised ETH from TokenSale contract
 * - Pairs with 10% of token supply (100M tokens = 100,000,000 * 10^18)
 * - Creates LP tokens
 * 
 * @param hre HardhatRuntimeEnvironment object
 */
const addLiquidity: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, ethers } = hre;
  const { log } = deployments;
  const { deployer } = await getNamedAccounts();

  log("----------------------------------------------------");
  log("Adding liquidity to VNDC/ETH pool...");

  // Get deployed contracts
  const vndc = await deployments.get("VNDC");
  const tokenSale = await deployments.get("TokenSale");
  const router = await deployments.get("Router");
  const factory = await deployments.get("Factory");

  if (!vndc || !tokenSale || !router || !factory) {
    throw new Error("VNDC, TokenSale, Router, and Factory must be deployed first");
  }

  // Get contract instances
  const vndcContract = await ethers.getContractAt("VNDC", vndc.address);
  const tokenSaleContract = await ethers.getContractAt("TokenSale", tokenSale.address);
  const routerContract = await ethers.getContractAt("Router", router.address);
  const factoryContract = await ethers.getContractAt("PoolFactory", factory.address);

  // Constants
  const TOTAL_SUPPLY = ethers.parseEther("1000000000"); // 1B tokens total
  const LIQUIDITY_TOKENS = TOTAL_SUPPLY / 10n; // 10% = 100M tokens
  const LIQUIDITY_ETH_PERCENT = 50n; // 50% of raised ETH for liquidity (can be adjusted)

  // Check if sale has ended and soft cap reached
  const saleActive = await tokenSaleContract.saleActive();
  const softCapReached = await tokenSaleContract.softCapReached();
  const totalRaised = await tokenSaleContract.totalRaised();
  const isLocalNetwork = hre.network.name === "hardhat" || hre.network.name === "localhost";

  // If local network and soft cap not reached, simulate token purchases
  if (isLocalNetwork && !softCapReached) {
    log("🌐 Local network detected. Simulating token purchases to reach soft cap...");
    
    const SOFT_CAP = await tokenSaleContract.SOFT_CAP();
    const MAX_PURCHASE = await tokenSaleContract.MAX_PURCHASE();
    const MIN_PURCHASE = await tokenSaleContract.MIN_PURCHASE();
    
    // Check if sale is active, if not start it
    if (!saleActive) {
      log("Starting token sale...");
      
      // Ensure TokenSale has enough tokens (for hard cap: 200 ETH * 2M tokens/ETH)
      const HARD_CAP = await tokenSaleContract.HARD_CAP();
      const TOKEN_PRICE = await tokenSaleContract.TOKEN_PRICE();
      const tokensNeeded = (HARD_CAP * TOKEN_PRICE) / ethers.parseEther("1");
      const tokenSaleBalance = await vndcContract.balanceOf(tokenSale.address);
      
      if (tokenSaleBalance < tokensNeeded) {
        log(`Minting ${ethers.formatEther(tokensNeeded - tokenSaleBalance)} tokens to TokenSale...`);
        const mintTx = await vndcContract.mint(tokenSale.address, tokensNeeded - tokenSaleBalance);
        await mintTx.wait();
        log("Tokens minted to TokenSale");
      }
      
      const latest = await ethers.provider.getBlock("latest");
      const startTime = latest!.timestamp;
      const endTime = startTime + 86400 * 7; // 7 days
      
      try {
        const startTx = await tokenSaleContract.startSale(startTime, endTime, false);
        await startTx.wait();
        log("Token sale started");
      } catch (error: any) {
        log(`⚠️  Could not start sale: ${error.message}`);
        throw error;
      }
    }

    // Get signers to simulate multiple buyers
    const signers = await ethers.getSigners();
    const buyers = signers.slice(1, Math.min(signers.length, 6)); // Use up to 5 buyers (skip deployer)
    
    log(`Using ${buyers.length} buyers to reach soft cap...`);
    
    // Calculate how much each buyer should contribute
    const remainingToSoftCap = SOFT_CAP - totalRaised;
    const amountPerBuyer = remainingToSoftCap / BigInt(buyers.length);
    
    // Ensure each purchase is within limits
    const purchaseAmount = amountPerBuyer > MAX_PURCHASE ? MAX_PURCHASE : amountPerBuyer;
    
    if (purchaseAmount < MIN_PURCHASE) {
      log("⚠️  Cannot reach soft cap with available buyers (purchase amount too small)");
      log(`Need ${ethers.formatEther(remainingToSoftCap)} ETH, but can only contribute ${ethers.formatEther(purchaseAmount * BigInt(buyers.length))} ETH`);
      return false;
    }

    // Make purchases to reach soft cap
    let currentRaised = totalRaised;
    for (let i = 0; i < buyers.length && currentRaised < SOFT_CAP; i++) {
      const buyer = buyers[i];
      const needed = SOFT_CAP - currentRaised;
      const buyAmount = needed < purchaseAmount ? needed : purchaseAmount;
      
      if (buyAmount < MIN_PURCHASE) {
        break; // Can't buy less than minimum
      }
      
      try {
        log(`Buyer ${i + 1} purchasing ${ethers.formatEther(buyAmount)} ETH worth of tokens...`);
        const buyTx = await tokenSaleContract.connect(buyer).buyTokens({ value: buyAmount });
        await buyTx.wait();
        currentRaised += buyAmount;
        log(`✅ Purchase successful. Total raised: ${ethers.formatEther(currentRaised)} ETH`);
      } catch (error: any) {
        log(`⚠️  Purchase failed for buyer ${i + 1}: ${error.message}`);
        // Continue with next buyer
      }
    }

    // Check if we reached soft cap
    const newTotalRaised = await tokenSaleContract.totalRaised();
    const newSoftCapReached = await tokenSaleContract.softCapReached();
    
    if (!newSoftCapReached) {
      log("⚠️  Could not reach soft cap. Cannot add liquidity.");
      log(`Total raised: ${ethers.formatEther(newTotalRaised)} ETH`);
      log(`Soft cap: ${ethers.formatEther(SOFT_CAP)} ETH`);
      return false;
    }
    
    log("✅ Soft cap reached!");
  }

  // Re-check sale status after potential local purchases
  const finalSaleActive = await tokenSaleContract.saleActive();
  const finalSoftCapReached = await tokenSaleContract.softCapReached();
  const finalTotalRaised = await tokenSaleContract.totalRaised();

  if (finalSaleActive) {
    log("⚠️  Sale is still active. Ending sale first...");
    // Only owner can end sale
    try {
      const tx = await tokenSaleContract.endSale();
      await tx.wait();
      log("Sale ended successfully");
    } catch (error) {
      log("Failed to end sale. Make sure you're the owner.");
      throw error;
    }
  }

  if (!finalSoftCapReached) {
    log("⚠️  Soft cap not reached. Cannot add liquidity.");
    log("Total raised:", ethers.formatEther(finalTotalRaised), "ETH");
    return false;
  }

  // Calculate ETH amount for liquidity (50% of raised ETH)
  const ethForLiquidity = finalTotalRaised * LIQUIDITY_ETH_PERCENT / 100n;
  
  log("Liquidity parameters:");
  log(`  VNDC tokens: ${ethers.formatEther(LIQUIDITY_TOKENS)}`);
  log(`  ETH amount: ${ethers.formatEther(ethForLiquidity)}`);
  log(`  Total raised: ${ethers.formatEther(finalTotalRaised)} ETH`);

  // Check if liquidity pool already exists
  const weth = await deployments.get("WETH");
  const pairAddress = await factoryContract.getPair(vndc.address, weth.address);
  
  if (pairAddress !== ethers.ZeroAddress) {
    log("⚠️  Liquidity pool already exists at:", pairAddress);
    log("Skipping liquidity addition. Use a different script to add more liquidity.");
    return false;
  }

  // Mint tokens to deployer for liquidity (if not already minted)
  const deployerBalance = await vndcContract.balanceOf(deployer);
  if (deployerBalance < LIQUIDITY_TOKENS) {
    log("Minting tokens for liquidity...");
    const tokensNeeded = LIQUIDITY_TOKENS - deployerBalance;
    const mintTx = await vndcContract.mint(deployer, tokensNeeded);
    await mintTx.wait();
    log(`Minted ${ethers.formatEther(tokensNeeded)} tokens`);
  }

  // Withdraw ETH from TokenSale (if not already withdrawn)
  const tokenSaleBalance = await ethers.provider.getBalance(tokenSale.address);
  if (tokenSaleBalance > 0n) {
    log("Withdrawing ETH from TokenSale...");
    try {
      const withdrawTx = await tokenSaleContract.withdrawFunds();
      await withdrawTx.wait();
      log("ETH withdrawn from TokenSale");
    } catch (error) {
      log("⚠️  Could not withdraw from TokenSale. Proceeding with available ETH...");
    }
  }

  // Approve Router to spend tokens
  log("Approving Router to spend tokens...");
  const approveTx = await vndcContract.approve(router.address, LIQUIDITY_TOKENS);
  await approveTx.wait();
  log("Token approval completed");

  // Add liquidity
  log("Adding liquidity...");
  const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes from now

  try {
    const addLiquidityTx = await routerContract.addLiquidityETH(
      vndc.address,
      LIQUIDITY_TOKENS, // amountTokenDesired
      LIQUIDITY_TOKENS * 95n / 100n, // amountTokenMin (5% slippage)
      ethForLiquidity * 95n / 100n, // amountETHMin (5% slippage)
      deployer, // to (LP tokens recipient)
      deadline,
      { value: ethForLiquidity }
    );

    const receipt = await addLiquidityTx.wait();
    log("✅ Liquidity added successfully!");

    // Get pair address
    const pair = await factoryContract.getPair(vndc.address, weth.address);
    log(`Pair created at: ${pair}`);

    // Get LP token balance
    try {
      // Use the swap IERC20 interface from contracts/swap/interfaces/IERC20.sol
      const pairContract = await ethers.getContractAt("contracts/swap/interfaces/IERC20.sol:IERC20", pair);
      const lpBalance = await pairContract.balanceOf(deployer);
      log(`LP tokens received: ${ethers.formatEther(lpBalance)}`);
    } catch (error) {
      log("✅ Liquidity added (LP balance check skipped - interface may differ)");
    }

    return true;
  } catch (error: any) {
    log("❌ Failed to add liquidity:", error.message);
    throw error;
  }
};

addLiquidity.id = "addLiquidity";
addLiquidity.tags = ["addLiquidity", "dex", "all"];
addLiquidity.dependencies = ["VNDC", "TokenSale", "Router", "Factory"];
export default addLiquidity;

