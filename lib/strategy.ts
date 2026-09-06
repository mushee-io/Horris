import type { HorrisRisk } from "./risk-config";

export type StrategyProposal = {
  id: string;
  action: "swap";
  protocol: "Mento";
  assetIn: "USDC";
  assetOut: "USDm";
  amount: number;
  risk: HorrisRisk;
  riskScore: number;
  rationale: string;
  requiresUserApproval: boolean;
};

const riskScore = { Conservative: 18, Balanced: 35, Aggressive: 58 } as const;

export function proposeStableStrategy(amount: number, risk: HorrisRisk): StrategyProposal {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Invalid strategy amount");
  return {
    id: `horris-${Date.now()}`,
    action: "swap",
    protocol: "Mento",
    assetIn: "USDC",
    assetOut: "USDm",
    amount,
    risk,
    riskScore: riskScore[risk],
    rationale: "Diversify a portion of test USDC into Mento USDm using a transparent stablecoin route with bounded slippage.",
    requiresUserApproval: true,
  };
}
