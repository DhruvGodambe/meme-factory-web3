// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "solady/src/tokens/ERC20.sol";
import {ReentrancyGuard} from "solady/src/utils/ReentrancyGuard.sol";
import {SafeTransferLib} from "solady/src/utils/SafeTransferLib.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {IUniswapV4Router04} from "./IUniswapV4Router04.sol";
import "./Interfaces.sol";

/// @title NFTStrategy - RARITY ERC20 token (non-transferable between EOAs, DEX tradable)
/// @notice This contract now serves as the RARITY token. NFT trading moved to FeeContract.
contract NFTStrategy is ERC20, ReentrancyGuard {
    /*                      CONSTANTS                      */
    
    IUniswapV4Router04 private immutable router;
    string tokenName;
    string tokenSymbol;
    address public immutable hookAddress;
    address public immutable factory;
    IERC721 public immutable collection;
    uint256 public constant MAX_SUPPLY = 1_000_000_000 * 1e18;
    address public constant DEADADDRESS = 0x000000000000000000000000000000000000dEaD;

    /*                   STATE VARIABLES                   */

    uint256 public priceMultiplier = 1200;
    mapping(uint256 => uint256) public nftForSale;
    uint256 public currentFees;
    uint256 public ethToTwap;
    uint256 public twapIncrement = 1 ether;
    uint256 public twapDelayInBlocks = 1;
    uint256 public lastTwapBlock;
    bool public midSwap;

    /*                    CUSTOM EVENTS                    */

    event NFTBoughtByProtocol(uint256 indexed tokenId, uint256 purchasePrice, uint256 listPrice);
    event NFTSoldByProtocol(uint256 indexed tokenId, uint256 price, address buyer);

    /*                    CUSTOM ERRORS                    */

    error NFTNotForSale();
    error NFTPriceTooLow();
    error InsufficientContractBalance();
    error InvalidMultiplier();
    error NoETHToTwap();
    error TwapDelayNotMet();
    error NotEnoughEth();
    error NotFactory();
    error AlreadyNFTOwner();
    error NeedToBuyNFT();
    error NotNFTOwner();
    error OnlyHook();
    error InvalidCollection();
    error ExternalCallFailed(bytes reason);

    /*                     CONSTRUCTOR                     */
    
    constructor(
        address _factory,
        address _hook,
        IUniswapV4Router04 _router,
        address _collection,
        string memory _tokenName,
        string memory _tokenSymbol
    ) {
        factory = _factory;
        router = _router;
        hookAddress = _hook;
        collection = IERC721(_collection);
        tokenName = _tokenName;
        tokenSymbol = _tokenSymbol;

        _mint(factory, MAX_SUPPLY);
    }

    function name() public view override returns (string memory)   { 
        return tokenName; 
    }

    function symbol() public view override returns (string memory) { 
        return tokenSymbol;     
    }

    function updateName(string memory _tokenName) external {
        if (msg.sender != factory) revert NotFactory();
        tokenName = _tokenName;
    }

    function updateSymbol(string memory _tokenSymbol) external {
        if (msg.sender != factory) revert NotFactory();
        tokenSymbol = _tokenSymbol;
    }

    function setPriceMultiplier(uint256 _newMultiplier) external {
        if (msg.sender != factory) revert NotFactory();
        if (_newMultiplier < 1100 || _newMultiplier > 10000) revert InvalidMultiplier();
        priceMultiplier = _newMultiplier;
    }

    /*                 MECHANISM FUNCTIONS                 */

    /// @notice Legacy function - kept for compatibility but disabled
    /// @dev Fee collection now handled by FeeContract
    function addFees() external pure {
        // Disabled for Rarity Town Protocol - fees go to FeeContract
        revert("Function disabled - fees handled by FeeContract");
    }

    function setMidSwap(bool value) external {
        if (msg.sender != hookAddress) revert OnlyHook();
        midSwap = value;
    }

    /// @notice Legacy function - kept for compatibility but disabled
    /// @dev NFT trading now handled by FeeContract
    function buyTargetNFT(uint256 /*value*/, bytes calldata /*data*/, uint256 /*expectedId*/, address /*target*/) external pure {
        // Disabled for Rarity Town Protocol - NFT trading moved to FeeContract
        revert("Function disabled - NFT trading handled by FeeContract");
        
        /*
        // Legacy implementation kept for reference:
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

        uint256 salePrice = cost * priceMultiplier / 1000;
        nftForSale[expectedId] = salePrice;
        
        emit NFTBoughtByProtocol(expectedId, cost, salePrice);
        */
    }

    /// @notice Legacy function - kept for compatibility but disabled
    /// @dev NFT trading now handled by FeeContract
    function sellTargetNFT(uint256 /*tokenId*/) external pure {
        // Disabled for Rarity Town Protocol - NFT trading moved to FeeContract
        revert("Function disabled - NFT trading handled by FeeContract");
        
        /*
        // Legacy implementation kept for reference:
        uint256 salePrice = nftForSale[tokenId];
        
        if (salePrice == 0) revert NFTNotForSale();
        
        if (msg.value != salePrice) revert NFTPriceTooLow();
        
        if (collection.ownerOf(tokenId) != address(this)) revert NotNFTOwner();
        
        collection.transferFrom(address(this), msg.sender, tokenId);
        
        delete nftForSale[tokenId];
        
        ethToTwap += salePrice;
        
        emit NFTSoldByProtocol(tokenId, salePrice, msg.sender);
        */
    }

    /// @notice Legacy function - kept for compatibility but disabled
    /// @dev Buyback/burn now handled by FeeContract
    function processTokenTwap() external pure {
        // Disabled for Rarity Town Protocol - buyback/burn moved to FeeContract
        revert("Function disabled - buyback/burn handled by FeeContract");
        
        /*
        // Legacy implementation kept for reference:
        if(ethToTwap == 0) revert NoETHToTwap();
        
        if(block.number < lastTwapBlock + twapDelayInBlocks) revert TwapDelayNotMet();
        
        uint256 burnAmount = twapIncrement;
        if(ethToTwap < twapIncrement) {
            burnAmount = ethToTwap;
        }

        uint256 reward = (burnAmount * 5) / 1000;
        burnAmount -= reward;
        
        ethToTwap -= burnAmount + reward;
        lastTwapBlock = block.number;
        
        _buyAndBurnTokens(burnAmount);

        SafeTransferLib.forceSafeTransferETH(msg.sender, reward);
        */
    }

    /*                  INTERNAL FUNCTIONS                 */

    function _buyAndBurnTokens(uint256 amountIn) internal {
        PoolKey memory key = PoolKey(
            Currency.wrap(address(0)),
            Currency.wrap(address(this)),
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
            DEADADDRESS,
            block.timestamp
        );
    }

    /// @notice Enforce RARITY token transfer restrictions (non-transferable between EOAs)
    /// @dev Keeps router restrictions intact - DEX trading allowed, direct EOA transfers blocked
    function _afterTokenTransfer(address from, address to, uint256) internal view override {
        if (!INFTStrategyFactory(factory).routerRestrict() || midSwap) return;

        // Use factory's validTransfer logic to enforce restrictions
        if (!INFTStrategyFactory(factory).validTransfer(from, to, address(this))) {
            revert("Invalid transfer - RARITY is non-transferable between EOAs");
        }
    }

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

    receive() external payable {}
}
