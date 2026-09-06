export type HorrisRisk = "Conservative" | "Balanced" | "Aggressive";

export const riskPolicy = {
  Conservative: { slippage: 0.25, maxAllocation: 250 },
  Balanced: { slippage: 0.5, maxAllocation: 1000 },
  Aggressive: { slippage: 1, maxAllocation: 5000 },
} as const satisfies Record<HorrisRisk, { slippage: number; maxAllocation: number }>;
