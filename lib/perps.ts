export type PerpRiskProfile = "Conservative" | "Balanced" | "Aggressive";
export type PerpSide = "long" | "short";

export const perpRiskPolicy = {
  Conservative: { maxLeverage: 3, maxAccountRiskPercent: 1, maxNotionalUsd: 1_000, maxMarginUtilizationPercent: 20, minRewardRisk: 1.5 },
  Balanced: { maxLeverage: 5, maxAccountRiskPercent: 2, maxNotionalUsd: 5_000, maxMarginUtilizationPercent: 35, minRewardRisk: 1.25 },
  Aggressive: { maxLeverage: 10, maxAccountRiskPercent: 4, maxNotionalUsd: 10_000, maxMarginUtilizationPercent: 50, minRewardRisk: 1 },
} as const;

export type PerpIntent = { market: string; side: PerpSide; marginUsd: number; leverage: number; accountBalanceUsd: number; entryPrice: number; stopLoss: number; takeProfit?: number; risk: PerpRiskProfile };
export type PerpRiskCheck = { code: string; label: string; passed: boolean; detail: string };
export type PerpRiskAnalysis = {
  approved: boolean; notionalUsd: number; stopDistancePercent: number; projectedLossAtStopUsd: number;
  projectedProfitAtTakeProfitUsd?: number; accountRiskPercent: number; marginUtilizationPercent: number; rewardRisk?: number;
  marginExhaustionMovePercent: number; stopBeforeMarginExhaustion: boolean; checks: PerpRiskCheck[]; warnings: string[];
};

function positive(value: number, name: string) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive number`);
}

export function analyzePerpIntent(intent: PerpIntent): PerpRiskAnalysis {
  positive(intent.marginUsd, "Margin"); positive(intent.leverage, "Leverage"); positive(intent.accountBalanceUsd, "Account balance");
  positive(intent.entryPrice, "Entry price"); positive(intent.stopLoss, "Stop loss");
  if (intent.takeProfit !== undefined) positive(intent.takeProfit, "Take profit");
  if (!Object.prototype.hasOwnProperty.call(perpRiskPolicy, intent.risk)) throw new Error("Invalid Horris risk profile");
  if (intent.side !== "long" && intent.side !== "short") throw new Error("Side must be long or short");
  if (!intent.market.trim()) throw new Error("Market is required");
  if (intent.marginUsd > intent.accountBalanceUsd) throw new Error("Margin cannot exceed account balance");

  const policy = perpRiskPolicy[intent.risk];
  const notionalUsd = intent.marginUsd * intent.leverage;
  if (!Number.isFinite(notionalUsd)) throw new Error("Notional is outside safe numeric range");
  const stopDistancePercent = Math.abs(intent.entryPrice - intent.stopLoss) / intent.entryPrice * 100;
  const projectedLossAtStopUsd = notionalUsd * stopDistancePercent / 100;
  const accountRiskPercent = projectedLossAtStopUsd / intent.accountBalanceUsd * 100;
  const marginUtilizationPercent = intent.marginUsd / intent.accountBalanceUsd * 100;
  const marginExhaustionMovePercent = 100 / intent.leverage;
  if (![stopDistancePercent, projectedLossAtStopUsd, accountRiskPercent, marginUtilizationPercent, marginExhaustionMovePercent].every(Number.isFinite)) throw new Error("Risk calculation is outside safe numeric range");
  const stopBeforeMarginExhaustion = stopDistancePercent < marginExhaustionMovePercent;
  const stopDirectionValid = intent.side === "long" ? intent.stopLoss < intent.entryPrice : intent.stopLoss > intent.entryPrice;
  const takeProfitDirectionValid = intent.takeProfit === undefined || (intent.side === "long" ? intent.takeProfit > intent.entryPrice : intent.takeProfit < intent.entryPrice);
  const projectedProfitAtTakeProfitUsd = intent.takeProfit === undefined ? undefined : notionalUsd * (Math.abs(intent.takeProfit - intent.entryPrice) / intent.entryPrice);
  if (projectedProfitAtTakeProfitUsd !== undefined && !Number.isFinite(projectedProfitAtTakeProfitUsd)) throw new Error("Take-profit calculation is outside safe numeric range");
  const rewardRisk = projectedProfitAtTakeProfitUsd === undefined || projectedLossAtStopUsd <= 0 ? undefined : projectedProfitAtTakeProfitUsd / projectedLossAtStopUsd;

  const checks: PerpRiskCheck[] = [
    { code: "LEVERAGE_CAP", label: "Leverage cap", passed: intent.leverage <= policy.maxLeverage, detail: `${intent.leverage.toFixed(2)}x requested · ${policy.maxLeverage}x Horris cap` },
    { code: "NOTIONAL_CAP", label: "Notional cap", passed: notionalUsd <= policy.maxNotionalUsd, detail: `$${notionalUsd.toFixed(2)} notional · $${policy.maxNotionalUsd.toFixed(2)} cap` },
    { code: "STOP_DIRECTION", label: "Stop direction", passed: stopDirectionValid, detail: stopDirectionValid ? "Stop is on the loss side of entry" : "Stop must sit on the loss side of entry" },
    { code: "ACCOUNT_RISK", label: "Account risk", passed: accountRiskPercent <= policy.maxAccountRiskPercent, detail: `${accountRiskPercent.toFixed(2)}% projected account loss at stop · ${policy.maxAccountRiskPercent}% cap` },
    { code: "MARGIN_UTILIZATION", label: "Margin utilization", passed: marginUtilizationPercent <= policy.maxMarginUtilizationPercent, detail: `${marginUtilizationPercent.toFixed(2)}% of account margin · ${policy.maxMarginUtilizationPercent}% cap` },
    { code: "STOP_BUFFER", label: "Margin exhaustion buffer", passed: stopBeforeMarginExhaustion, detail: `${stopDistancePercent.toFixed(2)}% stop distance · ${marginExhaustionMovePercent.toFixed(2)}% gross move would consume posted margin before venue maintenance margin, fees and funding` },
    { code: "TAKE_PROFIT_DIRECTION", label: "Take-profit direction", passed: takeProfitDirectionValid, detail: takeProfitDirectionValid ? "Take profit is on the profitable side of entry" : "Take profit is on the wrong side of entry" },
  ];
  if (rewardRisk !== undefined) checks.push({ code: "REWARD_RISK", label: "Reward / risk", passed: Number.isFinite(rewardRisk) && rewardRisk >= policy.minRewardRisk, detail: `${Number.isFinite(rewardRisk) ? rewardRisk.toFixed(2) : "invalid"}R projected · ${policy.minRewardRisk.toFixed(2)}R minimum` });

  return {
    approved: checks.every((check) => check.passed), notionalUsd, stopDistancePercent, projectedLossAtStopUsd, projectedProfitAtTakeProfitUsd,
    accountRiskPercent, marginUtilizationPercent, rewardRisk, marginExhaustionMovePercent, stopBeforeMarginExhaustion, checks,
    warnings: [
      "Margin exhaustion is a Horris planning estimate, not a venue liquidation price.",
      "Actual liquidation depends on UpDown maintenance margin, price impact, fees, funding, keeper execution and oracle mechanics.",
      "A stop order can execute worse than its trigger during fast markets or liquidity stress.",
    ],
  };
}
