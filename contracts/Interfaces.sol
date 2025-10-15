// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";

/**
 * @title IERC20Minimal
 * @notice Minimal ERC20 interface for token operations
 */
interface IERC20 {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
}

/**
 * @title IERC721
 * @notice ERC721 interface for NFT collection operations
 */
interface IERC721 {
    function balanceOf(address owner) external view returns (uint256 balance);
    function ownerOf(uint256 tokenId) external view returns (address owner);
    function safeTransferFrom(address from, address to, uint256 tokenId, bytes calldata data) external;
    function safeTransferFrom(address from, address to, uint256 tokenId) external;
    function transferFrom(address from, address to, uint256 tokenId) external;
    function approve(address to, uint256 tokenId) external;
    function setApprovalForAll(address operator, bool approved) external;
    function getApproved(uint256 tokenId) external view returns (address operator);
    function isApprovedForAll(address owner, address operator) external view returns (bool);
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
    function owner() external view returns (address);
    
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
}

/**
 * @title ICollectionStrategy
 * @notice Interface for NFT collection strategy contracts that receive fees
 */
interface INFTStrategy {
    /// @notice Add fees to the collection strategy
    function addFees() external payable;
    
    /// @notice Set price multiplier for the collection
    function setPriceMultiplier(uint256 _newMultiplier) external;
    
    /// @notice Update collection token name
    function updateName(string memory _tokenName) external;
    
    /// @notice Update collection token symbol
    function updateSymbol(string memory _tokenSymbol) external;
    
    /// @notice Set mid-swap flag for router restrictions
    function setMidSwap(bool value) external;
    
    /// @notice Check if currently in mid-swap
    function midSwap() external view returns (bool);
    
    /// @notice Get current accumulated fees
    function currentFees() external view returns (uint256);
    
    /// @notice Get collection owner
    function owner() external view returns (address);
}

/**
 * @title IFeeHookFactory
 * @notice Interface for the FeeHook factory contract
 */
interface IFeeHookFactory {
    /// @notice Check if currently loading liquidity
    function loadingLiquidity() external view returns (bool);
    
    /// @notice Check if deployer is buying (for fee exemptions)
    function deployerBuying() external view returns (bool);
    
    /// @notice Get factory owner
    function owner() external view returns (address);
    
    /// @notice Set router validity status
    function setRouter(address _router, bool status) external;
    
    /// @notice Get NFT strategy address for a collection
    function collectionToNFTStrategy(address collection) external view returns (address);
    
    /// @notice Get collection address for an NFT strategy
    function nftStrategyToCollection(address strategy) external view returns (address);
    
    /// @notice Check if router restrictions are enabled
    function routerRestrict() external view returns (bool);
    
    /// @notice Set router restriction status
    function setRouterRestrict(bool status) external;
    
    /// @notice Validate if a transfer is allowed under router restrictions
    function validTransfer(address to, address from, address tokenAddress) external view returns (bool);
    
    /// @notice Register a new collection
    function registerCollection(address collection, address strategy) external;
    
    /// @notice Get deployed hook address
    function getHook() external view returns (address);
    
    /// @notice Check if hook is deployed
    function isHookDeployed() external view returns (bool);
}

/**
 * @title IFeeHook
 * @notice Interface for the FeeHook contract
 */
interface IFeeHook {
    /// @notice Update fee address for a specific collection
    function adminUpdateFeeAddress(address collection, address destination) external;
    
    /// @notice Set treasury address
    function setTreasury(address _treasury) external;
    
    /// @notice Set factory address
    function setFactory(address _factory) external;
    
    /// @notice Transfer ownership
    function transferOwnership(address _newOwner) external;
    
    /// @notice Check if pool is authorized
    function isPoolAuthorized(PoolId poolId) external view returns (bool);
    
    /// @notice Get collection address for a pool
    function getCollectionForPool(PoolId poolId) external view returns (address);
    
    /// @notice Get pool ID for a collection
    function getPoolForCollection(address collection) external view returns (PoolId);
    
    /// @notice Get hook permissions
    function getHookPermissions() external pure returns (Hooks.Permissions memory);
    
    /// @notice Get treasury address
    function treasury() external view returns (address);
    
    /// @notice Get owner address
    function owner() external view returns (address);
    
    /// @notice Get factory address
    function factory() external view returns (address);
    
    /// @notice Get custom fee address claimed by collection owner
    function feeAddressClaimedByOwner(address collection) external view returns (address);
}

/**
 * @title IUniversalRouter
 * @notice Interface for Uniswap Universal Router
 */
interface IUniversalRouter {
    /// @notice Thrown when a required command has failed
    error ExecutionFailed(uint256 commandIndex, bytes message);

    /// @notice Thrown when attempting to send ETH directly to the contract
    error ETHNotAccepted();

    /// @notice Thrown when executing commands with an expired deadline
    error TransactionDeadlinePassed();

    /// @notice Thrown when attempting to execute commands and an incorrect number of inputs are provided
    error LengthMismatch();

    /// @notice Thrown when an address that isn't WETH tries to send ETH to the router without calldata
    error InvalidEthSender();

    /// @notice Executes encoded commands along with provided inputs. Reverts if deadline has expired.
    /// @param commands A set of concatenated commands, each 1 byte in length
    /// @param inputs An array of byte strings containing abi encoded inputs for each command
    /// @param deadline The deadline by which the transaction must be executed
    function execute(bytes calldata commands, bytes[] calldata inputs, uint256 deadline) external payable;
}

/**
 * @title IValidRouter
 * @notice Interface for router validation
 */
interface IValidRouter {
    /// @notice Get the actual message sender
    function msgSender() external view returns (address);
}

/**
 * @title IRestrictedToken
 * @notice Interface for restricted tokens used in fee hook pools
 */
interface IRestrictedToken {
    /// @notice Set mid-swap flag to prevent unauthorized transfers during swaps
    function setMidSwap(bool value) external;
    
    /// @notice Check if currently in mid-swap
    function midSwap() external view returns (bool);
    
    /// @notice Set the pool manager address
    function setPoolManager(address _poolManager) external;
    
    /// @notice Set the authorized hook address
    function setHook(address _hook) external;
    
    /// @notice Set the swap router address
    function setSwapRouter(address _router) external;
    
    /// @notice Add/remove addresses from whitelist
    function setWhitelist(address account, bool status) external;
    
    /// @notice Enable/disable trading
    function setTradingEnabled(bool _status) external;
    
    /// @notice Check if an address is whitelisted
    function checkWhitelist(address account) external view returns (bool);
    
    /// @notice Get restriction status
    function getRestrictionStatus() external view returns (
        bool _tradingEnabled,
        bool _restrictionActive,
        address _poolManager,
        address _hook,
        address _router
    );
    
    /// @notice Get token owner
    function owner() external view returns (address);
}

/**
 * @title ExactInputSingleParams
 * @notice Parameters for exact input single swap
 */
struct ExactInputSingleParams {
    PoolKey poolKey;
    bool zeroForOne;
    uint128 amountIn;
    uint128 amountOutMinimum;
    bytes hookData;
}
