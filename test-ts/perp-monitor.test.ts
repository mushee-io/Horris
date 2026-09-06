import { describe, expect, it } from "vitest";
import { analyzePerpRiskState } from "../lib/perp-monitor";
import type { HorrisUpDownOrder } from "../lib/updown-orders";
import type { HorrisUpDownPosition } from "../lib/updown-positions";

const marketToken = "0x1111111111111111111111111111111111111111" as const;
const collateralToken = "0x2222222222222222222222222222222222222222" as const;

const position: HorrisUpDownPosition = {
  market: "BTC/USDT", marketToken, collateralToken, side: "long", sizeUsd: "300", collateralAmount: "100",
  effectiveLeverage: 3, increasedAt: 1, decreasedAt: 0,
};

function order(overrides: Partial<HorrisUpDownOrder> = {}): HorrisUpDownOrder {
  return {
    key: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    market: "BTC/USDT", marketToken, type: "StopLossDecrease", orderType: 6, side: "long", sizeUsd: "300",
    collateralAmount: "0", triggerPrice: "98000", acceptablePrice: "97500", executionFeeCelo: "1", updatedAt: 1,
    validFrom: 0, isFrozen: false, autoCancel: false, ...overrides,
  };
}

describe("Horris live perp protection analysis", () => {
  it("marks a position healthy when active stop coverage matches the full size", () => {
    const state = analyzePerpRiskState([position], [order()], "Balanced");
    expect(state.healthy).toBe(true);
    expect(state.criticalCount).toBe(0);
    expect(state.protections[0].stopCoveragePercent).toBe(100);
    expect(state.protections[0].fullyStopProtected).toBe(true);
  });

  it("raises a critical alert when stop coverage is missing", () => {
    const state = analyzePerpRiskState([position], [], "Balanced");
    expect(state.healthy).toBe(false);
    expect(state.alerts.some((alert) => alert.code === "STOP_COVERAGE" && alert.severity === "critical")).toBe(true);
  });

  it("does not count a frozen stop as active protection", () => {
    const state = analyzePerpRiskState([position], [order({ isFrozen: true })], "Balanced");
    expect(state.criticalCount).toBeGreaterThanOrEqual(2);
    expect(state.alerts.some((alert) => alert.code === "FROZEN_STOP")).toBe(true);
    expect(state.protections[0].stopCoveragePercent).toBe(0);
  });

  it("flags leverage above the selected policy", () => {
    const state = analyzePerpRiskState([{ ...position, effectiveLeverage: 6 }], [order()], "Balanced");
    expect(state.warningCount).toBe(1);
    expect(state.alerts.find((alert) => alert.code === "LEVERAGE_POLICY")?.severity).toBe("warning");
  });

  it("adds pending increase exposure to the protection verdict", () => {
    const increase = order({ key: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", type: "MarketIncrease", orderType: 2, sizeUsd: "150" });
    const state = analyzePerpRiskState([position], [order(), increase], "Balanced");
    expect(state.protections[0].pendingIncreaseUsd).toBe(150);
    expect(state.alerts.some((alert) => alert.code === "PENDING_INCREASE")).toBe(true);
  });

  it("flags pending entry exposure even before a live position exists", () => {
    const increase = order({ type: "MarketIncrease", orderType: 2, sizeUsd: "250" });
    const state = analyzePerpRiskState([], [increase], "Balanced");
    expect(state.warningCount).toBe(1);
    expect(state.alerts.some((alert) => alert.code === "PENDING_ENTRY" && alert.message.includes("$250.00"))).toBe(true);
  });

  it("flags orphan stop-loss orders when the matching position is gone", () => {
    const state = analyzePerpRiskState([], [order()], "Balanced");
    expect(state.alerts.some((alert) => alert.code === "ORPHAN_STOP")).toBe(true);
  });

  it("escalates a frozen orphan stop to critical", () => {
    const state = analyzePerpRiskState([], [order({ isFrozen: true })], "Balanced");
    expect(state.criticalCount).toBe(1);
    expect(state.alerts.some((alert) => alert.code === "ORPHAN_STOP" && alert.severity === "critical")).toBe(true);
  });
});
