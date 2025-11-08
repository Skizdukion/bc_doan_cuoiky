// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title VNDC Token
 * @dev ERC20 token with minting, burning, pausing capabilities
 * @notice Non-upgradeable token for ICO-ready cryptocurrency
 */
contract VNDC is ERC20, ERC20Burnable, Ownable, Pausable, ReentrancyGuard {
    /**
     * @dev Constructor that sets token name and symbol
     * @notice Initial supply is 0, tokens will be minted through ICO/Vesting/Reserve
     */
    constructor() ERC20("VNDC Token", "VNDC") {
        // No initial mint - all tokens minted through ICO/Vesting/Reserve
    }

    /**
     * @dev Mint new tokens to specified address
     * @param to Address to mint tokens to
     * @param amount Amount of tokens to mint
     * @notice Only owner can mint tokens
     */
    function mint(address to, uint256 amount) public onlyOwner whenNotPaused {
        _mint(to, amount);
        emit TokensMinted(to, amount);
    }

    /**
     * @dev Batch mint tokens to multiple addresses
     * @param recipients Array of recipient addresses
     * @param amounts Array of amounts to mint (should match recipients length)
     * @notice Only owner can mint tokens
     */
    function batchMint(address[] calldata recipients, uint256[] calldata amounts) 
        external 
        onlyOwner 
        whenNotPaused 
    {
        require(recipients.length == amounts.length, "VNDC: Arrays length mismatch");
        
        for (uint256 i = 0; i < recipients.length; i++) {
            _mint(recipients[i], amounts[i]);
        }
        
        emit BatchMint(recipients, amounts);
    }

    /**
     * @dev Pause all token transfers
     * @notice Only owner can pause
     */
    function pause() public onlyOwner {
        _pause();
    }

    /**
     * @dev Unpause all token transfers
     * @notice Only owner can unpause
     */
    function unpause() public onlyOwner {
        _unpause();
    }

    /**
     * @dev Override transfer functions to include pause check
     */
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override whenNotPaused {
        super._beforeTokenTransfer(from, to, amount);
    }

    /**
     * @dev Events
     */
    event TokensMinted(address indexed to, uint256 amount);
    event BatchMint(address[] recipients, uint256[] amounts);
}

