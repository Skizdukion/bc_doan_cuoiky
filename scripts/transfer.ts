import { ethers } from "hardhat";
import { MockERC20 } from "../typechain";

async function swap() {
  const deployer = (await ethers.getSigners())[0];

  const busd: MockERC20 = await ethers.getContract("BUSD");

  await busd.transfer("0xf5f3Ac6b2d9df1eea5e273BeBe54470d2ceE8bd9", ethers.parseEther("5"));
}

swap();
