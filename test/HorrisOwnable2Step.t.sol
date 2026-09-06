// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../contracts/HorrisOwnable2Step.sol";

interface VmOwner {
    function prank(address sender) external;
}

contract OwnableHarness is HorrisOwnable2Step {
    uint256 public value;
    function setValue(uint256 next) external onlyOwner { value = next; }
}

contract HorrisOwnable2StepTest {
    VmOwner constant vm = VmOwner(address(uint160(uint256(keccak256("hevm cheat code")))));
    address constant NEXT_OWNER = address(0xBEEF);
    address constant OTHER = address(0xCAFE);

    OwnableHarness harness;

    constructor() {
        harness = new OwnableHarness();
    }

    function testOwnerCanProposeAndPendingOwnerAccepts() public {
        harness.proposeOwner(NEXT_OWNER);
        require(harness.pendingOwner() == NEXT_OWNER, "pending owner");
        vm.prank(NEXT_OWNER);
        harness.acceptOwnership();
        require(harness.owner() == NEXT_OWNER, "owner not transferred");
        require(harness.pendingOwner() == address(0), "pending owner not cleared");
    }

    function testUnauthorizedAcceptanceReverts() public {
        harness.proposeOwner(NEXT_OWNER);
        vm.prank(OTHER);
        (bool ok,) = address(harness).call(abi.encodeCall(harness.acceptOwnership, ()));
        require(!ok, "unauthorized accept should revert");
    }

    function testOwnerCanCancelPendingTransfer() public {
        harness.proposeOwner(NEXT_OWNER);
        harness.cancelOwnershipTransfer();
        require(harness.pendingOwner() == address(0), "pending owner not cancelled");
        vm.prank(NEXT_OWNER);
        (bool ok,) = address(harness).call(abi.encodeCall(harness.acceptOwnership, ()));
        require(!ok, "cancelled owner should not accept");
    }

    function testOldOwnerLosesAdminAfterAcceptance() public {
        harness.proposeOwner(NEXT_OWNER);
        vm.prank(NEXT_OWNER);
        harness.acceptOwnership();
        (bool ok,) = address(harness).call(abi.encodeCall(harness.setValue, (1)));
        require(!ok, "old owner retained admin");
        vm.prank(NEXT_OWNER);
        harness.setValue(2);
        require(harness.value() == 2, "new owner cannot administer");
    }
}
