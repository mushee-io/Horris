import { analyzePerpIntent, perpRiskPolicy, type PerpIntent, type PerpRiskAnalysis } from "./perps";

export type PerpAdvisorProposal = {
  source: "deterministic-horris";
  executable: false;
  recommendedMarginUsd: number;
  recommendedLeverage: number;
  recommendedStopLoss: number;
  recommendedTakeProfit: number;
  analysis: PerpRiskAnalysis;
  rationale: string[];
  disclaimer: string;
};

function round(value: number, digits = 6) { const factor = 10 ** digits; return Math.round(value * factor) / factor; }

export function proposeBoundedPerpIntent(intent: Omit<PerpIntent, "marginUsd" | "leverage" | "stopLoss" | "takeProfit"> & { preferredMarginUsd?: number; preferredLeverage?: number }): PerpAdvisorProposal {
  const policy = perpRiskPolicy[intent.risk];
  const recommendedLeverage = Math.max(1, Math.min(policy.maxLeverage, Number.isFinite(intent.preferredLeverage) ? Number(intent.preferredLeverage) : Math.min(2, policy.maxLeverage)));
  const maxMarginByUtilization = intent.accountBalanceUsd * policy.maxMarginUtilizationPercent / 100;
  const recommendedMarginUsd = Math.max(1, Math.min(maxMarginByUtilization, Number.isFinite(intent.preferredMarginUsd) ? Number(intent.preferredMarginUsd) : Math.min(100, maxMarginByUtilization)));
  const targetAccountRiskPercent = policy.maxAccountRiskPercent * 0.75;
  const notionalUsd = recommendedMarginUsd * recommendedLeverage;
  const targetLossUsd = intent.accountBalanceUsd * targetAccountRiskPercent / 100;
  const stopDistancePercent = Math.min(targetLossUsd / notionalUsd * 100, 80 / recommendedLeverage);
  const stopDelta = intent.entryPrice * stopDistancePercent / 100;
  const recommendedStopLoss = intent.side === "long" ? intent.entryPrice - stopDelta : intent.entryPrice + stopDelta;
  const rewardRisk = Math.max(policy.minRewardRisk, 1.5);
  const takeProfitDelta = stopDelta * rewardRisk;
  const recommendedTakeProfit = intent.side === "long" ? intent.entryPrice + takeProfitDelta : intent.entryPrice - takeProfitDelta;
  const proposed: PerpIntent = { market: intent.market, side: intent.side, risk: intent.risk, accountBalanceUsd: intent.accountBalanceUsd, entryPrice: intent.entryPrice, marginUsd: recommendedMarginUsd, leverage: recommendedLeverage, stopLoss: recommendedStopLoss, takeProfit: recommendedTakeProfit };
  const analysis = analyzePerpIntent(proposed);
  return {
    source: "deterministic-horris", executable: false,
    recommendedMarginUsd: round(recommendedMarginUsd, 2), recommendedLeverage: round(recommendedLeverage, 2), recommendedStopLoss: round(recommendedStopLoss), recommendedTakeProfit: round(recommendedTakeProfit), analysis,
    rationale: [
      `Targets about ${targetAccountRiskPercent.toFixed(2)}% account risk, below the ${policy.maxAccountRiskPercent}% ${intent.risk} cap.`,
      `Keeps margin within the ${policy.maxMarginUtilizationPercent}% utilization ceiling and leverage at or below ${policy.maxLeverage}x.`,
      `Uses at least ${rewardRisk.toFixed(2)}R projected reward/risk before venue fees, funding, price impact and execution slippage.`,
    ],
    disclaimer: "This is a bounded Horris planning proposal, not financial advice or a price forecast. It cannot execute and must pass live venue and onchain policy checks.",
  };
}
