import type { HorrisRisk } from "./mento";
import { simulatePolicy } from "./policy";
import { proposeStableStrategy } from "./strategy";

export const HORRIS_RISKS = ["Conservative", "Balanced", "Aggressive"] as const satisfies readonly HorrisRisk[];

export type DiscordCommand =
  | { name: "strategy"; amount: number; balance: number; risk: HorrisRisk }
  | { name: "risk"; amount: number; balance: number; risk: HorrisRisk }
  | { name: "help" };

export function isHorrisRisk(value: unknown): value is HorrisRisk {
  return typeof value === "string" && (HORRIS_RISKS as readonly string[]).includes(value);
}

export function handleDiscordCommand(command: DiscordCommand) {
  if (command.name === "help") {
    return { content: "Horris commands: /strategy and /risk. Execution remains subject to Horris policy and explicit permissions." };
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
