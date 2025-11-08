import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { Contract } from "ethers";

/**
 * Deploys the PoolFactory contract
 * 
 * @param hre HardhatRuntimeEnvironment object
 */
const deployFactory: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, ethers } = hre;
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();

  log("----------------------------------------------------");
  log("Deploying PoolFactory...");

  const factory = await deploy("Factory", {
    contract: "PoolFactory",
    from: deployer,
    args: [deployer], // feeToSetter
    log: true,
    waitConfirmations: 1,
  });

  log(`PoolFactory deployed at: ${factory.address}`);

  // Verify the deployment
  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    log("Verifying contract...");
    try {
      await hre.run("verify:verify", {
        address: factory.address,
        constructorArguments: [deployer],
      });
    } catch (error) {
      log("Verification failed:", error);
    }
  }

  return true;
};

deployFactory.id = "Factory";
deployFactory.tags = ["Factory", "dex", "all"];
deployFactory.dependencies = []; // No dependencies, but WETH should be deployed first for Router
export default deployFactory;

