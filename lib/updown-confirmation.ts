import type { HorrisUpDownOrder } from "./updown-orders";
import type { HorrisUpDownPosition } from "./updown-positions";

export type UpDownEntryConfirmationPhase = "order-pending" | "position-live" | "not-observed" | "ambiguous";

export type UpDownEntryConfirmation = {
  phase: UpDownEntryConfirmationPhase;
  marketToken: string;
  side: "long" | "short";
  expectedNotionalUsd: number;
  matchingOrderKeys: string[];
  matchingPositionCount: number;
  livePositionSizeUsd: number;
  nextAction: string;
  executionEnabled: false;
};

function closeEnough(actual: number, expected: number) {
  const tolerance = Math.max(0.01, expected * 0.005);
  return Math.abs(actual - expected) <= tolerance;
}

export function confirmUpDownEntryFromState(
  marketToken: string,
  side: "long" | "short",
  expectedNotionalUsd: number,
  positions: HorrisUpDownPosition[],
  orders: HorrisUpDownOrder[],
): UpDownEntryConfirmation {
  if (!/^0x[0-9a-fA-F]{40}$/.test(marketToken)) throw new Error("A valid market token is required");
  if (!Number.isFinite(expectedNotionalUsd) || expectedNotionalUsd <= 0) throw new Error("Expected notional must be positive");

  const relatedPositions = positions.filter((position) => position.marketToken.toLowerCase() === marketToken.toLowerCase() && position.side === side);
  const matchingPositions = relatedPositions.filter((position) => closeEnough(Number(position.sizeUsd), expectedNotionalUsd));
  const matchingOrders = orders.filter((order) =>
    order.marketToken.toLowerCase() === marketToken.toLowerCase() &&
    order.side === side &&
    [2, 3, 8].includes(order.orderType) &&
    !order.isFrozen &&
    closeEnough(Number(order.sizeUsd), expectedNotionalUsd)
  );

  if (matchingPositions.length > 1 || matchingOrders.length > 1 || (matchingPositions.length > 0 && matchingOrders.length > 0)) {
    return {
      phase: "ambiguous", marketToken, side, expectedNotionalUsd,
      matchingOrderKeys: matchingOrders.map((order) => order.key), matchingPositionCount: matchingPositions.length,
      livePositionSizeUsd: matchingPositions.reduce((sum, position) => sum + Math.max(0, Number(position.sizeUsd)), 0),
      nextAction: "Do not automate protection. Multiple matching venue states require manual disambiguation.", executionEnabled: false,
    };
  }

  if (matchingPositions.length === 1) {
    return {
      phase: "position-live", marketToken, side, expectedNotionalUsd, matchingOrderKeys: [], matchingPositionCount: 1,
      livePositionSizeUsd: Number(matchingPositions[0].sizeUsd),
      nextAction: "Entry is visible as a live position. Re-read protection coverage and compile only the uncovered stop size.", executionEnabled: false,
    };
  }

  if (matchingOrders.length === 1) {
    return {
      phase: "order-pending", marketToken, side, expectedNotionalUsd, matchingOrderKeys: [matchingOrders[0].key], matchingPositionCount: 0,
      livePositionSizeUsd: 0,
      nextAction: "Entry order is pending. Wait for venue execution; do not compile position protection yet.", executionEnabled: false,
    };
  }

  return {
    phase: "not-observed", marketToken, side, expectedNotionalUsd, matchingOrderKeys: [], matchingPositionCount: 0, livePositionSizeUsd: 0,
    nextAction: "Expected entry is not visible as a pending order or live position. Do not assume execution succeeded.", executionEnabled: false,
  };
}
