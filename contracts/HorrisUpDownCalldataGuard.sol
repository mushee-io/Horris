// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IUpDownExchangeRouterShape {
    struct OrderAddresses {
        address receiver;
        address cancellationReceiver;
        address callbackContract;
        address uiFeeReceiver;
        address market;
        address initialCollateralToken;
        address[] swapPath;
    }

    struct OrderNumbers {
        uint256 sizeDeltaUsd;
        uint256 initialCollateralDeltaAmount;
        uint256 triggerPrice;
        uint256 acceptablePrice;
        uint256 executionFee;
        uint256 callbackGasLimit;
        uint256 minOutputAmount;
        uint256 validFromTime;
    }

    struct CreateOrderParams {
        OrderAddresses addresses;
        OrderNumbers numbers;
        uint8 orderType;
        uint8 decreasePositionSwapType;
        bool isLong;
        bool shouldUnwrapNativeToken;
        bool autoCancel;
        bytes32 referralCode;
    }

    function sendWnt(address receiver, uint256 amount) external payable;
    function sendTokens(address token, address receiver, uint256 amount) external payable;
    function createOrder(CreateOrderParams calldata params) external payable returns (bytes32);
    function multicall(bytes[] calldata data) external payable returns (bytes[] memory results);
}

/// @title HorrisUpDownCalldataGuard
/// @notice Fail-closed decoder for the exact UpDown MarketIncrease transaction shape Horris compiles.
/// @dev This contract does not execute, custody or sign. It is a transaction firewall primitive for a future smart-account/module path.
contract HorrisUpDownCalldataGuard {
    uint32 public constant BPS = 10_000;
    uint32 public constant ABSOLUTE_MAX_LEVERAGE_BPS = 100_000; // 10x
    uint256 private constant USDT_TO_USD_E30 = 1e24; // 6-decimal USDT -> 30-decimal USD

    address public immutable owner;
    address public immutable exchangeRouter;
    address public immutable orderVault;
    address public immutable usdt;

    bool public paused;
    uint32 public maxLeverageBps;
    uint256 public maxNotionalUsdE30;
    mapping(address => bool) public allowedMarkets;

    event MarketUpdated(address indexed market, bool allowed);
    event LimitsUpdated(uint32 maxLeverageBps, uint256 maxNotionalUsdE30);
    event PauseUpdated(bool paused);

    struct Inspection {
        address market;
        uint256 collateralUsdt;
        uint256 notionalUsdE30;
        uint32 leverageBps;
        uint256 executionFee;
        bool isLong;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "NOT_OWNER");
        _;
    }

    constructor(
        address exchangeRouter_,
        address orderVault_,
        address usdt_,
        uint32 initialMaxLeverageBps,
        uint256 initialMaxNotionalUsdE30
    ) {
        require(exchangeRouter_ != address(0) && orderVault_ != address(0) && usdt_ != address(0), "ZERO_ADDRESS");
        owner = msg.sender;
        exchangeRouter = exchangeRouter_;
        orderVault = orderVault_;
        usdt = usdt_;
        _setLimits(initialMaxLeverageBps, initialMaxNotionalUsdE30);
    }

    function setPaused(bool value) external onlyOwner {
        paused = value;
        emit PauseUpdated(value);
    }

    function setMarket(address market, bool allowed) external onlyOwner {
        require(market != address(0), "ZERO_MARKET");
        allowedMarkets[market] = allowed;
        emit MarketUpdated(market, allowed);
    }

    function setLimits(uint32 leverageBps, uint256 notionalUsdE30) external onlyOwner {
        _setLimits(leverageBps, notionalUsdE30);
    }

    /// @notice Inspect the exact calldata/value that a future smart account would send to the pinned ExchangeRouter.
    function inspectIncrease(
        address target,
        address expectedReceiver,
        uint256 msgValue,
        bytes calldata multicallData
    ) external view returns (Inspection memory result) {
        require(!paused, "PAUSED");
        require(target == exchangeRouter, "WRONG_TARGET");
        require(expectedReceiver != address(0), "ZERO_RECEIVER");
        require(multicallData.length >= 4, "SHORT_CALLDATA");
        require(bytes4(multicallData[:4]) == IUpDownExchangeRouterShape.multicall.selector, "NOT_MULTICALL");

        bytes[] memory calls = abi.decode(multicallData[4:], (bytes[]));
        require(calls.length == 3, "BAD_CALL_COUNT");
        require(_selector(calls[0]) == IUpDownExchangeRouterShape.sendWnt.selector, "CALL0");
        require(_selector(calls[1]) == IUpDownExchangeRouterShape.sendTokens.selector, "CALL1");
        require(_selector(calls[2]) == IUpDownExchangeRouterShape.createOrder.selector, "CALL2");

        (address wntReceiver, uint256 wntAmount) = abi.decode(_arguments(calls[0]), (address, uint256));
        require(wntReceiver == orderVault, "BAD_WNT_RECEIVER");
        require(wntAmount > 0 && msgValue == wntAmount, "BAD_FEE_VALUE");

        (address collateralToken, address tokenReceiver, uint256 collateralAmount) =
            abi.decode(_arguments(calls[1]), (address, address, uint256));
        require(collateralToken == usdt, "BAD_COLLATERAL_TOKEN");
        require(tokenReceiver == orderVault, "BAD_TOKEN_RECEIVER");
        require(collateralAmount > 0, "ZERO_COLLATERAL");

        IUpDownExchangeRouterShape.CreateOrderParams memory params =
            abi.decode(_arguments(calls[2]), (IUpDownExchangeRouterShape.CreateOrderParams));

        require(params.addresses.receiver == expectedReceiver, "BAD_RECEIVER");
        require(params.addresses.cancellationReceiver == address(0), "CANCEL_RECEIVER");
        require(params.addresses.callbackContract == address(0), "CALLBACK");
        require(params.addresses.uiFeeReceiver == address(0), "UI_FEE");
        require(allowedMarkets[params.addresses.market], "MARKET_BLOCKED");
        require(params.addresses.initialCollateralToken == usdt, "ORDER_COLLATERAL");
        require(params.addresses.swapPath.length == 0, "SWAP_PATH");

        require(params.numbers.sizeDeltaUsd > 0, "ZERO_NOTIONAL");
        require(params.numbers.sizeDeltaUsd <= maxNotionalUsdE30, "NOTIONAL_CAP");
        require(params.numbers.initialCollateralDeltaAmount == collateralAmount, "COLLATERAL_MISMATCH");
        require(params.numbers.triggerPrice == 0, "TRIGGER_NOT_ZERO");
        require(params.numbers.acceptablePrice > 0, "ZERO_ACCEPTABLE_PRICE");
        require(params.numbers.executionFee == wntAmount, "FEE_MISMATCH");
        require(params.numbers.callbackGasLimit == 0, "CALLBACK_GAS");
        require(params.numbers.minOutputAmount == 0, "MIN_OUTPUT");
        require(params.numbers.validFromTime == 0, "VALID_FROM");

        require(params.orderType == 2, "NOT_MARKET_INCREASE");
        require(params.decreasePositionSwapType == 0, "DECREASE_SWAP");
        require(!params.shouldUnwrapNativeToken, "UNWRAP");
        require(!params.autoCancel, "AUTO_CANCEL");
        require(params.referralCode == bytes32(0), "REFERRAL");

        uint256 marginUsdE30 = collateralAmount * USDT_TO_USD_E30;
        uint256 leverage = params.numbers.sizeDeltaUsd * BPS / marginUsdE30;
        require(leverage >= BPS && leverage <= maxLeverageBps, "LEVERAGE_CAP");
        require(leverage <= type(uint32).max, "LEVERAGE_OVERFLOW");

        result = Inspection({
            market: params.addresses.market,
            collateralUsdt: collateralAmount,
            notionalUsdE30: params.numbers.sizeDeltaUsd,
            leverageBps: uint32(leverage),
            executionFee: wntAmount,
            isLong: params.isLong
        });
    }

    function _setLimits(uint32 leverageBps, uint256 notionalUsdE30) internal {
        require(leverageBps >= BPS && leverageBps <= ABSOLUTE_MAX_LEVERAGE_BPS, "UNSAFE_LEVERAGE");
        require(notionalUsdE30 > 0, "ZERO_NOTIONAL_CAP");
        maxLeverageBps = leverageBps;
        maxNotionalUsdE30 = notionalUsdE30;
        emit LimitsUpdated(leverageBps, notionalUsdE30);
    }

    function _selector(bytes memory data) internal pure returns (bytes4 selector) {
        require(data.length >= 4, "SHORT_INNER_CALL");
        assembly {
            selector := mload(add(data, 32))
        }
    }

    function _arguments(bytes memory data) internal pure returns (bytes memory args) {
        require(data.length >= 4, "SHORT_INNER_CALL");
        args = new bytes(data.length - 4);
        for (uint256 i = 4; i < data.length; i++) {
            args[i - 4] = data[i];
        }
    }
}
