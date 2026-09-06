import { describe, expect, it } from "vitest";
import { derivePerpLifecycle, type PerpLifecycleInput } from "../lib/perp-lifecycle";

const base: PerpLifecycleInput = { riskApproved: true, preflightPassed: true, authorizationAvailable: true, authorizationSimulationPassed: true, userSignaturePresent: true, entrySubmitted: true, entryConfirmed: true, protectionConfirmed: true, criticalAlert: false };

describe("Horris perp lifecycle", () => {
  it("blocks before risk approval", () => { expect(derivePerpLifecycle({ ...base, riskApproved: false }).stage).toBe("blocked"); });
  it("never resubmits while entry confirmation is pending", () => { const state = derivePerpLifecycle({ ...base, entryConfirmed: false }); expect(state.stage).toBe("confirm"); expect(state.executionAllowed).toBe(false); expect(state.protectionUrgent).toBe(true); });
  it("freezes new exposure if entry exists without confirmed protection", () => { const state = derivePerpLifecycle({ ...base, protectionConfirmed: false }); expect(state.stage).toBe("protect"); expect(state.safe).toBe(false); expect(state.executionAllowed).toBe(false); });
  it("moves protected positions with critical alerts into recovery", () => { const state = derivePerpLifecycle({ ...base, criticalAlert: true }); expect(state.stage).toBe("recover"); expect(state.executionAllowed).toBe(false); });
  it("monitors only after entry and protection are confirmed", () => { const state = derivePerpLifecycle(base); expect(state.stage).toBe("monitor"); expect(state.safe).toBe(true); });
});
