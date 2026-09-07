import { afterEach, describe, expect, it, vi } from "vitest";
import { requestGroqPerpProposal, AiAdvisorUnavailableError } from "../lib/groq-perp-advisor";

const input = { market: "BTC", side: "long" as const, risk: "Balanced" as const, accountBalanceUsd: 5000, entryPrice: 100000 };
const proposal = { ...input, marginUsd: 100, leverage: 2, stopLoss: 99000, takeProfit: 102000, rationale: "Bounded setup" };
const originalKey = process.env.GROQ_API_KEY;
const originalModel = process.env.GROQ_MODEL;

function providerResponse(payload: unknown, options: { ok?: boolean; status?: number; headers?: HeadersInit; raw?: boolean } = {}) {
  const raw = options.raw ? String(payload) : JSON.stringify(payload);
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    headers: new Headers(options.headers),
    text: async () => raw,
  };
}

function validPayload(value = proposal) {
  return { choices: [{ message: { content: JSON.stringify(value) } }] };
}

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalKey === undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = originalKey;
  if (originalModel === undefined) delete process.env.GROQ_MODEL; else process.env.GROQ_MODEL = originalModel;
});

describe("Groq perp advisor", () => {
  it("fails closed when no API key is configured", async () => {
    delete process.env.GROQ_API_KEY;
    await expect(requestGroqPerpProposal(input)).rejects.toBeInstanceOf(AiAdvisorUnavailableError);
  });

  it("accepts structured output only as a non-executable proposal", async () => {
    process.env.GROQ_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(providerResponse(validPayload())));
    const result = await requestGroqPerpProposal(input);
    expect(result.provider).toBe("groq");
    expect(result.executionEnabled).toBe(false);
    expect(result.review.authority).toBe("horris-policy");
    expect(result.review.accepted).toBe(true);
  });

  it("rejects provider mutation of immutable trade context", async () => {
    process.env.GROQ_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(providerResponse(validPayload({ ...proposal, market: "ETH" }))));
    await expect(requestGroqPerpProposal(input)).rejects.toThrow("mutated immutable trade context");
  });

  it("rejects malformed proposal JSON", async () => {
    process.env.GROQ_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(providerResponse({ choices: [{ message: { content: "not-json" } }] })));
    await expect(requestGroqPerpProposal(input)).rejects.toBeInstanceOf(AiAdvisorUnavailableError);
  });

  it("rejects malformed provider JSON before proposal parsing", async () => {
    process.env.GROQ_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(providerResponse("not-provider-json", { raw: true })));
    await expect(requestGroqPerpProposal(input)).rejects.toThrow("malformed provider JSON");
  });

  it("fails closed on provider errors", async () => {
    process.env.GROQ_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(providerResponse({}, { ok: false, status: 429 })));
    await expect(requestGroqPerpProposal(input)).rejects.toBeInstanceOf(AiAdvisorUnavailableError);
  });

  it("rejects oversized provider responses", async () => {
    process.env.GROQ_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(providerResponse("x", { raw: true, headers: { "content-length": "70000" } })));
    await expect(requestGroqPerpProposal(input)).rejects.toThrow("size limit");
  });

  it("fails closed on invalid model configuration", async () => {
    process.env.GROQ_API_KEY = "test-key";
    process.env.GROQ_MODEL = "bad model name";
    await expect(requestGroqPerpProposal(input)).rejects.toThrow("model configuration is invalid");
  });

  it("sends no execution authority to the model and disables redirects/cache", async () => {
    process.env.GROQ_API_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValue(providerResponse(validPayload()));
    vi.stubGlobal("fetch", fetchMock);
    await requestGroqPerpProposal(input);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(init.body));
    expect(body.messages[0].content).toContain("Never claim execution");
    expect(String(init.body)).not.toContain("test-key");
    expect(init.redirect).toBe("error");
    expect(init.cache).toBe("no-store");
  });
});
