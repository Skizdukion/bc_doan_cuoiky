import { ethers } from "hardhat";
import { MockERC20 } from "../typechain";

async function swap() {
  //   const deployer = (await ethers.getSigners())[0];
  const signer = await ethers.getSigners();

  const signer1 = signer[Math.floor(Math.random() * signer.length)];
  let signer2;
  do {
    signer2 = signer[Math.floor(Math.random() * signer.length)];
  } while (signer2 == signer1);

  const busd: MockERC20 = await ethers.getContract("BUSD");

  await busd.connect(signer1).transfer(signer2.address, ethers.parseEther("5"));
}

swap();
