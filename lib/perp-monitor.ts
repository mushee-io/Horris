import { perpRiskPolicy, type PerpRiskProfile } from "./perps";
import type { HorrisUpDownOrder } from "./updown-orders";
import type { HorrisUpDownPosition } from "./updown-positions";

export type PerpMonitorAlert = {
  severity: "critical" | "warning" | "info";
  code: string;
  market: string;
  message: string;
};

export type PerpPositionProtection = {
  market: string;
  side: "long" | "short";
  sizeUsd: number;
  effectiveLeverage: number | null;
  leverageWithinPolicy: boolean;
  stopOrderCount: number;
  stopCoveragePercent: number;
  fullyStopProtected: boolean;
  hasFrozenStop: boolean;
  pendingIncreaseUsd: number;
};

export type PerpRiskState = {
  risk: PerpRiskProfile;
  healthy: boolean;
  criticalCount: number;
  warningCount: number;
  protections: PerpPositionProtection[];
  alerts: PerpMonitorAlert[];
};

function sameExposure(marketToken: string, side: "long" | "short", position: HorrisUpDownPosition) {
  return position.marketToken.toLowerCase() === marketToken.toLowerCase() && position.side === side;
}

export function analyzePerpRiskState(
  positions: HorrisUpDownPosition[],
  orders: HorrisUpDownOrder[],
  risk: PerpRiskProfile = "Balanced",
): PerpRiskState {
  const policy = perpRiskPolicy[risk];
  const alerts: PerpMonitorAlert[] = [];

  const protections = positions.map((position) => {
    const positionSize = Number(position.sizeUsd);
    const stops = orders.filter((order) => order.marketToken.toLowerCase() === position.marketToken.toLowerCase() && order.side === position.side && order.orderType === 6);
    const activeStops = stops.filter((order) => !order.isFrozen);
    const frozenStops = stops.filter((order) => order.isFrozen);
    const coveredUsd = activeStops.reduce((sum, order) => sum + Math.max(0, Number(order.sizeUsd)), 0);
    const stopCoveragePercent = positionSize > 0 ? Math.min(100, coveredUsd / positionSize * 100) : 0;
    const fullyStopProtected = stopCoveragePercent >= 99.5;
    const leverageWithinPolicy = position.effectiveLeverage !== null && position.effectiveLeverage <= policy.maxLeverage;
    const pendingIncreaseUsd = orders
      .filter((order) => order.marketToken.toLowerCase() === position.marketToken.toLowerCase() && order.side === position.side && !order.isFrozen && (order.orderType === 2 || order.orderType === 3 || order.orderType === 8))
      .reduce((sum, order) => sum + Math.max(0, Number(order.sizeUsd)), 0);

    if (!fullyStopProtected) {
      alerts.push({ severity: "critical", code: "STOP_COVERAGE", market: position.market, message: `${position.market} ${position.side} has only ${stopCoveragePercent.toFixed(1)}% active stop-loss coverage.` });
    }
    if (frozenStops.length) {
      alerts.push({ severity: "critical", code: "FROZEN_STOP", market: position.market, message: `${position.market} has ${frozenStops.length} frozen stop-loss order${frozenStops.length === 1 ? "" : "s"}.` });
    }
    if (!leverageWithinPolicy) {
      alerts.push({
        severity: "warning", code: "LEVERAGE_POLICY", market: position.market,
        message: position.effectiveLeverage === null
          ? `${position.market} effective leverage could not be derived from position collateral.`
          : `${position.market} effective leverage ${position.effectiveLeverage.toFixed(2)}x exceeds the ${risk} ${policy.maxLeverage}x limit.`,
      });
    }
    if (pendingIncreaseUsd > 0) {
      alerts.push({ severity: "warning", code: "PENDING_INCREASE", market: position.market, message: `${position.market} has $${pendingIncreaseUsd.toFixed(2)} of additional pending increase exposure.` });
    }

    return {
      market: position.market, side: position.side, sizeUsd: positionSize, effectiveLeverage: position.effectiveLeverage,
      leverageWithinPolicy, stopOrderCount: stops.length, stopCoveragePercent, fullyStopProtected,
      hasFrozenStop: frozenStops.length > 0, pendingIncreaseUsd,
    };
  });

  for (const order of orders) {
    const hasLivePosition = positions.some((position) => sameExposure(order.marketToken, order.side, position));
    if (order.isFrozen && order.orderType !== 6) {
      alerts.push({ severity: "warning", code: "FROZEN_ORDER", market: order.market, message: `${order.market} ${order.type} order is frozen.` });
    }
    if (!hasLivePosition && !order.isFrozen && (order.orderType === 2 || order.orderType === 3 || order.orderType === 8)) {
      const pendingUsd = Math.max(0, Number(order.sizeUsd));
      alerts.push({
        severity: "warning", code: "PENDING_ENTRY", market: order.market,
        message: `${order.market} ${order.side} has ${Number.isFinite(pendingUsd) ? `$${pendingUsd.toFixed(2)}` : "unknown size"} of pending entry exposure before a live position exists.`,
      });
    }
    if (!hasLivePosition && order.orderType === 6) {
      alerts.push({
        severity: order.isFrozen ? "critical" : "warning", code: "ORPHAN_STOP", market: order.market,
        message: `${order.market} ${order.side} has a stop-loss order but no matching live position. Review or cancel stale protection before new automation.`,
      });
    }
  }

  const criticalCount = alerts.filter((alert) => alert.severity === "critical").length;
  const warningCount = alerts.filter((alert) => alert.severity === "warning").length;
  return { risk, healthy: criticalCount === 0, criticalCount, warningCount, protections, alerts };
}
