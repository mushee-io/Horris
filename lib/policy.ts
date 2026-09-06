import { riskPolicy, type HorrisRisk } from "./mento";
import type { StrategyProposal } from "./strategy";

export type PolicyCheck = { rule: string; passed: boolean; detail: string };
export type PolicySimulation = { passed: boolean; checks: PolicyCheck[] };

export function simulatePolicy(proposal: StrategyProposal, balance: number, risk: HorrisRisk): PolicySimulation {
  const policy = riskPolicy[risk];
  const checks: PolicyCheck[] = [
    { rule: "Approved protocol", passed: proposal.protocol === "Mento", detail: "Mento is the only enabled V1 adapter." },
    { rule: "Approved input", passed: proposal.assetIn === "USDC", detail: "V1 accepts test USDC as execution input." },
    { rule: "Approved output", passed: proposal.assetOut === "USDm", detail: "V1 route terminates in Mento USDm." },
    { rule: "Execution cap", passed: proposal.amount <= policy.maxAllocation, detail: `Maximum ${policy.maxAllocation} USDC for ${risk}.` },
    { rule: "Available balance", passed: proposal.amount <= balance, detail: `Wallet reports ${balance.toFixed(2)} USDC.` },
    { rule: "Human approval", passed: proposal.requiresUserApproval, detail: "V1 never grants unrestricted autonomous execution." },
  ];

  return { passed: checks.every((check) => check.passed), checks };
}
