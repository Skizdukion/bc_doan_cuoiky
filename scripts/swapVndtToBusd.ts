import { ethers } from "hardhat";
import { Router } from "../typechain";

async function swap() {
  const router: Router = await ethers.getContract("Router");

  const busd = await ethers.getContract("BUSD");

  const vndc = await ethers.getContract("VNDC");

  const walletSwap = new ethers.Wallet(
    "c9b64f50832c02da6708c4665ef207aa210635e4d4c44d47a3118aacba9fff49",
    busd.provider
  );

  const amountIn = ethers.parseEther("23000");

  const deadline = Math.ceil(Date.now() / 1000) + 3600;

  await router
    .connect(walletSwap)
    .swapExactTokensForTokens(
      amountIn,
      "0",
      [vndc.address, busd.address],
      walletSwap.address,
      deadline
    );
}

swap();
