// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;
import {BaseHook} from "@uniswap/v4-periphery/src/utils/BaseHook.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {SafeCast} from "@uniswap/v4-core/src/libraries/SafeCast.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {CurrencySettler} from "@uniswap/v4-core/test/utils/CurrencySettler.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {SafeTransferLib} from "solady/src/utils/SafeTransferLib.sol";
import {RestrictedToken} from "../RestrictedToken.sol";
import {ReentrancyGuard} from "solady/src/utils/ReentrancyGuard.sol";
import {ModifyLiquidityParams, SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import "./Interfaces.sol";

/// @title NFTStrategyHook - Uniswap V4 Hook for NFTStrategy
contract NFTStrategyHook is BaseHook, ReentrancyGuard {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;
    using CurrencySettler for Currency;
    using SafeCast for uint256;
    using SafeCast for int128;

    /*                      CONSTANTS                      */

    uint128 private constant TOTAL_BIPS = 10000;
    uint128 private constant DEFAULT_FEE = 1500;
    uint128 private constant STARTING_BUY_FEE = 9500;
    uint160 private constant MAX_PRICE_LIMIT = TickMath.MAX_SQRT_PRICE - 1;
    uint160 private constant MIN_PRICE_LIMIT = TickMath.MIN_SQRT_PRICE + 1;

    RestrictedToken immutable restrictedToken;
    INFTStrategyFactory public nftStrategyFactory;
    IPoolManager public manager;
    address public feeAddress;

    /*                   STATE VARIABLES                   */

    mapping(address => uint256) public deploymentBlock;
    mapping(address => address) public feeAddressClaimedByOwner;

    /*                    CUSTOM ERRORS                    */

    error NotNFTStrategy();
    error NotNFTStrategyFactoryOwner();
    error InvalidCollection();
    error NotCollectionOwner();

    /*                    CUSTOM EVENTS                    */

    event HookFee(bytes32 indexed id, address indexed sender, uint128 feeAmount0, uint128 feeAmount1);
    event Trade(address indexed nftStrategy, uint160 sqrtPriceX96, int128 ethAmount, int128 tokenAmount);

    /*                     CONSTRUCTOR                     */

    constructor(
        IPoolManager _poolManager,
        RestrictedToken _restrictedToken,
        INFTStrategyFactory _nftStrategyFactory,
        address _feeAddress
    ) BaseHook(_poolManager) {
        manager = _poolManager;
        restrictedToken = _restrictedToken;
        nftStrategyFactory = _nftStrategyFactory;
        feeAddress = _feeAddress;
    }

    /*                     FUNCTIONS                       */


    function setNFTStrategyFactory(address _nftStrategyFactory) external {
        if (msg.sender != nftStrategyFactory.owner()) revert NotNFTStrategyFactoryOwner();
        nftStrategyFactory = INFTStrategyFactory(_nftStrategyFactory);
    }

    function setpoolmanager(address _poolManager) external {
        if (msg.sender != nftStrategyFactory.owner()) revert NotNFTStrategyFactoryOwner();
        manager = IPoolManager(_poolManager);
    }

    function updateFeeAddress(address _feeAddress) external {
        if (msg.sender != nftStrategyFactory.owner()) revert NotNFTStrategyFactoryOwner();
        feeAddress = _feeAddress;
    }

    function updateFeeAddressForCollection(address nftStrategy, address destination) external {
        address collection = nftStrategyFactory.nftStrategyToCollection(nftStrategy);
        if (collection == address(0)) revert InvalidCollection();
        if (IERC721(collection).owner() != msg.sender) revert NotCollectionOwner();
        feeAddressClaimedByOwner[nftStrategy] = destination;
    }

    function adminUpdateFeeAddress(address nftStrategy, address destination) external {
        if (msg.sender != nftStrategyFactory.owner() && msg.sender != address(nftStrategyFactory)) revert NotNFTStrategyFactoryOwner();        
        feeAddressClaimedByOwner[nftStrategy] = destination;
    }
 
    function _processFees(address collection, uint256 feeAmount) internal {
        if (feeAmount == 0) return;
        
        uint256 depositAmount = (feeAmount * 990) / 1000;
        uint256 restrictedTokenAmount = 0;
        uint256 ownerAmount = feeAmount - depositAmount - restrictedTokenAmount;

        INFTStrategy(collection).addFees{value: depositAmount}();
        
        if (restrictedTokenAmount > 0) {
            SafeTransferLib.forceSafeTransferETH(address(nftStrategyFactory), restrictedTokenAmount);
        }
        
        SafeTransferLib.forceSafeTransferETH(feeAddressClaimedByOwner[collection] == address(0) ? feeAddress : feeAddressClaimedByOwner[collection], ownerAmount);
    }

    function calculateFee(address collection, bool isBuying) public view returns (uint128) {
        if (!isBuying) return DEFAULT_FEE;
        if(nftStrategyFactory.deployerBuying()) return 0;

        uint256 deployedAt = deploymentBlock[collection];
        if (deployedAt == 0) return DEFAULT_FEE;

        uint256 blocksPassed = block.number - deployedAt;
        uint256 feeReductions = (blocksPassed / 5) * 100;

        uint256 maxReducible = STARTING_BUY_FEE - DEFAULT_FEE;
        if (feeReductions >= maxReducible) return DEFAULT_FEE;

        return uint128(STARTING_BUY_FEE - feeReductions);
    }

    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: true,
            afterInitialize: false,
            beforeAddLiquidity: true,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: false,
            beforeSwap: true,
            afterSwap: true,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: false,
            afterSwapReturnDelta: true,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    function _beforeInitialize(address, PoolKey calldata key, uint160)
        internal
        override
        returns (bytes4)
    {        
        if(!nftStrategyFactory.loadingLiquidity()) {
            revert NotNFTStrategy();
        }

        address collection = Currency.unwrap(key.currency1);
        deploymentBlock[collection] = block.number;
        
        return BaseHook.beforeInitialize.selector;
    }

    function _beforeAddLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        internal
        view
        override
        returns (bytes4)
    {        
        if(!nftStrategyFactory.loadingLiquidity()) {
            revert NotNFTStrategy();
        }
        return BaseHook.beforeAddLiquidity.selector;
    }

    function _beforeSwap(
        address,
        PoolKey calldata key,
        SwapParams calldata,
        bytes calldata
    ) internal override returns (bytes4, BeforeSwapDelta, uint24) {
        if (nftStrategyFactory.routerRestrict()) {
            INFTStrategy(Currency.unwrap(key.currency1)).setMidSwap(true);
        }
        return (BaseHook.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
    }

    function _afterSwap(
        address sender,
        PoolKey calldata key,
        SwapParams calldata params,
        BalanceDelta delta,
        bytes calldata
    ) internal override returns (bytes4, int128) {
        bool specifiedTokenIs0 = (params.amountSpecified < 0 == params.zeroForOne);
        (Currency feeCurrency, int128 swapAmount) =
            (specifiedTokenIs0) ? (key.currency1, delta.amount1()) : (key.currency0, delta.amount0());

        if (swapAmount < 0) swapAmount = -swapAmount;

        bool ethFee = Currency.unwrap(feeCurrency) == address(0);
        address collection = Currency.unwrap(key.currency1);

        uint128 currentFee = calculateFee(collection, params.zeroForOne);
        uint256 feeAmount = uint128(swapAmount) * currentFee / TOTAL_BIPS;

        if(feeAmount == 0) {
            return (BaseHook.afterSwap.selector, 0);
        }

        manager.take(feeCurrency, address(this), feeAmount);

        emit HookFee(
            PoolId.unwrap(key.toId()),
            sender,
            ethFee ? uint128(feeAmount) : 0,
            ethFee ? 0 : uint128(feeAmount)
        );

        if (!ethFee) {
            uint256 feeInETH = _swapToEth(key, feeAmount);
            _processFees(collection, feeInETH); 
        } else {
            _processFees(collection, feeAmount); 
        }

        emit Trade(collection, _getCurrentPrice(key), delta.amount0(), delta.amount1());

        if (nftStrategyFactory.routerRestrict()) {
            INFTStrategy(Currency.unwrap(key.currency1)).setMidSwap(false);
        }
        return (BaseHook.afterSwap.selector, feeAmount.toInt128());
    }

    function _swapToEth(PoolKey memory key, uint256 amount) internal returns (uint256) {
        uint256 ethBefore = address(this).balance;
        
        BalanceDelta delta = manager.swap(
            key,
            SwapParams({
                zeroForOne: false,
                amountSpecified: -int256(amount),
                sqrtPriceLimitX96: MAX_PRICE_LIMIT
            }),
            bytes("")
        );

        if (delta.amount0() < 0) {
            key.currency0.settle(poolManager, address(this), uint256(int256(-delta.amount0())), false);
        } else if (delta.amount0() > 0) {
            key.currency0.take(poolManager, address(this), uint256(int256(delta.amount0())), false);
        }

        if (delta.amount1() < 0) {
            key.currency1.settle(poolManager, address(this), uint256(int256(-delta.amount1())), false);
        } else if (delta.amount1() > 0) {
            key.currency1.take(poolManager, address(this), uint256(int256(delta.amount1())), false);
        }

        return address(this).balance - ethBefore;
    }

    function _getCurrentPrice(PoolKey calldata key) internal view returns (uint160) {
        (uint160 sqrtPriceX96,,,) = poolManager.getSlot0(key.toId());
        return sqrtPriceX96;
    }

    receive() external payable {}
}
