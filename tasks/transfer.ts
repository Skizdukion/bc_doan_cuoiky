import { ethers } from "ethers";
import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

const jsonRpcProvider = process.env.ALCHEMY_MAINNET_RPC_URL; // https://docs.ethers.io/v6/api/providers/#providers-getDefaultProvider
const provider = ethers.getDefaultProvider(jsonRpcProvider);

task("balance", "Prints an account's balance")
  .addParam("account", "The account's address")
  .setAction(async (taskArgs: TaskArguments): Promise<void> => {
    const account: string = ethers.getAddress(taskArgs.account);
    const balance: bigint = await provider.getBalance(account);

    console.log(`${ethers.formatEther(balance)} ETH`);
  });
