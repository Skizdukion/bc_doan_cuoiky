# Flash Dump Panic Scenario

## Overview

The **Flash Dump Panic** scenario is a stress test that simulates a market crash situation where token holders panic and attempt to exit their positions. This test validates that the staking system can automatically respond to TVL (Total Value Locked) drops by activating dynamic APY boosts to encourage holders to keep their tokens staked.

## Purpose

This scenario demonstrates:
- How the system handles panic selling during market downturns
- Automatic detection of significant TVL drops
- Dynamic APY boost mechanism that activates when TVL drops below a threshold
- Recovery mechanisms that attract new capital during crisis

## How It Works

### 1. Initial Setup
- Investors claim tokens from the token sale
- Investors stake tokens across different lock tiers (1, 3, and 6 months)
- A baseline TVL is established in the contract as a reference point

### 2. Normal Market Conditions
- Time advances to simulate normal market activity
- Rewards accrue for stakers
- System operates normally

### 3. Market Panic
- Market crash is simulated
- Some investors panic and unstake early (despite 50% penalty on rewards)
- TVL drops significantly as tokens are withdrawn

### 4. Automatic Response
- The contract automatically detects the TVL drop
- If the drop exceeds the threshold (10%), the contract activates an APY boost
- All staking tiers receive a 50% APY increase automatically
- This happens entirely on-chain, no manual intervention needed

### 5. Recovery
- Higher APY rates attract "smart money" investors
- New stakers enter to take advantage of boosted rates
- TVL begins to recover
- System demonstrates resilience

## Key Features

### Automatic TVL Drop Detection
The contract monitors TVL continuously. When tokens are unstaked, it automatically checks if the drop exceeds the threshold.

### Dynamic APY Boost
- **Trigger**: TVL drops by 10% or more from baseline
- **Effect**: All tier APYs increase by 50%
- **Duration**: Boost lasts for a fixed period
- **Automatic**: No manual intervention required

### Early Withdrawal Penalty
Investors who unstake before their lock period ends lose 50% of their accrued rewards. This discourages panic selling.

### Staggered Unlock Tiers
Different lock durations (1, 3, 6 months) prevent mass exit events by spreading unlock times across different periods.

## Running the Scenario

### Prerequisites
1. Hardhat node running: `yarn hardhat node`
2. Contracts deployed: `yarn hardhat deploy --network localhost`

### Execute
```bash
yarn hardhat run scripts/flash_dump_panic.ts --network localhost
```

### What You'll See
1. Initial state and token claiming
2. Investors staking tokens
3. Baseline TVL establishment
4. Time advancement (simulating normal conditions)
5. Panic unstaking events
6. Automatic APY boost activation (if threshold met)
7. Recovery metrics showing new staking activity
8. Final validation of all mechanisms

## Contract Integration

The APY boost mechanism is **fully implemented in the contract**, not just simulated in the script:

- **Baseline TVL**: Stored in contract, can be updated by owner
- **Automatic Detection**: Contract checks TVL on every stake/unstake
- **Automatic Boost**: Contract updates tier APYs when threshold is met
- **Reward Calculation**: Uses boosted APY automatically via `getEffectiveAPY()`

The script only:
- Sets up the scenario
- Triggers panic events
- Reads and displays what the contract does automatically

## Expected Outcomes

✅ **TVL Drop Detected**: Contract automatically measures drop from baseline  
✅ **APY Boost Activated**: Contract increases all tier APYs by 50%  
✅ **Penalties Applied**: Early unstakers lose 50% of rewards  
✅ **Recovery Demonstrated**: New stakers enter at boosted rates  
✅ **System Resilience**: Mechanisms work as designed during crisis  

## Key Takeaways

1. **Fully Automated**: All detection and boost logic is in the smart contract
2. **On-Chain Verification**: Everything is verifiable on the blockchain
3. **Real-Time Response**: Boost activates immediately when threshold is met
4. **Economic Incentives**: Higher APY encourages staking during panic
5. **Penalty Deterrent**: Early withdrawal penalty discourages panic selling

## Notes

- The baseline TVL should be updated periodically in production (e.g., daily/weekly) to account for normal growth
- The boost duration is fixed and will automatically deactivate after the period ends
- Existing stakers benefit from boosted APY for new rewards calculations
- The system is designed to be resilient during market volatility

