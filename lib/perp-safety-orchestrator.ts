import { derivePerpLifecycle, type PerpLifecycleInput } from "./perp-lifecycle";
import { analyzePerpRiskState } from "./perp-monitor";
import type { PerpRiskProfile } from "./perps";
import type { HorrisUpDownOrder } from "./updown-orders";
import type { HorrisUpDownPosition } from "./updown-positions";

export type PerpSafetyOrchestratorInput = Omit<PerpLifecycleInput, "protectionConfirmed" | "criticalAlert"> & {
  risk: PerpRiskProfile;
  positions: HorrisUpDownPosition[];
  orders: HorrisUpDownOrder[];
};

export function derivePerpSafetyState(input: PerpSafetyOrchestratorInput) {
  const monitor = analyzePerpRiskState(input.positions, input.orders, input.risk);
  const hasLiveExposure = input.positions.length > 0;
  const protectionConfirmed = !hasLiveExposure || monitor.protections.every((item) => item.fullyStopProtected && !item.hasFrozenStop);
  const criticalAlert = monitor.criticalCount > 0;
  const lifecycle = derivePerpLifecycle({ ...input, protectionConfirmed, criticalAlert });
  const freezeNewRisk = hasLiveExposure && (!protectionConfirmed || criticalAlert);
  return {
    lifecycle,
    monitor,
    protectionConfirmed,
    freezeNewRisk,
    executionAllowed: lifecycle.executionAllowed && !freezeNewRisk,
    authority: "horris-policy" as const,
  };
}
