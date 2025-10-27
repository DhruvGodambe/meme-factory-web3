// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC721} from "solady/src/tokens/ERC721.sol";
import {Ownable} from "solady/src/auth/Ownable.sol";
import {LibString} from "solady/src/utils/LibString.sol";

/**
 * @title FakeNFTCollection
 * @notice A simple ERC721 collection for testing NFTStrategy contracts
 * @dev Pre-mints some NFTs for testing purposes
 */
contract FakeNFTCollection is ERC721, Ownable {
    using LibString for uint256;

    uint256 private _nextTokenId;
    string private _baseTokenURI;
    string private _name;
    string private _symbol;
    uint256 public constant MAX_SUPPLY = 1000;
    uint256 public constant PRE_MINT_COUNT = 10; // Pre-mint 10 NFTs for testing

    event NFTMinted(address indexed to, uint256 indexed tokenId);

    error MaxSupplyReached();
    error InvalidTokenId();
    error NotOwnerOrApproved();

    constructor(string memory collectionName, string memory collectionSymbol, string memory baseTokenURI) {
        _initializeOwner(msg.sender);
        _name = collectionName;
        _symbol = collectionSymbol;
        _baseTokenURI = baseTokenURI;
        
        // Pre-mint some NFTs for testing
        _preMintNFTs();
    }

    /**
     * @notice Pre-mints a set number of NFTs to the contract owner
     * @dev Called during construction to provide test NFTs
     */
    function _preMintNFTs() internal {
        for (uint256 i = 0; i < PRE_MINT_COUNT; i++) {
            _mint(msg.sender, _nextTokenId);
            _nextTokenId++;
        }
    }

    /**
     * @notice Mints a new NFT to the specified address
     * @param to The address to mint the NFT to
     * @return tokenId The ID of the minted NFT
     */
    function mint(address to) external onlyOwner returns (uint256) {
        if (_nextTokenId >= MAX_SUPPLY) revert MaxSupplyReached();
        
        uint256 tokenId = _nextTokenId;
        _mint(to, tokenId);
        _nextTokenId++;
        
        emit NFTMinted(to, tokenId);
        return tokenId;
    }

    /**
     * @notice Mints multiple NFTs to the specified address
     * @param to The address to mint the NFTs to
     * @param count The number of NFTs to mint
     */
    function mintBatch(address to, uint256 count) external onlyOwner {
        if (_nextTokenId + count > MAX_SUPPLY) revert MaxSupplyReached();
        
        for (uint256 i = 0; i < count; i++) {
            _mint(to, _nextTokenId);
            emit NFTMinted(to, _nextTokenId);
            _nextTokenId++;
        }
    }

    /**
     * @notice Sets the base URI for token metadata
     * @param newBaseURI The new base URI
     */
    function setBaseURI(string memory newBaseURI) external onlyOwner {
        _baseTokenURI = newBaseURI;
    }

    /**
     * @notice Returns the name of the token collection
     */
    function name() public view override returns (string memory) {
        return _name;
    }

    /**
     * @notice Returns the symbol of the token collection
     */
    function symbol() public view override returns (string memory) {
        return _symbol;
    }

    /**
     * @notice Returns the total number of tokens minted
     */
    function totalSupply() public view returns (uint256) {
        return _nextTokenId;
    }

    /**
     * @notice Returns the next token ID that will be minted
     */
    function nextTokenId() public view returns (uint256) {
        return _nextTokenId;
    }

    /**
     * @notice Returns the token URI for a given token ID
     * @param tokenId The token ID
     * @return The token URI
     */
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        if (!_exists(tokenId)) revert InvalidTokenId();
        return string(abi.encodePacked(_baseTokenURI, tokenId.toString()));
    }

    /**
     * @notice Checks if a token exists
     * @param tokenId The token ID to check
     * @return True if the token exists
     */
    function _exists(uint256 tokenId) internal view override returns (bool) {
        return tokenId < _nextTokenId;
    }

    /**
     * @notice Returns the base URI
     */
    function baseURI() public view returns (string memory) {
        return _baseTokenURI;
    }

    /**
     * @notice Returns the number of pre-minted tokens
     */
    function getPreMintCount() public pure returns (uint256) {
        return PRE_MINT_COUNT;
    }

    /**
     * @notice Returns the maximum supply
     */
    function getMaxSupply() public pure returns (uint256) {
        return MAX_SUPPLY;
    }

    /**
     * @notice Allows the contract to receive ETH
     */
    receive() external payable {}
}
