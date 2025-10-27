// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "solady/src/tokens/ERC20.sol";
import {ReentrancyGuard} from "solady/src/utils/ReentrancyGuard.sol";
import {SafeTransferLib} from "solady/src/utils/SafeTransferLib.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {IUniswapV4Router04} from "./IUniswapV4Router04.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import "./Interfaces.sol";
import {Initializable} from "solady/src/utils/Initializable.sol";
import {UUPSUpgradeable} from "solady/src/utils/UUPSUpgradeable.sol";
import {Ownable} from "solady/src/auth/Ownable.sol";
import {LibClone} from "solady/src/utils/LibClone.sol";

/// @title NFTStrategy - An ERC20 token that constantly churns NFTs from a collection
/// @author TokenWorks (https://token.works/)
/// @notice This contract implements an ERC20 token backed by NFTs from a specific collection.
///         Users can trade the token on Uniswap V4, and the contract uses trading fees to buy and sell NFTs.
/// @dev Uses ERC1967 proxy pattern with immutable args for gas-efficient upgrades
contract NFTStrategy is Initializable, UUPSUpgradeable, Ownable, ReentrancyGuard, ERC20 {
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
    /*                     CONSTANTS                       */
    /* ™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™ */

    /// @notice The name of the ERC20 token
    string tokenName;
    /// @notice The symbol of the ERC20 token
    string tokenSymbol;
    /// @notice Address of the Uniswap V4 hook contract
    address public hookAddress;
    /// @notice The NFT collection this strategy is tied to
    IERC721 public collection;
    /// @notice Maximum token supply (1 billion tokens)
    uint256 public constant MAX_SUPPLY = 1_000_000_000 * 1e18;
    /// @notice Dead address for burning tokens
    address public constant DEAD_ADDRESS = 0x000000000000000000000000000000000000dEaD;
    /// @notice Contract version for upgrade tracking
    uint256 public constant VERSION = 2;

    /* ™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™ */
    /*                   STATE VARIABLES                   */
    /* ™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™ */

    /// @notice Multiplier for NFT resale price (in basis points, e.g., 1200 = 1.2x)
    uint256 public priceMultiplier;
    /// @notice Mapping of NFT token IDs to their sale prices
    mapping(uint256 => uint256) public nftForSale;
    /// @notice Current accumulated fees available for NFT purchases
    uint256 public currentFees;
    /// @notice ETH accumulated from NFT sales, waiting to be used for token buyback
    uint256 public ethToTwap;
    /// @notice Amount of ETH to use per TWAP buyback operation
    uint256 public twapIncrement;
    /// @notice Number of blocks to wait between TWAP operations
    uint256 public twapDelayInBlocks;
    /// @notice Block number of the last TWAP operation
    uint256 public lastTwapBlock;
    /// @notice Block number when the last NFT was bought
    uint256 public lastBuyBlock;
    /// @notice ETH amount increment for maximum buy price calculation
    uint256 public buyIncrement;
    /// @notice Mapping of addresses that can distribute tokens freely (team wallets, airdrop contracts)
    mapping(address => bool) public isDistributor;

    /// @notice Storage gap for future upgrades (prevents storage collisions)
    uint256[49] private __gap;

    /* ™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™ */
    /*                   CUSTOM EVENTS                     */
    /* ™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™ */

    /// @notice Emitted when the protocol buys an NFT
    event NFTBoughtByProtocol(uint256 indexed tokenId, uint256 purchasePrice, uint256 listPrice);
    /// @notice Emitted when the protocol sells an NFT
    event NFTSoldByProtocol(uint256 indexed tokenId, uint256 price, address buyer);
    /// @notice Emitted when transfer allowance is increased by the hook
    event AllowanceIncreased(uint256 amount);
    /// @notice Emitted when transfer allowance is spent
    event AllowanceSpent(address indexed from, address indexed to, uint256 amount);
    /// @notice Emitted when the contract implementation is upgraded
    event ContractUpgraded(address indexed oldImplementation, address indexed newImplementation, uint256 version);
    /// @notice Emitted when a distributor's whitelist status is updated
    event DistributorUpdated(address indexed distributor, bool status);

    /* ™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™ */
    /*                    CUSTOM ERRORS                    */
    /* ™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™ */

    /// @notice NFT is not currently for sale
    error NFTNotForSale();
    /// @notice Sent ETH amount is less than the NFT sale price
    error NFTPriceTooLow();
    /// @notice Contract doesn't have enough ETH balance
    error InsufficientContractBalance();
    /// @notice Price multiplier is outside valid range
    error InvalidMultiplier();
    /// @notice No ETH available for TWAP operations
    error NoETHToTwap();
    /// @notice Not enough blocks have passed since last TWAP
    error TwapDelayNotMet();
    /// @notice Not enough ETH in fees to make purchase
    error NotEnoughEth();
    /// @notice Purchase price exceeds time-based maximum
    error PriceTooHigh();
    /// @notice Caller is not the factory contract
    error NotFactory();
    /// @notice Contract already owns this NFT
    error AlreadyNFTOwner();
    /// @notice External call didn't result in NFT acquisition
    error NeedToBuyNFT();
    /// @notice Contract doesn't own the specified NFT
    error NotNFTOwner();
    /// @notice Caller is not the authorized hook contract
    error OnlyHook();
    /// @notice Invalid NFT collection address
    error InvalidCollection();
    /// @notice External call to marketplace failed
    error ExternalCallFailed(bytes reason);
    /// @notice Invalid target address for external call
    error InvalidTarget();
    /// @notice Token transfer not authorized
    error InvalidTransfer();

    /* ™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™ */
    /*                    CONSTRUCTOR                      */
    /* ™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™ */
    /// @notice Constructor disables initializers to prevent implementation contract initialization
    /// @dev This is required for the proxy pattern to work correctly
    constructor() {
        _disableInitializers();
    }

    /// @notice Initializes the contract with required addresses and permissions
    /// @param _collection Address of the NFT collection contract
    /// @param _hook Address of the NFTStrategyHook contract
    /// @param _tokenName Name of the token
    /// @param _tokenSymbol Symbol of the token
    /// @param _buyIncrement Buy increment for the token
    /// @param _owner Owner of the contract
    function initialize(
        address _collection,
        address _hook,
        string memory _tokenName,
        string memory _tokenSymbol,
        uint256 _buyIncrement,
        address _owner
    ) external initializer {
        require(_collection != address(0), "Invalid collection");
        require(bytes(_tokenName).length > 0, "Empty name");
        require(bytes(_tokenSymbol).length > 0, "Empty symbol");

        collection = IERC721(_collection);
        hookAddress = _hook;
        tokenName = _tokenName;
        tokenSymbol = _tokenSymbol;
        lastBuyBlock = block.number;
        buyIncrement = _buyIncrement;

        // Initialize owner without validation in-case we want to disable upgradeability
        _initializeOwner(_owner);

        // Initialize state variables that have default values
        priceMultiplier = 1200; // 1.2x
        twapIncrement = 1 ether;
        twapDelayInBlocks = 1;

        _mint(address(this), MAX_SUPPLY);
    }

    /* ™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™ */
    /*                     MODIFIERS                       */
    /* ™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™ */

    /// @notice Restricts function access to the factory contract only
    modifier onlyFactory() {
        if (msg.sender != factory()) revert NotFactory(); // TODO: Fix factory check
        _;
    }

    /* ™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™ */
    /*                   ADMIN FUNCTIONS                   */
    /* ™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™ */

    /// @notice Authorizes contract upgrades (UUPS pattern)
    /// @param newImplementation Address of the new implementation contract
    /// @dev Only callable by contract owner, validates implementation is a contract
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {
        require(newImplementation != address(0), "Invalid implementation");
        require(newImplementation.code.length > 0, "Implementation must be contract");
        emit ContractUpgraded(address(this), newImplementation, VERSION);
    }

    /// @notice Updates the hook address
    /// @dev Can only be called by the owner
    /// @param _hookAddress New hook address
    function updateHookAddress(address _hookAddress) external onlyOwner {
        hookAddress = _hookAddress;
    }

    /// @notice Returns the name of the token
    /// @return The token name as a string
    function name() public view override returns (string memory) {
        return tokenName;
    }

    /// @notice Returns the symbol of the token
    /// @return The token symbol as a string
    function symbol() public view override returns (string memory) {
        return tokenSymbol;
    }

    /* ™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™ */
    /*                   FACTORY FUNCTIONS                 */
    /* ™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™ */

    /// @notice Updates the name of the token
    /// @dev Can only be called by the factory
    /// @param _tokenName New name for the token
    function updateName(string memory _tokenName) external onlyFactory {
        tokenName = _tokenName;
    }

    /// @notice Updates the symbol of the token
    /// @dev Can only be called by the factory
    /// @param _tokenSymbol New symbol for the token
    function updateSymbol(string memory _tokenSymbol) external onlyFactory {
        tokenSymbol = _tokenSymbol;
    }

    /// @notice Updates the price multiplier for relisting punks
    /// @param _newMultiplier New multiplier in basis points (1100 = 1.1x, 10000 = 10.0x)
    /// @dev Only callable by factory. Must be between 1.1x (1100) and 10.0x (10000)
    function setPriceMultiplier(uint256 _newMultiplier) external onlyFactory {
        if (_newMultiplier < 1100 || _newMultiplier > 10000) revert InvalidMultiplier();
        priceMultiplier = _newMultiplier;
    }

    /// @notice Allows owner to whitelist addresses that can distribute tokens freely
    /// @param distributor Address to whitelist
    /// @param status True to whitelist, false to remove from whitelist
    /// @dev Only callable by owner. Enables fee-free token distribution for whitelisted addresses
    function setDistributor(address distributor, bool status) external onlyOwner {
        isDistributor[distributor] = status;
        emit DistributorUpdated(distributor, status);
    }

    /* ™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™ */
    /*                 MECHANISM FUNCTIONS                 */
    /* ™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™ */

    /// @notice Returns the maximum price allowed for buying an NFT, increasing over time
    /// @return The maximum price in ETH (wei) that can be used for buying
    /// @dev Increases by buyIncrement per block from last buy
    function getMaxPriceForBuy() public view returns (uint256) {
        // Calculate blocks since last buy
        uint256 blocksSinceLastBuy = block.number - lastBuyBlock;

        // Return buyIncrement for each block, starting at 1 block minimum
        return (blocksSinceLastBuy + 1) * buyIncrement;
    }

    /// @notice Allows the hook to deposit trading fees into the contract
    /// @dev Only callable by the authorized hook contract, uses msg.value for fee amount
    function addFees() external payable {
        if (msg.sender != hookAddress) revert OnlyHook();
        currentFees += msg.value;
    }

    /// @notice Increases the transient transfer allowance for pool operations
    /// @param amountAllowed Amount to add to the current allowance
    /// @dev Only callable by the hook contract, uses transient storage
    function increaseTransferAllowance(uint256 amountAllowed) external {
        if (msg.sender != hookAddress) revert OnlyHook();
    uint256 currentAllowance = getTransferAllowance();
    assembly {
        tstore(0, add(currentAllowance, amountAllowed))
    }
    emit AllowanceIncreased(amountAllowed);
    }

    /// @notice Buys a specific NFT using accumulated fees
    /// @param value Amount of ETH to spend on the NFT purchase
    /// @param data Calldata for the external marketplace call
    /// @param expectedId The token ID expected to be acquired
    /// @param target The marketplace contract to call
    /// @dev Protected against reentrancy, validates NFT acquisition
    function buyTargetNFT(uint256 value, bytes calldata data, uint256 expectedId, address target)
        external
        nonReentrant
    {
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

        // Ensure value doesn't exceed the time-based maximum price
        if (value > getMaxPriceForBuy()) {
            revert PriceTooHigh();
        }

        // Ensure target is not the collection itself
        if (target == address(collection)) revert InvalidTarget();

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

        // Update last buy block to reset max price calculation
        lastBuyBlock = block.number;

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

    /// @notice Processes token buyback using TWAP mechanism
    /// @dev Can be called once every twapDelayInBlocks, uses ethToTwap for buyback
    /// @dev Caller receives 0.5% reward, remaining ETH is used to buy and burn tokens
    function processTokenTwap() external nonReentrant {
        if (ethToTwap == 0) revert NoETHToTwap();

        // Check if enough blocks have passed since last TWAP
        if (block.number < lastTwapBlock + twapDelayInBlocks) revert TwapDelayNotMet();

        // Calculate amount to burn - either twapIncrement or remaining ethToTwap
        uint256 burnAmount = twapIncrement;
        if (ethToTwap < twapIncrement) {
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
    /// @dev Creates a pool key and swaps ETH for tokens, sending tokens to dead address
    function _buyAndBurnTokens(uint256 amountIn) internal {
        PoolKey memory key =
            PoolKey(Currency.wrap(address(0)), Currency.wrap(address(this)), 0, 60, IHooks(hookAddress));

        router().swapExactTokensForTokens{value: amountIn}(amountIn, 0, true, key, "", DEAD_ADDRESS, block.timestamp);
    }

    /// @notice Validates token transfers using a transient allowance system
    /// @param from The address sending tokens
    /// @param to The address receiving tokens
    /// @param amount The amount of tokens being transferred
    /// @dev Reverts if transfer isn't through the hook
    function _afterTokenTransfer(address from, address to, uint256 amount) internal override {
        // On strategy launch, we need to allow for supply mint transfer
        if (from == address(0)) {
            return;
        }

        // Allow whitelisted distributors to send tokens freely
        if (isDistributor[from]) {
            return;
        }

        // TODO: Fix transient storage and pool manager checks
        // Transfers to and from the poolManager require a transient allowance thats set by the hook
        if ((from == address(poolManager()) || to == address(poolManager()))) {
            uint256 transferAllowance = getTransferAllowance();
            require(transferAllowance >= amount, InvalidTransfer());
            assembly {
                let newAllowance := sub(transferAllowance, amount)
                tstore(0, newAllowance)
            }
            emit AllowanceSpent(from, to, amount);
            return;
        }
        revert InvalidTransfer();
    }

    /// @notice Gets the current transient transfer allowance
    /// @return transferAllowance The current allowance amount
    /// @dev Reads from transient storage slot 0
    function getTransferAllowance() public view returns (uint256 transferAllowance) {
        // TODO: Fix transient storage
        assembly {
            transferAllowance := tload(0)
        }
        // return 0;
    }

    /// @notice Handles receipt of NFTs (ERC721 receiver)
    /// @dev Only accepts NFTs from the designated collection
    /// @return The function selector to confirm receipt
    function onERC721Received(address, address, uint256, bytes calldata) external view returns (bytes4) {
        if (msg.sender != address(collection)) {
            revert InvalidCollection();
        }

        return this.onERC721Received.selector;
    }

    /* ™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™ */
    /*                  GETTER FUNCTIONS                   */
    /* ™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™™ */

    /// @notice Returns the factory address from proxy bytecode
    /// @return The factory contract address
    /// @dev Reads from bytes 0-20 of the proxy's immutable args
    function factory() public view returns (address) {
        // TODO: Fix LibClone usage
        bytes memory args = LibClone.argsOnERC1967(address(this), 0, 20);
        return address(bytes20(args));
        // return address(0);
    }

    /// @notice Returns the router address from proxy bytecode
    /// @return The Uniswap V4 router contract interface
    /// @dev Reads from bytes 20-40 of the proxy's immutable args
    function router() public view returns (IUniswapV4Router04) {
        // TODO: Fix LibClone usage
        bytes memory args = LibClone.argsOnERC1967(address(this), 20, 40);
        return IUniswapV4Router04(payable(address(bytes20(args))));
        // return IUniswapV4Router04(payable(address(0)));
    }

    /// @notice Returns the pool manager address from proxy bytecode
    /// @return The Uniswap V4 pool manager contract interface
    /// @dev Reads from bytes 40-60 of the proxy's immutable args
    function poolManager() public view returns (IPoolManager) {
        // TODO: Fix LibClone usage
        bytes memory args = LibClone.argsOnERC1967(address(this), 40, 60);
        return IPoolManager(address(bytes20(args)));
        // return IPoolManager(address(0));
    }

    /// @notice Returns the current implementation address
    /// @return result The address of the current implementation contract
    /// @dev Reads from the ERC1967 implementation slot
    function getImplementation() external view returns (address result) {
        // TODO: Fix ERC1967 slot access
        assembly {
            result := sload(_ERC1967_IMPLEMENTATION_SLOT)
        }
        // return address(0);
    }

    /// @notice Allows the contract to receive ETH
    receive() external payable {}
}