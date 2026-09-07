import { describe, expect, it } from "vitest";
import { validatePerpSessionUse, type PerpSession } from "../lib/perp-session";

const session: PerpSession = { id: "session-1", enabled: true, issuedAt: 1000, expiresAt: 2000, maxExecutions: 3, usedExecutions: 0, nonce: 7 };

describe("perp agent sessions", () => {
  it("advances nonce and budget only for a valid use", () => { const r = validatePerpSessionUse(session, { sessionId: "session-1", nonce: 7, now: 1500 }); expect(r.allowed).toBe(true); expect(r.nextNonce).toBe(8); expect(r.nextUsedExecutions).toBe(1); });
  it("rejects replayed nonce", () => { expect(validatePerpSessionUse(session, { sessionId: "session-1", nonce: 6, now: 1500 }).allowed).toBe(false); });
  it("rejects expired session", () => { expect(validatePerpSessionUse(session, { sessionId: "session-1", nonce: 7, now: 2000 }).allowed).toBe(false); });
  it("rejects revoked session", () => { expect(validatePerpSessionUse({ ...session, revokedAt: 1400 }, { sessionId: "session-1", nonce: 7, now: 1500 }).allowed).toBe(false); });
  it("rejects exhausted execution budget", () => { expect(validatePerpSessionUse({ ...session, usedExecutions: 3 }, { sessionId: "session-1", nonce: 7, now: 1500 }).allowed).toBe(false); });
  it("rejects sessions longer than 24 hours", () => { const issuedAt = 1_000_000; const long = { ...session, issuedAt, expiresAt: issuedAt + 24 * 60 * 60 * 1000 + 1 }; expect(validatePerpSessionUse(long, { sessionId: long.id, nonce: long.nonce, now: issuedAt + 1 }).allowed).toBe(false); });
  it("rejects excessive execution budgets", () => { expect(validatePerpSessionUse({ ...session, maxExecutions: 101 }, { sessionId: session.id, nonce: session.nonce, now: 1500 }).allowed).toBe(false); });
  it("rejects nonce overflow", () => { const maxed = { ...session, nonce: Number.MAX_SAFE_INTEGER }; expect(validatePerpSessionUse(maxed, { sessionId: maxed.id, nonce: maxed.nonce, now: 1500 }).allowed).toBe(false); });
  it("rejects oversized session identities", () => { const oversized = { ...session, id: "x".repeat(129) }; expect(validatePerpSessionUse(oversized, { sessionId: oversized.id, nonce: oversized.nonce, now: 1500 }).allowed).toBe(false); });
});
