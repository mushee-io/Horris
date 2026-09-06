import { analyzePerpIntent, type PerpRiskProfile } from "./perps";

export type UntrustedAiPerpProposal = {
  market: string;
  side: "long" | "short";
  risk: PerpRiskProfile;
  marginUsd: number;
  leverage: number;
  accountBalanceUsd: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  rationale?: string;
};

const finitePositive = (value: number) => Number.isFinite(value) && value > 0;

export function reviewUntrustedAiProposal(proposal: UntrustedAiPerpProposal) {
  const malformed: string[] = [];
  if (!proposal.market || proposal.market.length > 32) malformed.push("Invalid market");
  if (proposal.side !== "long" && proposal.side !== "short") malformed.push("Invalid side");
  for (const [name, value] of Object.entries({ marginUsd: proposal.marginUsd, leverage: proposal.leverage, accountBalanceUsd: proposal.accountBalanceUsd, entryPrice: proposal.entryPrice, stopLoss: proposal.stopLoss, takeProfit: proposal.takeProfit })) {
    if (!finitePositive(value)) malformed.push(`Invalid ${name}`);
  }
  if (proposal.rationale && proposal.rationale.length > 2_000) malformed.push("AI rationale is too large");
  if (malformed.length) return { accepted: false as const, executable: false as const, malformed, analysis: null, authority: "horris-policy" as const };

  const analysis = analyzePerpIntent({ market: proposal.market, side: proposal.side, marginUsd: proposal.marginUsd, leverage: proposal.leverage, accountBalanceUsd: proposal.accountBalanceUsd, entryPrice: proposal.entryPrice, stopLoss: proposal.stopLoss, takeProfit: proposal.takeProfit, risk: proposal.risk });
  return { accepted: analysis.approved, executable: false as const, malformed: [], analysis, authority: "horris-policy" as const };
}
