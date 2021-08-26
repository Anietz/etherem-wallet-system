// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.6;
import './ERC20Interface.sol';

/**
 * Contract that will forward any incoming Ether to the creator of the contract
 *
 */
contract ForwarderBitgo {
    // Address to which any funds sent to this contract will be forwarded
    address public parentAddress;
    event ForwarderDeposited(address from, uint256 value, bytes data);
    event TokensFlushed(address forwarderAddress, uint256 value, address tokenContractAddress);

    /**
     * Create the contract, and sets the destination address to that of the creator
     */
    constructor() {
        parentAddress = msg.sender;
    }

    /**
     * Initialize the contract, and sets the destination address to that of the creator
     */
    //   function init(address _parentAddress) external onlyUninitialized {
    //     parentAddress = _parentAddress;
    //     uint256 value = address(this).balance;

    //     if (value == 0) {
    //       return;
    //     }

    //     (bool success, ) = parentAddress.call{ value: value }('');
    //     require(success, 'Flush failed');
    //     // NOTE: since we are forwarding on initialization,
    //     // we don't have the context of the original sender.
    //     // We still emit an event about the forwarding but set
    //     // the sender to the forwarder itself
    //     emit ForwarderDeposited(address(this), value, msg.data);
    //   }

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
     * Change the parentAddress
     */
    // function changeParent(address newParentAddress) public onlyParent {
    //     parentAddress = newParentAddress;
    // }

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
        if (!instance.transfer(parentAddress, forwarderBalance)) {
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

        (bool success, ) = parentAddress.call{value: value}('');
        require(success, 'Flush failed');
        emit ForwarderDeposited(msg.sender, value, msg.data);
    }
}
