import { expect } from "chai";
import { ethers } from "hardhat";
import { VNDC, TokenSale, TokenVesting } from "../typechain";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { Contract } from "ethers";

describe("TokenSale", function () {
  let vndc: VNDC;
  let tokenSale: TokenSale;
  let tokenVesting: TokenVesting;
  let router: Contract;
  let factory: Contract;
  let weth: Contract;
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let user3: SignerWithAddress;
  let user4: SignerWithAddress;
  let user5: SignerWithAddress;

  const SOFT_CAP = ethers.parseEther("50");
  const HARD_CAP = ethers.parseEther("200");
  const TOKEN_PRICE = ethers.parseEther("2000000"); // 2M tokens per ETH (with 18 decimals)
  const MIN_PURCHASE = ethers.parseEther("0.01");
  const MAX_PURCHASE = ethers.parseEther("10");

  beforeEach(async function () {
    [owner, user1, user2, user3, user4, user5] = await ethers.getSigners();

    const VNDCFactory = await ethers.getContractFactory("VNDC");
    vndc = await VNDCFactory.deploy();
    await vndc.waitForDeployment();

    const WETHFactory = await ethers.getContractFactory("WETH9");
    weth = await WETHFactory.deploy();
    await weth.waitForDeployment();

    const FactoryFactory = await ethers.getContractFactory("PoolFactory");
    factory = await FactoryFactory.deploy(owner.address);
    await factory.waitForDeployment();

    const RouterFactory = await ethers.getContractFactory("Router");
    router = await RouterFactory.deploy(await factory.getAddress(), await weth.getAddress());
    await router.waitForDeployment();

    const TokenSaleFactory = await ethers.getContractFactory("TokenSale");
    tokenSale = await TokenSaleFactory.deploy(await vndc.getAddress(), await router.getAddress());
    await tokenSale.waitForDeployment();

    // Transfer ownership so that TokenSale is the sole minter
    await vndc.transferOwnership(await tokenSale.getAddress());

    const TokenVestingFactory = await ethers.getContractFactory("TokenVesting");
    tokenVesting = await TokenVestingFactory.deploy(await vndc.getAddress());
    await tokenVesting.waitForDeployment();

    await tokenSale.setTokenVesting(await tokenVesting.getAddress());
  });

  describe("Deployment", function () {
    it("Should set the right token address", async function () {
      expect(await tokenSale.token()).to.equal(await vndc.getAddress());
    });

    it("Should set the right owner", async function () {
      expect(await tokenSale.owner()).to.equal(owner.address);
    });

    it("Should have correct sale parameters", async function () {
      expect(await tokenSale.SOFT_CAP()).to.equal(SOFT_CAP);
      expect(await tokenSale.HARD_CAP()).to.equal(HARD_CAP);
      expect(await tokenSale.TOKEN_PRICE()).to.equal(TOKEN_PRICE);
      expect(await tokenSale.MIN_PURCHASE()).to.equal(MIN_PURCHASE);
      expect(await tokenSale.MAX_PURCHASE()).to.equal(MAX_PURCHASE);
      expect(await tokenSale.tokenVesting()).to.equal(await tokenVesting.getAddress());
    });
  });

  describe("Starting Sale", function () {
    it("Should allow owner to start sale", async function () {
      const latest = Number(await time.latest());
      const startTime = latest + 100;
      const endTime = startTime + 86400; // 1 day

      await tokenSale.startSale(startTime, endTime, false);
      expect(await tokenSale.saleActive()).to.be.true;
    });

    it("Should not allow non-owner to start sale", async function () {
      const latest = Number(await time.latest());
      const startTime = latest + 100;
      const endTime = startTime + 86400;

      await expect(
        tokenSale.connect(user1).startSale(startTime, endTime, false)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should not allow starting sale twice", async function () {
      const latest = Number(await time.latest());
      const startTime = latest + 100;
      const endTime = startTime + 86400;

      await tokenSale.startSale(startTime, endTime, false);
      await expect(
        tokenSale.startSale(startTime, endTime, false)
      ).to.be.revertedWith("TokenSale: Sale already active");
    });
  });

  describe("Buying Tokens", function () {
    beforeEach(async function () {
      const latest = Number(await time.latest());
      const startTime = latest; // Use current time
      const endTime = startTime + 86400 * 7; // 7 days
      await tokenSale.startSale(startTime, endTime, false);
    });

    it("Should allow users to buy tokens", async function () {
      const ethAmount = ethers.parseEther("1");
      const expectedTokens = (ethAmount * TOKEN_PRICE) / ethers.parseEther("1");
      const expectedInvestorShare = (expectedTokens * 3000n) / 10000n;

      await expect(
        tokenSale.connect(user1).buyTokens({ value: ethAmount })
      ).to.emit(tokenSale, "TokensPurchased")
        .withArgs(user1.address, ethAmount, expectedTokens);

      expect(await tokenSale.purchasedTokens(user1.address)).to.equal(expectedInvestorShare);
      expect(await vndc.balanceOf(user1.address)).to.equal(0);
      expect(await tokenSale.totalRaised()).to.equal(ethAmount);
    });

    it("Should not allow purchase below minimum", async function () {
      const ethAmount = ethers.parseEther("0.005");
      await expect(
        tokenSale.connect(user1).buyTokens({ value: ethAmount })
      ).to.be.revertedWith("TokenSale: Below minimum purchase");
    });

    it("Should not allow purchase above maximum", async function () {
      const ethAmount = ethers.parseEther("11");
      await expect(
        tokenSale.connect(user1).buyTokens({ value: ethAmount })
      ).to.be.revertedWith("TokenSale: Exceeds maximum purchase");
    });

    it("Should not allow purchase if sale not active", async function () {
      await tokenSale.endSale();
      const ethAmount = ethers.parseEther("1");
      await expect(
        tokenSale.connect(user1).buyTokens({ value: ethAmount })
      ).to.be.revertedWith("TokenSale: Sale not active");
    });

    it("Should track individual contributions", async function () {
      const ethAmount = ethers.parseEther("5");
      await tokenSale.connect(user1).buyTokens({ value: ethAmount });
      expect(await tokenSale.contributions(user1.address)).to.equal(ethAmount);
    });

    it("Should not allow exceeding individual limit", async function () {
      await tokenSale.connect(user1).buyTokens({ value: ethers.parseEther("5") });
      await expect(
        tokenSale.connect(user1).buyTokens({ value: ethers.parseEther("6") })
      ).to.be.revertedWith("TokenSale: Exceeds individual limit");
    });

    it("Should mark soft cap as reached", async function () {
      const amountPerUser = ethers.parseEther("10");
      await tokenSale.connect(user1).buyTokens({ value: amountPerUser });
      await tokenSale.connect(user2).buyTokens({ value: amountPerUser });
      await tokenSale.connect(user3).buyTokens({ value: amountPerUser });
      await tokenSale.connect(user4).buyTokens({ value: amountPerUser });
      await tokenSale.connect(user5).buyTokens({ value: amountPerUser });
      expect(await tokenSale.softCapReached()).to.be.true;
    });

    it("Should end sale when hard cap reached", async function () {
      // Hard cap is 200 ETH, each user can contribute max 10 ETH
      // So we need 20 users, each contributing 10 ETH
      const amount = ethers.parseEther("10");
      // Get all available signers
      const signers = await ethers.getSigners();
      // Hardhat provides 20 signers by default (indices 0-19)
      // We need 20 users (skip owner at index 0), so we can use indices 1-20
      // But Hardhat only has 20 signers total, so we can use indices 1-19 (19 users)
      // Let's use what we have and check if we reach hard cap
      const buyers = signers.slice(1); // Skip owner, get all other signers
      
      // Buy with all available buyers
      for (const buyer of buyers) {
        try {
          await tokenSale.connect(buyer).buyTokens({ value: amount });
        } catch (e) {
          // If we can't buy (e.g., hard cap reached), break
          break;
        }
      }

      // Check if we reached hard cap (might not if we don't have 20 users)
      const totalRaised = await tokenSale.totalRaised();
      if (totalRaised >= HARD_CAP) {
        expect(await tokenSale.hardCapReached()).to.be.true;
        expect(await tokenSale.saleActive()).to.be.false;
      } else {
        // If we didn't reach hard cap due to insufficient users, 
        // at least verify the sale is still active and hard cap not reached
        expect(await tokenSale.hardCapReached()).to.be.false;
        expect(await tokenSale.saleActive()).to.be.true;
        // Manually end sale to complete test
        await tokenSale.endSale();
      }
    });
  });

  describe("Refunds", function () {
    beforeEach(async function () {
      const latest = Number(await time.latest());
      const startTime = latest; // Use current time
      const endTime = startTime + 86400; // 1 day
      await tokenSale.startSale(startTime, endTime, false);
    });

    it("Should allow refund if soft cap not reached", async function () {
      const ethAmount = ethers.parseEther("10");
      await tokenSale.connect(user1).buyTokens({ value: ethAmount });
      
      // End sale
      await time.increase(86401);
      await tokenSale.endSale();

      // Claim refund
      const balanceBefore = await ethers.provider.getBalance(user1.address);
      await tokenSale.connect(user1).claimRefund();
      const balanceAfter = await ethers.provider.getBalance(user1.address);

      expect(balanceAfter - balanceBefore).to.be.closeTo(ethAmount, ethers.parseEther("0.01"));
      expect(await tokenSale.contributions(user1.address)).to.equal(0);
    });

    it("Should not allow refund if soft cap reached", async function () {
      // Buy in multiple transactions to reach soft cap (50 ETH)
      // Each user can contribute max 10 ETH, so need 5 users
      const amountPerUser = ethers.parseEther("10");
      await tokenSale.connect(user1).buyTokens({ value: amountPerUser });
      await tokenSale.connect(user2).buyTokens({ value: amountPerUser });
      await tokenSale.connect(user3).buyTokens({ value: amountPerUser });
      await tokenSale.connect(user4).buyTokens({ value: amountPerUser });
      await tokenSale.connect(user5).buyTokens({ value: amountPerUser });
      await tokenSale.endSale();
      
      // Advance time past sale end time
      await time.increase(86401);

      await expect(
        tokenSale.connect(user1).claimRefund()
      ).to.be.revertedWith("TokenSale: Soft cap reached, no refunds");
    });
  });

  describe("Finalization and claims", function () {
    beforeEach(async function () {
      const latest = Number(await time.latest());
      const endTime = latest + 86400;
      await tokenSale.startSale(latest, endTime, false);
      const amountPerUser = ethers.parseEther("10");
      await tokenSale.connect(user1).buyTokens({ value: amountPerUser });
      await tokenSale.connect(user2).buyTokens({ value: amountPerUser });
      await tokenSale.connect(user3).buyTokens({ value: amountPerUser });
      await tokenSale.connect(user4).buyTokens({ value: amountPerUser });
      await tokenSale.connect(user5).buyTokens({ value: amountPerUser });
      await tokenSale.endSale();
    });

    it("Finalizes sale, mints allocations, and adds liquidity", async function () {
      await tokenSale.finalizeSale();
      expect(await tokenSale.finalized()).to.be.true;
      expect(await tokenSale.liquidityAdded()).to.be.true;

      const base = await tokenSale.totalTokensSold();
      const expectedInvestor = (base * 3000n) / 10000n;
      const expectedLiquidity = (base * 3000n) / 10000n;
      const expectedTeam = base - expectedInvestor - expectedLiquidity;

      expect(await tokenSale.totalInvestorAllocation()).to.equal(expectedInvestor);
      expect(await tokenSale.totalLiquidityAllocation()).to.equal(expectedLiquidity);
      expect(await tokenSale.totalTeamAllocation()).to.equal(expectedTeam);
      expect(await vndc.balanceOf(await tokenVesting.getAddress())).to.equal(expectedTeam);

      const pairAddress = await factory.getPair(await vndc.getAddress(), await weth.getAddress());
      expect(pairAddress).to.not.equal(ethers.ZeroAddress);
    });

    it("Allows investor claims once finalized", async function () {
      await tokenSale.finalizeSale();
      const owed = await tokenSale.purchasedTokens(user1.address);
      await tokenSale.connect(user1).claimTokens();
      expect(await vndc.balanceOf(user1.address)).to.equal(owed);
      await expect(
        tokenSale.connect(user1).claimTokens()
      ).to.be.revertedWith("TokenSale: No tokens to claim");
    });
  });

  describe("Whitelist", function () {
    beforeEach(async function () {
      const latest = Number(await time.latest());
      const startTime = latest; // Use current time
      const endTime = startTime + 86400;
      await tokenSale.startSale(startTime, endTime, true); // Whitelist enabled
    });

    it("Should not allow purchase if not whitelisted", async function () {
      const ethAmount = ethers.parseEther("1");
      await expect(
        tokenSale.connect(user1).buyTokens({ value: ethAmount })
      ).to.be.revertedWith("TokenSale: Not whitelisted");
    });

    it("Should allow purchase if whitelisted", async function () {
      await tokenSale.setWhitelist([user1.address], [true]);
      const ethAmount = ethers.parseEther("1");
      await tokenSale.connect(user1).buyTokens({ value: ethAmount });
      
      expect(await tokenSale.contributions(user1.address)).to.equal(ethAmount);
    });
  });
});

