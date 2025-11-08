import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { Contract } from "ethers";

/**
 * Deploys the VNDC token contract
 *
 * @param hre HardhatRuntimeEnvironment object
 */
const deployVNDC: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, ethers } = hre;
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();

  log("----------------------------------------------------");
  log("Deploying VNDC Token...");

  const vndc = await deploy("VNDC", {
    from: deployer,
    args: [],
    log: true,
    waitConfirmations: 1,
  });

  log(`VNDC Token deployed at: ${vndc.address}`);

  // Verify the deployment
  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    log("Verifying contract...");
    try {
      await hre.run("verify:verify", {
        address: vndc.address,
        constructorArguments: [],
      });
    } catch (error) {
      log("Verification failed:", error);
    }
  }

  return true;
};

deployVNDC.id = "VNDC";
deployVNDC.tags = ["VNDC", "all"];
export default deployVNDC;

