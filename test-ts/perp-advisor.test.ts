import { describe, expect, it } from "vitest";
import { proposeBoundedPerpIntent } from "../lib/perp-advisor";

describe("Horris bounded perp advisor", () => {
  it("produces an approved balanced long proposal inside policy", () => {
    const proposal = proposeBoundedPerpIntent({ market: "BTC", side: "long", risk: "Balanced", accountBalanceUsd: 5_000, entryPrice: 100_000 });
    expect(proposal.executable).toBe(false); expect(proposal.analysis.approved).toBe(true); expect(proposal.recommendedLeverage).toBeLessThanOrEqual(5); expect(proposal.recommendedStopLoss).toBeLessThan(100_000); expect(proposal.recommendedTakeProfit).toBeGreaterThan(100_000);
  });

  it("places short protection and target on the correct sides", () => {
    const proposal = proposeBoundedPerpIntent({ market: "ETH", side: "short", risk: "Conservative", accountBalanceUsd: 2_000, entryPrice: 4_000 });
    expect(proposal.analysis.approved).toBe(true); expect(proposal.recommendedStopLoss).toBeGreaterThan(4_000); expect(proposal.recommendedTakeProfit).toBeLessThan(4_000);
  });

  it("clamps preferred leverage and margin to policy limits", () => {
    const proposal = proposeBoundedPerpIntent({ market: "CELO", side: "long", risk: "Balanced", accountBalanceUsd: 1_000, entryPrice: 1, preferredLeverage: 50, preferredMarginUsd: 900 });
    expect(proposal.recommendedLeverage).toBe(5); expect(proposal.recommendedMarginUsd).toBeLessThanOrEqual(350); expect(proposal.analysis.approved).toBe(true);
  });

  it("does not force a one-dollar margin onto a micro balance", () => {
    const proposal = proposeBoundedPerpIntent({ market: "BTC", side: "long", risk: "Conservative", accountBalanceUsd: 0.01, entryPrice: 80_000 });
    expect(proposal.recommendedMarginUsd).toBeCloseTo(0.002, 8);
    expect(proposal.recommendedMarginUsd).toBeLessThanOrEqual(0.01 * 0.2);
    expect(proposal.analysis.marginUtilizationPercent).toBeLessThanOrEqual(20);
    expect(proposal.analysis.accountRiskPercent).toBeLessThanOrEqual(1);
    expect(proposal.analysis.approved).toBe(true);
  });

  it("rejects non-positive account balances", () => {
    expect(() => proposeBoundedPerpIntent({ market: "BTC", side: "long", risk: "Conservative", accountBalanceUsd: 0, entryPrice: 80_000 })).toThrow("Account balance must be a positive number");
  });
});
