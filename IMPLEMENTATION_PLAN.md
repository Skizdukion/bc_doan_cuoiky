# ICO-Ready ERC-20 Token Implementation Plan

## Project Overview

This document outlines the implementation plan for building a comprehensive ICO-ready ERC-20 token ecosystem with the following components:

1. **ERC-20 Token** (Mintable, Non-Upgradeable)
2. **ICO Sale Contract** (Soft cap/Hard cap, ETH payment)
3. **Vesting Contract** (Cliff + Linear vesting)
4. **Staking Contract** (Lock tiers, reward emission, early withdrawal penalty)
5. **LP Lock Contract** (Timelock for liquidity pool tokens)

---

## Tokenomics Design

### Token Distribution

**Total Supply**: 1,000,000,000 tokens (1 billion)

- **ICO Sale**: 40% (400,000,000 tokens)
  - Soft cap: 50 ETH
  - Hard cap: 200 ETH
  - Price: 1 ETH = 2,000,000 tokens (fixed price)
  - Max purchase per address: 10 ETH worth

- **Team & Advisors**: 20% (200,000,000 tokens)
  - Cliff: 6 months
  - Vesting: 24 months linear after cliff

- **Reserve/Staking Rewards**: 25% (250,000,000 tokens)
  - Used for staking rewards over 4 years
  - Emission rate: ~5,208,333 tokens/month

- **Liquidity Pool**: 10% (100,000,000 tokens)
  - Locked for 12 months
  - Paired with raised ETH from ICO

- **Marketing & Development**: 5% (50,000,000 tokens)
  - Immediate unlock for operations

### Staking Parameters

- **Lock Tiers**:
  - Tier 1: 1 month lock → 8% APY
  - Tier 2: 3 months lock → 12% APY
  - Tier 3: 6 months lock → 18% APY

- **Early Withdrawal Penalty**: 50% of rewards
- **Minimum Stake**: 1,000 tokens
- **Reward Emission**: Linear distribution from reserve pool over 4 years

### Vesting Schedule

- **Cliff Period**: 6 months (no tokens unlockable)
- **Vesting Duration**: 24 months linear after cliff
- **Total Vesting Period**: 30 months
- **Monthly Unlock**: ~6,666,667 tokens/month (after cliff)

---

## Implementation Phases

### Phase 1: ERC-20 Token Contract

#### 1.1 Modify Existing VNDI Token

**File**: `contracts/VNDC.sol` (rename from VNDI)

**Requirements**:
- Remove upgradeability (use standard ERC20, not Upgradeable)
- Add `Mintable` functionality (only owner can mint)
- Add `Burnable` functionality (users can burn their tokens)
- Implement OpenZeppelin's `ERC20`, `ERC20Burnable`, `Ownable`, `Pausable`
- Use Solidity ^0.8.0

**Key Functions**:
```solidity
- constructor(string memory name, string memory symbol, uint256 initialSupply)
- mint(address to, uint256 amount) - onlyOwner
- burn(uint256 amount) - public
- pause() - onlyOwner
- unpause() - onlyOwner
```

**Token Details**:
- Name: "VNDC Token"
- Symbol: "VNDC"
- Decimals: 18
- Initial Supply: 0 (all tokens minted through ICO/Vesting/Reserve)

#### 1.2 Implementation Steps

1. Create new `VNDC.sol` contract (non-upgradeable)
2. Import OpenZeppelin contracts:
   - `@openzeppelin/contracts/token/ERC20/ERC20.sol`
   - `@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol`
   - `@openzeppelin/contracts/access/Ownable.sol`
   - `@openzeppelin/contracts/security/Pausable.sol`
   - `@openzeppelin/contracts/security/ReentrancyGuard.sol`
3. Write unit tests for mint, burn, pause functionality
4. Update deployment script

---

### Phase 2: ICO Sale Contract

#### 2.1 TokenSale Contract

**File**: `contracts/TokenSale.sol`

**Requirements**:
- Accept ETH payments
- Fixed price: 1 ETH = 2,000,000 VNDC tokens
- Soft cap: 50 ETH
- Hard cap: 200 ETH
- Start/End time controls
- Individual purchase limit: 10 ETH max
- Refund mechanism if soft cap not reached
- Whitelist functionality (optional but recommended)

**Key Functions**:
```solidity
- buyTokens() - payable, main purchase function
- claimRefund() - if soft cap not reached
- withdrawFunds() - onlyOwner, after successful sale
- setSalePeriod(uint256 startTime, uint256 endTime) - onlyOwner
- setWhitelist(address[] users, bool status) - onlyOwner
```

**State Variables**:
- `softCap`: 50 ether
- `hardCap`: 200 ether
- `tokenPrice`: 2_000_000 (tokens per ETH)
- `minPurchase`: 0.01 ether
- `maxPurchase`: 10 ether
- `saleStartTime`: uint256
- `saleEndTime`: uint256
- `totalRaised`: uint256
- `contributors`: mapping(address => uint256)

#### 2.2 Implementation Steps

1. Create `TokenSale.sol` with ReentrancyGuard, Ownable
2. Implement buyTokens() with checks:
   - Sale is active
   - Not exceeded hard cap
   - Not exceeded individual limit
   - Minimum purchase amount
3. Implement refund logic (if soft cap not reached)
4. Implement withdraw funds (only if soft cap reached)
5. Write comprehensive tests:
   - Successful purchase
   - Hard cap reached
   - Refund scenario
   - Individual limit enforcement
   - Time-based restrictions

---

### Phase 3: Vesting Contract

#### 3.1 TokenVesting Contract

**File**: `contracts/TokenVesting.sol`

**Requirements**:
- Cliff period: 6 months (no tokens unlockable)
- Linear vesting: 24 months after cliff
- Support multiple beneficiaries
- Batch vesting schedules
- Revocable (onlyOwner, for team vesting)

**Key Functions**:
```solidity
- createVestingSchedule(
    address beneficiary,
    uint256 amount,
    uint256 cliffDuration,
    uint256 vestingDuration
) - onlyOwner

- claim() - beneficiary claims unlocked tokens
- revoke(address beneficiary) - onlyOwner
- getVestedAmount(address beneficiary) - view function
```

**Vesting Formula**:
```
If (currentTime < cliffEnd):
    vested = 0
Else if (currentTime >= vestingEnd):
    vested = totalAmount
Else:
    vested = totalAmount * (currentTime - cliffEnd) / vestingDuration
```

#### 3.2 Implementation Steps

1. Create `TokenVesting.sol` using OpenZeppelin's `VestingWallet` pattern
2. Implement custom vesting schedule structure:
   ```solidity
   struct VestingSchedule {
       address beneficiary;
       uint256 totalAmount;
       uint256 startTime;
       uint256 cliffDuration;
       uint256 vestingDuration;
       uint256 released;
       bool revocable;
   }
   ```
3. Implement linear vesting calculation
4. Add revocable functionality (only before cliff ends)
5. Write tests:
   - Cliff period enforcement
   - Linear vesting calculation
   - Multiple beneficiaries
   - Revocation scenarios
   - Edge cases (claim before cliff, claim after full vest)

---

### Phase 4: Staking Contract

#### 4.1 StakingContract

**File**: `contracts/StakingContract.sol`

**Requirements**:
- Three lock tiers: 1 month, 3 months, 6 months
- Different APY for each tier
- Reward emission from reserve pool
- Early withdrawal penalty (50% of rewards)
- Compound rewards option
- Minimum stake amount

**Key Functions**:
```solidity
- stake(uint256 amount, uint8 tier) - stake tokens
- unstake(uint256 stakeId) - unstake (penalty if early)
- claimRewards(uint256 stakeId) - claim accumulated rewards
- compoundRewards(uint256 stakeId) - reinvest rewards
- getStakeInfo(uint256 stakeId) - view stake details
- getPendingRewards(uint256 stakeId) - view pending rewards
```

**Stake Structure**:
```solidity
struct Stake {
    address staker;
    uint256 amount;
    uint256 startTime;
    uint256 lockDuration; // 1, 3, or 6 months
    uint256 tier; // 1, 2, or 3
    uint256 apy; // 8%, 12%, or 18%
    uint256 claimedRewards;
    bool active;
}
```

**APY Calculation**:
- Tier 1 (1 month): 8% APY = 0.667% per month
- Tier 2 (3 months): 12% APY = 1% per month
- Tier 3 (6 months): 18% APY = 1.5% per month

**Reward Calculation**:
```
monthlyReward = stakedAmount * (apy / 12) / 100
totalReward = monthlyReward * (currentTime - startTime) / 30 days
```

#### 4.2 Implementation Steps

1. Create `StakingContract.sol` with ReentrancyGuard
2. Implement stake function with tier selection
3. Implement reward calculation based on time and tier
4. Implement early withdrawal penalty logic
5. Add compound rewards functionality
6. Implement reward emission from reserve pool
7. Write tests:
   - Staking in different tiers
   - Reward accumulation over time
   - Early withdrawal penalty
   - Compound rewards
   - Minimum stake enforcement
   - Lock period enforcement

---

### Phase 5: Liquidity Pool & LP Lock

#### 5.1 Add Liquidity Script

**File**: `scripts/addLiquidity.ts`

**Requirements**:
- Use existing Router contract (Uniswap v2 style)
- Add liquidity using ICO-raised ETH
- Pair with 10% of token supply (100M tokens)
- Create LP tokens

**Implementation**:
1. Calculate token/ETH ratio based on ICO price
2. Approve Router to spend tokens
3. Call Router.addLiquidityETH()
4. Receive LP tokens

#### 5.2 LP Timelock Contract

**File**: `contracts/LPTimelock.sol`

**Requirements**:
- Lock LP tokens for 12 months
- Only owner can lock
- Automatic unlock after lock period
- Transfer LP tokens to specified address after unlock

**Key Functions**:
```solidity
- lock(address lpToken, uint256 amount, uint256 unlockTime) - onlyOwner
- unlock() - public, after unlockTime
- getLockInfo() - view lock details
```

**Implementation Steps**:
1. Create `LPTimelock.sol` using OpenZeppelin's `TimelockController` pattern
2. Implement lock function
3. Implement unlock function (only after lock period)
4. Write tests for lock/unlock functionality
5. Create deployment script

---

## Testing Strategy

### Unit Tests

**Framework**: Hardhat + Mocha + Chai

**Test Files**:
1. `test/VNDC.test.ts` - ERC20 token tests
2. `test/TokenSale.test.ts` - ICO sale tests
3. `test/TokenVesting.test.ts` - Vesting tests
4. `test/StakingContract.test.ts` - Staking tests
5. `test/LPTimelock.test.ts` - LP lock tests

**Test Coverage Goals**:
- Minimum 90% code coverage
- All edge cases covered
- Gas optimization tests
- Security vulnerability tests (reentrancy, overflow, etc.)

### Integration Tests

**File**: `test/integration.test.ts`

**Test Scenarios**:
1. Complete ICO flow: Deploy → ICO → Vesting → Staking
2. Liquidity provision and locking
3. End-to-end user journey

---

## Security Considerations

### Audit Checklist

- [ ] Reentrancy protection on all external calls
- [ ] Access control (onlyOwner modifiers)
- [ ] Integer overflow/underflow protection (Solidity ^0.8.0)
- [ ] Timestamp dependency checks
- [ ] Front-running protection (where applicable)
- [ ] Pause functionality for emergency stops
- [ ] Input validation on all functions
- [ ] Event emissions for all state changes

### Security Patterns

1. **Use OpenZeppelin Contracts**: Leverage battle-tested contracts
2. **ReentrancyGuard**: On all state-changing functions
3. **SafeMath**: Not needed in Solidity ^0.8.0, but good practice to verify
4. **Access Control**: Ownable for admin functions
5. **Pausable**: Emergency stop mechanism

---

## Gas Optimization

### Strategies

1. **Pack Structs**: Optimize storage layout
2. **Use Events**: Instead of storing unnecessary data
3. **Batch Operations**: Where possible
4. **Optimize Loops**: Minimize iterations
5. **Use Custom Errors**: Instead of require strings (Solidity ^0.8.4)

### Gas Reporting

Use Hardhat Gas Reporter to track:
- Deployment costs
- Function call costs
- Optimization improvements

---

## Deployment Strategy

### Deployment Order

1. **VNDC Token** - Deploy token contract
2. **TokenSale** - Deploy with token address
3. **TokenVesting** - Deploy with token address
4. **StakingContract** - Deploy with token address
5. **Router/Factory** - Use existing or deploy new
6. **LPTimelock** - Deploy after liquidity is added

### Deployment Scripts

**Files**:
- `deploy/01_deploy_VNDC.ts`
- `deploy/02_deploy_TokenSale.ts`
- `deploy/03_deploy_Vesting.ts`
- `deploy/04_deploy_Staking.ts`
- `deploy/05_add_liquidity.ts`
- `deploy/06_lock_lp.ts`

### Environment Setup

**Networks**:
- `localhost` - Development
- `bscTestnet` - Testing (if needed)
- `sophia` - Final deployment (TBD)

---

## Documentation Requirements

### Code Documentation

- **NatSpec Comments**: All public functions
- **README.md**: Setup and usage instructions
- **API Documentation**: Function signatures and parameters

### User Documentation

- **ICO Guide**: How to participate in ICO
- **Vesting Guide**: How to claim vested tokens
- **Staking Guide**: How to stake and claim rewards
- **FAQ**: Common questions and answers

---

## File Structure

```
contracts/
├── VNDC.sol                    # Main ERC20 token
├── TokenSale.sol               # ICO sale contract
├── TokenVesting.sol            # Vesting contract
├── StakingContract.sol         # Staking contract
├── LPTimelock.sol              # LP token lock
└── interfaces/
    ├── ITokenSale.sol
    ├── IVesting.sol
    └── IStaking.sol

test/
├── VNDC.test.ts
├── TokenSale.test.ts
├── TokenVesting.test.ts
├── StakingContract.test.ts
├── LPTimelock.test.ts
└── integration.test.ts

scripts/
├── deploy/
│   ├── 01_deploy_VNDC.ts
│   ├── 02_deploy_TokenSale.ts
│   ├── 03_deploy_Vesting.ts
│   ├── 04_deploy_Staking.ts
│   ├── 05_add_liquidity.ts
│   └── 06_lock_lp.ts
└── interactions/
    ├── buyTokens.ts
    ├── claimVesting.ts
    ├── stakeTokens.ts
    └── claimRewards.ts
```

---

## Implementation Checklist

### Phase 1: ERC-20 Token
- [ ] Create VNDC.sol (non-upgradeable, mintable)
- [ ] Write unit tests
- [ ] Deploy and verify
- [ ] Update documentation

### Phase 2: ICO Sale
- [ ] Create TokenSale.sol
- [ ] Implement buyTokens function
- [ ] Implement refund mechanism
- [ ] Implement withdraw function
- [ ] Write comprehensive tests
- [ ] Deploy and verify

### Phase 3: Vesting
- [ ] Create TokenVesting.sol
- [ ] Implement vesting schedule
- [ ] Implement claim function
- [ ] Implement revocation (if needed)
- [ ] Write tests
- [ ] Deploy and verify

### Phase 4: Staking
- [ ] Create StakingContract.sol
- [ ] Implement stake function with tiers
- [ ] Implement reward calculation
- [ ] Implement unstake with penalty
- [ ] Implement compound rewards
- [ ] Write tests
- [ ] Deploy and verify

### Phase 5: Liquidity & Lock
- [ ] Create add liquidity script
- [ ] Create LPTimelock.sol
- [ ] Test liquidity provision
- [ ] Test LP locking
- [ ] Deploy and verify

### Final Integration
- [ ] End-to-end integration tests
- [ ] Gas optimization
- [ ] Security audit checklist
- [ ] Documentation completion
- [ ] Demo preparation

---

## Next Steps

1. **Start with Phase 1**: Create the VNDC token contract
2. **Set up testing environment**: Ensure all tests can run locally
3. **Implement contracts sequentially**: Follow the phase order
4. **Test thoroughly**: Aim for 90%+ coverage
5. **Optimize gas**: Review and optimize before final deployment
6. **Document everything**: Keep documentation updated as you build

---

## Notes

- All contracts use Solidity ^0.8.0 for built-in overflow protection
- Use OpenZeppelin contracts for security and best practices
- Test on localhost first, then move to testnet
- Keep private keys secure using .env file
- Use Hardhat's console.log for debugging during development

---

**Last Updated**: Implementation-focused plan without timeline constraints
**Status**: Ready for implementation

