import * as dotenv from "dotenv";

import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-chai-matchers";
import "@nomiclabs/hardhat-etherscan";
import "@typechain/hardhat";
import "@typechain/ethers-v6";
import "hardhat-deploy";
import "hardhat-deploy-ethers";
import "solidity-coverage";
import "hardhat-gas-reporter";
import "hardhat-contract-sizer";
import "@openzeppelin/hardhat-upgrades";
import "./tasks";

dotenv.config();

const MAINNET_RPC_URL =
  process.env.MAINNET_RPC_URL ||
  process.env.ALCHEMY_MAINNET_RPC_URL ||
  "https://eth-mainnet.alchemyapi.io/v2/your-api-key";
const RINKEBY_RPC_URL =
  process.env.RINKEBY_RPC_URL || "https://eth-rinkeby.alchemyapi.io/v2/your-api-key";
const KOVAN_RPC_URL =
  process.env.KOVAN_RPC_URL || "https://eth-kovan.alchemyapi.io/v2/your-api-key";
const POLYGON_MAINNET_RPC_URL =
  process.env.POLYGON_MAINNET_RPC_URL || "https://polygon-mainnet.alchemyapi.io/v2/your-api-key";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
// optional
const MNEMONIC = process.env.MNEMONIC || "Your mnemonic";
const FORKING_BLOCK_NUMBER = process.env.FORKING_BLOCK_NUMBER;

// Your API key for Etherscan, obtain one at https://etherscan.io/
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "Your etherscan API key";
const POLYGONSCAN_API_KEY = process.env.POLYGONSCAN_API_KEY || "Your polygonscan API key";

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  networks: {
    // hardhat: {
    //   forking: {
    //     url: process.env.FORKING_NETWORK!,
    //     // url: "https://bscrpc.com",
    //     enabled: process.env.ENABLE_FORKING! === "true",
    //     blockNumber: Number(process.env.FORKING_BLOCK!),
    //   },
    //   loggingEnabled: process.env.FORKING_LOG! === "true",
    //   chainId: 31337,
    //   // accounts: PRIVATE_KEY !== undefined ? [PRIVATE_KEY] : undefined,
    //   allowUnlimitedContractSize: true,
    // },
    localhost: {
      chainId: 31337,
    },
    // forking_bsc: {
    //   forking: {
    //     url: "https://bsc-mainnet.nodereal.io/v1/09aca415a354469eb97c2b7fea7c1201",
    //     enabled: true,
    //     blockNumber: 21110565,
    //   },
    //   chainId: 31337,
    //   accounts: PRIVATE_KEY !== undefined ? [PRIVATE_KEY] : [],
    //   allowUnlimitedContractSize: true,
    // },
    // kovan: {
    //   url: KOVAN_RPC_URL,
    //   accounts: PRIVATE_KEY !== undefined ? [PRIVATE_KEY] : [],
    //   //accounts: {
    //   //     mnemonic: MNEMONIC,
    //   // },
    //   saveDeployments: true,
    //   chainId: 42,
    // },
    // rinkeby: {
    //   url: RINKEBY_RPC_URL,
    //   accounts: PRIVATE_KEY !== undefined ? [PRIVATE_KEY] : [],
    //   //   accounts: {
    //   //     mnemonic: MNEMONIC,
    //   //   },
    //   saveDeployments: true,
    //   chainId: 4,
    // },
    // mainnet: {
    //   url: MAINNET_RPC_URL,
    //   accounts: PRIVATE_KEY !== undefined ? [PRIVATE_KEY] : [],
    //   //   accounts: {
    //   //     mnemonic: MNEMONIC,
    //   //   },
    //   saveDeployments: true,
    //   chainId: 1,
    // },
    // polygon: {
    //   url: POLYGON_MAINNET_RPC_URL,
    //   accounts: PRIVATE_KEY !== undefined ? [PRIVATE_KEY] : [],
    //   saveDeployments: true,
    //   chainId: 137,
    // },
    bscTestnet: {
      url: process.env.BSCTESTNET_RPC_URL,
      accounts: PRIVATE_KEY !== undefined ? [PRIVATE_KEY] : [],
      saveDeployments: true,
      chainId: 97,
    },
    bscMainnet: {
      url: process.env.BSCMAINNET_RPC_URL,
      accounts: PRIVATE_KEY !== undefined ? [PRIVATE_KEY] : [],
      saveDeployments: true,
      chainId: 56,
    },
  },
  etherscan: {
    // yarn hardhat verify --network <NETWORK> <CONTRACT_ADDRESS> <CONSTRUCTOR_PARAMETERS>
    apiKey: {
      // rinkeby: ETHERSCAN_API_KEY,
      // kovan: ETHERSCAN_API_KEY,
      // polygon: POLYGONSCAN_API_KEY,
      bscTestnet: process.env.BSCSCAN_API_KEY,
      bsc: process.env.BSCSCAN_API_KEY,
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
    outputFile: "gas-report.txt",
    noColors: true,
    // coinmarketcap: process.env.COINMARKETCAP_API_KEY,
  },
  contractSizer: {
    runOnCompile: false,
    only: ["APIConsumer", "KeepersCounter", "PriceConsumerV3", "RandomNumberConsumer"],
  },
  namedAccounts: {
    deployer: {
      default: 0, // here this will by default take the first account as deployer
      1: 0, // similarly on mainnet it will take the first account as deployer. Note though that depending on how hardhat network are configured, the account 0 on one network can be different than on another
    },
    feeCollector: {
      default: 1,
    },
  },
  solidity: {
    compilers: [
      {
        version: "0.6.12",
      },
      {
        version: "0.6.6",
        settings: {
          // See the solidity docs for advice about optimization and evmVersion
          optimizer: {
            enabled: true,
            runs: 999999,
          },
          evmVersion: "istanbul",
          outputSelection: {
            "*": {
              "": ["ast"],
              "*": [
                "evm.bytecode.object",
                "evm.deployedBytecode.object",
                "abi",
                "evm.bytecode.sourceMap",
                "evm.deployedBytecode.sourceMap",
                "metadata",
              ],
            },
          },
        },
      },
      {
        version: "0.5.16",
      },
      {
        version: "0.4.24",
      },
      {
        version: "0.8.1",
      },
      {
        version: "0.8.4",
      },
    ],
  },
  mocha: {
    timeout: 200000, // 200 seconds max for running tests
  },
  typechain: {
    outDir: "typechain",
    target: "ethers-v6",
  },
};

export default config;
