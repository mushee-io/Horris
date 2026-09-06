// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../contracts/HorrisUpDownAuthorization.sol";

contract HorrisUpDownAuthorizationAdminTest {
    HorrisUpDownAuthorization authorization;
    address constant INITIAL_AUTHORIZER = address(0xA11CE);
    address constant NEXT_AUTHORIZER = address(0xB0B);

    constructor() {
        authorization = new HorrisUpDownAuthorization(
            INITIAL_AUTHORIZER,
            address(0x1001),
            address(0x1002)
        );
    }

    function testAuthorizerCanBeRotated() public {
        authorization.setAuthorizer(NEXT_AUTHORIZER);
        require(authorization.authorizer() == NEXT_AUTHORIZER, "authorizer not rotated");
    }

    function testNonceCanBeInvalidatedBeforeUse() public {
        authorization.invalidateNonce(42);
        require(authorization.usedNonces(42), "nonce not invalidated");
    }

    function testCannotInvalidateSameNonceTwice() public {
        authorization.invalidateNonce(43);
        (bool ok,) = address(authorization).call(abi.encodeCall(authorization.invalidateNonce, (43)));
        require(!ok, "duplicate invalidation should revert");
    }

    function testZeroAuthorizerRejected() public {
        (bool ok,) = address(authorization).call(abi.encodeCall(authorization.setAuthorizer, (address(0))));
        require(!ok, "zero authorizer should revert");
    }
}
