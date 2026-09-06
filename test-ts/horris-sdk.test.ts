import { describe, expect, it } from "vitest";
import { HorrisSDK } from "../lib/horris-sdk";

describe("Horris SDK", () => {
  it("exposes supported UpDown markets and deterministic risk analysis", () => {
    expect(HorrisSDK.markets.length).toBeGreaterThanOrEqual(8);
    const result = HorrisSDK.analyzePerpIntent({ market: "BTC", side: "long", marginUsd: 100, leverage: 2, accountBalanceUsd: 5_000, entryPrice: 100_000, stopLoss: 99_000, takeProfit: 102_000, risk: "Balanced" });
    expect(result.approved).toBe(true);
  });
  it("exposes the bounded advisor without enabling execution", () => {
    const proposal = HorrisSDK.proposeBoundedPerpIntent({ market: "BTC", side: "long", risk: "Balanced", accountBalanceUsd: 5_000, entryPrice: 100_000 });
    expect(proposal.executable).toBe(false); expect(proposal.analysis.approved).toBe(true);
  });
});
