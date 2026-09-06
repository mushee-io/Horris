import { analyzePerpRiskState } from "./perp-monitor";
import { derivePerpProtectionSequence } from "./perp-sequence";
import type { HorrisUpDownOrder } from "./updown-orders";
import type { HorrisUpDownPosition } from "./updown-positions";

export function formatDiscordPerpStatus(positions: HorrisUpDownPosition[], orders: HorrisUpDownOrder[]) {
  const riskState = analyzePerpRiskState(positions, orders, "Balanced");
  if (positions.length === 0) {
    const frozen = orders.filter((order) => order.isFrozen).length;
    const pendingEntries = riskState.alerts.filter((alert) => alert.code === "PENDING_ENTRY").length;
    const orphanStops = riskState.alerts.filter((alert) => alert.code === "ORPHAN_STOP").length;
    const risks = [
      pendingEntries ? `${pendingEntries} pending entr${pendingEntries === 1 ? "y" : "ies"}` : "",
      orphanStops ? `${orphanStops} orphan stop${orphanStops === 1 ? "" : "s"}` : "",
    ].filter(Boolean).join(" · ");
    return `Horris PERP STATUS · no live UpDown positions · ${orders.length} pending order${orders.length === 1 ? "" : "s"}${frozen ? ` · ${frozen} frozen` : ""}${risks ? ` · ${risks}` : ""}. Read-only.`.slice(0, 1_900);
  }

  const lines = positions.slice(0, 5).map((position) => {
    const sequence = derivePerpProtectionSequence(position.marketToken, position.side, positions, orders);
    return `${position.market} ${position.side.toUpperCase()} · $${Number(position.sizeUsd).toFixed(2)} · stop ${sequence.stopCoveragePercent.toFixed(1)}% · ${sequence.phase.toUpperCase().replaceAll("-", " ")}`;
  });
  const extra = positions.length > 5 ? `\n+${positions.length - 5} more position(s)` : "";
  const riskLine = riskState.alerts.length ? `\nRisk alerts: ${riskState.criticalCount} critical · ${riskState.warningCount} warning` : "";
  return `Horris PERP STATUS · ${positions.length} live position${positions.length === 1 ? "" : "s"}\n${lines.join("\n")}${extra}${riskLine}\nRead-only; no order submitted.`.slice(0, 1_900);
}
