import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

/**
 * Helper script to finalize the sale and ensure TokenSale performs its auto-liquidity logic.
 */
const addLiquidity: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, ethers } = hre;
  const { log } = deployments;
  const { deployer } = await getNamedAccounts();

  log("----------------------------------------------------");
  log("Finalizing TokenSale and verifying auto-liquidity...");

  const vndc = await deployments.get("VNDC");
  const tokenSale = await deployments.get("TokenSale");
  const router = await deployments.get("Router");
  const factory = await deployments.get("Factory");

  const tokenSaleContract = await ethers.getContractAt("TokenSale", tokenSale.address);
  const factoryContract = await ethers.getContractAt("PoolFactory", factory.address);

  const saleActive = await tokenSaleContract.saleActive();
  const softCapReached = await tokenSaleContract.softCapReached();
  const totalRaised = await tokenSaleContract.totalRaised();
  const isLocalNetwork = hre.network.name === "hardhat" || hre.network.name === "localhost";

  if (isLocalNetwork && !softCapReached) {
    log("🌐 Local network detected. Simulating purchases to reach soft cap...");
    const SOFT_CAP = await tokenSaleContract.SOFT_CAP();
    const MAX_PURCHASE = await tokenSaleContract.MAX_PURCHASE();
    const MIN_PURCHASE = await tokenSaleContract.MIN_PURCHASE();

    if (!saleActive) {
      log("Starting token sale...");
      const latest = await ethers.provider.getBlock("latest");
      const startTime = latest!.timestamp;
      const endTime = startTime + 7 * 86400;
      const startTx = await tokenSaleContract.startSale(startTime, endTime, false);
      await startTx.wait();
    }

    const signers = await ethers.getSigners();
    const buyers = signers.slice(0, Math.min(signers.length, 8));
    if (buyers.length === 0) {
      log("⚠️ No signers available to simulate purchases.");
      return false;
    }

    const contributionTracker: Record<string, bigint> = {};
    let currentRaised = totalRaised;
    let attempts = 0;

    while (currentRaised < SOFT_CAP && attempts < 200) {
      const buyer = buyers[attempts % buyers.length];
      const contributed = contributionTracker[buyer.address] ?? 0n;
      if (contributed >= MAX_PURCHASE) {
        attempts++;
        continue;
      }

      const remaining = SOFT_CAP - currentRaised;
      const allowance = MAX_PURCHASE - contributed;
      let buyAmount = remaining < allowance ? remaining : allowance;

      if (buyAmount > MAX_PURCHASE) {
        buyAmount = MAX_PURCHASE;
      }

      if (buyAmount < MIN_PURCHASE) {
        log("⚠️ Remaining gap below MIN_PURCHASE. Cannot simulate further buys.");
        break;
      }

      try {
        const buyTx = await tokenSaleContract.connect(buyer).buyTokens({ value: buyAmount });
        await buyTx.wait();
        currentRaised += buyAmount;
        contributionTracker[buyer.address] = contributed + buyAmount;
        log(`✅ ${buyer.address} contributed ${ethers.formatEther(buyAmount)} ETH (total ${ethers.formatEther(currentRaised)} ETH)`);
      } catch (error: any) {
        log(`⚠️  Purchase failed for ${buyer.address}: ${error.message}`);
      }

      attempts++;
    }

    if (!(await tokenSaleContract.softCapReached())) {
      log("⚠️ Unable to reach soft cap after simulations.");
      return false;
    }
  }

  if (await tokenSaleContract.saleActive()) {
    log("Ending sale...");
    const endTx = await tokenSaleContract.endSale();
    await endTx.wait();
  }

  const currentRouter = await tokenSaleContract.dexRouter();
  if (currentRouter.toLowerCase() !== router.address.toLowerCase()) {
    log("Setting router on TokenSale...");
    const setRouterTx = await tokenSaleContract.setDexRouter(router.address);
    await setRouterTx.wait();
  }

  if (!(await tokenSaleContract.finalized())) {
    log("Finalizing sale (auto-add liquidity will run)...");
    const finalizeTx = await tokenSaleContract.finalizeSale();
    await finalizeTx.wait();
  } else {
    log("Sale already finalized.");
  }

  if (await tokenSaleContract.liquidityAdded()) {
    log("✅ Liquidity added according to TokenSale.");
  } else {
    log("⚠️ Liquidity flag not set. Inspect TokenSale finalize.");
  }

  const weth = await deployments.get("WETH");
  const pairAddress = await factoryContract.getPair(vndc.address, weth.address);
  if (pairAddress !== ethers.ZeroAddress) {
    log(`VNDC/WETH pair address: ${pairAddress}`);
  } else {
    log("⚠️ VNDC/WETH pair not found.");
  }

  // Fund staking reward pool if on local network
  if (isLocalNetwork) {
    log("----------------------------------------------------");
    log("Funding StakingContract reward pool...");
    try {
      const staking = await deployments.get("StakingContract");
      const stakingContract = await ethers.getContractAt("StakingContract", staking.address);
      const rewardPool = await stakingContract.rewardPool();
      
      if (rewardPool === 0n) {
        const rewardPoolAmount = ethers.parseEther("1000000"); // 1M tokens
        const vndcContract = await ethers.getContractAt("VNDC", vndc.address);
        const ownerBalance = await vndcContract.balanceOf(deployer);
        
        if (ownerBalance >= rewardPoolAmount) {
          log(`Funding reward pool with ${ethers.formatEther(rewardPoolAmount)} VNDC...`);
          await vndcContract.approve(staking.address, rewardPoolAmount);
          const fundTx = await stakingContract.fundRewardPool(rewardPoolAmount);
          await fundTx.wait();
          log("✅ Reward pool funded successfully");
        } else {
          log(`⚠️ Owner balance (${ethers.formatEther(ownerBalance)}) insufficient to fund reward pool`);
          log(`   Required: ${ethers.formatEther(rewardPoolAmount)} VNDC`);
        }
      } else {
        log(`✅ Reward pool already funded: ${ethers.formatEther(rewardPool)} VNDC`);
      }
    } catch (error: any) {
      log(`⚠️ Could not fund reward pool: ${error.message}`);
    }
  }

  return true;
};

addLiquidity.id = "addLiquidity";
addLiquidity.tags = ["addLiquidity", "dex", "all"];
addLiquidity.dependencies = ["VNDC", "TokenSale", "Router", "Factory"];
export default addLiquidity;

