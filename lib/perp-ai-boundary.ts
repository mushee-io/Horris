import { analyzePerpIntent, perpRiskPolicy, type PerpRiskProfile } from "./perps";

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

const MAX_MARKET_LENGTH = 32;
const MAX_RATIONALE_LENGTH = 2_000;
const MAX_ABSOLUTE_USD_INPUT = 1_000_000_000;
const MAX_ABSOLUTE_PRICE_INPUT = 1_000_000_000;
const MAX_ABSOLUTE_LEVERAGE_INPUT = 1_000;
const finitePositive = (value: number) => Number.isFinite(value) && value > 0;
const cleanMarket = (value: string) => /^[A-Z0-9._-]{1,32}$/.test(value);

export function reviewUntrustedAiProposal(proposal: UntrustedAiPerpProposal) {
  const malformed: string[] = [];
  if (!proposal || typeof proposal !== "object") return { accepted: false as const, executable: false as const, malformed: ["Invalid proposal"], analysis: null, authority: "horris-policy" as const };
  if (typeof proposal.market !== "string" || proposal.market.length > MAX_MARKET_LENGTH || !cleanMarket(proposal.market)) malformed.push("Invalid market");
  if (proposal.side !== "long" && proposal.side !== "short") malformed.push("Invalid side");
  if (!(proposal.risk in perpRiskPolicy)) malformed.push("Invalid risk profile");

  for (const [name, value] of Object.entries({ marginUsd: proposal.marginUsd, leverage: proposal.leverage, accountBalanceUsd: proposal.accountBalanceUsd, entryPrice: proposal.entryPrice, stopLoss: proposal.stopLoss, takeProfit: proposal.takeProfit })) {
    if (typeof value !== "number" || !finitePositive(value)) malformed.push(`Invalid ${name}`);
  }
  if (finitePositive(proposal.marginUsd) && proposal.marginUsd > MAX_ABSOLUTE_USD_INPUT) malformed.push("Margin exceeds parser ceiling");
  if (finitePositive(proposal.accountBalanceUsd) && proposal.accountBalanceUsd > MAX_ABSOLUTE_USD_INPUT) malformed.push("Account balance exceeds parser ceiling");
  if (finitePositive(proposal.leverage) && proposal.leverage > MAX_ABSOLUTE_LEVERAGE_INPUT) malformed.push("Leverage exceeds parser ceiling");
  for (const [name, value] of Object.entries({ entryPrice: proposal.entryPrice, stopLoss: proposal.stopLoss, takeProfit: proposal.takeProfit })) {
    if (finitePositive(value) && value > MAX_ABSOLUTE_PRICE_INPUT) malformed.push(`${name} exceeds parser ceiling`);
  }
  if (proposal.rationale !== undefined && typeof proposal.rationale !== "string") malformed.push("Invalid AI rationale");
  if (typeof proposal.rationale === "string" && proposal.rationale.length > MAX_RATIONALE_LENGTH) malformed.push("AI rationale is too large");
  if (malformed.length) return { accepted: false as const, executable: false as const, malformed: [...new Set(malformed)], analysis: null, authority: "horris-policy" as const };

  const analysis = analyzePerpIntent({ market: proposal.market, side: proposal.side, marginUsd: proposal.marginUsd, leverage: proposal.leverage, accountBalanceUsd: proposal.accountBalanceUsd, entryPrice: proposal.entryPrice, stopLoss: proposal.stopLoss, takeProfit: proposal.takeProfit, risk: proposal.risk });
  return { accepted: analysis.approved, executable: false as const, malformed: [], analysis, authority: "horris-policy" as const };
}
