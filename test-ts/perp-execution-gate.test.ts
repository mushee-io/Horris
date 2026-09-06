import { describe, expect, it } from "vitest";
import { derivePerpExecutionGate } from "../lib/perp-execution-gate";
import { analyzePerpIntent } from "../lib/perps";

const approvedRisk = analyzePerpIntent({ market: "BTC", side: "long", marginUsd: 100, leverage: 2, accountBalanceUsd: 5_000, entryPrice: 100_000, stopLoss: 99_000, takeProfit: 102_000, risk: "Balanced" });
const blockedRisk = analyzePerpIntent({ market: "BTC", side: "long", marginUsd: 100, leverage: 8, accountBalanceUsd: 5_000, entryPrice: 100_000, stopLoss: 99_000, takeProfit: 102_000, risk: "Balanced" });

describe("Horris perp execution gate", () => {
  it("blocks execution when deterministic risk policy fails", () => {
    const gate = derivePerpExecutionGate({ risk: blockedRisk, preflightPassed: true, authorizationAvailable: true, authorizationSimulationPassed: true, signingEnabled: true, submissionEnabled: true });
    expect(gate.stage).toBe("risk-blocked"); expect(gate.readyForSubmission).toBe(false); expect(gate.blockedReasons.some((reason) => reason.includes("LEVERAGE_CAP"))).toBe(true);
  });

  it("requires live transaction preflight before authorization", () => {
    const gate = derivePerpExecutionGate({ risk: approvedRisk, preflightPassed: false, authorizationAvailable: false });
    expect(gate.stage).toBe("preflight-blocked"); expect(gate.readyForAuthorization).toBe(false);
  });

  it("keeps signing locked even after risk and preflight pass", () => {
    const gate = derivePerpExecutionGate({ risk: approvedRisk, preflightPassed: true, authorizationAvailable: true });
    expect(gate.readyForSigning).toBe(true); expect(gate.readyForSubmission).toBe(false); expect(gate.stage).toBe("signature-simulation-required");
  });

  it("requires signed authorization simulation before submission", () => {
    const gate = derivePerpExecutionGate({ risk: approvedRisk, preflightPassed: true, authorizationAvailable: true, signingEnabled: true, submissionEnabled: true });
    expect(gate.stage).toBe("signature-simulation-required"); expect(gate.readyForSubmission).toBe(false);
  });

  it("can only reach ready when every explicit gate is enabled", () => {
    const gate = derivePerpExecutionGate({ risk: approvedRisk, preflightPassed: true, authorizationAvailable: true, authorizationSimulationPassed: true, signingEnabled: true, submissionEnabled: true });
    expect(gate.stage).toBe("ready"); expect(gate.readyForSubmission).toBe(true);
  });
});
