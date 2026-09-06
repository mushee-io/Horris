import { describe, expect, it } from "vitest";
import { analyzePerpIntent, type PerpIntent } from "../lib/perps";

const base: PerpIntent = {
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

describe("Horris perpetual risk engine", () => {
  it("approves a bounded Balanced trade and calculates exposure", () => {
    const result = analyzePerpIntent(base);
    expect(result.approved).toBe(true);
    expect(result.notionalUsd).toBe(300);
    expect(result.stopDistancePercent).toBeCloseTo(2);
    expect(result.projectedLossAtStopUsd).toBeCloseTo(6);
    expect(result.accountRiskPercent).toBeCloseTo(0.6);
    expect(result.marginUtilizationPercent).toBeCloseTo(10);
    expect(result.rewardRisk).toBeCloseTo(2);
  });

  it("blocks leverage above the selected Horris policy", () => {
    const result = analyzePerpIntent({ ...base, leverage: 6 });
    expect(result.approved).toBe(false);
    expect(result.checks.find((check) => check.code === "LEVERAGE_CAP")?.passed).toBe(false);
  });

  it("blocks a stop on the profitable side of entry", () => {
    const result = analyzePerpIntent({ ...base, stopLoss: 101_000 });
    expect(result.approved).toBe(false);
    expect(result.checks.find((check) => check.code === "STOP_DIRECTION")?.passed).toBe(false);
  });

  it("blocks oversized account risk even when leverage itself is allowed", () => {
    const result = analyzePerpIntent({ ...base, stopLoss: 90_000 });
    expect(result.approved).toBe(false);
    expect(result.checks.find((check) => check.code === "ACCOUNT_RISK")?.passed).toBe(false);
  });

  it("rejects margin larger than the declared account balance", () => {
    expect(() => analyzePerpIntent({ ...base, marginUsd: 1_001 })).toThrow("Margin cannot exceed account balance");
  });
});
