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

  const router = await get("Router");
  const routerAddress = router.address;
  log(`Using Router at: ${routerAddress}`);

  const tokenSale = await deploy("TokenSale", {
    from: deployer,
    args: [vndcAddress, routerAddress],
    log: true,
    waitConfirmations: 1,
  });

  log(`TokenSale deployed at: ${tokenSale.address}`);

  // Mint tokens to owner for reward pool funding before transferring ownership
  const vndcContract = await ethers.getContractAt("VNDC", vndcAddress);
  const currentOwner = await vndcContract.owner();
  
  if (currentOwner.toLowerCase() === deployer.toLowerCase()) {
    // Mint tokens to owner for staking reward pool (1M tokens)
    const rewardPoolAmount = ethers.parseEther("1000000");
    log(`Minting ${ethers.formatEther(rewardPoolAmount)} VNDC to owner for reward pool...`);
    try {
      const mintTx = await vndcContract.mint(deployer, rewardPoolAmount);
      await mintTx.wait();
      log("✅ Reward pool tokens minted to owner");
    } catch (error: any) {
      log(`⚠️ Could not mint reward pool tokens: ${error.message}`);
    }
  }

  // Transfer VNDC ownership to TokenSale so it becomes the sole minter
  if (currentOwner.toLowerCase() !== tokenSale.address.toLowerCase()) {
    log("Transferring VNDC ownership to TokenSale...");
    const transferTx = await vndcContract.transferOwnership(tokenSale.address);
    await transferTx.wait();
    log("VNDC ownership transferred");
  } else {
    log("VNDC already owned by TokenSale");
  }

  // Verify the deployment
  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    log("Verifying contract...");
    try {
      await hre.run("verify:verify", {
        address: tokenSale.address,
        constructorArguments: [vndcAddress, routerAddress],
      });
    } catch (error) {
      log("Verification failed:", error);
    }
  }

  return true;
};

deployTokenSale.id = "TokenSale";
deployTokenSale.tags = ["TokenSale", "all"];
deployTokenSale.dependencies = ["VNDC", "Router"];
export default deployTokenSale;

