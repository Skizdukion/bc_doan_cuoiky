import { expect } from "chai";
import { ethers } from "hardhat";
import { LPTimelock } from "../typechain";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("LPTimelock", function () {
  let lpTimelock: LPTimelock;
  let mockLPToken: any; // Mock ERC20 token to represent LP tokens
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;

  const LOCK_AMOUNT = ethers.parseEther("1000");
  const LOCK_DURATION = 365 * 24 * 60 * 60; // 12 months

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();

    // Deploy mock LP token (ERC20) - MockERC20 mints to deployer in constructor
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockLPToken = await MockERC20.deploy(
      "LP Token",
      "LP",
      ethers.parseEther("1000000") // 1M tokens minted to deployer
    );
    await mockLPToken.waitForDeployment();

    // Deploy LPTimelock
    const LPTimelockFactory = await ethers.getContractFactory("LPTimelock");
    lpTimelock = await LPTimelockFactory.deploy();
    await lpTimelock.waitForDeployment();

    // Owner already has tokens from constructor, no need to mint
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await lpTimelock.owner()).to.equal(owner.address);
    });

    it("Should have correct default lock duration", async function () {
      expect(await lpTimelock.DEFAULT_LOCK_DURATION()).to.equal(365 * 24 * 60 * 60);
    });

    it("Should start with zero locks", async function () {
      expect(await lpTimelock.lockCount()).to.equal(0);
    });
  });

  describe("Locking", function () {
    it("Should allow owner to lock LP tokens", async function () {
      await mockLPToken.approve(await lpTimelock.getAddress(), LOCK_AMOUNT);

      await expect(
        lpTimelock.lock(
          await mockLPToken.getAddress(),
          LOCK_AMOUNT,
          user1.address
        )
      )
        .to.emit(lpTimelock, "TokensLocked")
        .withArgs(
          0, // lockId
          await mockLPToken.getAddress(),
          LOCK_AMOUNT,
          (value: bigint) => value > 0n, // Just check it's positive
          user1.address
        );

      expect(await mockLPToken.balanceOf(await lpTimelock.getAddress())).to.equal(LOCK_AMOUNT);
      expect(await lpTimelock.lockCount()).to.equal(1);
      
      // Verify unlock time separately
      const lockInfo = await lpTimelock.getLockInfo(0);
      const latest = Number(await time.latest());
      const expectedUnlockTime = latest + LOCK_DURATION;
      expect(Number(lockInfo.unlockTime)).to.be.closeTo(expectedUnlockTime, 10);
    });

    it("Should not allow non-owner to lock", async function () {
      await mockLPToken.connect(user1).approve(await lpTimelock.getAddress(), LOCK_AMOUNT);

      await expect(
        lpTimelock.connect(user1).lock(
          await mockLPToken.getAddress(),
          LOCK_AMOUNT,
          user2.address
        )
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should not allow locking with zero amount", async function () {
      await expect(
        lpTimelock.lock(
          await mockLPToken.getAddress(),
          0,
          user1.address
        )
      ).to.be.revertedWith("LPTimelock: Amount must be greater than 0");
    });

    it("Should not allow locking with invalid LP token address", async function () {
      await expect(
        lpTimelock.lock(
          ethers.ZeroAddress,
          LOCK_AMOUNT,
          user1.address
        )
      ).to.be.revertedWith("LPTimelock: Invalid LP token address");
    });

    it("Should not allow locking with invalid beneficiary address", async function () {
      await mockLPToken.approve(await lpTimelock.getAddress(), LOCK_AMOUNT);

      await expect(
        lpTimelock.lock(
          await mockLPToken.getAddress(),
          LOCK_AMOUNT,
          ethers.ZeroAddress
        )
      ).to.be.revertedWith("LPTimelock: Invalid beneficiary address");
    });

    it("Should allow locking with custom duration", async function () {
      const customDuration = 180 * 24 * 60 * 60; // 6 months
      await mockLPToken.approve(await lpTimelock.getAddress(), LOCK_AMOUNT);

      await expect(
        lpTimelock.lockWithDuration(
          await mockLPToken.getAddress(),
          LOCK_AMOUNT,
          user1.address,
          customDuration
        )
      )
        .to.emit(lpTimelock, "TokensLocked")
        .withArgs(
          0,
          await mockLPToken.getAddress(),
          LOCK_AMOUNT,
          (value: bigint) => {
            // Check that unlock time is positive
            return value > 0n;
          },
          user1.address
        );

      // Verify unlock time separately
      const lockInfo = await lpTimelock.getLockInfo(0);
      const latest = Number(await time.latest());
      const expectedUnlockTime = latest + customDuration;
      // Allow small difference due to block time
      expect(Number(lockInfo.unlockTime)).to.be.closeTo(expectedUnlockTime, 10);
    });

    it("Should create multiple locks", async function () {
      await mockLPToken.approve(await lpTimelock.getAddress(), LOCK_AMOUNT * 2n);

      await lpTimelock.lock(
        await mockLPToken.getAddress(),
        LOCK_AMOUNT,
        user1.address
      );

      await lpTimelock.lock(
        await mockLPToken.getAddress(),
        LOCK_AMOUNT,
        user2.address
      );

      expect(await lpTimelock.lockCount()).to.equal(2);
      
      const lockInfo1 = await lpTimelock.getLockInfo(0);
      const lockInfo2 = await lpTimelock.getLockInfo(1);

      expect(lockInfo1.beneficiary).to.equal(user1.address);
      expect(lockInfo2.beneficiary).to.equal(user2.address);
    });
  });

  describe("Unlocking", function () {
    beforeEach(async function () {
      await mockLPToken.approve(await lpTimelock.getAddress(), LOCK_AMOUNT);
      await lpTimelock.lock(
        await mockLPToken.getAddress(),
        LOCK_AMOUNT,
        user1.address
      );
    });

    it("Should not allow unlocking before lock period expires", async function () {
      await expect(
        lpTimelock.unlock(0)
      ).to.be.revertedWith("LPTimelock: Lock period not expired");
    });

    it("Should allow unlocking after lock period expires", async function () {
      // Fast forward time by lock duration + 1 day
      await time.increase(LOCK_DURATION + 24 * 60 * 60);

      const balanceBefore = await mockLPToken.balanceOf(user1.address);

      await expect(
        lpTimelock.unlock(0)
      )
        .to.emit(lpTimelock, "TokensUnlocked")
        .withArgs(0, await mockLPToken.getAddress(), LOCK_AMOUNT, user1.address);

      const balanceAfter = await mockLPToken.balanceOf(user1.address);
      expect(balanceAfter - balanceBefore).to.equal(LOCK_AMOUNT);

      const lockInfo = await lpTimelock.getLockInfo(0);
      expect(lockInfo.unlocked).to.be.true;
    });

    it("Should allow anyone to unlock after lock period", async function () {
      await time.increase(LOCK_DURATION + 24 * 60 * 60);

      // User2 (not beneficiary) can unlock
      await expect(
        lpTimelock.connect(user2).unlock(0)
      ).to.emit(lpTimelock, "TokensUnlocked");

      const balanceAfter = await mockLPToken.balanceOf(user1.address);
      expect(balanceAfter).to.equal(LOCK_AMOUNT);
    });

    it("Should not allow unlocking same lock twice", async function () {
      await time.increase(LOCK_DURATION + 24 * 60 * 60);

      await lpTimelock.unlock(0);

      await expect(
        lpTimelock.unlock(0)
      ).to.be.revertedWith("LPTimelock: Tokens already unlocked");
    });

    it("Should not allow unlocking non-existent lock", async function () {
      await expect(
        lpTimelock.unlock(999)
      ).to.be.revertedWith("LPTimelock: Lock does not exist");
    });
  });

  describe("View Functions", function () {
    beforeEach(async function () {
      await mockLPToken.approve(await lpTimelock.getAddress(), LOCK_AMOUNT);
      await lpTimelock.lock(
        await mockLPToken.getAddress(),
        LOCK_AMOUNT,
        user1.address
      );
    });

    it("Should return correct lock info", async function () {
      const lockInfo = await lpTimelock.getLockInfo(0);

      expect(lockInfo.lpToken).to.equal(await mockLPToken.getAddress());
      expect(lockInfo.amount).to.equal(LOCK_AMOUNT);
      expect(lockInfo.beneficiary).to.equal(user1.address);
      expect(lockInfo.unlocked).to.be.false;
    });

    it("Should correctly check if lock can be unlocked", async function () {
      expect(await lpTimelock.canUnlock(0)).to.be.false;

      await time.increase(LOCK_DURATION + 24 * 60 * 60);

      expect(await lpTimelock.canUnlock(0)).to.be.true;
    });

    it("Should return false for non-existent lock", async function () {
      expect(await lpTimelock.canUnlock(999)).to.be.false;
    });

    it("Should return false for already unlocked lock", async function () {
      await time.increase(LOCK_DURATION + 24 * 60 * 60);
      await lpTimelock.unlock(0);

      expect(await lpTimelock.canUnlock(0)).to.be.false;
    });
  });
});

