import { describe, expect, it } from "vitest";
import { derivePerpProtectionSequence } from "../lib/perp-sequence";
import { UPDOWN_MARKETS } from "../lib/updown";
import type { HorrisUpDownPosition } from "../lib/updown-positions";
import type { HorrisUpDownOrder } from "../lib/updown-orders";

const btc = UPDOWN_MARKETS.find((market) => market.symbol === "BTC")!;
const position: HorrisUpDownPosition = {
  market: "BTC/USDT",
  marketToken: btc.marketToken,
  collateralToken: "0xd96a1ac57a180a3819633bCE3dC602Bd8972f595",
  side: "long",
  sizeUsd: "300",
  collateralAmount: "100",
  effectiveLeverage: 3,
  increasedAt: 0,
  decreasedAt: 0,
};

function order(orderType: number, sizeUsd: string, isFrozen = false): HorrisUpDownOrder {
  return {
    key: `0x${"11".repeat(32)}`,
    market: "BTC/USDT",
    marketToken: btc.marketToken,
    type: `OrderType(${orderType})`,
    orderType,
    side: "long",
    sizeUsd,
    collateralAmount: "0",
    triggerPrice: null,
    acceptablePrice: null,
    executionFeeCelo: "1",
    updatedAt: 0,
    validFrom: 0,
    isFrozen,
    autoCancel: true,
  };
}

describe("Horris perp protection sequence", () => {
  it("waits for venue state before protection compilation", () => {
    const state = derivePerpProtectionSequence(btc.marketToken, "long", [], []);
    expect(state.phase).toBe("awaiting-position");
    expect(state.executionAllowed).toBe(false);
  });

  it("requires protection when no active stop covers the position", () => {
    const state = derivePerpProtectionSequence(btc.marketToken, "long", [position], []);
    expect(state.phase).toBe("protection-required");
    expect(state.stopCoveragePercent).toBe(0);
  });

  it("treats partial stop coverage as protection-required", () => {
    const state = derivePerpProtectionSequence(btc.marketToken, "long", [position], [order(6, "150")]);
    expect(state.phase).toBe("protection-required");
    expect(state.activeStopCoverageUsd).toBe(150);
    expect(state.stopCoveragePercent).toBeCloseTo(50);
  });

  it("blocks automation when a stop is frozen", () => {
    const state = derivePerpProtectionSequence(btc.marketToken, "long", [position], [order(6, "300", true)]);
    expect(state.phase).toBe("blocked");
    expect(state.frozenStopCount).toBe(1);
  });

  it("flags protected positions with pending increases for re-review", () => {
    const state = derivePerpProtectionSequence(btc.marketToken, "long", [position], [order(6, "300"), order(2, "200")]);
    expect(state.phase).toBe("review-exposure");
    expect(state.pendingIncreaseUsd).toBe(200);
  });

  it("marks fully stop-covered positions as protected", () => {
    const state = derivePerpProtectionSequence(btc.marketToken, "long", [position], [order(6, "300")]);
    expect(state.phase).toBe("protected");
    expect(state.stopCoveragePercent).toBe(100);
  });
});
