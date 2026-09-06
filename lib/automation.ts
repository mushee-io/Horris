import type { AgentPermission } from "./agent";
import type { PolicySimulation } from "./policy";
import type { StrategyProposal } from "./strategy";

export type AutomationMode = "manual" | "guarded";

export type AutomationDecision = {
  mode: AutomationMode;
  canExecute: boolean;
  requiresUserApproval: boolean;
  reasons: string[];
};

export function evaluateAutomation(
  mode: AutomationMode,
  proposal: StrategyProposal,
  simulation: PolicySimulation,
  permission?: AgentPermission,
): AutomationDecision {
  if (mode === "manual") {
    return {
      mode,
      canExecute: simulation.passed,
      requiresUserApproval: true,
      reasons: simulation.passed ? [] : ["Policy simulation failed"],
    };
  }

  const reasons: string[] = [];
  if (!permission) reasons.push("No agent permission configured");
  if (!simulation.passed) reasons.push("Policy simulation failed");

  if (permission) {
    if (!permission.enabled) reasons.push("Agent permission disabled");
    if (Date.now() >= permission.expiresAt) reasons.push("Agent permission expired");
    if (proposal.amount > permission.maxAmount) reasons.push("Proposal exceeds delegated amount");
    if (proposal.protocol !== permission.allowedProtocol) reasons.push("Protocol outside delegation");
    if (`${proposal.assetIn}/${proposal.assetOut}` !== permission.allowedPair) reasons.push("Pair outside delegation");
  }

  return {
    mode,
    canExecute: reasons.length === 0,
    requiresUserApproval: false,
    reasons,
  };
}
