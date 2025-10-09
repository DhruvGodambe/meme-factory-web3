import { expect } from "chai";
import { ethers } from "hardhat";
import { RestrictedToken, FeeHook } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { IPoolManager } from "../typechain-types/@uniswap/v4-core/src/interfaces/IPoolManager";

describe("RestrictedToken", function () {
  let restrictedToken: RestrictedToken;
  let feeHook: FeeHook;
  let mockPoolManager: IPoolManager;
  let owner: SignerWithAddress;
  let trader: SignerWithAddress;
  let user: SignerWithAddress;
  let treasury: SignerWithAddress;

  const INITIAL_SUPPLY = ethers.parseEther("1000000");
  const FEE_PERCENT = 10n;

  beforeEach(async function () {
    [owner, trader, user, treasury] = await ethers.getSigners();

    // Deploy RestrictedToken
    const RestrictedTokenFactory = await ethers.getContractFactory("RestrictedToken");
    restrictedToken = await RestrictedTokenFactory.deploy();
    await restrictedToken.waitForDeployment();

    // Deploy a mock PoolManager for testing (using owner address as placeholder)
    // In production, this would be the actual Uniswap v4 PoolManager
    mockPoolManager = await ethers.getContractAt(
      "IPoolManager",
      owner.address
    ) as unknown as IPoolManager;

    // Deploy FeeHook
    const FeeHookFactory = await ethers.getContractFactory("FeeHook");
    feeHook = await FeeHookFactory.deploy(
      await mockPoolManager.getAddress(),
      treasury.address
    );
    await feeHook.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await restrictedToken.owner()).to.equal(owner.address);
    });

    it("Should assign the total supply to the owner", async function () {
      const ownerBalance = await restrictedToken.balanceOf(owner.address);
      expect(ownerBalance).to.equal(INITIAL_SUPPLY);
    });

    it("Should have correct name and symbol", async function () {
      expect(await restrictedToken.name()).to.equal("Restricted Token");
      expect(await restrictedToken.symbol()).to.equal("RST");
    });

    it("Should have trading disabled initially", async function () {
      expect(await restrictedToken.tradingEnabled()).to.equal(false);
    });

    it("Should deploy FeeHook with correct parameters", async function () {
      expect(await feeHook.poolManager()).to.equal(await mockPoolManager.getAddress());
      expect(await feeHook.feeReceiver()).to.equal(treasury.address);
    });
  });

  describe("Access Control", function () {
    it("Should allow owner to set allowed addresses", async function () {
      const hookAddress = await feeHook.getAddress();
      const poolManagerAddress = await mockPoolManager.getAddress();

      await expect(
        restrictedToken.setAllowedAddresses(hookAddress, poolManagerAddress)
      )
        .to.emit(restrictedToken, "AllowedAddressesSet")
        .withArgs(hookAddress, poolManagerAddress);

      expect(await restrictedToken.allowedHook()).to.equal(hookAddress);
      expect(await restrictedToken.allowedPoolManager()).to.equal(poolManagerAddress);
    });

    it("Should prevent non-owner from setting allowed addresses", async function () {
      const hookAddress = await feeHook.getAddress();
      const poolManagerAddress = await mockPoolManager.getAddress();

      await expect(
        restrictedToken.connect(trader).setAllowedAddresses(hookAddress, poolManagerAddress)
      ).to.be.revertedWithCustomError(restrictedToken, "OwnableUnauthorizedAccount");
    });

    it("Should allow owner to enable trading", async function () {
      await expect(restrictedToken.enableTrading(true))
        .to.emit(restrictedToken, "TradingEnabled")
        .withArgs(true);

      expect(await restrictedToken.tradingEnabled()).to.equal(true);
    });

    it("Should prevent non-owner from enabling trading", async function () {
      await expect(
        restrictedToken.connect(trader).enableTrading(true)
      ).to.be.revertedWithCustomError(restrictedToken, "OwnableUnauthorizedAccount");
    });

    it("Should reject zero addresses in setAllowedAddresses", async function () {
      await expect(
        restrictedToken.setAllowedAddresses(ethers.ZeroAddress, owner.address)
      ).to.be.revertedWith("Invalid hook address");

      await expect(
        restrictedToken.setAllowedAddresses(owner.address, ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid pool manager address");
    });
  });

  describe("Token Transfers - Before Trading", function () {
    it("Should allow normal transfers before trading is enabled", async function () {
      const transferAmount = ethers.parseEther("1000");

      await restrictedToken.transfer(trader.address, transferAmount);
      expect(await restrictedToken.balanceOf(trader.address)).to.equal(transferAmount);
    });

    it("Should allow transfers between any addresses before trading", async function () {
      const transferAmount = ethers.parseEther("1000");

      await restrictedToken.transfer(trader.address, transferAmount);
      await restrictedToken.connect(trader).transfer(user.address, transferAmount);

      expect(await restrictedToken.balanceOf(user.address)).to.equal(transferAmount);
    });
  });

  describe("Token Transfers - After Trading Enabled", function () {
    beforeEach(async function () {
      // Set up the token for trading
      const hookAddress = await feeHook.getAddress();
      const poolManagerAddress = await mockPoolManager.getAddress();

      await restrictedToken.setAllowedAddresses(hookAddress, poolManagerAddress);
      await restrictedToken.enableTrading(true);

      // Give some tokens to the hook for testing
      await restrictedToken.transfer(hookAddress, ethers.parseEther("100000"));
    });

    it("Should restrict transfers to non-allowed addresses", async function () {
      const transferAmount = ethers.parseEther("1000");

      await restrictedToken.transfer(trader.address, ethers.parseEther("10000"));

      await expect(
        restrictedToken.connect(trader).transfer(user.address, transferAmount)
      ).to.be.revertedWith("Restricted: use official pool only");
    });

    it("Should allow owner to transfer after trading enabled", async function () {
      const transferAmount = ethers.parseEther("1000");

      await restrictedToken.transfer(trader.address, transferAmount);
      expect(await restrictedToken.balanceOf(trader.address)).to.equal(transferAmount);
    });

    it("Should apply 10% fee on transfers via hook", async function () {
      const hookAddress = await feeHook.getAddress();
      const transferAmount = ethers.parseEther("1000");
      const expectedFee = (transferAmount * FEE_PERCENT) / 100n;
      const expectedNet = transferAmount - expectedFee;

      const ownerBalanceBefore = await restrictedToken.balanceOf(owner.address);
      const hookBalanceBefore = await restrictedToken.balanceOf(hookAddress);

      // Hook transfers to user (this should trigger fee)
      // The hook already has tokens from the beforeEach setup
      const hook = await ethers.getImpersonatedSigner(hookAddress);
      await ethers.provider.send("hardhat_setBalance", [
        hookAddress,
        ethers.toQuantity(ethers.parseEther("10")),
      ]);

      await restrictedToken.connect(hook).transfer(user.address, transferAmount);

      const userBalance = await restrictedToken.balanceOf(user.address);
      const ownerBalanceAfter = await restrictedToken.balanceOf(owner.address);
      const hookBalanceAfter = await restrictedToken.balanceOf(hookAddress);

      expect(userBalance).to.equal(expectedNet);
      // Owner should have received the fee
      expect(ownerBalanceAfter - ownerBalanceBefore).to.equal(expectedFee);
      // Hook balance should have decreased by the full transfer amount
      expect(hookBalanceBefore - hookBalanceAfter).to.equal(transferAmount);
    });

    it("Should emit FeeCollected event when fee is applied", async function () {
      const hookAddress = await feeHook.getAddress();
      const transferAmount = ethers.parseEther("1000");
      const expectedFee = (transferAmount * FEE_PERCENT) / 100n;

      await restrictedToken.transfer(hookAddress, transferAmount);

      const hook = await ethers.getImpersonatedSigner(hookAddress);
      await ethers.provider.send("hardhat_setBalance", [
        hookAddress,
        ethers.toQuantity(ethers.parseEther("10")),
      ]);

      await expect(restrictedToken.connect(hook).transfer(user.address, transferAmount))
        .to.emit(restrictedToken, "FeeCollected")
        .withArgs(hookAddress, owner.address, expectedFee);
    });

    it("Should allow transfers through pool manager", async function () {
      const poolManagerAddress = await mockPoolManager.getAddress();
      const transferAmount = ethers.parseEther("1000");

      await restrictedToken.transfer(trader.address, transferAmount);
      
      // Approve pool manager to spend tokens
      await restrictedToken.connect(trader).approve(poolManagerAddress, transferAmount);

      // Impersonate pool manager
      const poolManager = await ethers.getImpersonatedSigner(poolManagerAddress);
      await ethers.provider.send("hardhat_setBalance", [
        poolManagerAddress,
        ethers.toQuantity(ethers.parseEther("10")),
      ]);

      // Transfer should work from pool manager
      await restrictedToken.connect(poolManager).transferFrom(
        trader.address,
        user.address,
        transferAmount
      );
      
      expect(await restrictedToken.balanceOf(user.address)).to.equal(transferAmount);
    });
  });

  describe("Fee Calculation", function () {
    it("Should correctly calculate fee for various amounts", async function () {
      const hookAddress = await feeHook.getAddress();
      await restrictedToken.setAllowedAddresses(hookAddress, owner.address);
      await restrictedToken.enableTrading(true);

      const testAmounts = [
        ethers.parseEther("100"),
        ethers.parseEther("1000"),
        ethers.parseEther("10000"),
      ];

      for (const amount of testAmounts) {
        await restrictedToken.transfer(hookAddress, amount);

        const hook = await ethers.getImpersonatedSigner(hookAddress);
        await ethers.provider.send("hardhat_setBalance", [
          hookAddress,
          ethers.toQuantity(ethers.parseEther("10")),
        ]);

        const expectedFee = (amount * FEE_PERCENT) / 100n;
        const expectedNet = amount - expectedFee;

        const userBalanceBefore = await restrictedToken.balanceOf(user.address);
        await restrictedToken.connect(hook).transfer(user.address, amount);
        const userBalanceAfter = await restrictedToken.balanceOf(user.address);

        expect(userBalanceAfter - userBalanceBefore).to.equal(expectedNet);
      }
    });
  });

  describe("Trading Toggle", function () {
    it("Should allow disabling trading after it's enabled", async function () {
      await restrictedToken.enableTrading(true);
      expect(await restrictedToken.tradingEnabled()).to.equal(true);

      await restrictedToken.enableTrading(false);
      expect(await restrictedToken.tradingEnabled()).to.equal(false);
    });

    it("Should allow unrestricted transfers after trading is disabled", async function () {
      const hookAddress = await feeHook.getAddress();
      const poolManagerAddress = await mockPoolManager.getAddress();

      await restrictedToken.setAllowedAddresses(hookAddress, poolManagerAddress);
      await restrictedToken.enableTrading(true);

      // Give tokens to trader
      await restrictedToken.transfer(trader.address, ethers.parseEther("10000"));

      // Should fail when trading is enabled
      await expect(
        restrictedToken.connect(trader).transfer(user.address, ethers.parseEther("1000"))
      ).to.be.revertedWith("Restricted: use official pool only");

      // Disable trading
      await restrictedToken.enableTrading(false);

      // Should succeed when trading is disabled
      await restrictedToken.connect(trader).transfer(user.address, ethers.parseEther("1000"));
      expect(await restrictedToken.balanceOf(user.address)).to.equal(ethers.parseEther("1000"));
    });
  });
});
