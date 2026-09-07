import { analyzePerpIntent, type PerpIntent } from "./perps";
import { proposeBoundedPerpIntent } from "./perp-advisor";
import { derivePerpExecutionGate, type PerpExecutionGateInput } from "./perp-execution-gate";
import { canPerpAgentProceed, type PerpAgentPermission, type PerpAgentRequest } from "./perp-agent";
import { derivePerpSafetyState, type PerpSafetyOrchestratorInput } from "./perp-safety-orchestrator";
import { buildUnsignedUpDownIncreaseOrderPlan } from "./updown-order";
import { buildUnsignedUpDownCancelPlan } from "./updown-cancel";
import { getUpDownMarket, UPDOWN_MARKETS, UPDOWN_CELO } from "./updown";

export const HorrisSDK = {
  analyzePerpIntent,
  proposeBoundedPerpIntent,
  derivePerpExecutionGate,
  derivePerpSafetyState,
  canPerpAgentProceed,
  buildUnsignedUpDownIncreaseOrderPlan,
  buildUnsignedUpDownCancelPlan,
  getUpDownMarket,
  markets: UPDOWN_MARKETS,
  celo: UPDOWN_CELO,
} as const;

export type { PerpIntent, PerpExecutionGateInput, PerpSafetyOrchestratorInput, PerpAgentPermission, PerpAgentRequest };
