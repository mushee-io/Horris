import type { PerpRiskAnalysis } from "./perps";

export type PerpExecutionGateInput = {
  risk: PerpRiskAnalysis;
  preflightPassed: boolean;
  authorizationAvailable: boolean;
  authorizationSimulationPassed?: boolean;
  signingEnabled?: boolean;
  submissionEnabled?: boolean;
};

export type PerpExecutionGate = {
  readyForAuthorization: boolean;
  readyForSigning: boolean;
  readyForSubmission: boolean;
  blockedReasons: string[];
  stage: "risk-blocked" | "preflight-blocked" | "authorization-required" | "signature-simulation-required" | "signing-locked" | "submission-locked" | "ready";
};

export function derivePerpExecutionGate(input: PerpExecutionGateInput): PerpExecutionGate {
  const blockedReasons: string[] = [];
  if (!input.risk.approved) blockedReasons.push(...input.risk.checks.filter((check) => !check.passed).map((check) => `${check.code}: ${check.detail}`));
  if (!input.preflightPassed) blockedReasons.push("Exact UpDown transaction has not passed live readiness and eth_call simulation.");
  if (!input.authorizationAvailable) blockedReasons.push("Replay-safe EIP-712 authorization payload is not available.");
  if (input.authorizationSimulationPassed !== true) blockedReasons.push("Signed authorization has not passed read-only onchain simulation.");
  if (input.signingEnabled !== true) blockedReasons.push("Wallet signing is deliberately locked.");
  if (input.submissionEnabled !== true) blockedReasons.push("Mainnet submission is deliberately locked.");

  const readyForAuthorization = input.risk.approved && input.preflightPassed;
  const readyForSigning = readyForAuthorization && input.authorizationAvailable;
  const readyForSubmission = readyForSigning && input.authorizationSimulationPassed === true && input.signingEnabled === true && input.submissionEnabled === true;

  let stage: PerpExecutionGate["stage"] = "ready";
  if (!input.risk.approved) stage = "risk-blocked";
  else if (!input.preflightPassed) stage = "preflight-blocked";
  else if (!input.authorizationAvailable) stage = "authorization-required";
  else if (input.authorizationSimulationPassed !== true) stage = "signature-simulation-required";
  else if (input.signingEnabled !== true) stage = "signing-locked";
  else if (input.submissionEnabled !== true) stage = "submission-locked";

  return { readyForAuthorization, readyForSigning, readyForSubmission, blockedReasons, stage };
}
