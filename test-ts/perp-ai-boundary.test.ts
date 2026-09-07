import { describe, expect, it } from "vitest";
import { reviewUntrustedAiProposal } from "../lib/perp-ai-boundary";

const safe = { market: "BTC", side: "long" as const, risk: "Balanced" as const, marginUsd: 100, leverage: 2, accountBalanceUsd: 5000, entryPrice: 100000, stopLoss: 99000, takeProfit: 102000 };

describe("untrusted AI proposal boundary", () => {
  it("accepts a policy-approved proposal but never marks it executable", () => { const r = reviewUntrustedAiProposal(safe); expect(r.accepted).toBe(true); expect(r.executable).toBe(false); expect(r.authority).toBe("horris-policy"); });
  it("rejects non-finite model output", () => { const r = reviewUntrustedAiProposal({ ...safe, leverage: Number.NaN }); expect(r.accepted).toBe(false); expect(r.analysis).toBeNull(); });
  it("rejects dangerous leverage through deterministic policy", () => { const r = reviewUntrustedAiProposal({ ...safe, leverage: 100 }); expect(r.accepted).toBe(false); expect(r.executable).toBe(false); });
  it("rejects oversized model rationale", () => { const r = reviewUntrustedAiProposal({ ...safe, rationale: "x".repeat(2001) }); expect(r.accepted).toBe(false); });
  it("rejects an unknown risk profile before policy lookup", () => { const r = reviewUntrustedAiProposal({ ...safe, risk: "YOLO" as never }); expect(r.accepted).toBe(false); expect(r.analysis).toBeNull(); expect(r.malformed).toContain("Invalid risk profile"); });
  it("rejects hostile market strings", () => { const r = reviewUntrustedAiProposal({ ...safe, market: "BTC<script>" }); expect(r.accepted).toBe(false); expect(r.analysis).toBeNull(); });
  it("rejects absurd numeric parser inputs", () => { const r = reviewUntrustedAiProposal({ ...safe, accountBalanceUsd: 1_000_000_001 }); expect(r.accepted).toBe(false); expect(r.analysis).toBeNull(); });
  it("rejects non-string rationale at runtime", () => { const r = reviewUntrustedAiProposal({ ...safe, rationale: { ignore: "policy" } as never }); expect(r.accepted).toBe(false); expect(r.analysis).toBeNull(); });
});
