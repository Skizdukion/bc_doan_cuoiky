import { ethers } from "hardhat";
import { MockERC20, Router } from "../typechain";

async function swap() {
  const router: Router = await ethers.getContract("Router");

  const busd: MockERC20 = await ethers.getContract("BUSD");

  const vndc = await ethers.getContract("VNDC");

  const walletSwap = new ethers.Wallet(
    "c9b64f50832c02da6708c4665ef207aa210635e4d4c44d47a3118aacba9fff49",
    busd.provider
  );

  await busd.connect(walletSwap).approve(router.address, ethers.parseEther("100000"));
  await vndc.connect(walletSwap).approve(router.address, ethers.parseEther("1000000000"));
}

swap();
