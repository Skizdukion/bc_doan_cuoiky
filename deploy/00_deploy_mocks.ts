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
    log(`Local network detected! Deploying mocks...`);

    await deploy("WETH", {
      contract: "WETH9",
      from: deployer,
      log: true,
    });

    await deploy("BUSD", {
      contract: "MockERC20",
      from: deployer,
      log: true,
      args: ["BUSD", "BUSD", ethers.MaxUint256.toString()],
    });

    await deploy("USDT", {
      contract: "MockERC20",
      from: deployer,
      log: true,
      args: ["USDT", "USDT", ethers.MaxUint256.toString()],
    });

    await deploy("Nope", {
      contract: "MockERC20",
      from: deployer,
      log: true,
      args: ["NC", "NC", "0"],
    });

    log(`Mocks Deployed!`);
  }

  // await deploy("WETH", {
  //   contract: "WETH9",
  //   from: deployer,
  //   log: true,
  // });

  // const weth = await ethers.getContract("WETH");

  // if (!developmentChains.includes(network.name) && process.env.BSCSCAN_API_KEY) {
  //   await verify(weth.address, []);
  // }

  // await deploy("BUSD", {
  //   contract: "MockERC20",
  //   from: deployer,
  //   log: true,
  //   args: ["BUSD", "BUSD", ethers.constants.MaxUint256],
  // });

  // await deploy("USDT", {
  //   contract: "MockERC20",
  //   from: deployer,
  //   log: true,
  //   args: ["USDT", "USDT", ethers.constants.MaxUint256],
  // });

  // const busd = await ethers.getContract("BUSD");
  // const usdt = await ethers.getContract("USDT");

  // if (!developmentChains.includes(network.name) && process.env.BSCSCAN_API_KEY) {
  //   await verify(busd.address, ["BUSD", "BUSD", ethers.constants.MaxUint256]);
  //   await verify(usdt.address, ["USDT", "USDT", ethers.constants.MaxUint256]);
  // }
};

export default deployFunction;
deployFunction.tags = [`all`, `mocks`, `main`];
