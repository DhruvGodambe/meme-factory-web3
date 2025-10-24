// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "solady/tokens/ERC20.sol";
import {ReentrancyGuard} from "solady/utils/ReentrancyGuard.sol";
import {SafeTransferLib} from "solady/utils/SafeTransferLib.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {IUniswapV4Router04} from "./IUniswapV4Router04.sol";
import './Interfaces.sol';

/// @title NFTStrategy - An ERC20 token that constantly churns NFTs from a collection
/// @author TokenWorks (https://token.works/)
contract NFTStrategy is ERC20, ReentrancyGuard {
    /* ™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™                ™™™™™™™™™™™                ™™™™™™™™™™™ */
    /* ™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™               ™™™™™™™™™™™™™              ™™™™™™™™™™  */
    /* ™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™              ™™™™™™™™™™™™™              ™™™™™™™™™™™  */
    /* ™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™             ™™™™™™™™™™™™™™            ™™™™™™™™™™™   */
    /* ™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™            ™™™™™™™™™™™™™™™            ™™™™™™™™™™™   */
    /*                ™™™™™™™™™™™            ™™™™™™™™™™™           ™™™™™™™™™™™™™™™           ™™™™™™™™™™™    */
    /*                ™™™™™™™™™™™             ™™™™™™™™™™          ™™™™™™™™™™™™™™™™™          ™™™™™™™™™™™    */
    /*                ™™™™™™™™™™™             ™™™™™™™™™™          ™™™™™™™™™™™™™™™™™          ™™™™™™™™™™     */
    /*                ™™™™™™™™™™™              ™™™™™™™™™™        ™™™™™™™™™™™™™™™™™™™        ™™™™™™™™™™™     */
    /*                ™™™™™™™™™™™              ™™™™™™™™™™™       ™™™™™™™™™ ™™™™™™™™™       ™™™™™™™™™™™      */
    /*                ™™™™™™™™™™™               ™™™™™™™™™™      ™™™™™™™™™™ ™™™™™™™™™™      ™™™™™™™™™™™      */
    /*                ™™™™™™™™™™™               ™™™™™™™™™™      ™™™™™™™™™   ™™™™™™™™™      ™™™™™™™™™™       */
    /*                ™™™™™™™™™™™                ™™™™™™™™™™    ™™™™™™™™™™    ™™™™™™™™™    ™™™™™™™™™™        */
    /*                ™™™™™™™™™™™                 ™™™™™™™™™™   ™™™™™™™™™     ™™™™™™™™™™  ™™™™™™™™™™™        */
    /*                ™™™™™™™™™™™                 ™™™™™™™™™™  ™™™™™™™™™™     ™™™™™™™™™™  ™™™™™™™™™™         */
    /*                ™™™™™™™™™™™                  ™™™™™™™™™™™™™™™™™™™™       ™™™™™™™™™™™™™™™™™™™™          */
    /*                ™™™™™™™™™™™                   ™™™™™™™™™™™™™™™™™™         ™™™™™™™™™™™™™™™™™™           */
    /*                ™™™™™™™™™™™                   ™™™™™™™™™™™™™™™™™™         ™™™™™™™™™™™™™™™™™™           */
    /*                ™™™™™™™™™™™                    ™™™™™™™™™™™™™™™™           ™™™™™™™™™™™™™™™™            */
    /*                ™™™™™™™™™™™                     ™™™™™™™™™™™™™™             ™™™™™™™™™™™™™™             */
    /*                ™™™™™™™™™™™                     ™™™™™™™™™™™™™™             ™™™™™™™™™™™™™™             */
    /*                ™™™™™™™™™™™                      ™™™™™™™™™™™™               ™™™™™™™™™™™™              */

    /* ™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™ */
    /*                      CONSTANTS                      */
    /* ™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™ */
    
    IUniswapV4Router04 private immutable router;
    string tokenName;
    string tokenSymbol;
    address public immutable hookAddress;
    address public immutable factory;
    IERC721 public immutable collection;
    uint256 public constant MAX_SUPPLY = 1_000_000_000 * 1e18;
    address public constant DEADADDRESS = 0x000000000000000000000000000000000000dEaD;

    /* ™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™ */
    /*                   STATE VARIABLES                   */
    /* ™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™ */

    uint256 public priceMultiplier = 1200; // 1.2x
    mapping(uint256 => uint256) public nftForSale; // tokenId => price
    uint256 public currentFees;
    uint256 public ethToTwap;
    uint256 public twapIncrement = 1 ether;
    uint256 public twapDelayInBlocks = 1;
    uint256 public lastTwapBlock;
    bool public midSwap;

    /* ™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™ */
    /*                    CUSTOM EVENTS                    */
    /* ™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™ */

    event NFTBoughtByProtocol(uint256 indexed tokenId, uint256 purchasePrice, uint256 listPrice);
    event NFTSoldByProtocol(uint256 indexed tokenId, uint256 price, address buyer);

    /* ™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™ */
    /*                    CUSTOM ERRORS                    */
    /* ™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™ */

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
    error NotValidSwap();
    error NotValidRouter();

    /* ™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™ */
    /*                     CONSTRUCTOR                     */
    /* ™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™ */
    /// @notice Initializes the contract with required addresses and permissions
    /// @param _factory Address of the NFTStrategyFactory contract
    /// @param _hook Address of the NFTStrategyHook contract
    /// @param _router Address of the Uniswap V4 Router contract
    /// @param _collection Address of the NFT collection contract
    /// @param _tokenName Name of the token
    /// @param _tokenSymbol Symbol of the token
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

    /// @notice Returns the name of the token
    /// @return The token name as a string
    function name() public view override returns (string memory)   { 
        return tokenName; 
    }

    /// @notice Returns the symbol of the token
    /// @return The token symbol as a string
    function symbol() public view override returns (string memory) { 
        return tokenSymbol;     
    }

    /// @notice Updates the name of the token
    /// @dev Can only be called by the factory
    /// @param _tokenName New name for the token
    function updateName(string memory _tokenName) external {
        if (msg.sender != factory) revert NotFactory();
        tokenName = _tokenName;
    }

    /// @notice Updates the symbol of the token
    /// @dev Can only be called by the factory  
    /// @param _tokenSymbol New symbol for the token
    function updateSymbol(string memory _tokenSymbol) external {
        if (msg.sender != factory) revert NotFactory();
        tokenSymbol = _tokenSymbol;
    }

    /// @notice Updates the price multiplier for relisting punks
    /// @param _newMultiplier New multiplier in basis points (1100 = 1.1x, 10000 = 10.0x)
    /// @dev Only callable by factory. Must be between 1.1x (1100) and 10.0x (10000)
    function setPriceMultiplier(uint256 _newMultiplier) external {
        if (msg.sender != factory) revert NotFactory();
        if (_newMultiplier < 1100 || _newMultiplier > 10000) revert InvalidMultiplier();
        priceMultiplier = _newMultiplier;
    }

    /* ™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™ */
    /*                 MECHANISM FUNCTIONS                 */
    /* ™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™ */

    /// @notice Allows the hook to deposit trading fees into the contract
    /// @dev Only callable by the hook contract
    /// @dev Fees are added to currentFees balance
    function addFees() external payable nonReentrant {
        if (msg.sender != hookAddress) revert OnlyHook();
        currentFees += msg.value;
    }

    /// @notice Sets midSwap to false
    /// @dev Only callable by the hook contract
    function setMidSwap(bool value) external {
        if (msg.sender != hookAddress) revert OnlyHook();
        midSwap = value;
    }

    function buyTargetNFT(uint256 value, bytes calldata data, uint256 expectedId, address target) external nonReentrant {
        // Store both balance and nft amount before calling external 
        uint256 ethBalanceBefore = address(this).balance;
        uint256 nftBalanceBefore = collection.balanceOf(address(this));

        // Make sure we are not owner of the expected id
        if (collection.ownerOf(expectedId) == address(this)) {
            revert AlreadyNFTOwner();
        }

        // Ensure value is not more than currentFees
        if (value > currentFees) {
            revert NotEnoughEth();
        }

        // Call external
        (bool success, bytes memory reason) = target.call{value: value}(data);
        if (!success) {
            revert ExternalCallFailed(reason);
        }

        // Ensure we now have one more NFT
        uint256 nftBalanceAfter = collection.balanceOf(address(this));

        if (nftBalanceAfter != nftBalanceBefore + 1) {
            revert NeedToBuyNFT();
        }

        // Ensure we are now owner of expectedId
        if (collection.ownerOf(expectedId) != address(this)) {
            revert NotNFTOwner();
        }

        // Calculate actual cost of the NFT to base new price on
        uint256 cost = ethBalanceBefore - address(this).balance;
        currentFees -= cost;

        // List NFT for sale at priceMultiplier times the cost
        uint256 salePrice = cost * priceMultiplier / 1000;
        nftForSale[expectedId] = salePrice;
        
        emit NFTBoughtByProtocol(expectedId, cost, salePrice);
    }

    /// @notice Sells an NFT owned by the contract for the listed price
    /// @param tokenId The ID of the NFT to sell
    function sellTargetNFT(uint256 tokenId) external payable nonReentrant {
        // Get sale price
        uint256 salePrice = nftForSale[tokenId];
        
        // Verify NFT is for sale
        if (salePrice == 0) revert NFTNotForSale();
        
        // Verify sent ETH matches sale price
        if (msg.value != salePrice) revert NFTPriceTooLow();
        
        // Verify contract owns the NFT
        if (collection.ownerOf(tokenId) != address(this)) revert NotNFTOwner();
        
        // Transfer NFT to buyer
        collection.transferFrom(address(this), msg.sender, tokenId);
        
        // Remove NFT from sale
        delete nftForSale[tokenId];
        
        // Add sale price to fees
        ethToTwap += salePrice;
        
        emit NFTSoldByProtocol(tokenId, salePrice, msg.sender);
    }

    // This function lets someone process _buyAndBurnTokens once every twapDelayInBlocks
    // Eth amount to TWAP is twapIncrement, if we have less than that use the remaining amount
    // Payout reward to the caller at the end, we also need to subtract this from burnAmount.
    function processTokenTwap() external {
        if(ethToTwap == 0) revert NoETHToTwap();
        
        // Check if enough blocks have passed since last TWAP
        if(block.number < lastTwapBlock + twapDelayInBlocks) revert TwapDelayNotMet();
        
        // Calculate amount to burn - either twapIncrement or remaining ethToTwap
        uint256 burnAmount = twapIncrement;
        if(ethToTwap < twapIncrement) {
            burnAmount = ethToTwap;
        }

        // Set reward to 0.5% of burnAmount
        uint256 reward = (burnAmount * 5) / 1000;
        burnAmount -= reward;
        
        // Update state
        ethToTwap -= burnAmount + reward;
        lastTwapBlock = block.number;
        
        _buyAndBurnTokens(burnAmount);

        // Send reward to caller
        SafeTransferLib.forceSafeTransferETH(msg.sender, reward);
    }

    /* ™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™ */
    /*                  INTERNAL FUNCTIONS                 */
    /* ™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™ */

    /// @notice Buys tokens with ETH and burns them by sending to dead address
    /// @param amountIn The amount of ETH to spend on tokens that will be burned
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

    /// @notice Checks if a transfer is allowed based on swapping through the hook
    /// @param from The address sending tokens
    /// @param to The address receiving tokens 
    /// @dev Reverts if transfer isn't through the hook
    function _afterTokenTransfer(address from, address to, uint256) internal view override {
        // Allow transfer if router restrictions are disabled or we're mid-swap
        if (!INFTStrategyFactory(factory).routerRestrict() || midSwap) return;

        // Check if transfer is valid based on router restrictions
        // Reverts with NotValidRouter if transfer is between unauthorized addresses
        if (!INFTStrategyFactory(factory).validTransfer(from, to, address(this))) {
            revert NotValidRouter();
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

    /// @notice Allows the contract to receive ETH
    receive() external payable {}
}