import type { Address, PublicClient } from "viem";
import { canAgentSubmit, type AgentPermission } from "../lib/agent";
import { evaluateAutomation, type AutomationMode } from "../lib/automation";
import { getPortfolio, getVaultActivity } from "../lib/portfolio";
import { simulatePolicy } from "../lib/policy";
import { proposeStableStrategy } from "../lib/strategy";
import type { HorrisRisk } from "../lib/risk-config";
import { analyzePerpIntent, type PerpIntent } from "../lib/perps";
import { buildUnsignedUpDownIncreaseOrderPlan } from "../lib/updown-order";
import { buildUpDownAuthorizationTypedData, type UpDownAuthorizationPayloadInput } from "../lib/updown-authorization";
import { derivePerpProtectionSequence } from "../lib/perp-sequence";
import type { HorrisUpDownPosition } from "../lib/updown-positions";
import type { HorrisUpDownOrder } from "../lib/updown-orders";

export class HorrisClient {
  constructor(private readonly publicClient: PublicClient) {}

  createStrategy(amount: number, risk: HorrisRisk) {
    return proposeStableStrategy(amount, risk);
  }

  simulate(amount: number, balance: number, risk: HorrisRisk) {
    const proposal = this.createStrategy(amount, risk);
    return { proposal, simulation: simulatePolicy(proposal, balance, risk) };
  }

  checkAgent(amount: number, balance: number, risk: HorrisRisk, permission: AgentPermission) {
    const { proposal, simulation } = this.simulate(amount, balance, risk);
    return { proposal, simulation, agent: canAgentSubmit(proposal, simulation, permission) };
  }

  evaluateAutomation(amount: number, balance: number, risk: HorrisRisk, mode: AutomationMode, permission?: AgentPermission) {
    const { proposal, simulation } = this.simulate(amount, balance, risk);
    return { proposal, simulation, automation: evaluateAutomation(mode, proposal, simulation, permission) };
  }

  analyzePerp(intent: PerpIntent) {
    return analyzePerpIntent(intent);
  }

  compileUnsignedUpDownOrder(intent: PerpIntent, receiver: Address, acceptablePriceSlippageBps = 50) {
    return buildUnsignedUpDownIncreaseOrderPlan(intent, receiver, acceptablePriceSlippageBps);
  }

  buildUpDownAuthorization(input: UpDownAuthorizationPayloadInput) {
    return buildUpDownAuthorizationTypedData(input);
  }

  protectionState(marketToken: string, side: "long" | "short", positions: HorrisUpDownPosition[], orders: HorrisUpDownOrder[]) {
    return derivePerpProtectionSequence(marketToken, side, positions, orders);
  }

  portfolio(account: Address) {
    return getPortfolio(this.publicClient, account);
  }

  activity(vault: Address, fromBlock: bigint) {
    return getVaultActivity(this.publicClient, vault, fromBlock);
  }
}

export * from "../lib/agent";
export * from "../lib/automation";
export * from "../lib/policy";
export * from "../lib/portfolio";
export * from "../lib/strategy";
export * from "../lib/risk-config";
export * from "../lib/perps";
export * from "../lib/updown";
export * from "../lib/updown-order";
export * from "../lib/updown-authorization";
export * from "../lib/perp-sequence";
