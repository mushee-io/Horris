import type { StrategyProposal } from "./strategy";
import type { PolicySimulation } from "./policy";

export type AgentPermission = {
  enabled: boolean;
  maxAmount: number;
  allowedProtocol: "Mento";
  allowedPair: "USDC/USDm";
  expiresAt: number;
};

export function canAgentSubmit(proposal: StrategyProposal, simulation: PolicySimulation, permission: AgentPermission) {
  const reasons: string[] = [];
  if (!permission.enabled) reasons.push("Agent permission is disabled");
  if (Date.now() >= permission.expiresAt) reasons.push("Agent permission has expired");
  if (proposal.amount > permission.maxAmount) reasons.push("Proposal exceeds delegated amount");
  if (proposal.protocol !== permission.allowedProtocol) reasons.push("Protocol is outside delegation");
  if (`${proposal.assetIn}/${proposal.assetOut}` !== permission.allowedPair) reasons.push("Pair is outside delegation");
  if (!simulation.passed) reasons.push("Policy simulation failed");

  return { allowed: reasons.length === 0, reasons };
}
