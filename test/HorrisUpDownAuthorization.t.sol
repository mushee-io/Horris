// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../contracts/HorrisPerpPolicy.sol";
import "../contracts/HorrisUpDownCalldataGuard.sol";
import "../contracts/HorrisUpDownAuthorization.sol";

interface VmAuth {
    function addr(uint256 privateKey) external returns (address);
    function sign(uint256 privateKey, bytes32 digest) external returns (uint8 v, bytes32 r, bytes32 s);
    function warp(uint256 timestamp) external;
}

contract HorrisUpDownAuthorizationTest {
    VmAuth constant vm = VmAuth(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 constant AUTHORIZER_KEY = 0xA11CE;

    address constant EXCHANGE_ROUTER = address(0x1001);
    address constant ORDER_VAULT = address(0x1002);
    address constant USDT = address(0x1003);
    address constant MARKET = address(0x2001);
    address constant RECEIVER = address(0x3001);
    bytes32 constant MARKET_ID = keccak256("BTC");

    HorrisPerpPolicy policy;
    HorrisUpDownCalldataGuard guard;
    HorrisUpDownAuthorization authorization;
    address authorizer;

    constructor() {
        authorizer = vm.addr(AUTHORIZER_KEY);
        HorrisPerpPolicy.Limits memory limits = HorrisPerpPolicy.Limits({
            maxLeverageBps: 50_000,
            maxAccountRiskBps: 200,
            maxMarginUtilizationBps: 3_500,
            maxNotionalUsdE18: 5_000e18
        });
        policy = new HorrisPerpPolicy(address(0), limits);
        policy.setMarket(MARKET_ID, true);

        guard = new HorrisUpDownCalldataGuard(EXCHANGE_ROUTER, ORDER_VAULT, USDT, 50_000, 5_000e30);
        guard.setMarket(MARKET, true);

        authorization = new HorrisUpDownAuthorization(authorizer, address(guard), address(policy));
        authorization.setMarketId(MARKET, MARKET_ID);
        policy.setAgent(address(authorization));
    }

    function _params(uint256 sizeUsdE30, uint256 collateralUsdt)
        internal pure returns (IUpDownExchangeRouterShape.CreateOrderParams memory params)
    {
        address[] memory swapPath = new address[](0);
        params = IUpDownExchangeRouterShape.CreateOrderParams({
            addresses: IUpDownExchangeRouterShape.OrderAddresses({
                receiver: RECEIVER,
                cancellationReceiver: address(0),
                callbackContract: address(0),
                uiFeeReceiver: address(0),
                market: MARKET,
                initialCollateralToken: USDT,
                swapPath: swapPath
            }),
            numbers: IUpDownExchangeRouterShape.OrderNumbers({
                sizeDeltaUsd: sizeUsdE30,
                initialCollateralDeltaAmount: collateralUsdt,
                triggerPrice: 0,
                acceptablePrice: 100_500e22,
                executionFee: 1 ether,
                callbackGasLimit: 0,
                minOutputAmount: 0,
                validFromTime: 0
            }),
            orderType: 2,
            decreasePositionSwapType: 0,
            isLong: true,
            shouldUnwrapNativeToken: false,
            autoCancel: false,
            referralCode: bytes32(0)
        });
    }

    function _multicall(uint256 sizeUsdE30, uint256 collateralUsdt)
        internal pure returns (bytes memory data)
    {
        IUpDownExchangeRouterShape.CreateOrderParams memory params = _params(sizeUsdE30, collateralUsdt);
        bytes[] memory calls = new bytes[](3);
        calls[0] = abi.encodeCall(IUpDownExchangeRouterShape.sendWnt, (ORDER_VAULT, 1 ether));
        calls[1] = abi.encodeCall(IUpDownExchangeRouterShape.sendTokens, (USDT, ORDER_VAULT, collateralUsdt));
        calls[2] = abi.encodeCall(IUpDownExchangeRouterShape.createOrder, (params));
        data = abi.encodeCall(IUpDownExchangeRouterShape.multicall, (calls));
    }

    function _auth(bytes memory data, uint256 nonce, uint16 stopDistanceBps, uint256 accountBalanceUsdE18)
        internal view returns (HorrisUpDownAuthorization.Authorization memory auth)
    {
        auth = HorrisUpDownAuthorization.Authorization({
            calldataHash: keccak256(data),
            receiver: RECEIVER,
            market: MARKET,
            accountBalanceUsdE18: accountBalanceUsdE18,
            stopDistanceBps: stopDistanceBps,
            nonce: nonce,
            deadline: block.timestamp + 1 hours
        });
    }

    function _sign(HorrisUpDownAuthorization.Authorization memory auth) internal returns (bytes memory signature) {
        bytes32 digest = authorization.authorizationDigest(auth);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(AUTHORIZER_KEY, digest);
        signature = abi.encodePacked(r, s, v);
    }

    function testValidAuthorizationConsumesNonceAndPolicyPasses() public {
        bytes memory data = _multicall(300e30, 100e6); // 3x
        HorrisUpDownAuthorization.Authorization memory auth = _auth(data, 1, 200, 1_000e18);
        bytes memory signature = _sign(auth);

        (IHorrisUpDownCalldataGuard.Inspection memory inspection, uint16 accountRiskBps, uint16 utilizationBps) =
            authorization.consumeIncreaseAuthorization(EXCHANGE_ROUTER, 1 ether, data, auth, signature);

        require(inspection.leverageBps == 30_000, "leverage");
        require(accountRiskBps == 60, "risk"); // $300 * 2% / $1000 = 0.6%
        require(utilizationBps == 1_000, "utilization"); // $100 / $1000 = 10%
        require(authorization.usedNonces(1), "nonce not consumed");
    }

    function testReplayReverts() public {
        bytes memory data = _multicall(300e30, 100e6);
        HorrisUpDownAuthorization.Authorization memory auth = _auth(data, 2, 200, 1_000e18);
        bytes memory signature = _sign(auth);
        authorization.consumeIncreaseAuthorization(EXCHANGE_ROUTER, 1 ether, data, auth, signature);
        (bool ok,) = address(authorization).call(abi.encodeCall(
            authorization.consumeIncreaseAuthorization,
            (EXCHANGE_ROUTER, 1 ether, data, auth, signature)
        ));
        require(!ok, "replay should revert");
    }

    function testMutatedCalldataReverts() public {
        bytes memory approvedData = _multicall(300e30, 100e6);
        HorrisUpDownAuthorization.Authorization memory auth = _auth(approvedData, 3, 200, 1_000e18);
        bytes memory signature = _sign(auth);
        bytes memory mutatedData = _multicall(400e30, 100e6);
        (bool ok,) = address(authorization).call(abi.encodeCall(
            authorization.consumeIncreaseAuthorization,
            (EXCHANGE_ROUTER, 1 ether, mutatedData, auth, signature)
        ));
        require(!ok, "mutated calldata should revert");
        require(!authorization.usedNonces(3), "failed auth consumed nonce");
    }

    function testTamperedRiskContextBreaksSignature() public {
        bytes memory data = _multicall(300e30, 100e6);
        HorrisUpDownAuthorization.Authorization memory auth = _auth(data, 4, 200, 1_000e18);
        bytes memory signature = _sign(auth);
        auth.accountBalanceUsdE18 = 10_000e18;
        (bool ok,) = address(authorization).call(abi.encodeCall(
            authorization.consumeIncreaseAuthorization,
            (EXCHANGE_ROUTER, 1 ether, data, auth, signature)
        ));
        require(!ok, "tampered risk context should revert");
    }

    function testExpiredAuthorizationReverts() public {
        bytes memory data = _multicall(300e30, 100e6);
        HorrisUpDownAuthorization.Authorization memory auth = _auth(data, 5, 200, 1_000e18);
        bytes memory signature = _sign(auth);
        vm.warp(auth.deadline + 1);
        (bool ok,) = address(authorization).call(abi.encodeCall(
            authorization.consumeIncreaseAuthorization,
            (EXCHANGE_ROUTER, 1 ether, data, auth, signature)
        ));
        require(!ok, "expired auth should revert");
    }

    function testSignedButUnsafeRiskContextFailsPolicyAndDoesNotConsumeNonce() public {
        bytes memory data = _multicall(300e30, 100e6);
        HorrisUpDownAuthorization.Authorization memory auth = _auth(data, 6, 800, 1_000e18); // $24 loss = 2.4% > 2%
        bytes memory signature = _sign(auth);
        (bool ok,) = address(authorization).call(abi.encodeCall(
            authorization.consumeIncreaseAuthorization,
            (EXCHANGE_ROUTER, 1 ether, data, auth, signature)
        ));
        require(!ok, "unsafe signed risk should fail policy");
        require(!authorization.usedNonces(6), "failed policy consumed nonce");
    }

    function testGuardDerivedLeverageStillEnforced() public {
        bytes memory data = _multicall(600e30, 100e6); // 6x > guard 5x
        HorrisUpDownAuthorization.Authorization memory auth = _auth(data, 7, 100, 2_000e18);
        bytes memory signature = _sign(auth);
        (bool ok,) = address(authorization).call(abi.encodeCall(
            authorization.consumeIncreaseAuthorization,
            (EXCHANGE_ROUTER, 1 ether, data, auth, signature)
        ));
        require(!ok, "actual calldata leverage should be enforced");
        require(!authorization.usedNonces(7), "guard failure consumed nonce");
    }
}
