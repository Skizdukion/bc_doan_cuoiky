import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

/**
 * Deploys the TokenVesting contract
 *
 * @param hre HardhatRuntimeEnvironment object
 */
const deployVesting: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, ethers } = hre;
  const { deploy, log, get } = deployments;
  const { deployer } = await getNamedAccounts();

  log("----------------------------------------------------");
  log("Deploying TokenVesting...");

  // Get VNDC token address
  const vndc = await get("VNDC");
  const vndcAddress = vndc.address;

  log(`Using VNDC token at: ${vndcAddress}`);

  const vesting = await deploy("TokenVesting", {
    from: deployer,
    args: [vndcAddress],
    log: true,
    waitConfirmations: 1,
  });

  log(`TokenVesting deployed at: ${vesting.address}`);

  // Verify the deployment
  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    log("Verifying contract...");
    try {
      await hre.run("verify:verify", {
        address: vesting.address,
        constructorArguments: [vndcAddress],
      });
    } catch (error) {
      log("Verification failed:", error);
    }
  }

  return true;
};

deployVesting.id = "TokenVesting";
deployVesting.tags = ["TokenVesting", "all"];
deployVesting.dependencies = ["VNDC"];
export default deployVesting;

