# VNDC Token Sale & Staking System

A Hardhat-based project for testing stress scenarios in a token sale system with staking, vesting, and liquidity protection mechanisms. This project includes smart contracts and stress test scripts to validate system behavior under extreme market conditions.

## 📋 Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Compilation](#compilation)
- [Running the Project](#running-the-project)
- [Available Scripts](#available-scripts)
- [Troubleshooting](#troubleshooting)

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js**: Version 20.19.5 (required)
  - Check your version: `node --version`
  - If you need to install or switch versions, consider using [nvm](https://github.com/nvm-sh/nvm) or [n](https://github.com/tj/n)
- **Yarn**: Package manager (install via `npm install -g yarn`)
- **Git**: For cloning the repository

## Installation

1. **Clone the repository** (if not already done):
   ```bash
   git clone <repository-url>
   cd bc_doan_cuoiky
   ```

2. **Install dependencies**:
   ```bash
   yarn install
   ```

## Configuration

Before compiling, you need to fix a Solidity version compatibility issue in the PancakeSwap library dependencies.

### Fix Solidity Version Compatibility

The PancakeSwap library contracts need their pragma statements updated to be compatible with the project's Solidity compiler versions.

**Step 1:** Open the first file:
```bash
node_modules/@pancakeswap/pancake-swap-lib/contracts/GSN/Context.sol
```

**Step 2:** Find the line:
```solidity
pragma solidity >=0.4.0;
```

**Step 3:** Change it to:
```solidity
pragma solidity >=0.4.0 <0.7.0;
```

**Step 4:** Open the second file:
```bash
node_modules/@pancakeswap/pancake-swap-lib/contracts/access/Ownable.sol
```

**Step 5:** Find the line:
```solidity
pragma solidity >=0.4.0;
```

**Step 6:** Change it to:
```solidity
pragma solidity >=0.4.0 <0.7.0;
```

> **Note:** These changes are necessary because the project uses multiple Solidity compiler versions (0.4.24, 0.5.16, 0.6.6, 0.6.12, 0.8.1, 0.8.4), and the unrestricted `>=0.4.0` pragma can cause compilation conflicts.

## Compilation

After fixing the pragma statements, compile the contracts:

```bash
yarn hardhat compile
```

This will:
- Compile all Solidity contracts in the `contracts/` directory
- Generate TypeScript types in the `typechain/` directory
- Create artifacts in the `artifacts/` directory

If compilation succeeds, you're ready to run the project!

## Running the Project

The project requires running two processes simultaneously: a local Hardhat node and the test scripts.

### Step 1: Start the Local Hardhat Node

Open your first terminal and run:

```bash
yarn hardhat node
```

This command will:
- Start a local Ethereum node on `http://127.0.0.1:8545`
- Automatically deploy all contracts configured in the `deploy/` directory
- Provide 20 test accounts with pre-funded ETH
- Display contract addresses and account information

**Keep this terminal running** - the node must stay active while you run scripts.

### Step 2: Run Stress Test Scripts

Open a **second terminal** (keep the first one running) and navigate to the project directory.

You can run either of the following stress test scenarios:

#### Option A: Flash Dump Panic Scenario
Tests the dynamic APY boost mechanism when market dumps and TVL drops:

```bash
yarn hardhat run scripts/flash_dump_panic.ts --network localhost
```

This script validates that:
- When 40% of tokens are locked in vesting and most are staked
- The system activates dynamic APY boost to encourage token locking
- This reduces selling pressure during market dumps

#### Option B: Liquidity Withdrawal Mitigation
Tests that LP tokens are locked and cannot be withdrawn (rug pull prevention):

```bash
yarn hardhat run scripts/liquidity_withdrawal_mitigation.ts --network localhost
```

This script validates that:
- LP tokens are locked in the TokenSale contract
- Any attempt to remove liquidity should fail
- LP tokens are locked on-chain, preventing rug pulls

## Available Scripts

The project includes several useful scripts defined in `package.json`:

| Command | Description |
|---------|-------------|
| `yarn hardhat compile` | Compile all Solidity contracts |
| `yarn hardhat test` | Run unit tests (in `test/unit/`) |
| `yarn hardhat coverage` | Generate test coverage report |
| `yarn hardhat node` | Start local Hardhat node with deployments |

## Troubleshooting

### Common Issues

#### 1. **Node Version Mismatch**
```
Error: The engine "node" is incompatible with this module
```
**Solution:** Ensure you're using Node.js v20.19.5. Use `nvm use 20.19.5` or install the correct version.

#### 2. **Compilation Errors After Pragma Fix**
```
Error: ParserError: Source file requires different compiler version
```
**Solution:** 
- Double-check that you've updated both files correctly
- Ensure the pragma statement is exactly: `pragma solidity >=0.4.0 <0.7.0;`
- Try deleting `cache/` and `artifacts/` directories, then recompile:
  ```bash
  rm -rf cache artifacts
  yarn hardhat compile
  ```

#### 3. **Contracts Not Found Error**
```
Error: Could not get contracts. Make sure:
  1. hardhat node is running (yarn hardhat node)
  2. Contracts are deployed
  3. Run with --network localhost flag
```
**Solution:**
- Ensure `yarn hardhat node` is running in another terminal
- Wait for all contracts to deploy (you'll see deployment messages)
- Make sure you're using the `--network localhost` flag

#### 4. **Port Already in Use**
```
Error: listen EADDRINUSE: address already in use :::8545
```
**Solution:** 
- Another Hardhat node might be running. Kill it first:
  ```bash
  # Find the process
  lsof -ti:8545
  # Kill it
  kill -9 $(lsof -ti:8545)
  ```
- Or use a different port by modifying `hardhat.config.ts`

#### 5. **Yarn Install Fails**
**Solution:**
- Clear yarn cache: `yarn cache clean`
- Delete `node_modules/` and `yarn.lock`, then reinstall:
  ```bash
  rm -rf node_modules yarn.lock
  yarn install
  ```