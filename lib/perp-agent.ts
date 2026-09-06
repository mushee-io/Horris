import type { PerpRiskAnalysis, PerpRiskProfile } from "./perps";

export type PerpAgentPermission = {
  enabled: boolean;
  expiresAt: number;
  allowedMarkets: string[];
  allowedSides: Array<"long" | "short">;
  maxNotionalUsd: number;
  maxLeverage: number;
  maxAccountRiskPercent: number;
  allowedRiskProfiles: PerpRiskProfile[];
  requireStopProtection: true;
};

export type PerpAgentRequest = {
  market: string;
  side: "long" | "short";
  risk: PerpRiskProfile;
  leverage: number;
  analysis: PerpRiskAnalysis;
  executionPreflightPassed: boolean;
  authorizationSimulationPassed: boolean;
};

function validPositive(value: number) { return Number.isFinite(value) && value > 0; }

export function canPerpAgentProceed(request: PerpAgentRequest, permission: PerpAgentPermission, now = Date.now()) {
  const reasons: string[] = [];
  if (!permission.enabled) reasons.push("Perp agent permission is disabled");
  if (!Number.isFinite(now) || !Number.isFinite(permission.expiresAt) || now >= permission.expiresAt) reasons.push("Perp agent permission has expired or has invalid timing");
  if (!Array.isArray(permission.allowedMarkets) || permission.allowedMarkets.length === 0 || !permission.allowedMarkets.includes(request.market)) reasons.push("Market is outside delegated scope");
  if (!Array.isArray(permission.allowedSides) || !permission.allowedSides.includes(request.side)) reasons.push("Side is outside delegated scope");
  if (!Array.isArray(permission.allowedRiskProfiles) || !permission.allowedRiskProfiles.includes(request.risk)) reasons.push("Risk profile is outside delegated scope");
  if (permission.requireStopProtection !== true) reasons.push("Delegation must require stop protection");
  if (!validPositive(permission.maxNotionalUsd) || !validPositive(permission.maxLeverage) || !validPositive(permission.maxAccountRiskPercent)) reasons.push("Delegated risk caps are invalid");
  if (!validPositive(request.leverage)) reasons.push("Requested leverage is invalid");
  if (!request.analysis.approved) reasons.push("Deterministic Horris risk policy rejected the trade");
  if (!validPositive(request.analysis.notionalUsd) || request.analysis.notionalUsd > permission.maxNotionalUsd) reasons.push("Notional exceeds delegated cap or is invalid");
  if (request.leverage > permission.maxLeverage) reasons.push("Leverage exceeds delegated cap");
  if (!Number.isFinite(request.analysis.accountRiskPercent) || request.analysis.accountRiskPercent < 0 || request.analysis.accountRiskPercent > permission.maxAccountRiskPercent) reasons.push("Projected account risk exceeds delegated cap or is invalid");
  if (!request.executionPreflightPassed) reasons.push("Exact venue transaction has not passed live preflight");
  if (!request.authorizationSimulationPassed) reasons.push("Signed authorization has not passed read-only onchain simulation");
  return { allowed: reasons.length === 0, reasons, executionEnabled: false as const };
}
