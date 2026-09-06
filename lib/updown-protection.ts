import { parseUnits, type Address } from "viem";
import type { HorrisUpDownPosition } from "./updown-positions";
import { UPDOWN_CELO, UPDOWN_MARKETS } from "./updown";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;
const ZERO_BYTES32 = `0x${"00".repeat(32)}` as `0x${string}`;

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

export type UpDownProtectionKind = "stop-loss" | "take-profit";

export type UnsignedUpDownProtectionPlan = {
  venue: "UpDown";
  chainId: 42220;
  exchangeRouter: Address;
  orderVault: Address;
  executionEnabled: false;
  requiresLiveExecutionFee: true;
  kind: UpDownProtectionKind;
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
    orderType: 5 | 6;
    decreasePositionSwapType: 0;
    isLong: boolean;
    shouldUnwrapNativeToken: false;
    autoCancel: true;
    referralCode: `0x${string}`;
  };
  human: {
    market: string;
    side: "long" | "short";
    sizeUsd: number;
    triggerPrice: number;
    acceptablePrice: number;
    acceptablePriceSlippageBps: number;
  };
};

function marketForPosition(position: HorrisUpDownPosition) {
  const market = UPDOWN_MARKETS.find((item) => item.marketToken.toLowerCase() === position.marketToken.toLowerCase());
  if (!market) throw new Error("Position market is not in the pinned UpDown registry");
  return market;
}

function priceToVenueUnits(price: number, symbol: string) {
  const indexDecimals = INDEX_DECIMALS[symbol];
  if (indexDecimals === undefined) throw new Error(`Missing index-token decimals for ${symbol}`);
  const decimals = 30 - indexDecimals;
  if (decimals < 0) throw new Error("Invalid index-token decimals");
  return parseUnits(price.toFixed(Math.min(decimals, 12)), decimals);
}

export function buildUnsignedUpDownProtectionPlan(
  position: HorrisUpDownPosition,
  receiver: Address,
  kind: UpDownProtectionKind,
  triggerPrice: number,
  acceptablePriceSlippageBps = 100,
): UnsignedUpDownProtectionPlan {
  if (!/^0x[0-9a-fA-F]{40}$/.test(receiver)) throw new Error("A valid receiver address is required");
  if (!Number.isFinite(triggerPrice) || triggerPrice <= 0) throw new Error("A positive protection trigger price is required");
  if (!Number.isInteger(acceptablePriceSlippageBps) || acceptablePriceSlippageBps < 1 || acceptablePriceSlippageBps > 300) {
    throw new Error("Protection acceptable-price slippage must be between 1 and 300 bps");
  }

  const sizeUsd = Number(position.sizeUsd);
  if (!Number.isFinite(sizeUsd) || sizeUsd <= 0) throw new Error("Protection requires a live non-zero position");
  const market = marketForPosition(position);

  // Decrease orders must tolerate adverse execution beyond the trigger. Long exits sell lower; short exits buy higher.
  const acceptablePrice = position.side === "long"
    ? triggerPrice * (1 - acceptablePriceSlippageBps / 10_000)
    : triggerPrice * (1 + acceptablePriceSlippageBps / 10_000);
  if (acceptablePrice <= 0) throw new Error("Invalid protection acceptable price");

  return {
    venue: "UpDown",
    chainId: 42220,
    exchangeRouter: UPDOWN_CELO.exchangeRouter,
    orderVault: UPDOWN_CELO.orderVault,
    executionEnabled: false,
    requiresLiveExecutionFee: true,
    kind,
    params: {
      addresses: {
        receiver,
        cancellationReceiver: receiver,
        callbackContract: ZERO_ADDRESS,
        uiFeeReceiver: ZERO_ADDRESS,
        market: position.marketToken,
        initialCollateralToken: position.collateralToken,
        swapPath: [],
      },
      numbers: {
        sizeDeltaUsd: parseUnits(sizeUsd.toFixed(12), 30),
        initialCollateralDeltaAmount: 0n,
        triggerPrice: priceToVenueUnits(triggerPrice, market.symbol),
        acceptablePrice: priceToVenueUnits(acceptablePrice, market.symbol),
        executionFee: null,
        callbackGasLimit: 0n,
        minOutputAmount: 0n,
        validFromTime: 0n,
      },
      orderType: kind === "stop-loss" ? 6 : 5,
      decreasePositionSwapType: 0,
      isLong: position.side === "long",
      shouldUnwrapNativeToken: false,
      autoCancel: true,
      referralCode: ZERO_BYTES32,
    },
    human: {
      market: position.market,
      side: position.side,
      sizeUsd,
      triggerPrice,
      acceptablePrice,
      acceptablePriceSlippageBps,
    },
  };
}
