// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../contracts/HorrisUpDownCalldataGuard.sol";

contract HorrisUpDownCalldataGuardTest {
    address constant EXCHANGE_ROUTER = address(0x1001);
    address constant ORDER_VAULT = address(0x1002);
    address constant USDT = address(0x1003);
    address constant MARKET = address(0x2001);
    address constant RECEIVER = address(0x3001);

    HorrisUpDownCalldataGuard guard;

    constructor() {
        guard = new HorrisUpDownCalldataGuard(EXCHANGE_ROUTER, ORDER_VAULT, USDT, 50_000, 5_000e30); // 5x, $5k
        guard.setMarket(MARKET, true);
    }

    function _params(uint256 sizeUsdE30, uint256 collateralUsdt) internal pure returns (IUpDownExchangeRouterShape.CreateOrderParams memory params) {
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

    function _multicall(IUpDownExchangeRouterShape.CreateOrderParams memory params, address token, uint256 fee)
        internal pure returns (bytes memory data)
    {
        bytes[] memory calls = new bytes[](3);
        calls[0] = abi.encodeCall(IUpDownExchangeRouterShape.sendWnt, (ORDER_VAULT, fee));
        calls[1] = abi.encodeCall(IUpDownExchangeRouterShape.sendTokens, (token, ORDER_VAULT, params.numbers.initialCollateralDeltaAmount));
        calls[2] = abi.encodeCall(IUpDownExchangeRouterShape.createOrder, (params));
        data = abi.encodeCall(IUpDownExchangeRouterShape.multicall, (calls));
    }

    function testValidThreeXIncreasePasses() public view {
        IUpDownExchangeRouterShape.CreateOrderParams memory params = _params(300e30, 100e6);
        HorrisUpDownCalldataGuard.Inspection memory result = guard.inspectIncrease(
            EXCHANGE_ROUTER,
            RECEIVER,
            1 ether,
            _multicall(params, USDT, 1 ether)
        );
        require(result.market == MARKET, "market");
        require(result.collateralUsdt == 100e6, "collateral");
        require(result.notionalUsdE30 == 300e30, "notional");
        require(result.leverageBps == 30_000, "leverage");
        require(result.executionFee == 1 ether, "fee");
        require(result.isLong, "side");
    }

    function testWrongReceiverReverts() public {
        IUpDownExchangeRouterShape.CreateOrderParams memory params = _params(300e30, 100e6);
        (bool ok,) = address(guard).call(abi.encodeCall(
            guard.inspectIncrease,
            (EXCHANGE_ROUTER, address(0xBEEF), 1 ether, _multicall(params, USDT, 1 ether))
        ));
        require(!ok, "wrong receiver should revert");
    }

    function testAlteredCollateralTokenReverts() public {
        IUpDownExchangeRouterShape.CreateOrderParams memory params = _params(300e30, 100e6);
        (bool ok,) = address(guard).call(abi.encodeCall(
            guard.inspectIncrease,
            (EXCHANGE_ROUTER, RECEIVER, 1 ether, _multicall(params, address(0xBAD), 1 ether))
        ));
        require(!ok, "bad token should revert");
    }

    function testFeeValueMismatchReverts() public {
        IUpDownExchangeRouterShape.CreateOrderParams memory params = _params(300e30, 100e6);
        (bool ok,) = address(guard).call(abi.encodeCall(
            guard.inspectIncrease,
            (EXCHANGE_ROUTER, RECEIVER, 2 ether, _multicall(params, USDT, 1 ether))
        ));
        require(!ok, "fee mismatch should revert");
    }

    function testBlockedMarketReverts() public {
        IUpDownExchangeRouterShape.CreateOrderParams memory params = _params(300e30, 100e6);
        guard.setMarket(MARKET, false);
        (bool ok,) = address(guard).call(abi.encodeCall(
            guard.inspectIncrease,
            (EXCHANGE_ROUTER, RECEIVER, 1 ether, _multicall(params, USDT, 1 ether))
        ));
        require(!ok, "blocked market should revert");
        guard.setMarket(MARKET, true);
    }

    function testLeverageAbovePolicyReverts() public {
        IUpDownExchangeRouterShape.CreateOrderParams memory params = _params(600e30, 100e6); // 6x > 5x
        (bool ok,) = address(guard).call(abi.encodeCall(
            guard.inspectIncrease,
            (EXCHANGE_ROUTER, RECEIVER, 1 ether, _multicall(params, USDT, 1 ether))
        ));
        require(!ok, "leverage cap should revert");
    }

    function testNotionalCapReverts() public {
        IUpDownExchangeRouterShape.CreateOrderParams memory params = _params(5_001e30, 2_000e6);
        (bool ok,) = address(guard).call(abi.encodeCall(
            guard.inspectIncrease,
            (EXCHANGE_ROUTER, RECEIVER, 1 ether, _multicall(params, USDT, 1 ether))
        ));
        require(!ok, "notional cap should revert");
    }

    function testWrongCallOrderReverts() public {
        IUpDownExchangeRouterShape.CreateOrderParams memory params = _params(300e30, 100e6);
        bytes[] memory calls = new bytes[](3);
        calls[0] = abi.encodeCall(IUpDownExchangeRouterShape.sendTokens, (USDT, ORDER_VAULT, 100e6));
        calls[1] = abi.encodeCall(IUpDownExchangeRouterShape.sendWnt, (ORDER_VAULT, 1 ether));
        calls[2] = abi.encodeCall(IUpDownExchangeRouterShape.createOrder, (params));
        bytes memory data = abi.encodeCall(IUpDownExchangeRouterShape.multicall, (calls));
        (bool ok,) = address(guard).call(abi.encodeCall(guard.inspectIncrease, (EXCHANGE_ROUTER, RECEIVER, 1 ether, data)));
        require(!ok, "wrong call order should revert");
    }
}
