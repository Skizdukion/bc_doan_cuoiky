import { expect } from "chai";
import { ethers } from "hardhat";
import { VNDC } from "../typechain";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("VNDC Token", function () {
  let vndc: VNDC;
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;

  const INITIAL_SUPPLY = ethers.parseEther("1000000");

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();

    const VNDCFactory = await ethers.getContractFactory("VNDC");
    vndc = await VNDCFactory.deploy();
    await vndc.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await vndc.owner()).to.equal(owner.address);
    });

    it("Should have correct name and symbol", async function () {
      expect(await vndc.name()).to.equal("VNDC Token");
      expect(await vndc.symbol()).to.equal("VNDC");
    });

    it("Should have 18 decimals", async function () {
      expect(await vndc.decimals()).to.equal(18n);
    });

    it("Should start with zero supply", async function () {
      expect(await vndc.totalSupply()).to.equal(0n);
    });
  });

  describe("Minting", function () {
    it("Should allow owner to mint tokens", async function () {
      await vndc.mint(user1.address, INITIAL_SUPPLY);
      expect(await vndc.balanceOf(user1.address)).to.equal(INITIAL_SUPPLY);
      expect(await vndc.totalSupply()).to.equal(INITIAL_SUPPLY);
    });

    it("Should not allow non-owner to mint", async function () {
      await expect(
        vndc.connect(user1).mint(user1.address, INITIAL_SUPPLY)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should emit TokensMinted event", async function () {
      await expect(vndc.mint(user1.address, INITIAL_SUPPLY))
        .to.emit(vndc, "TokensMinted")
        .withArgs(user1.address, INITIAL_SUPPLY);
    });

    it("Should allow batch minting", async function () {
      const recipients = [user1.address, user2.address];
      const amounts = [ethers.parseEther("1000"), ethers.parseEther("2000")];
      
      await vndc.batchMint(recipients, amounts);
      
      expect(await vndc.balanceOf(user1.address)).to.equal(amounts[0]);
      expect(await vndc.balanceOf(user2.address)).to.equal(amounts[1]);
    });

    it("Should revert batch mint with mismatched arrays", async function () {
      const recipients = [user1.address, user2.address];
      const amounts = [ethers.parseEther("1000")];
      
      await expect(
        vndc.batchMint(recipients, amounts)
      ).to.be.revertedWith("VNDC: Arrays length mismatch");
    });
  });

  describe("Burning", function () {
    beforeEach(async function () {
      await vndc.mint(user1.address, INITIAL_SUPPLY);
    });

    it("Should allow users to burn their own tokens", async function () {
      const burnAmount = ethers.parseEther("1000");
      await vndc.connect(user1).burn(burnAmount);
      expect(await vndc.balanceOf(user1.address)).to.equal(INITIAL_SUPPLY - burnAmount);
      expect(await vndc.totalSupply()).to.equal(INITIAL_SUPPLY - burnAmount);
    });

    it("Should not allow burning more than balance", async function () {
      const burnAmount = INITIAL_SUPPLY + ethers.parseEther("1");
      await expect(
        vndc.connect(user1).burn(burnAmount)
      ).to.be.reverted;
    });
  });

  describe("Pausing", function () {
    beforeEach(async function () {
      await vndc.mint(user1.address, INITIAL_SUPPLY);
    });

    it("Should allow owner to pause", async function () {
      await vndc.pause();
      expect(await vndc.paused()).to.be.true;
    });

    it("Should not allow transfers when paused", async function () {
      await vndc.pause();
      await expect(
        vndc.connect(user1).transfer(user2.address, ethers.parseEther("100"))
      ).to.be.revertedWith("Pausable: paused");
    });

    it("Should not allow minting when paused", async function () {
      await vndc.pause();
      await expect(
        vndc.mint(user2.address, INITIAL_SUPPLY)
      ).to.be.revertedWith("Pausable: paused");
    });

    it("Should allow owner to unpause", async function () {
      await vndc.pause();
      await vndc.unpause();
      expect(await vndc.paused()).to.be.false;
    });

    it("Should allow transfers after unpause", async function () {
      await vndc.pause();
      await vndc.unpause();
      await vndc.connect(user1).transfer(user2.address, ethers.parseEther("100"));
      expect(await vndc.balanceOf(user2.address)).to.equal(ethers.parseEther("100"));
    });
  });

  describe("Transfers", function () {
    beforeEach(async function () {
      await vndc.mint(user1.address, INITIAL_SUPPLY);
    });

    it("Should transfer tokens between users", async function () {
      const transferAmount = ethers.parseEther("100");
      await vndc.connect(user1).transfer(user2.address, transferAmount);
      expect(await vndc.balanceOf(user2.address)).to.equal(transferAmount);
      expect(await vndc.balanceOf(user1.address)).to.equal(INITIAL_SUPPLY - transferAmount);
    });

    it("Should not allow transfer of more than balance", async function () {
      const transferAmount = INITIAL_SUPPLY + ethers.parseEther("1");
      await expect(
        vndc.connect(user1).transfer(user2.address, transferAmount)
      ).to.be.reverted;
    });
  });
});

