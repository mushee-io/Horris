export type PerpSession = {
  id: string;
  enabled: boolean;
  issuedAt: number;
  expiresAt: number;
  maxExecutions: number;
  usedExecutions: number;
  nonce: number;
  revokedAt?: number;
};

export type PerpSessionUse = { sessionId: string; nonce: number; now?: number };

const MAX_SESSION_ID_LENGTH = 128;
const MAX_SESSION_LIFETIME_MS = 24 * 60 * 60 * 1000;
const MAX_SESSION_EXECUTIONS = 100;

export function validatePerpSessionUse(session: PerpSession, use: PerpSessionUse) {
  const now = use.now ?? Date.now();
  const reasons: string[] = [];
  if (!session || !use || typeof session !== "object" || typeof use !== "object") return { allowed: false, reasons: ["Invalid session input"], nextNonce: 0, nextUsedExecutions: 0 };
  if (typeof session.id !== "string" || typeof use.sessionId !== "string" || !session.id || session.id.length > MAX_SESSION_ID_LENGTH || session.id !== use.sessionId) reasons.push("Session identity mismatch");
  if (!session.enabled || session.revokedAt !== undefined) reasons.push("Session is revoked or disabled");
  if (![session.issuedAt, session.expiresAt, session.maxExecutions, session.usedExecutions, session.nonce, use.nonce, now].every(Number.isFinite)) reasons.push("Session contains invalid numeric state");
  if (!Number.isSafeInteger(session.issuedAt) || !Number.isSafeInteger(session.expiresAt) || !Number.isSafeInteger(now)) reasons.push("Session timestamps are invalid");
  if (session.issuedAt >= session.expiresAt || session.expiresAt - session.issuedAt > MAX_SESSION_LIFETIME_MS || now < session.issuedAt || now >= session.expiresAt) reasons.push("Session is outside its validity window");
  if (!Number.isSafeInteger(session.maxExecutions) || session.maxExecutions <= 0 || session.maxExecutions > MAX_SESSION_EXECUTIONS || !Number.isSafeInteger(session.usedExecutions) || session.usedExecutions < 0 || session.usedExecutions >= session.maxExecutions) reasons.push("Session execution budget is exhausted or invalid");
  if (!Number.isSafeInteger(session.nonce) || session.nonce < 0 || !Number.isSafeInteger(use.nonce) || use.nonce < 0 || use.nonce !== session.nonce || session.nonce === Number.MAX_SAFE_INTEGER) reasons.push("Session nonce is invalid, stale or replayed");
  const allowed = reasons.length === 0;
  return { allowed, reasons: [...new Set(reasons)], nextNonce: allowed ? session.nonce + 1 : session.nonce, nextUsedExecutions: allowed ? session.usedExecutions + 1 : session.usedExecutions };
}
