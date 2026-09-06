import type { HorrisRisk } from "./mento";
import { simulatePolicy } from "./policy";
import { proposeStableStrategy } from "./strategy";
import { analyzePerpIntent, type PerpRiskProfile, type PerpSide } from "./perps";

export const HORRIS_RISKS = ["Conservative", "Balanced", "Aggressive"] as const satisfies readonly HorrisRisk[];

export type DiscordCommand =
  | { name: "strategy"; amount: number; balance: number; risk: HorrisRisk }
  | { name: "risk"; amount: number; balance: number; risk: HorrisRisk }
  | {
      name: "perp-risk";
      market: string;
      side: PerpSide;
      balance: number;
      margin: number;
      leverage: number;
      entry: number;
      stop: number;
      takeProfit?: number;
      risk: PerpRiskProfile;
    }
  | { name: "help" };

export function isHorrisRisk(value: unknown): value is HorrisRisk {
  return typeof value === "string" && (HORRIS_RISKS as readonly string[]).includes(value);
}

export function isPerpSide(value: unknown): value is PerpSide {
  return value === "long" || value === "short";
}

export function handleDiscordCommand(command: DiscordCommand) {
  if (command.name === "help") {
    return { content: "Horris commands: /strategy, /risk, and /perp-risk. Discord is analysis-only; signing and execution remain disabled." };
  }

  if (command.name === "perp-risk") {
    const analysis = analyzePerpIntent({
      market: command.market,
      side: command.side,
      risk: command.risk,
      marginUsd: command.margin,
      leverage: command.leverage,
      accountBalanceUsd: command.balance,
      entryPrice: command.entry,
      stopLoss: command.stop,
      takeProfit: command.takeProfit,
    });
    const failed = analysis.checks.filter((check) => !check.passed).map((check) => check.label).join(", ");
    return {
      content: analysis.approved
        ? `Horris PERP PASS · ${command.market.toUpperCase()} ${command.side.toUpperCase()} · $${analysis.notionalUsd.toFixed(2)} notional · ${analysis.accountRiskPercent.toFixed(2)}% account risk · ${analysis.stopDistancePercent.toFixed(2)}% stop distance. Analysis only; no order submitted.`
        : `Horris PERP BLOCK · ${command.market.toUpperCase()} ${command.side.toUpperCase()} · failed: ${failed || "policy"}. Analysis only; no order submitted.`,
    };
  }

  const proposal = proposeStableStrategy(command.amount, command.risk);
  const simulation = simulatePolicy(proposal, command.balance, command.risk);

  if (command.name === "risk") {
    return {
      content: simulation.passed
        ? `Policy passed for ${proposal.amount} USDC · ${proposal.risk} · risk score ${proposal.riskScore}/100.`
        : `Policy blocked this proposal: ${simulation.checks.filter((check) => !check.passed).map((check) => check.rule).join(", ")}.`,
    };
  }

  return {
    content: `${proposal.action.toUpperCase()} ${proposal.amount} ${proposal.assetIn} → ${proposal.assetOut} via ${proposal.protocol}. Risk ${proposal.riskScore}/100. Policy: ${simulation.passed ? "PASS" : "BLOCK"}.`,
  };
}
