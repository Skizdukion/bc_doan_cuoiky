import { expect } from "chai";
import { ethers } from "hardhat";
import { VNDC, TokenVesting } from "../typechain";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("TokenVesting", function () {
  let vndc: VNDC;
  let vesting: TokenVesting;
  let owner: SignerWithAddress;
  let beneficiary1: SignerWithAddress;
  let beneficiary2: SignerWithAddress;

  const VESTING_AMOUNT = ethers.parseEther("1000000");
  const CLIFF_DURATION = 6 * 30 * 24 * 60 * 60; // 6 months in seconds
  const VESTING_DURATION = 24 * 30 * 24 * 60 * 60; // 24 months in seconds

  beforeEach(async function () {
    [owner, beneficiary1, beneficiary2] = await ethers.getSigners();

    // Deploy VNDC token
    const VNDCFactory = await ethers.getContractFactory("VNDC");
    vndc = await VNDCFactory.deploy();
    await vndc.waitForDeployment();

    // Deploy TokenVesting
    const VestingFactory = await ethers.getContractFactory("TokenVesting");
    vesting = await VestingFactory.deploy(await vndc.getAddress());
    await vesting.waitForDeployment();

    // Mint tokens to owner
    await vndc.mint(owner.address, VESTING_AMOUNT * 10n);
  });

  describe("Deployment", function () {
    it("Should set the right token address", async function () {
      expect(await vesting.token()).to.equal(await vndc.getAddress());
    });

    it("Should set the right owner", async function () {
      expect(await vesting.owner()).to.equal(owner.address);
    });
  });

  describe("Creating Vesting Schedule", function () {
    it("Should create a vesting schedule", async function () {
      await vndc.approve(await vesting.getAddress(), VESTING_AMOUNT);
      
      await expect(
        vesting.createVestingSchedule(
          beneficiary1.address,
          VESTING_AMOUNT,
          CLIFF_DURATION,
          VESTING_DURATION,
          true
        )
      ).to.emit(vesting, "VestingScheduleCreated");

      const schedule = await vesting.getVestingSchedule(beneficiary1.address);
      expect(schedule.beneficiary).to.equal(beneficiary1.address);
      expect(schedule.totalAmount).to.equal(VESTING_AMOUNT);
      expect(schedule.cliffDuration).to.equal(CLIFF_DURATION);
      expect(schedule.vestingDuration).to.equal(VESTING_DURATION);
    });

    it("Should not allow creating duplicate schedule", async function () {
      await vndc.approve(await vesting.getAddress(), VESTING_AMOUNT * 2n);
      
      await vesting.createVestingSchedule(
        beneficiary1.address,
        VESTING_AMOUNT,
        CLIFF_DURATION,
        VESTING_DURATION,
        true
      );

      await expect(
        vesting.createVestingSchedule(
          beneficiary1.address,
          VESTING_AMOUNT,
          CLIFF_DURATION,
          VESTING_DURATION,
          true
        )
      ).to.be.revertedWith("TokenVesting: Schedule already exists");
    });

    it("Should create batch vesting schedules", async function () {
      await vndc.approve(await vesting.getAddress(), VESTING_AMOUNT * 2n);
      
      await vesting.createVestingSchedulesBatch(
        [beneficiary1.address, beneficiary2.address],
        [VESTING_AMOUNT, VESTING_AMOUNT],
        [CLIFF_DURATION, CLIFF_DURATION],
        [VESTING_DURATION, VESTING_DURATION],
        true
      );

      const schedule1 = await vesting.getVestingSchedule(beneficiary1.address);
      const schedule2 = await vesting.getVestingSchedule(beneficiary2.address);
      
      expect(schedule1.beneficiary).to.equal(beneficiary1.address);
      expect(schedule2.beneficiary).to.equal(beneficiary2.address);
    });
  });

  describe("Vesting Calculations", function () {
    beforeEach(async function () {
      await vndc.approve(await vesting.getAddress(), VESTING_AMOUNT);
      await vesting.createVestingSchedule(
        beneficiary1.address,
        VESTING_AMOUNT,
        CLIFF_DURATION,
        VESTING_DURATION,
        true
      );
    });

    it("Should return 0 vested amount before cliff", async function () {
      const vestedAmount = await vesting.getVestedAmount(beneficiary1.address);
      expect(vestedAmount).to.equal(0);
    });

    it("Should return correct vested amount after cliff", async function () {
      // Move time to after cliff
      await time.increase(CLIFF_DURATION + 1);
      
      // After cliff, some tokens should be vested
      const vestedAmount = await vesting.getVestedAmount(beneficiary1.address);
      expect(vestedAmount).to.be.gt(0);
      expect(vestedAmount).to.be.lt(VESTING_AMOUNT);
    });

    it("Should return full amount after vesting period", async function () {
      // Move time to after full vesting period
      await time.increase(CLIFF_DURATION + VESTING_DURATION + 1);
      
      const vestedAmount = await vesting.getVestedAmount(beneficiary1.address);
      expect(vestedAmount).to.equal(VESTING_AMOUNT);
    });
  });

  describe("Releasing Tokens", function () {
    beforeEach(async function () {
      await vndc.approve(await vesting.getAddress(), VESTING_AMOUNT);
      await vesting.createVestingSchedule(
        beneficiary1.address,
        VESTING_AMOUNT,
        CLIFF_DURATION,
        VESTING_DURATION,
        true
      );
    });

    it("Should not allow release before cliff", async function () {
      await expect(
        vesting.connect(beneficiary1).release()
      ).to.be.revertedWith("TokenVesting: No tokens to release");
    });

    it("Should allow release after cliff", async function () {
      await time.increase(Number(CLIFF_DURATION) + Number(VESTING_DURATION) / 4);
      
      const releasable = await vesting.getReleasableAmount(beneficiary1.address);
      expect(releasable).to.be.gt(0);

      await expect(
        vesting.connect(beneficiary1).release()
      ).to.emit(vesting, "TokensReleased");

      const balance = await vndc.balanceOf(beneficiary1.address);
      expect(balance).to.be.closeTo(releasable, ethers.parseEther("0.1"));
    });

    it("Should allow anyone to release for beneficiary", async function () {
      await time.increase(Number(CLIFF_DURATION) + Number(VESTING_DURATION) / 4);
      
      await vesting.connect(owner).releaseFor(beneficiary1.address);
      
      const releasable = await vesting.getReleasableAmount(beneficiary1.address);
      expect(releasable).to.equal(0n); // Should be 0 after release
    });

    it("Should allow multiple releases over time", async function () {
      // First release after 1/4 of vesting
      await time.increase(Number(CLIFF_DURATION) + Number(VESTING_DURATION) / 4);
      await vesting.connect(beneficiary1).release();
      
      const balance1 = await vndc.balanceOf(beneficiary1.address);

      // Second release after another 1/4
      await time.increase(Number(VESTING_DURATION) / 4);
      await vesting.connect(beneficiary1).release();
      
      const balance2 = await vndc.balanceOf(beneficiary1.address);
      expect(balance2).to.be.gt(balance1);
    });
  });

  describe("Revoking Vesting", function () {
    beforeEach(async function () {
      await vndc.approve(await vesting.getAddress(), VESTING_AMOUNT);
      await vesting.createVestingSchedule(
        beneficiary1.address,
        VESTING_AMOUNT,
        CLIFF_DURATION,
        VESTING_DURATION,
        true // revocable
      );
    });

    it("Should allow owner to revoke before cliff", async function () {
      await expect(
        vesting.revoke(beneficiary1.address)
      ).to.emit(vesting, "VestingRevoked");

      const schedule = await vesting.getVestingSchedule(beneficiary1.address);
      expect(schedule.revoked).to.be.true;
    });

    it("Should not allow revoking after cliff", async function () {
      await time.increase(CLIFF_DURATION + 1);
      
      await expect(
        vesting.revoke(beneficiary1.address)
      ).to.be.revertedWith("TokenVesting: Cannot revoke after cliff");
    });

    it("Should not allow revoking non-revocable vesting", async function () {
      await vndc.approve(await vesting.getAddress(), VESTING_AMOUNT);
      await vesting.createVestingSchedule(
        beneficiary2.address,
        VESTING_AMOUNT,
        CLIFF_DURATION,
        VESTING_DURATION,
        false // not revocable
      );

      await expect(
        vesting.revoke(beneficiary2.address)
      ).to.be.revertedWith("TokenVesting: Vesting not revocable");
    });

    it("Should return revoked tokens to owner", async function () {
      const ownerBalanceBefore = await vndc.balanceOf(owner.address);
      await vesting.revoke(beneficiary1.address);
      const ownerBalanceAfter = await vndc.balanceOf(owner.address);
      
      expect(ownerBalanceAfter).to.be.gt(ownerBalanceBefore);
    });
  });
});

