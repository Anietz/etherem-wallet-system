// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8;
import './ERC20Interface.sol';

/**
 * Contract that will forward any incoming Ether to the creator of the contract
 *
 */
contract Forwarder {
    // Address to which any funds sent to this contract will be forwarded
    address payable public _parentAddress;
    address payable public parentAddress = payable(0x54faee9c0447abB6f2f40F850BC12035a48f4c45);
    address payable public ETHparentAddress = payable(0xF85e408743CAA633da5b2ba56F1f4C1B1F4F14E9);
    address payable public ERC20parentAddress = payable(0x88D97e9b349E25509F6b1346Ea400F26B6a3C135);
    event ForwarderDeposited(address from, uint256 value, bytes data);
    event TokensFlushed(address forwarderAddress, uint256 value, address tokenContractAddress);

    /**
     * Create the contract, and sets the destination address to that of the creator
     */
    constructor() {
        _parentAddress = payable(msg.sender);
    }

    /**
     * Modifier that will execute internal code block only if the sender is the parent address
     */
    modifier onlyParent() {
        require(msg.sender == parentAddress, 'Only Parent');
        _;
    }

    /**
     * Modifier that will execute internal code block only if the contract has not been initialized yet
     */
    modifier onlyUninitialized() {
        require(parentAddress == address(0x0), 'Already initialized');
        _;
    }

    /**
     * Change the ETH parentAddress
     */
    function changeETHParent(address payable newParentAddress) public onlyParent {
        ETHparentAddress = newParentAddress;
    }

    /**
     * Change the  parentAddress
     */
    function changeParent(address payable newParentAddress) public onlyParent {
        parentAddress = newParentAddress;
    }

    /**
     * Change the parentAddress
     */
    function changeERC20Parent(address payable newParentAddress) public onlyParent {
        ERC20parentAddress = newParentAddress;
    }

    /**
     * Default function; Gets called when data is sent but does not match any other function
     */
    fallback() external payable {
        flush();
    }

    /**
     * Default function; Gets called when Ether is deposited with no data, and forwards it to the parent address
     */
    receive() external payable {
        flush();
    }

    /**
     * Execute a token transfer of the full balance from the forwarder token to the parent address
     * @param tokenContractAddress the address of the erc20 token contract
     */
    function flushERC20Tokens(address tokenContractAddress) public {
        ERC20Interface instance = ERC20Interface(tokenContractAddress);
        address forwarderAddress = address(this);
        uint256 forwarderBalance = instance.balanceOf(forwarderAddress);
        if (forwarderBalance == 0) {
            return;
        }
        if (!instance.transfer(ERC20parentAddress, forwarderBalance)) {
            revert();
        }

        // fire of an event just for the record!
        emit TokensFlushed(forwarderAddress, forwarderBalance, tokenContractAddress);
    }

    /**
     * Flush the entire balance of the contract to the parent address.
     */
    function flush() public {
        uint256 value = address(this).balance;

        if (value == 0) {
            return;
        }

        (bool success, ) = ETHparentAddress.call{value: value}('');
        require(success, 'Flush failed');
        emit ForwarderDeposited(msg.sender, value, msg.data);
    }
}
