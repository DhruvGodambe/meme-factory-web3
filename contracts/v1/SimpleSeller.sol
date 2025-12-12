// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Minimal ERC721 interface for transferring tokens
interface IERC721Minimal {
    function safeTransferFrom(address from, address to, uint256 tokenId) external;
}

/// @title SimpleSeller
/// @notice Minimal seller contract to interoperate with NFTStrategy.buyTargetNFT
/// @dev Designed so NFTStrategy can call this contract with ETH and empty data ("")
///      via `target.call{value: value}("")`. On receiving ETH from the strategy,
///      this contract transfers the preconfigured NFT to the strategy and forwards
///      the funds to the seller EOA. Seller must approve this contract for the token
///      (or pre-escrow the NFT to this contract and update logic accordingly if desired).
contract SimpleSeller {
    IERC721Minimal public immutable collection;
    address public immutable seller;
    address public immutable strategy;
    uint256 public immutable tokenId;
    uint256 public immutable price; // in wei

    error NotStrategy();
    error WrongPrice();

    constructor(
        address collectionAddress,
        address sellerAddress,
        address strategyAddress,
        uint256 tokenIdToSell,
        uint256 priceWei
    ) {
        collection = IERC721Minimal(collectionAddress);
        seller = sellerAddress;
        strategy = strategyAddress;
        tokenId = tokenIdToSell;
        price = priceWei;
    }

    /// @notice Receives ETH from the NFTStrategy and completes the sale.
    /// @dev NFTStrategy calls `target.call{value: price}("")`, which lands here.
    receive() external payable {
        if (msg.sender != strategy) revert NotStrategy();
        if (msg.value != price) revert WrongPrice();

        // Transfer NFT from the seller (requires prior approval) to the strategy (msg.sender)
        collection.safeTransferFrom(seller, msg.sender, tokenId);

        // Forward funds to the seller
        (bool ok, ) = seller.call{value: msg.value}("");
        require(ok, "Payout failed");
    }
}


