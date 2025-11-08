[dotenv@17.2.3] injecting env (0) from .env -- tip: ⚙️  suppress all logs with { quiet: true }
// Sources flattened with hardhat v2.26.3 https://hardhat.org

// SPDX-License-Identifier: MIT

// File contracts/amock/OpenSeaPort.sol

// Original license: SPDX_License_Identifier: MIT
pragma solidity ^0.8.17;

/**
 * @title OpenSeaNFTBuyer - Base Network
 * @notice Contract to buy NFTs from OpenSea marketplace on Base using Seaport protocol
 * @dev This contract interacts with Seaport 1.5 deployed at 0x00000000000000ADc04C56Bf30aC9d3c0aAF14dC on Base (Chain ID: 8453)
 */

// Seaport Order Types and Structs
enum ItemType {
    NATIVE,
    ERC20,
    ERC721,
    ERC1155,
    ERC721_WITH_CRITERIA,
    ERC1155_WITH_CRITERIA
}

enum OrderType {
    FULL_OPEN,
    PARTIAL_OPEN,
    FULL_RESTRICTED,
    PARTIAL_RESTRICTED,
    CONTRACT
}

struct OfferItem {
    ItemType itemType;
    address token;
    uint256 identifierOrCriteria;
    uint256 startAmount;
    uint256 endAmount;
}

struct ConsiderationItem {
    ItemType itemType;
    address token;
    uint256 identifierOrCriteria;
    uint256 startAmount;
    uint256 endAmount;
    address payable recipient;
}

struct OrderParameters {
    address offerer;
    address zone;
    OfferItem[] offer;
    ConsiderationItem[] consideration;
    OrderType orderType;
    uint256 startTime;
    uint256 endTime;
    bytes32 zoneHash;
    uint256 salt;
    bytes32 conduitKey;
    uint256 totalOriginalConsiderationItems;
}

struct Order {
    OrderParameters parameters;
    bytes signature;
}

struct AdvancedOrder {
    OrderParameters parameters;
    uint120 numerator;
    uint120 denominator;
    bytes signature;
    bytes extraData;
}

struct CriteriaResolver {
    uint256 orderIndex;
    uint256 side; // 0 for offer, 1 for consideration
    uint256 index;
    uint256 identifier;
    bytes32[] criteriaProof;
}

struct SpentItem {
    ItemType itemType;
    address token;
    uint256 identifier;
    uint256 amount;
}

struct ReceivedItem {
    ItemType itemType;
    address token;
    uint256 identifier;
    uint256 amount;
    address payable recipient;
}

// Seaport Interface
interface ISeaport {
    function fulfillOrder(Order calldata order, bytes32 fulfillerConduitKey)
        external
        payable
        returns (bool fulfilled);

    function fulfillAdvancedOrder(
        AdvancedOrder calldata advancedOrder,
        CriteriaResolver[] calldata criteriaResolvers,
        bytes32 fulfillerConduitKey,
        address recipient
    ) external payable returns (bool fulfilled);

    function fulfillBasicOrder(BasicOrderParameters calldata parameters)
        external
        payable
        returns (bool fulfilled);

    function getOrderHash(OrderComponents calldata order)
        external
        view
        returns (bytes32 orderHash);

    function getOrderStatus(bytes32 orderHash)
        external
        view
        returns (
            bool isValidated,
            bool isCancelled,
            uint256 totalFilled,
            uint256 totalSize
        );

    event OrderFulfilled(
        bytes32 orderHash,
        address indexed offerer,
        address indexed zone,
        address recipient,
        SpentItem[] offer,
        ReceivedItem[] consideration
    );
}

struct OrderComponents {
    address offerer;
    address zone;
    OfferItem[] offer;
    ConsiderationItem[] consideration;
    OrderType orderType;
    uint256 startTime;
    uint256 endTime;
    bytes32 zoneHash;
    uint256 salt;
    bytes32 conduitKey;
    uint256 counter;
}

struct BasicOrderParameters {
    address considerationToken;
    uint256 considerationIdentifier;
    uint256 considerationAmount;
    address payable offerer;
    address zone;
    address offerToken;
    uint256 offerIdentifier;
    uint256 offerAmount;
    uint8 basicOrderType;
    uint256 startTime;
    uint256 endTime;
    bytes32 zoneHash;
    uint256 salt;
    bytes32 offererConduitKey;
    bytes32 fulfillerConduitKey;
    uint256 totalOriginalAdditionalRecipients;
    AdditionalRecipient[] additionalRecipients;
    bytes signature;
}

struct AdditionalRecipient {
    uint256 amount;
    address payable recipient;
}

interface IERC721 {
    function ownerOf(uint256 tokenId) external view returns (address);
    function transferFrom(address from, address to, uint256 tokenId) external;
    function approve(address to, uint256 tokenId) external;
    function setApprovalForAll(address operator, bool approved) external;
}

interface IERC20 {
    function approve(address spender, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract OpenSeaNFTBuyer {
    // Seaport 1.6 address on Base Mainnet (Chain ID: 8453)
    // Same address as Ethereum, Optimism, Arbitrum, etc. due to cross-chain deployment
    address public constant SEAPORT_ADDRESS = 0x0000000000000068F116a894984e2DB1123eB395;
    ISeaport public immutable seaport;

    address public owner;

    // Base Chain ID for verification
    uint256 public constant BASE_CHAIN_ID = 8453;

    event NFTPurchased(
        address indexed buyer,
        address indexed nftContract,
        uint256 indexed tokenId,
        uint256 price,
        bytes32 orderHash
    );

    event OrderFulfilledEvent(
        bytes32 orderHash,
        address offerer,
        address recipient
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyBase() {
        require(block.chainid == BASE_CHAIN_ID, "Only Base network");
        _;
    }

    constructor() {
        seaport = ISeaport(SEAPORT_ADDRESS);
        owner = msg.sender;
    }

    /**
     * @notice Buy an NFT from OpenSea using a full order
     * @dev This function fulfills a complete Seaport order with ETH on Base
     * @param order The complete Seaport order to fulfill
     */
    function buyNFT(Order calldata order) external payable onlyBase {
        require(msg.value > 0, "Must send ETH");

        // Fulfill the order through Seaport
        // fulfillerConduitKey: bytes32(0) means no conduit, direct approval to Seaport
        bool fulfilled = seaport.fulfillOrder{value: msg.value}(
            order,
            bytes32(0) // No conduit key
        );

        require(fulfilled, "Order fulfillment failed");

        // Extract NFT info from order for event emission
        OrderParameters memory params = order.parameters;
        require(params.offer.length > 0, "No offer items");

        OfferItem memory nftItem = params.offer[0];
        
        emit NFTPurchased(
            msg.sender,
            nftItem.token,
            nftItem.identifierOrCriteria,
            msg.value,
            bytes32(0) // Order hash would need to be calculated
        );
    }

    /**
     * @notice Buy an NFT using an advanced order (supports partial fills and criteria)
     * @param advancedOrder The advanced order to fulfill
     * @param criteriaResolvers Array of criteria resolvers for trait-based orders
     * @param recipient Address to receive the NFT (use address(0) for msg.sender)
     */
    function buyNFTAdvanced(
        AdvancedOrder calldata advancedOrder,
        CriteriaResolver[] calldata criteriaResolvers,
        address recipient
    ) external payable onlyBase {
        require(msg.value > 0, "Must send ETH");

        // If recipient is 0, use msg.sender
        address actualRecipient = recipient == address(0) ? msg.sender : recipient;

        bool fulfilled = seaport.fulfillAdvancedOrder{value: msg.value}(
            advancedOrder,
            criteriaResolvers,
            bytes32(0), // No conduit key
            actualRecipient
        );

        require(fulfilled, "Advanced order fulfillment failed");

        OrderParameters memory params = advancedOrder.parameters;
        require(params.offer.length > 0, "No offer items");

        OfferItem memory nftItem = params.offer[0];
        
        emit NFTPurchased(
            actualRecipient,
            nftItem.token,
            nftItem.identifierOrCriteria,
            msg.value,
            bytes32(0)
        );
    }

    /**
     * @notice Buy NFT using simplified BasicOrder (most gas efficient for simple orders)
     * @param parameters BasicOrder parameters
     */
    function buyNFTBasic(BasicOrderParameters calldata parameters) external payable onlyBase {
        require(msg.value > 0, "Must send ETH");

        bool fulfilled = seaport.fulfillBasicOrder{value: msg.value}(parameters);

        require(fulfilled, "Basic order fulfillment failed");

        emit NFTPurchased(
            msg.sender,
            parameters.offerToken,
            parameters.offerIdentifier,
            msg.value,
            bytes32(0)
        );
    }

    /**
     * @notice Check if an order is still valid and can be fulfilled
     * @param orderHash The hash of the order to check
     */
    function checkOrderStatus(bytes32 orderHash)
        external
        view
        returns (
            bool isValidated,
            bool isCancelled,
            uint256 totalFilled,
            uint256 totalSize
        )
    {
        return seaport.getOrderStatus(orderHash);
    }

    /**
     * @notice Helper function to approve ERC20 token for Seaport spending
     * @param token The ERC20 token address
     * @param amount The amount to approve
     */
    function approveERC20(address token, uint256 amount) external onlyOwner {
        IERC20(token).approve(SEAPORT_ADDRESS, amount);
    }

    /**
     * @notice Helper function to approve ERC721 token for Seaport
     * @param token The ERC721 token address
     */
    function approveERC721(address token) external onlyOwner {
        IERC721(token).setApprovalForAll(SEAPORT_ADDRESS, true);
    }

    /**
     * @notice Withdraw ETH from contract
     */
    function withdrawETH() external onlyOwner {
        payable(owner).transfer(address(this).balance);
    }

    /**
     * @notice Withdraw ERC20 tokens from contract
     * @param token The token address
     */
    function withdrawERC20(address token) external onlyOwner {
        IERC20 tokenContract = IERC20(token);
        uint256 balance = tokenContract.balanceOf(address(this));
        require(balance > 0, "No tokens to withdraw");
        tokenContract.transfer(owner, balance);
    }

    /**
     * @notice Withdraw NFT from contract
     * @param token The NFT contract address
     * @param tokenId The token ID
     */
    function withdrawNFT(address token, uint256 tokenId) external onlyOwner {
        IERC721(token).transferFrom(address(this), owner, tokenId);
    }

    /**
     * @notice Transfer ownership
     * @param newOwner The new owner address
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid address");
        owner = newOwner;
    }

    /**
     * @notice Get current chain ID for verification
     */
    function getCurrentChainId() external view returns (uint256) {
        return block.chainid;
    }

    // Receive function to accept ETH
    receive() external payable {}

    // Fallback function
    fallback() external payable {}
}
