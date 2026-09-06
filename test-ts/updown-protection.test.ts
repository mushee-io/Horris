import { describe, expect, it } from "vitest";
import { parseUnits } from "viem";
import { encodeUnsignedUpDownProtectionMulticall } from "../lib/updown-calldata";
import { buildUnsignedUpDownProtectionPlan } from "../lib/updown-protection";
import { UPDOWN_CELO, UPDOWN_MARKETS } from "../lib/updown";
import type { HorrisUpDownPosition } from "../lib/updown-positions";

const receiver = "0x1234567890123456789012345678901234567890" as const;
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

describe("Horris UpDown protection compiler", () => {
  it("compiles a full-size StopLossDecrease from a live position shape", () => {
    const plan = buildUnsignedUpDownProtectionPlan(position, receiver, "stop-loss", 98_000, 100);
    expect(plan.executionEnabled).toBe(false);
    expect(plan.params.orderType).toBe(6);
    expect(plan.params.autoCancel).toBe(true);
    expect(plan.params.addresses.market).toBe(btc.marketToken);
    expect(plan.params.addresses.initialCollateralToken).toBe(position.collateralToken);
    expect(plan.params.numbers.initialCollateralDeltaAmount).toBe(0n);
    expect(plan.params.numbers.sizeDeltaUsd).toBe(parseUnits("300", 30));
    expect(plan.human.positionSizeUsd).toBe(300);
    expect(plan.human.sizeUsd).toBe(300);
    expect(plan.human.acceptablePrice).toBeCloseTo(97_020);
  });

  it("can compile only the uncovered part of a partially protected position", () => {
    const plan = buildUnsignedUpDownProtectionPlan(position, receiver, "stop-loss", 98_000, 100, 120);
    expect(plan.params.numbers.sizeDeltaUsd).toBe(parseUnits("120", 30));
    expect(plan.human.positionSizeUsd).toBe(300);
    expect(plan.human.sizeUsd).toBe(120);
  });

  it("compiles a TakeProfitDecrease with the same position size", () => {
    const plan = buildUnsignedUpDownProtectionPlan(position, receiver, "take-profit", 104_000, 100);
    expect(plan.params.orderType).toBe(5);
    expect(plan.human.acceptablePrice).toBeCloseTo(102_960);
  });

  it("uses the opposite acceptable-price direction for short exits", () => {
    const plan = buildUnsignedUpDownProtectionPlan({ ...position, side: "short" }, receiver, "stop-loss", 102_000, 100);
    expect(plan.params.isLong).toBe(false);
    expect(plan.human.acceptablePrice).toBeCloseTo(103_020);
  });

  it("rejects empty, oversized and unsafe protection plans", () => {
    expect(() => buildUnsignedUpDownProtectionPlan({ ...position, sizeUsd: "0" }, receiver, "stop-loss", 98_000)).toThrow("live non-zero position");
    expect(() => buildUnsignedUpDownProtectionPlan(position, receiver, "stop-loss", 98_000, 301)).toThrow("between 1 and 300 bps");
    expect(() => buildUnsignedUpDownProtectionPlan(position, receiver, "stop-loss", 98_000, 100, 301)).toThrow("cannot exceed the live position size");
    expect(() => buildUnsignedUpDownProtectionPlan(position, receiver, "stop-loss", 98_000, 100, 0)).toThrow("must be positive");
  });

  it("encodes only sendWnt + createOrder and requires no token approval", () => {
    const plan = buildUnsignedUpDownProtectionPlan(position, receiver, "stop-loss", 98_000, 100);
    const tx = encodeUnsignedUpDownProtectionMulticall(plan, 1_000_000_000_000_000_000n);
    expect(tx.to).toBe(UPDOWN_CELO.exchangeRouter);
    expect(tx.value).toBe(1_000_000_000_000_000_000n);
    expect(tx.calls).toEqual(["sendWnt", "createOrder"]);
    expect(tx.approval).toBeNull();
    expect(tx.calldataHash).toHaveLength(66);
    expect(tx.executionEnabled).toBe(false);
  });
});
