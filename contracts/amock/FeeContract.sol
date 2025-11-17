// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ReentrancyGuard} from "solady/src/utils/ReentrancyGuard.sol";
import {SafeTransferLib} from "solady/src/utils/SafeTransferLib.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {IUniswapV4Router04} from "./IUniswapV4Router04.sol";
import "./Interfaces.sol";

interface IOpenSeaNFTBuyer {
    function buyNFTBasic(BasicOrderParameters calldata parameters) external payable;
}

/// @title FeeContract - Vault for NFT trading and RARITY buyback/burn
contract FeeContract is ReentrancyGuard {
    /*                      CONSTANTS                      */
    
    uint256 public constant MAX_NFTS = 5;
    uint256 public constant TWAP_INCREMENT = 1 ether;
    uint256 public constant TWAP_DELAY_BLOCKS = 1;
    address public constant DEAD_ADDRESS = 0x000000000000000000000000000000000000dEaD;
    
    IUniswapV4Router04 private immutable router;
    IERC721 public immutable collection;
    address public immutable rarityToken;
    address public immutable hookAddress;
    address public immutable factory;
    IOpenSeaNFTBuyer public immutable openSeaBuyer;

    /*                   STATE VARIABLES                   */

    uint256 public currentHoldings;
    uint256 public priceMultiplier = 1200;
    mapping(uint256 => uint256) public nftForSale;
    uint256[] public heldTokenIds; // Array to track all tokenIds held by this contract
    uint256 public currentFees;
    uint256 public ethToTwap;
    uint256 public lastTwapBlock;

    /*                    CUSTOM EVENTS                    */

    event FeesAdded(uint256 amount, address from);
    event NFTBoughtByProtocol(uint256 indexed tokenId, uint256 purchasePrice, uint256 listPrice);
    event NFTSoldByProtocol(uint256 indexed tokenId, uint256 price, address buyer);
    event BuybackAndBurn(uint256 ethAmount, uint256 rarityBurned);

    /*                    CUSTOM ERRORS                    */

    error OnlyHook();
    error ContractFull();
    error NFTNotForSale();
    error NFTPriceTooLow();
    error NotEnoughEth();
    error AlreadyNFTOwner();
    error NeedToBuyNFT();
    error NotNFTOwner();
    error InvalidCollection();
    error ExternalCallFailed(bytes reason);
    error NoETHToTwap();
    error TwapDelayNotMet();

    /*                     CONSTRUCTOR                     */
    
    constructor(
        address _factory,
        address _hook,
        IUniswapV4Router04 _router,
        address _collection,
        address _rarityToken,
        address _openSeaBuyer
    ) {
        factory = _factory;
        hookAddress = _hook;
        router = _router;
        collection = IERC721(_collection);
        rarityToken = _rarityToken;
        openSeaBuyer = IOpenSeaNFTBuyer(_openSeaBuyer);
    }

    /*                     MODIFIERS                       */

    modifier onlyHook() {
        if (msg.sender != hookAddress) revert OnlyHook();
        _;
    }

    /*                  VIEW FUNCTIONS                     */

    function isFull() external view returns (bool) {
        return currentHoldings >= MAX_NFTS;
    }

    /// @notice Get all tokenIds held by this contract
    function getHeldTokenIds() external view returns (uint256[] memory) {
        return heldTokenIds;
    }

    /*                  FEE FUNCTIONS                      */

    /// @notice Receive ETH fees from the hook
    function addFees() external payable onlyHook nonReentrant {
        currentFees += msg.value;
        emit FeesAdded(msg.value, msg.sender);
    }

    /*                 NFT TRADING FUNCTIONS               */

    /// @notice Smart buy function that chooses between OpenSea and previous FeeContract
    function smartBuyNFT(
        address previousFeeContract,
        BasicOrderParameters calldata openSeaOrder
    ) external nonReentrant {
        if (previousFeeContract == address(0)) {
            if (openSeaOrder.offerToken != address(collection)) revert InvalidCollection();
            uint256 price = openSeaOrder.considerationAmount;
            for (uint256 i = 0; i < openSeaOrder.additionalRecipients.length; i++) {
                price += openSeaOrder.additionalRecipients[i].amount;
            }
            _executeOpenSeaPurchase(openSeaOrder, price);
            return;
        }

        uint256 tokenId = openSeaOrder.offerIdentifier;
        if (currentHoldings >= MAX_NFTS) revert ContractFull();
        if (collection.ownerOf(tokenId) == address(this)) revert AlreadyNFTOwner();

        uint256 feeContractFloorPrice = 0;
        uint256 feeContractTokenId = 0;
        uint256 openSeaPrice = type(uint256).max;
        bool availableOnOpenSea = false;

        if (openSeaOrder.offerToken == address(collection)) {
            openSeaPrice = openSeaOrder.considerationAmount;
            for (uint256 i = 0; i < openSeaOrder.additionalRecipients.length; i++) {
                openSeaPrice += openSeaOrder.additionalRecipients[i].amount;
            }
            availableOnOpenSea = true;
        }

        (feeContractFloorPrice, feeContractTokenId) = _getFloorPrice(previousFeeContract);
        if (feeContractFloorPrice == 0 && !availableOnOpenSea) revert NFTNotForSale();

        uint256 purchasePrice = feeContractFloorPrice > 0 && feeContractFloorPrice < openSeaPrice 
            ? feeContractFloorPrice : openSeaPrice;
        uint256 purchaseTokenId = feeContractFloorPrice > 0 && feeContractFloorPrice < openSeaPrice 
            ? feeContractTokenId : tokenId;

        if (purchasePrice > currentFees) revert NotEnoughEth();

        uint256 ethBalanceBefore = address(this).balance;
        uint256 nftBalanceBefore = collection.balanceOf(address(this));

        if (feeContractFloorPrice > 0 && feeContractFloorPrice < openSeaPrice) {
            IFeeContract(previousFeeContract).sellTargetNFT{value: purchasePrice}(purchaseTokenId);
        } else {
            _executeOpenSeaPurchase(openSeaOrder, purchasePrice);
            return;
        }

        _completePurchase(purchaseTokenId, ethBalanceBefore, nftBalanceBefore);
    }

    /// @notice Buy an NFT using collected fees
    function buyTargetNFT(
        uint256 value,
        bytes calldata data,
        uint256 expectedId,
        address target
    ) external nonReentrant {
        if (currentHoldings >= MAX_NFTS) revert ContractFull();
        if (collection.ownerOf(expectedId) == address(this)) revert AlreadyNFTOwner();
        if (value > currentFees) revert NotEnoughEth();

        uint256 ethBalanceBefore = address(this).balance;
        uint256 nftBalanceBefore = collection.balanceOf(address(this));

        (bool success, bytes memory reason) = target.call{value: value}(data);
        if (!success) revert ExternalCallFailed(reason);

        _completePurchase(expectedId, ethBalanceBefore, nftBalanceBefore);
    }

    /// @notice Sell an NFT to a user
    function sellTargetNFT(uint256 tokenId) external payable nonReentrant {
        uint256 salePrice = nftForSale[tokenId];
        
        if (salePrice == 0) revert NFTNotForSale();
        if (msg.value != salePrice) revert NFTPriceTooLow();
        if (collection.ownerOf(tokenId) != address(this)) revert NotNFTOwner();
        
        collection.transferFrom(address(this), msg.sender, tokenId);
        
        delete nftForSale[tokenId];
        // Remove tokenId from heldTokenIds array
        _removeTokenId(tokenId);
        // DO NOT decrement currentHoldings - keep the count for vault capacity
        // currentHoldings--; // ← REMOVED: NFT was bought to be held, selling doesn't reduce capacity
        
        ethToTwap += salePrice;
        
        emit NFTSoldByProtocol(tokenId, salePrice, msg.sender);
    }

    /*                 BUYBACK FUNCTIONS                   */

    /// @notice Process TWAP buyback and burn of RARITY tokens
    function processTokenTwap() external nonReentrant {
        if (ethToTwap == 0) revert NoETHToTwap();
        if (block.number < lastTwapBlock + TWAP_DELAY_BLOCKS) revert TwapDelayNotMet();
        
        uint256 burnAmount = TWAP_INCREMENT;
        if (ethToTwap < TWAP_INCREMENT) {
            burnAmount = ethToTwap;
        }

        uint256 reward = (burnAmount * 5) / 1000; // 0.5% reward
        burnAmount -= reward;
        
        ethToTwap -= burnAmount + reward;
        lastTwapBlock = block.number;
        
        uint256 rarityBurned = _buyAndBurnTokens(burnAmount);

        SafeTransferLib.forceSafeTransferETH(msg.sender, reward);
        
        emit BuybackAndBurn(burnAmount, rarityBurned);
    }

    /// @notice Direct buyback and burn function
    function buybackAndBurn(uint256 amountIn) external nonReentrant {
        if (amountIn > currentFees) revert NotEnoughEth();
        
        currentFees -= amountIn;
        uint256 rarityBurned = _buyAndBurnTokens(amountIn);
        
        emit BuybackAndBurn(amountIn, rarityBurned);
    }

    /*                  ADMIN FUNCTIONS                    */

    /// @notice Update price multiplier for NFT sales
    function setPriceMultiplier(uint256 _newMultiplier) external {
        if (msg.sender != factory) revert("Not factory");
        if (_newMultiplier < 1100 || _newMultiplier > 10000) revert("Invalid multiplier");
        priceMultiplier = _newMultiplier;
    }

    /*                  INTERNAL FUNCTIONS                 */

    /// @notice Get the floor price (minimum price) of all NFTs in a FeeContract
    /// @param feeContractAddress The address of the FeeContract to check
    /// @return floorPrice The minimum price found
    /// @return tokenId The tokenId with the minimum price
    function _getFloorPrice(address feeContractAddress) internal view returns (uint256 floorPrice, uint256 tokenId) {
        floorPrice = type(uint256).max;
        tokenId = 0;
        
        IFeeContract feeContract = IFeeContract(feeContractAddress);
        uint256 holdings = feeContract.currentHoldings();
        
        if (holdings == 0) {
            return (0, 0);
        }
        
        // Get all tokenIds held by the previousFeeContract
        uint256[] memory tokenIds;
        try feeContract.getHeldTokenIds() returns (uint256[] memory ids) {
            tokenIds = ids;
        } catch {
            // If we can't get tokenIds, return 0
            return (0, 0);
        }
        
        // Iterate through all tokenIds held by the previousFeeContract
        for (uint256 i = 0; i < tokenIds.length; i++) {
            uint256 id = tokenIds[i];
            // Check if this token is for sale
            try feeContract.nftForSale(id) returns (uint256 price) {
                if (price > 0 && price < floorPrice) {
                    floorPrice = price;
                    tokenId = id;
                }
            } catch {
                // Continue to next token if nftForSale fails
                continue;
            }
        }
        
        // If no floor price was found, return 0
        if (floorPrice == type(uint256).max) {
            return (0, 0);
        }
        
        return (floorPrice, tokenId);
    }

    /// @notice Execute a purchase on OpenSea and update vault state
    function _executeOpenSeaPurchase(
        BasicOrderParameters calldata openSeaOrder,
        uint256 maxPrice
    ) internal {
        if (currentHoldings >= MAX_NFTS) revert ContractFull();
        if (openSeaOrder.offerToken != address(collection)) revert InvalidCollection();

        uint256 tokenId = openSeaOrder.offerIdentifier;
        if (collection.ownerOf(tokenId) == address(this)) revert AlreadyNFTOwner();
        if (maxPrice > currentFees) revert NotEnoughEth();

        uint256 ethBalanceBefore = address(this).balance;
        uint256 nftBalanceBefore = collection.balanceOf(address(this));

        openSeaBuyer.buyNFTBasic{value: maxPrice}(openSeaOrder);

        _completePurchase(tokenId, ethBalanceBefore, nftBalanceBefore);
    }

    /// @notice Complete purchase by verifying NFT received and updating state
    function _completePurchase(uint256 tokenId, uint256 ethBalanceBefore, uint256 nftBalanceBefore) internal {
        uint256 nftBalanceAfter = collection.balanceOf(address(this));
        if (nftBalanceAfter != nftBalanceBefore + 1) revert NeedToBuyNFT();
        if (collection.ownerOf(tokenId) != address(this)) revert NotNFTOwner();

        uint256 actualCost = ethBalanceBefore - address(this).balance;
        currentFees -= actualCost;
        currentHoldings++;
        heldTokenIds.push(tokenId);

        uint256 salePrice = actualCost * priceMultiplier / 1000;
        nftForSale[tokenId] = salePrice;

        emit NFTBoughtByProtocol(tokenId, actualCost, salePrice);
    }

    /// @notice Remove a tokenId from the heldTokenIds array
    /// @param tokenId The tokenId to remove
    function _removeTokenId(uint256 tokenId) internal {
        uint256 length = heldTokenIds.length;
        for (uint256 i = 0; i < length; i++) {
            if (heldTokenIds[i] == tokenId) {
                // Move the last element to the position of the element to delete
                heldTokenIds[i] = heldTokenIds[length - 1];
                // Remove the last element
                heldTokenIds.pop();
                break;
            }
        }
    }

    /// @notice Internal function to buy and burn RARITY tokens
    function _buyAndBurnTokens(uint256 amountIn) internal returns (uint256) {
        uint256 rarityBalanceBefore = IERC20(rarityToken).balanceOf(DEAD_ADDRESS);
        
        PoolKey memory key = PoolKey(
            Currency.wrap(address(0)),
            Currency.wrap(rarityToken),
            0,
            60,
            IHooks(hookAddress)
        );

        router.swapExactTokensForTokens{value: amountIn}(
            amountIn,
            0,
            true,
            key,
            "",
            DEAD_ADDRESS,
            block.timestamp
        );
        
        return IERC20(rarityToken).balanceOf(DEAD_ADDRESS) - rarityBalanceBefore;
    }

    /*                  UTILITY FUNCTIONS                  */

    /// @notice Handle incoming NFTs
    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external view returns (bytes4) {
        if (msg.sender != address(collection)) {
            revert InvalidCollection();
        }

        return this.onERC721Received.selector;
    }

    /// @notice Emergency withdrawal for contract owner
    function emergencyWithdraw() external {
        if (msg.sender != INFTStrategyFactory(factory).owner()) revert("Not owner");
        SafeTransferLib.forceSafeTransferETH(msg.sender, address(this).balance);
    }

    receive() external payable {}
}