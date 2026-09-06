import { parseUnits, type Address } from "viem";
import { analyzePerpIntent, type PerpIntent } from "./perps";
import { getUpDownMarket, UPDOWN_CELO } from "./updown";

const USDT = "0xd96a1ac57a180a3819633bCE3dC602Bd8972f595" as Address;
const USDT_DECIMALS = 6;

const INDEX_DECIMALS: Record<string, number> = {
  BTC: 8,
  ETH: 18,
  CELO: 18,
  EURm: 18,
  JPYm: 18,
  NGNm: 18,
  AUDm: 18,
  GBPm: 18,
};

export type UnsignedUpDownIncreaseOrderPlan = {
  venue: "UpDown";
  chainId: 42220;
  exchangeRouter: Address;
  orderVault: Address;
  executionEnabled: false;
  requiresLiveExecutionFee: true;
  riskApproved: true;
  params: {
    addresses: {
      receiver: Address;
      cancellationReceiver: Address;
      callbackContract: Address;
      uiFeeReceiver: Address;
      market: Address;
      initialCollateralToken: Address;
      swapPath: readonly Address[];
    };
    numbers: {
      sizeDeltaUsd: bigint;
      initialCollateralDeltaAmount: bigint;
      triggerPrice: bigint;
      acceptablePrice: bigint;
      executionFee: null;
      callbackGasLimit: bigint;
      minOutputAmount: bigint;
      validFromTime: bigint;
    };
    orderType: 2;
    decreasePositionSwapType: 0;
    isLong: boolean;
    shouldUnwrapNativeToken: false;
    autoCancel: false;
    referralCode: `0x${string}`;
  };
  human: {
    market: string;
    side: "long" | "short";
    marginUsd: number;
    notionalUsd: number;
    leverage: number;
    acceptablePrice: number;
    acceptablePriceSlippageBps: number;
    stopLoss: number;
    takeProfit?: number;
  };
  warnings: string[];
};

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;
const ZERO_BYTES32 = `0x${"00".repeat(32)}` as `0x${string}`;

function priceToVenueUnits(price: number, symbol: string) {
  const indexDecimals = INDEX_DECIMALS[symbol];
  if (indexDecimals === undefined) throw new Error(`Missing index-token decimals for ${symbol}`);
  const decimals = 30 - indexDecimals;
  if (decimals < 0) throw new Error("Invalid index-token decimals");
  return parseUnits(price.toFixed(Math.min(decimals, 12)), decimals);
}

export function buildUnsignedUpDownIncreaseOrderPlan(
  intent: PerpIntent,
  receiver: Address,
  acceptablePriceSlippageBps = 50,
): UnsignedUpDownIncreaseOrderPlan {
  if (!/^0x[0-9a-fA-F]{40}$/.test(receiver)) throw new Error("A valid receiver address is required");
  if (!Number.isInteger(acceptablePriceSlippageBps) || acceptablePriceSlippageBps < 1 || acceptablePriceSlippageBps > 100) {
    throw new Error("Horris acceptable-price slippage must be between 1 and 100 bps");
  }

  const market = getUpDownMarket(intent.market);
  if (!market) throw new Error("Unsupported UpDown market");
  const analysis = analyzePerpIntent(intent);
  if (!analysis.approved) throw new Error("Horris risk policy blocked this perpetual trade");

  const acceptablePrice = intent.side === "long"
    ? intent.entryPrice * (1 + acceptablePriceSlippageBps / 10_000)
    : intent.entryPrice * (1 - acceptablePriceSlippageBps / 10_000);
  if (acceptablePrice <= 0) throw new Error("Invalid acceptable price");

  return {
    venue: "UpDown",
    chainId: 42220,
    exchangeRouter: UPDOWN_CELO.exchangeRouter,
    orderVault: UPDOWN_CELO.orderVault,
    executionEnabled: false,
    requiresLiveExecutionFee: true,
    riskApproved: true,
    params: {
      addresses: {
        receiver,
        cancellationReceiver: ZERO_ADDRESS,
        callbackContract: ZERO_ADDRESS,
        uiFeeReceiver: ZERO_ADDRESS,
        market: market.marketToken,
        initialCollateralToken: USDT,
        swapPath: [],
      },
      numbers: {
        sizeDeltaUsd: parseUnits(analysis.notionalUsd.toFixed(12), 30),
        initialCollateralDeltaAmount: parseUnits(intent.marginUsd.toFixed(USDT_DECIMALS), USDT_DECIMALS),
        triggerPrice: 0n,
        acceptablePrice: priceToVenueUnits(acceptablePrice, market.symbol),
        executionFee: null,
        callbackGasLimit: 0n,
        minOutputAmount: 0n,
        validFromTime: 0n,
      },
      orderType: 2,
      decreasePositionSwapType: 0,
      isLong: intent.side === "long",
      shouldUnwrapNativeToken: false,
      autoCancel: false,
      referralCode: ZERO_BYTES32,
    },
    human: {
      market: `${market.symbol}/${market.quoteSymbol}`,
      side: intent.side,
      marginUsd: intent.marginUsd,
      notionalUsd: analysis.notionalUsd,
      leverage: intent.leverage,
      acceptablePrice,
      acceptablePriceSlippageBps,
      stopLoss: intent.stopLoss,
      takeProfit: intent.takeProfit,
    },
    warnings: [
      "Unsigned compiler output only; execution is disabled.",
      "Execution fee must be resolved from UpDown's current DataStore/network state immediately before a future adapter submits an order.",
      "Stop-loss and take-profit are risk-plan requirements but are not atomically attached by this MarketIncrease compiler; a production adapter must guarantee protective-order behavior before enabling automation.",
    ],
  };
}
