import { expect } from "chai";
import { ethers } from "hardhat";
import { RestrictedToken, FeeHook } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("FeeHook Integration Tests", function () {
  let restrictedToken: RestrictedToken;
  let feeHook: FeeHook;
  let mockPoolManager: SignerWithAddress;
  let owner: SignerWithAddress;
  let trader: SignerWithAddress;
  let feeReceiver: SignerWithAddress;

  beforeEach(async function () {
    [owner, trader, feeReceiver, mockPoolManager] = await ethers.getSigners();

    // Deploy RestrictedToken
    const RestrictedTokenFactory = await ethers.getContractFactory("RestrictedToken");
    restrictedToken = await RestrictedTokenFactory.deploy();
    await restrictedToken.waitForDeployment();

    // Deploy FeeHook with mock pool manager
    const FeeHookFactory = await ethers.getContractFactory("FeeHook");
    feeHook = await FeeHookFactory.deploy(
      mockPoolManager.address,
      feeReceiver.address
    );
    await feeHook.waitForDeployment();

    // Configure RestrictedToken
    await restrictedToken.setAllowedAddresses(
      await feeHook.getAddress(),
      mockPoolManager.address
    );
    await restrictedToken.enableTrading(true);

    // Give tokens to trader
    await restrictedToken.transfer(trader.address, ethers.parseEther("10000"));
  });

  describe("Hook Deployment", function () {
    it("Should deploy with correct parameters", async function () {
      expect(await feeHook.poolManager()).to.equal(mockPoolManager.address);
      expect(await feeHook.feeReceiver()).to.equal(feeReceiver.address);
    });

    it("Should have correct hook permissions", async function () {
      const permissions = await feeHook.getHookPermissions();
      
      expect(permissions.beforeSwap).to.equal(true);
      expect(permissions.afterSwap).to.equal(false);
      expect(permissions.beforeInitialize).to.equal(false);
      expect(permissions.afterInitialize).to.equal(false);
      expect(permissions.beforeAddLiquidity).to.equal(false);
      expect(permissions.afterAddLiquidity).to.equal(false);
    });
  });

  describe("Hook beforeSwap Function", function () {
    it("Should be callable only by pool manager", async function () {
      const hookAddress = await feeHook.getAddress();
      
      // Create a mock PoolKey
      const poolKey = {
        currency0: await restrictedToken.getAddress(),
        currency1: ethers.Wallet.createRandom().address,
        fee: 3000,
        tickSpacing: 60,
        hooks: hookAddress
      };

      // Create mock SwapParams
      const swapParams = {
        zeroForOne: true,
        amountSpecified: ethers.parseEther("100"),
        sqrtPriceLimitX96: "79228162514264337593543950336"
      };

      // Should fail when called by non-pool-manager
      await expect(
        feeHook.connect(trader).beforeSwap(
          trader.address,
          poolKey,
          swapParams,
          "0x"
        )
      ).to.be.revertedWith("Only pool manager can call");

      // Should succeed when called by pool manager
      await expect(
        feeHook.connect(mockPoolManager).beforeSwap(
          trader.address,
          poolKey,
          swapParams,
          "0x"
        )
      ).to.not.be.reverted;
    });

    it("Should emit SwapExecuted event", async function () {
      const hookAddress = await feeHook.getAddress();
      
      const poolKey = {
        currency0: await restrictedToken.getAddress(),
        currency1: ethers.Wallet.createRandom().address,
        fee: 3000,
        tickSpacing: 60,
        hooks: hookAddress
      };

      const swapParams = {
        zeroForOne: true,
        amountSpecified: ethers.parseEther("100"),
        sqrtPriceLimitX96: "79228162514264337593543950336"
      };

      await expect(
        feeHook.connect(mockPoolManager).beforeSwap(
          trader.address,
          poolKey,
          swapParams,
          "0x"
        )
      ).to.emit(feeHook, "SwapExecuted");
    });

    it("Should return correct selector", async function () {
      const hookAddress = await feeHook.getAddress();
      
      const poolKey = {
        currency0: await restrictedToken.getAddress(),
        currency1: ethers.Wallet.createRandom().address,
        fee: 3000,
        tickSpacing: 60,
        hooks: hookAddress
      };

      const swapParams = {
        zeroForOne: true,
        amountSpecified: ethers.parseEther("100"),
        sqrtPriceLimitX96: "79228162514264337593543950336"
      };

      const result = await feeHook.connect(mockPoolManager).beforeSwap.staticCall(
        trader.address,
        poolKey,
        swapParams,
        "0x"
      );

      // Should return the beforeSwap selector
      expect(result[0]).to.equal(feeHook.interface.getFunction("beforeSwap")?.selector);
    });
  });

  describe("Token Integration with Hook", function () {
    it("Should allow transfers through hook", async function () {
      const hookAddress = await feeHook.getAddress();
      const transferAmount = ethers.parseEther("100");

      // Give tokens to hook
      await restrictedToken.transfer(hookAddress, transferAmount);

      // Hook transfers to trader (should apply fee)
      const hook = await ethers.getImpersonatedSigner(hookAddress);
      await ethers.provider.send("hardhat_setBalance", [
        hookAddress,
        ethers.toQuantity(ethers.parseEther("10")),
      ]);

      const ownerBalanceBefore = await restrictedToken.balanceOf(owner.address);
      
      await restrictedToken.connect(hook).transfer(trader.address, transferAmount);

      const ownerBalanceAfter = await restrictedToken.balanceOf(owner.address);
      const traderBalance = await restrictedToken.balanceOf(trader.address);

      // Owner should receive 10% fee
      const expectedFee = (transferAmount * 10n) / 100n;
      expect(ownerBalanceAfter - ownerBalanceBefore).to.equal(expectedFee);

      // Trader should receive 90%
      const expectedNet = transferAmount - expectedFee;
      expect(traderBalance).to.be.gt(expectedNet); // Already had 10000 tokens
    });

    it("Should restrict transfers not through hook when trading enabled", async function () {
      const transferAmount = ethers.parseEther("100");

      // Direct transfer should fail
      await expect(
        restrictedToken.connect(trader).transfer(feeReceiver.address, transferAmount)
      ).to.be.revertedWith("Restricted: use official pool only");
    });

    it("Should collect fees on hook transfers", async function () {
      const hookAddress = await feeHook.getAddress();
      const transferAmount = ethers.parseEther("1000");
      const expectedFee = (transferAmount * 10n) / 100n;

      await restrictedToken.transfer(hookAddress, transferAmount);

      const hook = await ethers.getImpersonatedSigner(hookAddress);
      await ethers.provider.send("hardhat_setBalance", [
        hookAddress,
        ethers.toQuantity(ethers.parseEther("10")),
      ]);

      await expect(
        restrictedToken.connect(hook).transfer(feeReceiver.address, transferAmount)
      ).to.emit(restrictedToken, "FeeCollected")
        .withArgs(hookAddress, owner.address, expectedFee);
    });
  });

  describe("Fee Receiver Management", function () {
    it("Should allow updating fee receiver", async function () {
      const newFeeReceiver = ethers.Wallet.createRandom().address;

      await expect(
        feeHook.setFeeReceiver(newFeeReceiver)
      ).to.emit(feeHook, "FeeReceiverSet")
        .withArgs(newFeeReceiver);

      expect(await feeHook.feeReceiver()).to.equal(newFeeReceiver);
    });

    it("Should reject zero address as fee receiver", async function () {
      await expect(
        feeHook.setFeeReceiver(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid fee receiver");
    });
  });

  describe("Full Swap Simulation", function () {
    it("Should simulate a complete swap flow with fee", async function () {
      const hookAddress = await feeHook.getAddress();
      const swapAmount = ethers.parseEther("500");
      
      // 1. Transfer tokens to hook (simulating swap input)
      await restrictedToken.transfer(hookAddress, swapAmount);

      // 2. Impersonate hook to act as pool manager would
      const hook = await ethers.getImpersonatedSigner(hookAddress);
      await ethers.provider.send("hardhat_setBalance", [
        hookAddress,
        ethers.toQuantity(ethers.parseEther("10")),
      ]);

      // 3. Hook calls beforeSwap
      const poolKey = {
        currency0: await restrictedToken.getAddress(),
        currency1: ethers.Wallet.createRandom().address,
        fee: 3000,
        tickSpacing: 60,
        hooks: hookAddress
      };

      const swapParams = {
        zeroForOne: true,
        amountSpecified: swapAmount,
        sqrtPriceLimitX96: "79228162514264337593543950336"
      };

      // Call beforeSwap as pool manager would
      await feeHook.connect(mockPoolManager).beforeSwap(
        trader.address,
        poolKey,
        swapParams,
        "0x"
      );

      // 4. Hook transfers tokens to trader (output of swap)
      const ownerBalanceBefore = await restrictedToken.balanceOf(owner.address);
      const traderBalanceBefore = await restrictedToken.balanceOf(trader.address);

      await restrictedToken.connect(hook).transfer(trader.address, swapAmount);

      const ownerBalanceAfter = await restrictedToken.balanceOf(owner.address);
      const traderBalanceAfter = await restrictedToken.balanceOf(trader.address);

      // Verify fee was collected
      const feeCollected = ownerBalanceAfter - ownerBalanceBefore;
      const expectedFee = (swapAmount * 10n) / 100n;
      expect(feeCollected).to.equal(expectedFee);

      // Verify trader received net amount
      const receivedAmount = traderBalanceAfter - traderBalanceBefore;
      const expectedNet = swapAmount - expectedFee;
      expect(receivedAmount).to.equal(expectedNet);

      console.log("\n✅ Full Swap Simulation Results:");
      console.log("================================");
      console.log("Swap Amount:", ethers.formatEther(swapAmount), "RST");
      console.log("Fee Collected:", ethers.formatEther(feeCollected), "RST");
      console.log("Net Received:", ethers.formatEther(receivedAmount), "RST");
      console.log("Fee Percentage:", (feeCollected * 100n) / swapAmount, "%");
    });
  });
});
