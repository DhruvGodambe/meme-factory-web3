/*
  Test script for smartBuyNFT function
  
  This script tests the smartBuyNFT function locally using Hardhat's local network.
  It sets up the necessary contracts and tests the function with mock data.
  
  Usage:
    npx hardhat run scripts/test-smart-buy.ts --network localhost
    OR
    npx hardhat node  # in one terminal
    npx hardhat run scripts/test-smart-buy.ts --network localhost  # in another
*/

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// Helper to get contract artifacts
function loadArtifact(contractName: string) {
  const artifactPath = path.join(
    __dirname,
    `../artifacts/contracts/amock/${contractName}.sol/${contractName}.json`
  );
  return JSON.parse(fs.readFileSync(artifactPath, "utf-8"));
}

// Mock BasicOrderParameters for testing
function createMockBasicOrderParams(
  collectionAddress: string,
  tokenId: number,
  price: bigint,
  seller: string
): any {
  return {
    considerationToken: ethers.ZeroAddress, // ETH
    considerationIdentifier: 0,
    considerationAmount: price,
    offerer: seller,
    zone: ethers.ZeroAddress,
    offerToken: collectionAddress,
    offerIdentifier: tokenId,
    offerAmount: 1, // 1 NFT
    basicOrderType: 0, // ETH_TO_ERC721_FULL_OPEN
    startTime: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
    endTime: Math.floor(Date.now() / 1000) + 86400, // 24 hours from now
    zoneHash: ethers.ZeroHash,
    salt: ethers.getBigInt(Math.floor(Math.random() * 1000000)),
    offererConduitKey: ethers.ZeroHash,
    fulfillerConduitKey: ethers.ZeroHash,
    totalOriginalAdditionalRecipients: 0,
    additionalRecipients: [],
    signature: "0x" + "00".repeat(65), // Mock signature
  };
}

async function main() {
  console.log("🧪 Testing smartBuyNFT Function");
  console.log("=".repeat(60));

  // Get signers
  const [deployer, user1, user2] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("User1:", user1.address);
  console.log("User2:", user2.address);

  // 1. Deploy FakeNFTCollection
  console.log("\n📦 Step 1: Deploying FakeNFTCollection...");
  const FakeNFTCollectionArtifact = loadArtifact("FakeNFTCollection");
  const FakeNFTCollectionFactory = new ethers.ContractFactory(
    FakeNFTCollectionArtifact.abi,
    FakeNFTCollectionArtifact.bytecode,
    deployer
  );
  const collection = await FakeNFTCollectionFactory.deploy(
    "Test Collection",
    "TEST",
    "https://test.com/"
  );
  await collection.waitForDeployment();
  const collectionAddress = await collection.getAddress();
  console.log("✅ FakeNFTCollection deployed at:", collectionAddress);

  // Mint some NFTs for testing
  console.log("\n🎨 Step 2: Minting test NFTs...");
  const collectionContract = new ethers.Contract(
    collectionAddress,
    FakeNFTCollectionArtifact.abi,
    deployer
  );
  
  // Note: Constructor pre-mints 10 NFTs to deployer (tokenIds 0-9)
  // So new mints will start at tokenId 10
  await collectionContract.mint(user1.address);
  await collectionContract.mint(user1.address);
  await collectionContract.mint(user2.address);
  console.log("✅ Minted 3 NFTs (tokenIds 10, 11, 12)");
  
  // Also transfer one pre-minted NFT from deployer to user1 for testing
  const tokenId0 = 0;
  await collectionContract.transferFrom(deployer.address, user1.address, tokenId0);
  console.log(`✅ Transferred pre-minted tokenId ${tokenId0} to user1`);

  // 2. Deploy OpenSeaNFTBuyer (mock version for local testing)
  console.log("\n🌊 Step 3: Deploying MockOpenSeaBuyer...");
  const MockOpenSeaBuyerArtifact = loadArtifact("MockOpenSeaBuyer");
  const MockOpenSeaBuyerFactory = new ethers.ContractFactory(
    MockOpenSeaBuyerArtifact.abi,
    MockOpenSeaBuyerArtifact.bytecode,
    deployer
  );
  const openSeaBuyer = await MockOpenSeaBuyerFactory.deploy();
  await openSeaBuyer.waitForDeployment();
  const openSeaBuyerAddress = await openSeaBuyer.getAddress();
  console.log("✅ MockOpenSeaBuyer deployed at:", openSeaBuyerAddress);

  // 3. Deploy first FeeContract (will act as previousFeeContract)
  console.log("\n💰 Step 4: Deploying first FeeContract (previousFeeContract)...");
  const FeeContractArtifact = loadArtifact("FeeContract");
  const FeeContractFactory = new ethers.ContractFactory(
    FeeContractArtifact.abi,
    FeeContractArtifact.bytecode,
    deployer
  );

  // We need mock addresses for router, hook, rarityToken, factory
  const mockRouter = ethers.Wallet.createRandom().address;
  const mockRarityToken = ethers.Wallet.createRandom().address;
  const mockFactory = ethers.Wallet.createRandom().address;
  
  // Use deployer as hook for testing so we can call addFees
  const mockHook = deployer.address;

  const previousFeeContract = await FeeContractFactory.deploy(
    mockFactory,
    mockHook,
    mockRouter,
    collectionAddress,
    mockRarityToken,
    openSeaBuyerAddress
  );
  await previousFeeContract.waitForDeployment();
  const previousFeeContractAddress = await previousFeeContract.getAddress();
  console.log("✅ Previous FeeContract deployed at:", previousFeeContractAddress);

  // 4. Deploy second FeeContract (the one we'll test)
  console.log("\n💰 Step 5: Deploying second FeeContract (test contract)...");
  const testFeeContract = await FeeContractFactory.deploy(
    mockFactory,
    mockHook,
    mockRouter,
    collectionAddress,
    mockRarityToken,
    openSeaBuyerAddress
  );
  await testFeeContract.waitForDeployment();
  const testFeeContractAddress = await testFeeContract.getAddress();
  console.log("✅ Test FeeContract deployed at:", testFeeContractAddress);

  // 5. Setup: Add fees to test contract and buy an NFT for previousFeeContract
  console.log("\n🔧 Step 6: Setting up test scenario...");

  // For previousFeeContract, let's manually transfer an NFT and set it for sale
  // First, verify ownership and then user1 lists NFT on collection marketplace
  const tokenId1 = 0;
  const listPrice = ethers.parseEther("0.1"); // 0.1 ETH
  
  // Verify ownership before listing
  const ownerBeforeList = await collectionContract.ownerOf(tokenId1);
  console.log(`TokenId ${tokenId1} owner before list:`, ownerBeforeList);
  console.log(`User1 address:`, user1.address);
  console.log(`Match:`, ownerBeforeList.toLowerCase() === user1.address.toLowerCase());
  
  if (ownerBeforeList.toLowerCase() !== user1.address.toLowerCase()) {
    console.log("⚠️  Token not owned by user1, transferring...");
    // If deployer owns it, transfer to user1 first
    if (ownerBeforeList.toLowerCase() === deployer.address.toLowerCase()) {
      await collectionContract.transferFrom(deployer.address, user1.address, tokenId1);
      console.log(`✅ Transferred tokenId ${tokenId1} to user1`);
    } else {
      throw new Error(`Token ${tokenId1} is owned by ${ownerBeforeList}, expected ${user1.address}`);
    }
  }
  
  const collectionContractWithUser = new ethers.Contract(
    collectionAddress,
    FakeNFTCollectionArtifact.abi,
    user1
  );
  await collectionContractWithUser["setApprovalForAll"](openSeaBuyerAddress, true);
  console.log("✅ User1 approved MockOpenSeaBuyer for NFT transfers");
  await collectionContractWithUser.list(tokenId1, listPrice);
  console.log(`✅ Listed tokenId ${tokenId1} for ${ethers.formatEther(listPrice)} ETH`);

  // Buy it with previousFeeContract using buyTargetNFT
  // We need to add fees to previousFeeContract first (since buyTargetNFT checks currentFees)
  console.log("\n💰 Adding fees to previousFeeContract...");
  const previousFeeContractInstance = new ethers.Contract(
    previousFeeContractAddress,
    FeeContractArtifact.abi,
    deployer
  );
  
  // Add fees via addFees (deployer is the hook, so this will work)
  const feesForPurchase = ethers.parseEther("0.2");
  await previousFeeContractInstance.addFees({ value: feesForPurchase });
  const previousFees = await previousFeeContractInstance.currentFees();
  console.log(`✅ Added fees to previousFeeContract: ${ethers.formatEther(previousFees)} ETH`);

  // Create buy data for collection marketplace
  const buyData = collectionContract.interface.encodeFunctionData("buy", [tokenId1]);
  await previousFeeContractInstance.buyTargetNFT(
    listPrice,
    buyData,
    tokenId1,
    collectionAddress
  );
  console.log(`✅ PreviousFeeContract bought tokenId ${tokenId1}`);

  // Check the sale price set
  const salePrice = await previousFeeContractInstance.nftForSale(tokenId1);
  console.log(`✅ NFT listed for sale at: ${ethers.formatEther(salePrice)} ETH`);

  // Add fees to test contract by calling addFees as the hook
  // We'll impersonate the hook address
  console.log("\n💰 Adding fees to test contract...");
  const feesAmount = ethers.parseEther("0.5"); // 0.5 ETH
  await deployer.sendTransaction({
    to: testFeeContractAddress,
    value: feesAmount,
  });
  
  // To call addFees, we need to impersonate the hook
  // For local testing, we can use hardhat_impersonateAccount or deploy with hook = deployer
  // Let's use a workaround: deploy a new contract with deployer as hook for testing
  console.log("⚠️  Note: addFees requires hook address. Creating test contract with deployer as hook...");
  
  // Deploy a test version where deployer is the hook
  const testFeeContractWithHook = await FeeContractFactory.deploy(
    mockFactory,
    deployer.address, // Use deployer as hook for testing
    mockRouter,
    collectionAddress,
    mockRarityToken,
    openSeaBuyerAddress
  );
  await testFeeContractWithHook.waitForDeployment();
  const testFeeContractWithHookAddress = await testFeeContractWithHook.getAddress();
  console.log("✅ Test FeeContract (with deployer as hook) deployed at:", testFeeContractWithHookAddress);
  
  // Now we can add fees
  const testFeeContractWithHookInstance = new ethers.Contract(
    testFeeContractWithHookAddress,
    FeeContractArtifact.abi,
    deployer
  );
  await testFeeContractWithHookInstance.addFees({ value: feesAmount });
  const currentFees = await testFeeContractWithHookInstance.currentFees();
  console.log(`✅ Added fees: ${ethers.formatEther(currentFees)} ETH`);

  // 6. Test smartBuyNFT with previousFeeContract only
  console.log("\n🧪 Step 7: Testing smartBuyNFT with price comparison...");

  // Get floor price from previousFeeContract BEFORE calling smartBuyNFT
  console.log("\n📊 Price Comparison:");
  const heldTokenIds = await previousFeeContractInstance.getHeldTokenIds();
  console.log("PreviousFeeContract held tokenIds:", heldTokenIds);
  
  // Calculate floor price manually to show what smartBuyNFT will see
  let floorPrice = ethers.MaxUint256;
  let floorTokenId = 0;
  for (let i = 0; i < heldTokenIds.length; i++) {
    const id = heldTokenIds[i];
    const price = await previousFeeContractInstance.nftForSale(id);
    if (price > 0 && price < floorPrice) {
      floorPrice = price;
      floorTokenId = id;
    }
  }
  console.log(`💰 PreviousFeeContract floor price: ${ethers.formatEther(floorPrice)} ETH (tokenId: ${floorTokenId})`);

  // Create a mock OpenSea order
  const openSeaPrice = ethers.parseEther("0.5"); // 0.5 ETH
  const mockOpenSeaOrder = createMockBasicOrderParams(
    collectionAddress,
    1, // tokenId 1
    openSeaPrice,
    user1.address
  );
  
  // Calculate total OpenSea price (considerationAmount + additionalRecipients)
  let totalOpenSeaPrice = mockOpenSeaOrder.considerationAmount;
  for (let i = 0; i < mockOpenSeaOrder.additionalRecipients.length; i++) {
    totalOpenSeaPrice += mockOpenSeaOrder.additionalRecipients[i].amount;
  }
  console.log(`🌊 OpenSea price: ${ethers.formatEther(totalOpenSeaPrice)} ETH`);
  
  // Show which is cheaper
  const cheaperSource = floorPrice < totalOpenSeaPrice ? "PreviousFeeContract" : "OpenSea";
  const cheaperPrice = floorPrice < totalOpenSeaPrice ? floorPrice : totalOpenSeaPrice;
  console.log(`\n🏆 Cheaper option: ${cheaperSource} at ${ethers.formatEther(cheaperPrice)} ETH`);
  console.log(`   Price difference: ${ethers.formatEther(
    floorPrice < totalOpenSeaPrice 
      ? totalOpenSeaPrice - floorPrice 
      : floorPrice - totalOpenSeaPrice
  )} ETH`);

  try {
    // Get fees before purchase
    const feesBefore = await testFeeContractWithHookInstance.currentFees();
    console.log(`\n💵 Test contract fees before purchase: ${ethers.formatEther(feesBefore)} ETH`);

    // Call smartBuyNFT using the contract with deployer as hook
    console.log("\n🛒 Calling smartBuyNFT...");
    const tx = await testFeeContractWithHookInstance.smartBuyNFT(
      previousFeeContractAddress,
      mockOpenSeaOrder
    );
    const receipt = await tx.wait();
    console.log("✅ Transaction successful!");
    console.log("   Gas used:", receipt?.gasUsed.toString());

    // Verify which source was used by checking the actual cost
    const feesAfter = await testFeeContractWithHookInstance.currentFees();
    const actualCost = feesBefore - feesAfter;
    console.log(`\n💰 Purchase Details:`);
    console.log(`   Actual cost: ${ethers.formatEther(actualCost)} ETH`);
    console.log(`   Expected cost (${cheaperSource}): ${ethers.formatEther(cheaperPrice)} ETH`);
    
    // Determine which source was actually used based on cost
    const usedPreviousFeeContract = actualCost <= floorPrice + ethers.parseEther("0.001"); // Allow small difference for gas
    const usedOpenSea = actualCost >= totalOpenSeaPrice - ethers.parseEther("0.001");
    
    if (usedPreviousFeeContract) {
      console.log(`   ✅ Purchased from: PreviousFeeContract`);
      console.log(`   ✅ Correct choice: ${floorPrice < totalOpenSeaPrice ? "YES ✓" : "NO ✗"}`);
    } else if (usedOpenSea) {
      console.log(`   ✅ Purchased from: OpenSea`);
      console.log(`   ✅ Correct choice: ${totalOpenSeaPrice < floorPrice ? "YES ✓" : "NO ✗"}`);
    } else {
      console.log(`   ⚠️  Could not determine source (cost: ${ethers.formatEther(actualCost)} ETH)`);
    }

    // Verify the NFT was purchased - check the floorTokenId (what was actually purchased)
    const purchasedTokenId = floorTokenId; // This is what should have been purchased from previousFeeContract
    const owner = await collectionContract.ownerOf(purchasedTokenId);
    console.log(`\n🎨 NFT Ownership:`);
    console.log(`   TokenId ${purchasedTokenId} owner:`, owner);
    console.log(`   Expected: ${testFeeContractWithHookAddress}`);
    console.log(`   Match: ${owner.toLowerCase() === testFeeContractWithHookAddress.toLowerCase() ? "✅ YES" : "❌ NO"}`);
    
    // Check test contract's holdings
    const holdings = await testFeeContractWithHookInstance.currentHoldings();
    const heldIdsAfter = await testFeeContractWithHookInstance.getHeldTokenIds();
    const hasPurchasedToken = heldIdsAfter.some((id: bigint) => id.toString() === purchasedTokenId.toString());
    
    console.log(`\n📦 Test Contract State:`);
    console.log(`   Holdings: ${holdings}`);
    console.log(`   Held tokenIds:`, heldIdsAfter);
    console.log(`   TokenId ${purchasedTokenId} in heldTokenIds: ${hasPurchasedToken ? "✅ YES" : "❌ NO"}`);
    console.log(`   Remaining fees: ${ethers.formatEther(feesAfter)} ETH`);
  } catch (error: any) {
    console.error("❌ Test failed:", error.message);
    if (error.data) {
      console.error("Error data:", error.data);
    }
    if (error.reason) {
      console.error("Error reason:", error.reason);
    }
  }

  // 8. Test OpenSea-only path (previousFeeContract = address(0))
  console.log("\n🧪 Step 8: Testing smartBuyNFT with OpenSea-only path...");
  const openSeaOnlyTokenId = 11; // Owned by user1 from earlier mint
  const openSeaOnlyPrice = ethers.parseEther("0.05");
  const openSeaOnlyOrder = createMockBasicOrderParams(
    collectionAddress,
    openSeaOnlyTokenId,
    openSeaOnlyPrice,
    user1.address
  );

  const ownerBeforeOpenSeaOnly = await collectionContract.ownerOf(openSeaOnlyTokenId);
  console.log(`TokenId ${openSeaOnlyTokenId} owner before purchase:`, ownerBeforeOpenSeaOnly);

  // Ensure the test contract has enough fees for the OpenSea purchase
  await testFeeContractWithHookInstance.addFees({ value: openSeaOnlyPrice });
  const feesBeforeOpenSeaOnly = await testFeeContractWithHookInstance.currentFees();
  console.log(`Fees before OpenSea-only purchase: ${ethers.formatEther(feesBeforeOpenSeaOnly)} ETH`);

  const holdingsBeforeOpenSeaOnly = await testFeeContractWithHookInstance.currentHoldings();
  const txOpenSeaOnly = await testFeeContractWithHookInstance.smartBuyNFT(
    ethers.ZeroAddress,
    openSeaOnlyOrder
  );
  await txOpenSeaOnly.wait();
  console.log("✅ OpenSea-only smartBuyNFT call succeeded");

  const ownerAfterOpenSeaOnly = await collectionContract.ownerOf(openSeaOnlyTokenId);
  console.log(`TokenId ${openSeaOnlyTokenId} owner after purchase:`, ownerAfterOpenSeaOnly);
  console.log(
    `Ownership transferred:`,
    ownerAfterOpenSeaOnly.toLowerCase() === testFeeContractWithHookAddress.toLowerCase() ? "✅ YES" : "❌ NO"
  );

  const holdingsAfterOpenSeaOnly = await testFeeContractWithHookInstance.currentHoldings();
  const heldIdsAfterOpenSeaOnly = await testFeeContractWithHookInstance.getHeldTokenIds();
  const tokenInVault = heldIdsAfterOpenSeaOnly.some(
    (id: bigint) => id.toString() === openSeaOnlyTokenId.toString()
  );

  console.log(`Holdings before: ${holdingsBeforeOpenSeaOnly}, after: ${holdingsAfterOpenSeaOnly}`);
  console.log(`Held tokenIds now:`, heldIdsAfterOpenSeaOnly);
  console.log(`TokenId ${openSeaOnlyTokenId} tracked in vault: ${tokenInVault ? "✅ YES" : "❌ NO"}`);

  console.log("\n✅ Test script completed!");
  console.log("\nSummary:");
  console.log("- Collection:", collectionAddress);
  console.log("- PreviousFeeContract:", previousFeeContractAddress);
  console.log("- TestFeeContract (original):", testFeeContractAddress);
  console.log("- TestFeeContract (with hook):", testFeeContractWithHookAddress);
  console.log("- OpenSeaBuyer:", openSeaBuyerAddress);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

