// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title HorrisOwnable2Step
/// @notice Minimal two-step ownership transfer used by Horris policy/admin contracts.
abstract contract HorrisOwnable2Step {
    address public owner;
    address public pendingOwner;

    event OwnershipTransferStarted(address indexed previousOwner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "NOT_OWNER");
        _;
    }

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    function proposeOwner(address nextOwner) external onlyOwner {
        require(nextOwner != address(0), "ZERO_OWNER");
        require(nextOwner != owner, "SAME_OWNER");
        pendingOwner = nextOwner;
        emit OwnershipTransferStarted(owner, nextOwner);
    }

    function cancelOwnershipTransfer() external onlyOwner {
        require(pendingOwner != address(0), "NO_PENDING_OWNER");
        pendingOwner = address(0);
        emit OwnershipTransferStarted(owner, address(0));
    }

    function acceptOwnership() external {
        address nextOwner = pendingOwner;
        require(msg.sender == nextOwner && nextOwner != address(0), "NOT_PENDING_OWNER");
        address previousOwner = owner;
        owner = nextOwner;
        pendingOwner = address(0);
        emit OwnershipTransferred(previousOwner, nextOwner);
    }
}
