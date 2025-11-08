import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { developmentChains } from "../helper-hardhat-config";
import { verify } from "../helper-functions";

/**
 * Deploys the LPTimelock contract and locks LP tokens if liquidity pool exists
 * 
 * @param hre HardhatRuntimeEnvironment object
 */
const deployLPTimelock: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, network, ethers } = hre;
  const { deploy, log, get } = deployments;
  const { deployer } = await getNamedAccounts();

  log("----------------------------------------------------");
  log("Deploying LPTimelock...");

  const lpTimelock = await deploy("LPTimelock", {
    from: deployer,
    args: [],
    log: true,
    waitConfirmations: developmentChains.includes(network.name) ? 1 : 6,
  });

  log(`LPTimelock deployed at: ${lpTimelock.address}`);

  // Verify the deployment
  if (!developmentChains.includes(network.name) && process.env.BSCSCAN_API_KEY) {
    log("Verifying contract...");
    try {
      await verify(lpTimelock.address, []);
    } catch (error) {
      log("Verification failed:", error);
    }
  }

  // Try to lock LP tokens if liquidity pool exists
  try {
    const vndc = await get("VNDC");
    const factory = await get("Factory");
    const weth = await get("WETH");

    const factoryContract = await ethers.getContractAt("PoolFactory", factory.address);
    const pairAddress = await factoryContract.getPair(vndc.address, weth.address);

    if (pairAddress !== ethers.ZeroAddress) {
      log("----------------------------------------------------");
      log("Liquidity pool found. Attempting to lock LP tokens...");

      // Get LP token contract (the pair itself is the LP token)
      const lpTokenContract = await ethers.getContractAt(
        "contracts/swap/interfaces/IERC20.sol:IERC20",
        pairAddress
      );

      // Get deployer's LP token balance
      const lpBalance = await lpTokenContract.balanceOf(deployer);

      if (lpBalance > 0n) {
        log(`Found ${ethers.formatEther(lpBalance)} LP tokens in deployer's account`);

        // Get LPTimelock contract instance
        const lpTimelockContract = await ethers.getContractAt("LPTimelock", lpTimelock.address);

        // Approve LPTimelock to spend LP tokens
        log("Approving LPTimelock to spend LP tokens...");
        const approveTx = await lpTokenContract.approve(lpTimelock.address, lpBalance);
        await approveTx.wait();
        log("Approval completed");

        // Lock LP tokens (default 12 months)
        // Beneficiary can be set to deployer, or a multisig/DAO address
        // For now, using deployer as beneficiary (can be changed via transferOwnership later)
        const beneficiary = deployer; // TODO: Set to multisig/DAO address for production

        log(`Locking ${ethers.formatEther(lpBalance)} LP tokens for 12 months...`);
        log(`Beneficiary: ${beneficiary}`);

        try {
          // Get current lock count to determine the lock ID
          const lockCountBefore = await lpTimelockContract.getLockCount();
          
          const lockTx = await lpTimelockContract.lock(pairAddress, lpBalance, beneficiary);
          const receipt = await lockTx.wait();

          // Get the lock ID (should be lockCountBefore)
          const lockId = lockCountBefore;
          
          // Get lock info
          const lockInfo = await lpTimelockContract.getLockInfo(lockId);
          const unlockTime = new Date(Number(lockInfo.unlockTime) * 1000);

          log("✅ LP tokens locked successfully!");
          log(`Lock ID: ${lockId}`);
          log(`LP Token: ${pairAddress}`);
          log(`Amount: ${ethers.formatEther(lpBalance)}`);
          log(`Unlock Time: ${unlockTime.toISOString()}`);
          log(`Beneficiary: ${beneficiary}`);
        } catch (error: any) {
          log(`⚠️  Failed to lock LP tokens: ${error.message}`);
          log("LP tokens are still in deployer's account. You can lock them manually later.");
        }
      } else {
        log("⚠️  Deployer has no LP tokens to lock.");
        log("Make sure liquidity has been added first (run addLiquidity script).");
      }
    } else {
      log("⚠️  No liquidity pool found.");
      log("Add liquidity first (run addLiquidity script), then lock the LP tokens.");
    }
  } catch (error: any) {
    log(`⚠️  Could not check/lock LP tokens: ${error.message}`);
    log("LPTimelock is deployed and ready. You can lock LP tokens manually later.");
  }

  return true;
};

deployLPTimelock.id = "LPTimelock";
deployLPTimelock.tags = ["LPTimelock", "lp", "all"];
deployLPTimelock.dependencies = ["VNDC", "Factory"]; // Depends on VNDC and Factory to check for LP pool
export default deployLPTimelock;

