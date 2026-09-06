import type { HorrisUpDownOrder } from "./updown-orders";
import type { HorrisUpDownPosition } from "./updown-positions";

export type PerpProtectionPhase =
  | "awaiting-position"
  | "protection-required"
  | "protected"
  | "review-exposure"
  | "blocked";

export type PerpProtectionSequence = {
  phase: PerpProtectionPhase;
  marketToken: string;
  side: "long" | "short";
  positionSizeUsd: number;
  activeStopCoverageUsd: number;
  stopCoveragePercent: number;
  pendingIncreaseUsd: number;
  frozenStopCount: number;
  nextAction: string;
  executionAllowed: false;
};

export function derivePerpProtectionSequence(
  marketToken: string,
  side: "long" | "short",
  positions: HorrisUpDownPosition[],
  orders: HorrisUpDownOrder[],
): PerpProtectionSequence {
  const matches = positions.filter((position) => position.marketToken.toLowerCase() === marketToken.toLowerCase() && position.side === side);
  if (matches.length > 1) throw new Error("Multiple matching positions require collateral disambiguation");

  const position = matches[0];
  if (!position) {
    return {
      phase: "awaiting-position", marketToken, side, positionSizeUsd: 0, activeStopCoverageUsd: 0,
      stopCoveragePercent: 0, pendingIncreaseUsd: 0, frozenStopCount: 0,
      nextAction: "Wait for the entry order to create a live position, then re-read venue state before compiling protection.",
      executionAllowed: false,
    };
  }

  const size = Number(position.sizeUsd);
  if (!Number.isFinite(size) || size <= 0) throw new Error("Live position size is invalid");
  const related = orders.filter((order) => order.marketToken.toLowerCase() === marketToken.toLowerCase() && order.side === side);
  const stops = related.filter((order) => order.orderType === 6);
  const frozenStops = stops.filter((order) => order.isFrozen);
  const activeStopCoverageUsd = stops.filter((order) => !order.isFrozen).reduce((sum, order) => sum + Math.max(0, Number(order.sizeUsd)), 0);
  const stopCoveragePercent = Math.min(100, activeStopCoverageUsd / size * 100);
  const pendingIncreaseUsd = related
    .filter((order) => !order.isFrozen && (order.orderType === 2 || order.orderType === 3 || order.orderType === 8))
    .reduce((sum, order) => sum + Math.max(0, Number(order.sizeUsd)), 0);

  if (frozenStops.length > 0) {
    return {
      phase: "blocked", marketToken, side, positionSizeUsd: size, activeStopCoverageUsd, stopCoveragePercent,
      pendingIncreaseUsd, frozenStopCount: frozenStops.length,
      nextAction: "Do not add exposure. Review or replace the frozen stop-loss order before any further automation.", executionAllowed: false,
    };
  }

  if (stopCoveragePercent < 99.5) {
    return {
      phase: "protection-required", marketToken, side, positionSizeUsd: size, activeStopCoverageUsd, stopCoveragePercent,
      pendingIncreaseUsd, frozenStopCount: 0,
      nextAction: "Compile stop-loss protection only for the currently uncovered position size using a fresh venue read.", executionAllowed: false,
    };
  }

  if (pendingIncreaseUsd > 0) {
    return {
      phase: "review-exposure", marketToken, side, positionSizeUsd: size, activeStopCoverageUsd, stopCoveragePercent,
      pendingIncreaseUsd, frozenStopCount: 0,
      nextAction: "Protection is currently sufficient, but pending increase orders may expand exposure. Re-evaluate after they execute.", executionAllowed: false,
    };
  }

  return {
    phase: "protected", marketToken, side, positionSizeUsd: size, activeStopCoverageUsd, stopCoveragePercent,
    pendingIncreaseUsd: 0, frozenStopCount: 0,
    nextAction: "Current live position has sufficient active stop-loss coverage. Continue read-only monitoring.", executionAllowed: false,
  };
}
