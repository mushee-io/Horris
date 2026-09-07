import { afterEach, describe, expect, it, vi } from "vitest";
import { requestGroqPerpProposal, AiAdvisorUnavailableError } from "../lib/groq-perp-advisor";

const input = { market: "BTC", side: "long" as const, risk: "Balanced" as const, accountBalanceUsd: 5000, entryPrice: 100000 };
const proposal = { ...input, marginUsd: 100, leverage: 2, stopLoss: 99000, takeProfit: 102000, rationale: "Bounded setup" };
const originalKey = process.env.GROQ_API_KEY;

afterEach(() => { vi.unstubAllGlobals(); if (originalKey === undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = originalKey; });

describe("Groq perp advisor", () => {
  it("fails closed when no API key is configured", async () => { delete process.env.GROQ_API_KEY; await expect(requestGroqPerpProposal(input)).rejects.toBeInstanceOf(AiAdvisorUnavailableError); });
  it("accepts structured output only as a non-executable proposal", async () => { process.env.GROQ_API_KEY = "test-key"; vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(proposal) } }] }) })); const result = await requestGroqPerpProposal(input); expect(result.provider).toBe("groq"); expect(result.executionEnabled).toBe(false); expect(result.review.authority).toBe("horris-policy"); expect(result.review.accepted).toBe(true); });
  it("rejects provider mutation of immutable trade context", async () => { process.env.GROQ_API_KEY = "test-key"; vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ ...proposal, market: "ETH" }) } }] }) })); await expect(requestGroqPerpProposal(input)).rejects.toThrow("mutated immutable trade context"); });
  it("rejects malformed provider JSON", async () => { process.env.GROQ_API_KEY = "test-key"; vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: "not-json" } }] }) })); await expect(requestGroqPerpProposal(input)).rejects.toBeInstanceOf(AiAdvisorUnavailableError); });
  it("fails closed on provider errors", async () => { process.env.GROQ_API_KEY = "test-key"; vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429 })); await expect(requestGroqPerpProposal(input)).rejects.toBeInstanceOf(AiAdvisorUnavailableError); });
  it("sends no execution authority to the model", async () => { process.env.GROQ_API_KEY = "test-key"; const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(proposal) } }] }) }); vi.stubGlobal("fetch", fetchMock); await requestGroqPerpProposal(input); const init = fetchMock.mock.calls[0][1] as RequestInit; const body = JSON.parse(String(init.body)); expect(body.messages[0].content).toContain("Never claim execution"); expect(String(init.body)).not.toContain("private key"); });
});
