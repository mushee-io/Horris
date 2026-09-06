export type ProtectionFailureInput = {
  entryConfirmed: boolean;
  stopCoveragePercent: number;
  protectionOrderFrozen: boolean;
  oracleFresh: boolean;
  rpcHealthy: boolean;
  retryCount: number;
};

export type ProtectionRecovery = {
  severity: "none" | "warning" | "critical";
  freezeNewRisk: boolean;
  retryProtection: boolean;
  recommendReduceOrClose: boolean;
  humanReviewRequired: boolean;
  reason: string;
};

export function planProtectionFailureRecovery(input: ProtectionFailureInput): ProtectionRecovery {
  if (!input.entryConfirmed) return { severity: "none", freezeNewRisk: false, retryProtection: false, recommendReduceOrClose: false, humanReviewRequired: false, reason: "No confirmed live entry requires protection yet." };
  if (input.stopCoveragePercent >= 100 && !input.protectionOrderFrozen) return { severity: "none", freezeNewRisk: false, retryProtection: false, recommendReduceOrClose: false, humanReviewRequired: false, reason: "Confirmed position is fully covered by active stop protection." };
  if (!input.oracleFresh || !input.rpcHealthy) return { severity: "critical", freezeNewRisk: true, retryProtection: false, recommendReduceOrClose: true, humanReviewRequired: true, reason: "Protection cannot be trusted while oracle or RPC state is unhealthy. Freeze new risk and prepare a reviewed reduce/close recovery." };
  if (input.protectionOrderFrozen) return { severity: "critical", freezeNewRisk: true, retryProtection: false, recommendReduceOrClose: true, humanReviewRequired: true, reason: "Protection order is frozen. Do not stack replacement orders until the stale order is reviewed/cancelled." };
  if (input.retryCount < 2) return { severity: "warning", freezeNewRisk: true, retryProtection: true, recommendReduceOrClose: false, humanReviewRequired: false, reason: "Position is under-protected. Retry the exact uncovered protection size after fresh preflight." };
  return { severity: "critical", freezeNewRisk: true, retryProtection: false, recommendReduceOrClose: true, humanReviewRequired: true, reason: "Protection retries are exhausted. Stop adding risk and prepare a reviewed reduce/close transaction." };
}
