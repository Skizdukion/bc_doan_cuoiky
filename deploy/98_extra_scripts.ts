import { DeployFunction } from "hardhat-deploy/types";
import { getNamedAccounts, deployments, network, ethers } from "hardhat";
import { developmentChains } from "../helper-hardhat-config";
import { verify } from "../helper-functions";

const deployFunction: DeployFunction = async () => {
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();
  const chainId: number | undefined = network.config.chainId;

  // If we are on a local development network, we need to deploy mocks!
  if (chainId === 31337) {
    const busd = await ethers.getContract("BUSD");
    const usdt = await ethers.getContract("USDT");
    const signer = await ethers.getSigners();

    for (let index = 1; index < signer.length; index++) {
      const element = signer[index];
      await busd.transfer(element.address, ethers.parseEther("5000"));
      await usdt.transfer(element.address, ethers.parseEther("5000"));
    }
  }
};

export default deployFunction;
deployFunction.tags = [`all`, `mocks`];
