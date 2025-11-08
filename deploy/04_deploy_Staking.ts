import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

/**
 * Deploys the StakingContract
 *
 * @param hre HardhatRuntimeEnvironment object
 */
const deployStaking: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, ethers } = hre;
  const { deploy, log, get } = deployments;
  const { deployer } = await getNamedAccounts();

  log("----------------------------------------------------");
  log("Deploying StakingContract...");

  // Get VNDC token address
  const vndc = await get("VNDC");
  const vndcAddress = vndc.address;

  log(`Using VNDC token at: ${vndcAddress}`);

  const staking = await deploy("StakingContract", {
    from: deployer,
    args: [vndcAddress],
    log: true,
    waitConfirmations: 1,
  });

  log(`StakingContract deployed at: ${staking.address}`);

  // Verify the deployment
  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    log("Verifying contract...");
    try {
      await hre.run("verify:verify", {
        address: staking.address,
        constructorArguments: [vndcAddress],
      });
    } catch (error) {
      log("Verification failed:", error);
    }
  }

  return true;
};

deployStaking.id = "StakingContract";
deployStaking.tags = ["StakingContract", "all"];
deployStaking.dependencies = ["VNDC"];
export default deployStaking;

