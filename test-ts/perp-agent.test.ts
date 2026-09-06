import { describe, expect, it } from "vitest";
import { canPerpAgentProceed, type PerpAgentPermission } from "../lib/perp-agent";
import { analyzePerpIntent } from "../lib/perps";

const analysis = analyzePerpIntent({ market: "BTC", side: "long", marginUsd: 100, leverage: 2, accountBalanceUsd: 5_000, entryPrice: 100_000, stopLoss: 99_000, takeProfit: 102_000, risk: "Balanced" });
const permission: PerpAgentPermission = { enabled: true, expiresAt: Date.now() + 60_000, allowedMarkets: ["BTC"], allowedSides: ["long"], maxNotionalUsd: 500, maxLeverage: 3, maxAccountRiskPercent: 1, allowedRiskProfiles: ["Balanced"], requireStopProtection: true };

describe("Horris perp agent permissions", () => {
  it("allows only a fully preflighted bounded request while keeping execution disabled", () => {
    const result = canPerpAgentProceed({ market: "BTC", side: "long", risk: "Balanced", leverage: 2, analysis, executionPreflightPassed: true, authorizationSimulationPassed: true }, permission);
    expect(result.allowed).toBe(true); expect(result.executionEnabled).toBe(false);
  });
  it("rejects expired delegation", () => {
    const result = canPerpAgentProceed({ market: "BTC", side: "long", risk: "Balanced", leverage: 2, analysis, executionPreflightPassed: true, authorizationSimulationPassed: true }, { ...permission, expiresAt: 1 }, 2);
    expect(result.allowed).toBe(false); expect(result.reasons).toContain("Perp agent permission has expired");
  });
  it("rejects market, side and leverage outside delegation", () => {
    const result = canPerpAgentProceed({ market: "ETH", side: "short", risk: "Balanced", leverage: 4, analysis, executionPreflightPassed: true, authorizationSimulationPassed: true }, permission);
    expect(result.allowed).toBe(false); expect(result.reasons).toEqual(expect.arrayContaining(["Market is outside delegated scope", "Side is outside delegated scope", "Leverage exceeds delegated cap"]));
  });
  it("rejects requests without live preflight and authorization simulation", () => {
    const result = canPerpAgentProceed({ market: "BTC", side: "long", risk: "Balanced", leverage: 2, analysis, executionPreflightPassed: false, authorizationSimulationPassed: false }, permission);
    expect(result.allowed).toBe(false); expect(result.reasons.length).toBeGreaterThanOrEqual(2);
  });
});
