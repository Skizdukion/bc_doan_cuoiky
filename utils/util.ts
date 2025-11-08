import { ethers } from "hardhat";
import { BigNumber as BN } from "bignumber.js";

export const imul = (a: bigint, b: bigint, c: bigint) => {
  return BigInt(
    new BN(a.toString()).times(b.toString()).idiv(c.toString()).toString(10)
  );
};

export const increaseTime = async (seconds: bigint) => {
  const now = (await ethers.provider.getBlock("latest"))?.timestamp || 0n;
  await ethers.provider.send("evm_mine", [Number(seconds + BigInt(now))]);
};
