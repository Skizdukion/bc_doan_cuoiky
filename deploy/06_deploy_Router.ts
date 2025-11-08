import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { Contract } from "ethers";

/**
 * Deploys the Router contract
 * 
 * @param hre HardhatRuntimeEnvironment object
 */
const deployRouter: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, ethers } = hre;
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();

  log("----------------------------------------------------");
  log("Deploying Router...");

  // Get Factory and WETH addresses
  const factory = await deployments.get("Factory");
  const weth = await deployments.get("WETH");

  if (!factory || !weth) {
    throw new Error("Factory and WETH must be deployed before Router");
  }

  const router = await deploy("Router", {
    contract: "Router",
    from: deployer,
    args: [factory.address, weth.address],
    log: true,
    waitConfirmations: 1,
  });

  log(`Router deployed at: ${router.address}`);
  log(`Factory address: ${factory.address}`);
  log(`WETH address: ${weth.address}`);

  // Verify the deployment
  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    log("Verifying contract...");
    try {
      await hre.run("verify:verify", {
        address: router.address,
        constructorArguments: [factory.address, weth.address],
      });
    } catch (error) {
      log("Verification failed:", error);
    }
  }

  return true;
};

deployRouter.id = "Router";
deployRouter.tags = ["Router", "dex", "all"];
deployRouter.dependencies = ["Factory"]; // Depends on Factory and WETH (deployed in mocks)
export default deployRouter;

