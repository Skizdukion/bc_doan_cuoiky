import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

/**
 * Deploys the TokenSale contract
 *
 * @param hre HardhatRuntimeEnvironment object
 */
const deployTokenSale: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, ethers } = hre;
  const { deploy, log, get } = deployments;
  const { deployer } = await getNamedAccounts();

  log("----------------------------------------------------");
  log("Deploying TokenSale...");

  // Get VNDC token address
  const vndc = await get("VNDC");
  const vndcAddress = vndc.address;

  log(`Using VNDC token at: ${vndcAddress}`);

  const tokenSale = await deploy("TokenSale", {
    from: deployer,
    args: [vndcAddress],
    log: true,
    waitConfirmations: 1,
  });

  log(`TokenSale deployed at: ${tokenSale.address}`);

  // Verify the deployment
  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    log("Verifying contract...");
    try {
      await hre.run("verify:verify", {
        address: tokenSale.address,
        constructorArguments: [vndcAddress],
      });
    } catch (error) {
      log("Verification failed:", error);
    }
  }

  return true;
};

deployTokenSale.id = "TokenSale";
deployTokenSale.tags = ["TokenSale", "all"];
deployTokenSale.dependencies = ["VNDC"];
export default deployTokenSale;

