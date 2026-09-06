import { describe, expect, it } from "vitest";
import { validatePerpSessionUse, type PerpSession } from "../lib/perp-session";

const session: PerpSession = { id: "session-1", enabled: true, issuedAt: 1000, expiresAt: 2000, maxExecutions: 3, usedExecutions: 0, nonce: 7 };

describe("perp agent sessions", () => {
  it("advances nonce and budget only for a valid use", () => { const r = validatePerpSessionUse(session, { sessionId: "session-1", nonce: 7, now: 1500 }); expect(r.allowed).toBe(true); expect(r.nextNonce).toBe(8); expect(r.nextUsedExecutions).toBe(1); });
  it("rejects replayed nonce", () => { expect(validatePerpSessionUse(session, { sessionId: "session-1", nonce: 6, now: 1500 }).allowed).toBe(false); });
  it("rejects expired session", () => { expect(validatePerpSessionUse(session, { sessionId: "session-1", nonce: 7, now: 2000 }).allowed).toBe(false); });
  it("rejects revoked session", () => { expect(validatePerpSessionUse({ ...session, revokedAt: 1400 }, { sessionId: "session-1", nonce: 7, now: 1500 }).allowed).toBe(false); });
  it("rejects exhausted execution budget", () => { expect(validatePerpSessionUse({ ...session, usedExecutions: 3 }, { sessionId: "session-1", nonce: 7, now: 1500 }).allowed).toBe(false); });
});
