import { expect } from "chai";
import { ethers } from "hardhat";
import { VNDC, StakingContract } from "../typechain";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("StakingContract", function () {
  let vndc: VNDC;
  let staking: StakingContract;
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;

  const REWARD_POOL = ethers.parseEther("10000000");
  const STAKE_AMOUNT = ethers.parseEther("10000");
  const MIN_STAKE = ethers.parseEther("1000");

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();

    // Deploy VNDC token
    const VNDCFactory = await ethers.getContractFactory("VNDC");
    vndc = await VNDCFactory.deploy();
    await vndc.waitForDeployment();

    // Deploy StakingContract
    const StakingFactory = await ethers.getContractFactory("StakingContract");
    staking = await StakingFactory.deploy(await vndc.getAddress());
    await staking.waitForDeployment();

    // Fund reward pool
    await vndc.mint(owner.address, REWARD_POOL);
    await vndc.approve(await staking.getAddress(), REWARD_POOL);
    await staking.fundRewardPool(REWARD_POOL);

    // Mint tokens to users
    await vndc.mint(user1.address, STAKE_AMOUNT * 10n);
    await vndc.mint(user2.address, STAKE_AMOUNT * 10n);
  });

  describe("Deployment", function () {
    it("Should set the right token address", async function () {
      expect(await staking.token()).to.equal(await vndc.getAddress());
    });

    it("Should set the right owner", async function () {
      expect(await staking.owner()).to.equal(owner.address);
    });

    it("Should have correct tier configurations", async function () {
      const tier1 = await staking.getTier(1);
      expect(tier1.lockDuration).to.equal(30 * 24 * 60 * 60); // 30 days
      expect(tier1.apy).to.equal(800); // 8%

      const tier2 = await staking.getTier(2);
      expect(tier2.lockDuration).to.equal(90 * 24 * 60 * 60); // 90 days
      expect(tier2.apy).to.equal(1200); // 12%

      const tier3 = await staking.getTier(3);
      expect(tier3.lockDuration).to.equal(180 * 24 * 60 * 60); // 180 days
      expect(tier3.apy).to.equal(1800); // 18%
    });
  });

  describe("Funding Reward Pool", function () {
    it("Should allow funding reward pool", async function () {
      const amount = ethers.parseEther("1000");
      await vndc.mint(owner.address, amount);
      await vndc.approve(await staking.getAddress(), amount);
      
      await expect(
        staking.fundRewardPool(amount)
      ).to.emit(staking, "RewardPoolFunded");

      const stats = await staking.getStats();
      expect(stats[2]).to.equal(REWARD_POOL + amount); // rewardPool is the 3rd element (index 2)
    });
  });

  describe("Staking", function () {
    it("Should allow users to stake tokens", async function () {
      await vndc.connect(user1).approve(await staking.getAddress(), STAKE_AMOUNT);
      
      await expect(
        staking.connect(user1).stake(STAKE_AMOUNT, 1)
      ).to.emit(staking, "StakeCreated");

      const userStakes = await staking.getUserStakes(user1.address);
      expect(userStakes.length).to.equal(1);
      
      const stakeInfo = await staking.getStakeInfo(0);
      expect(stakeInfo.staker).to.equal(user1.address);
      expect(stakeInfo.amount).to.equal(STAKE_AMOUNT);
      expect(stakeInfo.tier).to.equal(1);
    });

    it("Should not allow staking below minimum", async function () {
      const amount = MIN_STAKE - ethers.parseEther("1");
      await vndc.connect(user1).approve(await staking.getAddress(), amount);
      
      await expect(
        staking.connect(user1).stake(amount, 1)
      ).to.be.revertedWith("StakingContract: Below minimum stake");
    });

    it("Should not allow staking with invalid tier", async function () {
      await vndc.connect(user1).approve(await staking.getAddress(), STAKE_AMOUNT);
      
      await expect(
        staking.connect(user1).stake(STAKE_AMOUNT, 4)
      ).to.be.revertedWith("StakingContract: Invalid tier");
    });

    it("Should track total staked", async function () {
      await vndc.connect(user1).approve(await staking.getAddress(), STAKE_AMOUNT);
      await vndc.connect(user2).approve(await staking.getAddress(), STAKE_AMOUNT);
      
      await staking.connect(user1).stake(STAKE_AMOUNT, 1);
      await staking.connect(user2).stake(STAKE_AMOUNT, 2);

      const stats = await staking.getStats();
      expect(stats[1]).to.equal(STAKE_AMOUNT * 2n); // totalStaked is the 2nd element (index 1)
    });
  });

  describe("Rewards Calculation", function () {
    beforeEach(async function () {
      await vndc.connect(user1).approve(await staking.getAddress(), STAKE_AMOUNT);
      await staking.connect(user1).stake(STAKE_AMOUNT, 1); // Tier 1, 8% APY
    });

    it("Should calculate rewards correctly", async function () {
      // Move time forward by 1 month
      await time.increase(30 * 24 * 60 * 60);
      
      const pendingRewards = await staking.getPendingRewards(0);
      
      // Get effective APY (which includes boost multiplier based on TVL ratio)
      const effectiveAPY = await staking.getEffectiveAPY(1);
      
      // Expected: STAKE_AMOUNT * (effectiveAPY / 12) / 10000
      // effectiveAPY is in basis points, so divide by 10000
      const expectedReward = (STAKE_AMOUNT * effectiveAPY) / (12n * 10000n);
      
      expect(pendingRewards).to.be.closeTo(expectedReward, ethers.parseEther("10"));
    });

    it("Should return 0 rewards immediately after staking", async function () {
      const pendingRewards = await staking.getPendingRewards(0);
      expect(pendingRewards).to.equal(0);
    });
  });

  describe("Claiming Rewards", function () {
    beforeEach(async function () {
      await vndc.connect(user1).approve(await staking.getAddress(), STAKE_AMOUNT);
      await staking.connect(user1).stake(STAKE_AMOUNT, 1);
      await time.increase(30 * 24 * 60 * 60); // 1 month
    });

    it("Should allow claiming rewards", async function () {
      const pendingRewards = await staking.getPendingRewards(0);
      expect(pendingRewards).to.be.gt(0);

      const balanceBefore = await vndc.balanceOf(user1.address);
      await staking.connect(user1).claimRewards(0);
      const balanceAfter = await vndc.balanceOf(user1.address);

      expect(balanceAfter - balanceBefore).to.equal(pendingRewards);
    });

    it("Should update claimed rewards", async function () {
      const pendingRewards = await staking.getPendingRewards(0);
      await staking.connect(user1).claimRewards(0);

      const stakeInfo = await staking.getStakeInfo(0);
      expect(stakeInfo.claimedRewards).to.equal(pendingRewards);
    });
  });

  describe("Unstaking", function () {
    beforeEach(async function () {
      await vndc.connect(user1).approve(await staking.getAddress(), STAKE_AMOUNT);
      await staking.connect(user1).stake(STAKE_AMOUNT, 1);
    });

    it("Should allow unstaking after lock period", async function () {
      await time.increase(30 * 24 * 60 * 60 + 1); // 1 month + 1 second
      
      const balanceBefore = await vndc.balanceOf(user1.address);
      await staking.connect(user1).unstake(0);
      const balanceAfter = await vndc.balanceOf(user1.address);

      // Should receive staked amount + rewards
      expect(balanceAfter - balanceBefore).to.be.gte(STAKE_AMOUNT);
    });

    it("Should apply penalty for early withdrawal", async function () {
      await time.increase(15 * 24 * 60 * 60); // 15 days (before lock period)
      
      const pendingRewards = await staking.getPendingRewards(0);
      const expectedPenalty = pendingRewards * 50n / 100n;
      
      const balanceBefore = await vndc.balanceOf(user1.address);
      await staking.connect(user1).unstake(0);
      const balanceAfter = await vndc.balanceOf(user1.address);

      // Should receive staked amount + rewards - penalty
      const received = balanceAfter - balanceBefore;
      expect(received).to.be.closeTo(STAKE_AMOUNT + pendingRewards - expectedPenalty, ethers.parseEther("1"));
    });

    it("Should not allow unstaking same stake twice", async function () {
      await time.increase(30 * 24 * 60 * 60 + 1);
      await staking.connect(user1).unstake(0);
      
      await expect(
        staking.connect(user1).unstake(0)
      ).to.be.revertedWith("StakingContract: Stake not active");
    });
  });

  describe("Compounding Rewards", function () {
    beforeEach(async function () {
      await vndc.connect(user1).approve(await staking.getAddress(), STAKE_AMOUNT);
      await staking.connect(user1).stake(STAKE_AMOUNT, 1);
      await time.increase(30 * 24 * 60 * 60); // 1 month
    });

    it("Should allow compounding rewards", async function () {
      const pendingRewards = await staking.getPendingRewards(0);
      const stakeBefore = await staking.getStakeInfo(0);
      
      await staking.connect(user1).compoundRewards(0);
      
      const stakeAfter = await staking.getStakeInfo(0);
      expect(stakeAfter.amount).to.equal(stakeBefore.amount + pendingRewards);
      expect(stakeAfter.claimedRewards).to.equal(pendingRewards);
    });
  });
});

