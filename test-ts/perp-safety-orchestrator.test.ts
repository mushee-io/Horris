import { describe, expect, it } from "vitest";
import { derivePerpSafetyState } from "../lib/perp-safety-orchestrator";
import type { HorrisUpDownOrder } from "../lib/updown-orders";
import type { HorrisUpDownPosition } from "../lib/updown-positions";

const marketToken = "0x1111111111111111111111111111111111111111" as const;
const collateralToken = "0x2222222222222222222222222222222222222222" as const;
const position: HorrisUpDownPosition = { market: "BTC/USDT", marketToken, collateralToken, side: "long", sizeUsd: "300", collateralAmount: "100", effectiveLeverage: 3, increasedAt: 1, decreasedAt: 0 };
const stop: HorrisUpDownOrder = { key: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", market: "BTC/USDT", marketToken, type: "StopLossDecrease", orderType: 6, side: "long", sizeUsd: "300", collateralAmount: "0", triggerPrice: "98000", acceptablePrice: "97500", executionFeeCelo: "1", updatedAt: 1, validFrom: 0, isFrozen: false, autoCancel: false };
const base = { risk: "Balanced" as const, riskApproved: true, preflightPassed: true, authorizationAvailable: true, authorizationSimulationPassed: true, userSignaturePresent: true, entrySubmitted: true, entryConfirmed: true };

describe("Horris perp safety orchestrator", () => {
  it("monitors a fully protected live position without freezing new risk", () => {
    const state = derivePerpSafetyState({ ...base, positions: [position], orders: [stop] });
    expect(state.protectionConfirmed).toBe(true);
    expect(state.freezeNewRisk).toBe(false);
    expect(state.lifecycle.stage).toBe("monitor");
  });

  it("freezes new risk when a live position lacks stop coverage", () => {
    const state = derivePerpSafetyState({ ...base, positions: [position], orders: [] });
    expect(state.protectionConfirmed).toBe(false);
    expect(state.freezeNewRisk).toBe(true);
    expect(state.executionAllowed).toBe(false);
    expect(state.lifecycle.stage).toBe("protect");
  });

  it("routes a frozen stop into recovery and keeps execution locked", () => {
    const state = derivePerpSafetyState({ ...base, positions: [position], orders: [{ ...stop, isFrozen: true }] });
    expect(state.freezeNewRisk).toBe(true);
    expect(state.monitor.criticalCount).toBeGreaterThan(0);
    expect(state.executionAllowed).toBe(false);
    expect(["protect", "recover"]).toContain(state.lifecycle.stage);
  });

  it("does not invent protection requirements when there is no live exposure", () => {
    const state = derivePerpSafetyState({ ...base, entryConfirmed: false, positions: [], orders: [] });
    expect(state.protectionConfirmed).toBe(true);
    expect(state.freezeNewRisk).toBe(false);
    expect(state.lifecycle.stage).toBe("confirm");
  });
});
