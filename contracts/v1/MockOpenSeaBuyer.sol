// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./OpenSeaPort.sol";

interface IOpenSeaNFTBuyer {
    function buyNFTBasic(BasicOrderParameters calldata parameters) external payable;
}

/// @notice Simple mock that simulates OpenSea purchases for local testing
contract MockOpenSeaBuyer is IOpenSeaNFTBuyer {
    event MockPurchase(
        address indexed buyer,
        address indexed seller,
        address indexed collection,
        uint256 tokenId,
        uint256 price
    );

    function buyNFTBasic(BasicOrderParameters calldata parameters) external payable override {
        address seller = parameters.offerer;
        IERC721(parameters.offerToken).transferFrom(
            seller,
            msg.sender,
            parameters.offerIdentifier
        );

        emit MockPurchase(
            msg.sender,
            seller,
            parameters.offerToken,
            parameters.offerIdentifier,
            msg.value
        );
    }
}

