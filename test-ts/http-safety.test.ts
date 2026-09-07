import { afterEach, describe, expect, it } from "vitest";
import { checkBurstRateLimit, HttpRequestSafetyError, isCrossSiteBrowserRequest, readBoundedJson, resetHttpSafetyStateForTests } from "../lib/http-safety";

afterEach(() => resetHttpSafetyStateForTests());

describe("HTTP safety helpers", () => {
  it("parses a small JSON body", async () => {
    const request = new Request("https://horris.test/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ok: true }) });
    await expect(readBoundedJson(request, 1024)).resolves.toEqual({ ok: true });
  });

  it("rejects oversized streamed bodies even without Content-Length", async () => {
    const request = new Request("https://horris.test/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ data: "x".repeat(300) }) });
    await expect(readBoundedJson(request, 64)).rejects.toMatchObject<HttpRequestSafetyError>({ status: 413, code: "REQUEST_BODY_TOO_LARGE" });
  });

  it("rejects non-JSON content types", async () => {
    const request = new Request("https://horris.test/api", { method: "POST", headers: { "content-type": "text/plain" }, body: "{}" });
    await expect(readBoundedJson(request, 1024)).rejects.toMatchObject<HttpRequestSafetyError>({ status: 415, code: "UNSUPPORTED_MEDIA_TYPE" });
  });

  it("detects cross-site browser requests", () => {
    const request = new Request("https://horris.test/api", { headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" } });
    expect(isCrossSiteBrowserRequest(request)).toBe(true);
    const sameOrigin = new Request("https://horris.test/api", { headers: { origin: "https://horris.test", "sec-fetch-site": "same-origin" } });
    expect(isCrossSiteBrowserRequest(sameOrigin)).toBe(false);
  });

  it("rate limits repeated requests by client and globally", () => {
    const request = new Request("https://horris.test/api", { headers: { "x-forwarded-for": "203.0.113.5" } });
    const config = { namespace: "test", maxPerIp: 2, maxGlobal: 10, windowMs: 60_000 };
    expect(checkBurstRateLimit(request, config).allowed).toBe(true);
    expect(checkBurstRateLimit(request, config).allowed).toBe(true);
    const blocked = checkBurstRateLimit(request, config);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });
});
