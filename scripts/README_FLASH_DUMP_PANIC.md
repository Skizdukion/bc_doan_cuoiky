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

### Automatic TVL Ratio Monitoring
The contract monitors TVL ratio (totalStaked / totalSupply) continuously. When tokens are staked or unstaked, it automatically updates the APY boost multiplier based on the current ratio. This ensures the boost is always proportional to the actual staking participation rate.

### Dynamic APY Boost (Monotonically Decreasing)
- **Trigger**: Based on **TVL/totalSupply ratio** (not drop percentage)
- **Effect**: Boost multiplier increases when TVL ratio is LOW (monotonically decreasing):
  - **TVL < 10% of supply**: 2.0x multiplier (100% APY increase, maximum boost)
  - **TVL 10-20% of supply**: 1.75x multiplier (75% APY increase)
  - **TVL 20-30% of supply**: 1.5x multiplier (50% APY increase)
  - **TVL 30-40% of supply**: 1.25x multiplier (25% APY increase)
  - **TVL ≥ 40% of supply**: 1.0x multiplier (no boost)
- **Monotonic**: Lower TVL ratio always results in equal or higher boost (never decreases for lower ratios)
- **Real-time**: Boost updates automatically on every stake/unstake
- **Automatic**: No manual intervention required
- **Dynamic Application**: Boost is applied dynamically via `getEffectiveAPY()`, not by permanently modifying tier APYs
- **Economic Logic**: When few tokens are staked (low ratio), higher APY encourages more staking

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

- **TVL Ratio Calculation**: Contract calculates `totalStaked / totalSupply` on every stake/unstake
- **Total Supply Comparison**: Boost is based on TVL ratio vs total minted supply
- **Automatic Update**: Contract updates boost multiplier automatically on every stake/unstake
- **Monotonically Decreasing**: Lower TVL ratio = Higher boost multiplier (1.0x to 2.0x)
- **Dynamic Application**: Boost multiplier stored in `currentAPYBoostMultiplier` and applied via `getEffectiveAPY()`
- **Reward Calculation**: Uses boosted APY automatically via `getEffectiveAPY()` - tier APYs are not permanently modified
- **Real-time Response**: Boost updates immediately when TVL ratio changes

The script only:
- Sets up the scenario
- Triggers panic events
- Reads and displays what the contract does automatically

## Expected Outcomes

✅ **TVL Ratio Calculated**: Contract automatically calculates TVL/totalSupply ratio  
✅ **APY Boost Updated**: Contract applies monotonically decreasing boost (2.0x to 1.0x based on ratio)  
✅ **Monotonic Behavior**: Lower TVL ratios always result in equal or higher boost multipliers  
✅ **Penalties Applied**: Early unstakers lose 50% of rewards  
✅ **Recovery Demonstrated**: Higher APY (when ratio is low) encourages more staking  
✅ **System Resilience**: Mechanisms work as designed during crisis  

## Key Takeaways

1. **Fully Automated**: All detection and boost logic is in the smart contract
2. **On-Chain Verification**: Everything is verifiable on the blockchain
3. **Real-Time Response**: Boost updates immediately when TVL ratio changes
4. **Monotonically Decreasing**: Lower TVL ratio = Higher boost (2.0x to 1.0x) - encourages staking when participation is low
5. **Total Supply Normalization**: Ratio measured against total minted supply for accurate comparison
6. **Economic Incentives**: Higher APY when few tokens are staked encourages more participation
7. **Penalty Deterrent**: Early withdrawal penalty discourages panic selling
8. **Dynamic Application**: Boost applied via multiplier, tier APYs remain unchanged
9. **Self-Balancing**: As more tokens are staked (ratio increases), boost decreases naturally

## Notes

- **TVL Ratio Based**: The contract uses TVL/totalSupply ratio, not drop percentage. This ensures boost is always proportional to actual staking participation.
- **Monotonically Decreasing**: The boost multiplier decreases as TVL ratio increases. When ratio is low (<10%), boost is maximum (2.0x). When ratio is high (≥40%), there's no boost (1.0x).
- **Real-time Updates**: Boost updates automatically on every stake/unstake operation - no fixed duration or manual intervention needed.
- **Dynamic Application**: Boost is applied dynamically via `getEffectiveAPY()` - tier APYs in storage remain unchanged.
- **Existing Stakers**: All existing stakers benefit from boosted APY for new rewards calculations via `getEffectiveAPY()`.
- **Self-Balancing Mechanism**: As more tokens are staked (ratio increases), boost naturally decreases, creating a self-balancing system.
- **Economic Logic**: When few tokens are staked, higher APY incentivizes more staking. When many tokens are already staked, lower boost is sufficient.
- **System Resilience**: The system is designed to be resilient during market volatility with automatic, proportional responses based on actual participation rates.

