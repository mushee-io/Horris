import { describe, expect, it } from "vitest";
import { parseUnits } from "viem";
import { encodeUnsignedUpDownMulticall } from "../lib/updown-calldata";
import { buildUnsignedUpDownIncreaseOrderPlan } from "../lib/updown-order";
import { UPDOWN_CELO } from "../lib/updown";
import type { PerpIntent } from "../lib/perps";

const receiver = "0x1234567890123456789012345678901234567890" as const;
const intent: PerpIntent = {
  market: "BTC",
  side: "long",
  marginUsd: 100,
  leverage: 3,
  accountBalanceUsd: 1_000,
  entryPrice: 100_000,
  stopLoss: 98_000,
  takeProfit: 104_000,
  risk: "Balanced",
};

describe("Horris UpDown unsigned compiler", () => {
  it("compiles only an approved MarketIncrease plan", () => {
    const plan = buildUnsignedUpDownIncreaseOrderPlan(intent, receiver, 50);
    expect(plan.executionEnabled).toBe(false);
    expect(plan.riskApproved).toBe(true);
    expect(plan.params.orderType).toBe(2);
    expect(plan.params.isLong).toBe(true);
    expect(plan.params.addresses.receiver).toBe(receiver);
    expect(plan.params.numbers.sizeDeltaUsd).toBe(parseUnits("300", 30));
    expect(plan.params.numbers.initialCollateralDeltaAmount).toBe(100_000_000n);
    expect(plan.human.acceptablePrice).toBeCloseTo(100_500);
  });

  it("rejects a risk plan that Horris would block", () => {
    expect(() => buildUnsignedUpDownIncreaseOrderPlan({ ...intent, leverage: 8 }, receiver)).toThrow("Horris risk policy blocked");
  });

  it("bounds acceptable-price slippage to 100 bps", () => {
    expect(() => buildUnsignedUpDownIncreaseOrderPlan(intent, receiver, 101)).toThrow("between 1 and 100 bps");
  });

  it("encodes the exact three-call multicall and Router approval requirement", () => {
    const plan = buildUnsignedUpDownIncreaseOrderPlan(intent, receiver, 50);
    const tx = encodeUnsignedUpDownMulticall(plan, 1_000_000_000_000_000_000n);
    expect(tx.executionEnabled).toBe(false);
    expect(tx.to).toBe(UPDOWN_CELO.exchangeRouter);
    expect(tx.value).toBe(1_000_000_000_000_000_000n);
    expect(tx.calls).toEqual(["sendWnt", "sendTokens", "createOrder"]);
    expect(tx.approval.spender).toBe(UPDOWN_CELO.router);
    expect(tx.approval.minimumAmount).toBe(100_000_000n);
    expect(tx.data.startsWith("0x")).toBe(true);
    expect(tx.calldataHash).toHaveLength(66);
  });
});
