import { ethers } from "hardhat";
import { VNDI } from "../typechain";

async function transferOwnership() {
  const deployer = (await ethers.getSigners())[0];

  let vndi: VNDI = await ethers.getContract("VNDI");

  vndi = vndi.connect(deployer);

  // const availabeBalance = await vndi.balanceOf(deployer.address);

  // await vndi.burn(availabeBalance);

  await vndi.transferOwnership("0xdF4bff648C4B4Bc0b20d5348DF7e5d52e367f681");
}

transferOwnership();
