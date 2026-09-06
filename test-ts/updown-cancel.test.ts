import { describe, expect, it } from "vitest";
import { buildUnsignedUpDownCancelPlan } from "../lib/updown-cancel";
import { UPDOWN_CELO, UPDOWN_MARKETS } from "../lib/updown";
import type { HorrisUpDownOrder } from "../lib/updown-orders";

const btc = UPDOWN_MARKETS.find((market) => market.symbol === "BTC")!;
const base: HorrisUpDownOrder = {
  key: `0x${"12".repeat(32)}`, market: "BTC/USDT", marketToken: btc.marketToken, type: "MarketIncrease", orderType: 2, side: "long",
  sizeUsd: "300", collateralAmount: "100", triggerPrice: null, acceptablePrice: null, executionFeeCelo: "1", updatedAt: 0, validFrom: 0, isFrozen: false, autoCancel: false,
};

describe("Horris UpDown cancellation compiler", () => {
  it("compiles pending increase cancellation without value", () => {
    const plan = buildUnsignedUpDownCancelPlan(base, "pending-increase");
    expect(plan.to).toBe(UPDOWN_CELO.exchangeRouter); expect(plan.value).toBe(0n); expect(plan.executionEnabled).toBe(false); expect(plan.orderKey).toBe(base.key); expect(plan.calldataHash).toHaveLength(66);
  });

  it("requires a frozen order for frozen-order recovery", () => {
    expect(() => buildUnsignedUpDownCancelPlan(base, "frozen-order")).toThrow("not frozen");
    const plan = buildUnsignedUpDownCancelPlan({ ...base, isFrozen: true }, "frozen-order"); expect(plan.reason).toBe("frozen-order");
  });

  it("rejects pending-increase reason for a decrease order", () => {
    expect(() => buildUnsignedUpDownCancelPlan({ ...base, orderType: 6 }, "pending-increase")).toThrow("not an increase order");
  });

  it("compiles an explicit orphan stop recovery plan only for stop-loss orders", () => {
    expect(() => buildUnsignedUpDownCancelPlan(base, "orphan-stop")).toThrow("not a stop-loss order");
    const stop = { ...base, type: "StopLossDecrease", orderType: 6, triggerPrice: "98000" };
    const plan = buildUnsignedUpDownCancelPlan(stop, "orphan-stop");
    expect(plan.reason).toBe("orphan-stop"); expect(plan.orderType).toBe(6); expect(plan.value).toBe(0n); expect(plan.executionEnabled).toBe(false);
  });
});
