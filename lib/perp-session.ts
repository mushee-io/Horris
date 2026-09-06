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

export function validatePerpSessionUse(session: PerpSession, use: PerpSessionUse) {
  const now = use.now ?? Date.now();
  const reasons: string[] = [];
  if (!session.id || session.id !== use.sessionId) reasons.push("Session identity mismatch");
  if (!session.enabled || session.revokedAt !== undefined) reasons.push("Session is revoked or disabled");
  if (![session.issuedAt, session.expiresAt, session.maxExecutions, session.usedExecutions, session.nonce, use.nonce, now].every(Number.isFinite)) reasons.push("Session contains invalid numeric state");
  if (session.issuedAt >= session.expiresAt || now < session.issuedAt || now >= session.expiresAt) reasons.push("Session is outside its validity window");
  if (!Number.isInteger(session.maxExecutions) || session.maxExecutions <= 0 || !Number.isInteger(session.usedExecutions) || session.usedExecutions < 0 || session.usedExecutions >= session.maxExecutions) reasons.push("Session execution budget is exhausted or invalid");
  if (!Number.isSafeInteger(session.nonce) || session.nonce < 0 || use.nonce !== session.nonce) reasons.push("Session nonce is invalid, stale or replayed");
  return { allowed: reasons.length === 0, reasons, nextNonce: reasons.length === 0 ? session.nonce + 1 : session.nonce, nextUsedExecutions: reasons.length === 0 ? session.usedExecutions + 1 : session.usedExecutions };
}
