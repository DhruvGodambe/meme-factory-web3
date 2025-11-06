// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ReentrancyGuard} from "solady/src/utils/ReentrancyGuard.sol";
import {SafeTransferLib} from "solady/src/utils/SafeTransferLib.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {IUniswapV4Router04} from "./IUniswapV4Router04.sol";
import "./Interfaces.sol";

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

    /*                   STATE VARIABLES                   */

    uint256 public currentHoldings;
    uint256 public priceMultiplier = 1200;
    mapping(uint256 => uint256) public nftForSale;
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
        address _rarityToken
    ) {
        factory = _factory;
        hookAddress = _hook;
        router = _router;
        collection = IERC721(_collection);
        rarityToken = _rarityToken;
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

    /*                  FEE FUNCTIONS                      */

    /// @notice Receive ETH fees from the hook
    function addFees() external payable onlyHook nonReentrant {
        currentFees += msg.value;
        emit FeesAdded(msg.value, msg.sender);
    }

    /*                 NFT TRADING FUNCTIONS               */

    /// @notice Smart buy function that chooses between collection marketplace and previous FeeContract
    function smartBuyNFT(
        uint256 tokenId,
        address previousFeeContract
    ) external nonReentrant {
        if (currentHoldings >= MAX_NFTS) revert ContractFull();
        if (collection.ownerOf(tokenId) == address(this)) revert AlreadyNFTOwner();

        uint256 collectionPrice = 0;
        uint256 feeContractPrice = 0;
        bool availableOnCollection = false;
        bool availableOnFeeContract = false;

        // Check collection marketplace price
        try ICollectionWithListings(address(collection)).listings(tokenId) returns (address seller, uint256 price) {
            if (seller != address(0) && price > 0) {
                collectionPrice = price;
                availableOnCollection = true;
            }
        } catch {}

        // Check previous FeeContract price
        if (previousFeeContract != address(0)) {
            try IFeeContract(previousFeeContract).nftForSale(tokenId) returns (uint256 price) {
                if (price > 0) {
                    // Verify the previous FeeContract actually owns the NFT
                    if (collection.ownerOf(tokenId) == previousFeeContract) {
                        feeContractPrice = price;
                        availableOnFeeContract = true;
                    }
                }
            } catch {}
        }

        if (!availableOnCollection && !availableOnFeeContract) {
            revert NFTNotForSale();
        }

        // Choose the cheaper option
        bool buyFromCollection = false;
        uint256 purchasePrice = 0;

        if (availableOnCollection && availableOnFeeContract) {
            if (collectionPrice <= feeContractPrice) {
                buyFromCollection = true;
                purchasePrice = collectionPrice;
            } else {
                buyFromCollection = false;
                purchasePrice = feeContractPrice;
            }
        } else if (availableOnCollection) {
            buyFromCollection = true;
            purchasePrice = collectionPrice;
        } else {
            buyFromCollection = false;
            purchasePrice = feeContractPrice;
        }

        if (purchasePrice > currentFees) revert NotEnoughEth();

        uint256 ethBalanceBefore = address(this).balance;
        uint256 nftBalanceBefore = collection.balanceOf(address(this));

        // Execute the purchase
        if (buyFromCollection) {
            // Buy from collection marketplace
            bytes memory buyData = abi.encodeWithSignature("buy(uint256)", tokenId);
            (bool success, bytes memory reason) = address(collection).call{value: purchasePrice}(buyData);
            if (!success) revert ExternalCallFailed(reason);
        } else {
            // Buy from previous FeeContract
            IFeeContract(previousFeeContract).sellTargetNFT{value: purchasePrice}(tokenId);
        }

        // Verify purchase success
        uint256 nftBalanceAfter = collection.balanceOf(address(this));
        if (nftBalanceAfter != nftBalanceBefore + 1) revert NeedToBuyNFT();
        if (collection.ownerOf(tokenId) != address(this)) revert NotNFTOwner();

        // Update state
        uint256 actualCost = ethBalanceBefore - address(this).balance;
        currentFees -= actualCost;
        currentHoldings++;

        uint256 salePrice = actualCost * priceMultiplier / 1000;
        nftForSale[tokenId] = salePrice;
        
        emit NFTBoughtByProtocol(tokenId, actualCost, salePrice);
    }

    /// @notice Buy an NFT using collected fees
    function buyTargetNFT(
        uint256 value,
        bytes calldata data,
        uint256 expectedId,
        address target
    ) external nonReentrant {
        if (currentHoldings >= MAX_NFTS) revert ContractFull();

        uint256 ethBalanceBefore = address(this).balance;
        uint256 nftBalanceBefore = collection.balanceOf(address(this));

        if (collection.ownerOf(expectedId) == address(this)) {
            revert AlreadyNFTOwner();
        }

        if (value > currentFees) {
            revert NotEnoughEth();
        }

        (bool success, bytes memory reason) = target.call{value: value}(data);
        if (!success) {
            revert ExternalCallFailed(reason);
        }

        uint256 nftBalanceAfter = collection.balanceOf(address(this));

        if (nftBalanceAfter != nftBalanceBefore + 1) {
            revert NeedToBuyNFT();
        }

        if (collection.ownerOf(expectedId) != address(this)) {
            revert NotNFTOwner();
        }

        uint256 cost = ethBalanceBefore - address(this).balance;
        currentFees -= cost;
        currentHoldings++;

        uint256 salePrice = cost * priceMultiplier / 1000;
        nftForSale[expectedId] = salePrice;
        
        emit NFTBoughtByProtocol(expectedId, cost, salePrice);
    }

    /// @notice Sell an NFT to a user
    function sellTargetNFT(uint256 tokenId) external payable nonReentrant {
        uint256 salePrice = nftForSale[tokenId];
        
        if (salePrice == 0) revert NFTNotForSale();
        if (msg.value != salePrice) revert NFTPriceTooLow();
        if (collection.ownerOf(tokenId) != address(this)) revert NotNFTOwner();
        
        collection.transferFrom(address(this), msg.sender, tokenId);
        
        delete nftForSale[tokenId];
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