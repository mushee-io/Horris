"use client";

import { useEffect, useState } from "react";
import type { Address } from "viem";
import type { PerpRiskProfile } from "../lib/perps";

type Position = {
  market: string;
  marketToken: Address;
  collateralToken: Address;
  side: "long" | "short";
  sizeUsd: string;
  collateralAmount: string;
  effectiveLeverage: number | null;
  increasedAt: number;
  decreasedAt: number;
};

type Order = {
  key: `0x${string}`;
  market: string;
  marketToken: Address;
  type: string;
  orderType: number;
  side: "long" | "short";
  sizeUsd: string;
  collateralAmount: string;
  triggerPrice: string | null;
  acceptablePrice: string | null;
  executionFeeCelo: string;
  updatedAt: number;
  validFrom: number;
  isFrozen: boolean;
  autoCancel: boolean;
};

type Alert = { severity: "critical" | "warning" | "info"; code: string; market: string; message: string };
type Protection = {
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

type RiskState = {
  risk: PerpRiskProfile;
  healthy: boolean;
  criticalCount: number;
  warningCount: number;
  protections: Protection[];
  alerts: Alert[];
};

export default function PerpMonitorPanel({ account }: { account?: Address }) {
  const [positions, setPositions] = useState<Position[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [riskState, setRiskState] = useState<RiskState>();
  const [risk, setRisk] = useState<PerpRiskProfile>("Balanced");
  const [status, setStatus] = useState(account ? "Reading UpDown risk state…" : "Connect a wallet to monitor UpDown positions and orders");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    if (!account) {
      setPositions([]);
      setOrders([]);
      setRiskState(undefined);
      setStatus("Connect a wallet to monitor UpDown positions and orders");
      return;
    }
    setBusy(true);
    setStatus("Reading positions, orders and protection state from Celo mainnet…");
    try {
      const response = await fetch(`/api/perps/risk-state?account=${account}&risk=${risk}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Risk-state read failed");
      setPositions(data.positions);
      setOrders(data.orders);
      setRiskState(data.riskState);
      setStatus(data.riskState.healthy
        ? `${data.positions.length} position${data.positions.length === 1 ? "" : "s"} · no critical protection gaps`
        : `${data.riskState.criticalCount} critical · ${data.riskState.warningCount} warning`);
    } catch (error) {
      setPositions([]);
      setOrders([]);
      setRiskState(undefined);
      setStatus(error instanceof Error ? error.message : "UpDown risk-state read failed");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { void refresh(); }, [account, risk]);

  function protectionFor(position: Position) {
    return riskState?.protections.find((item) => item.market === position.market && item.side === position.side);
  }

  return (
    <section className="perp-monitor shell" aria-label="UpDown risk monitor">
      <div className="activity-head"><div><p className="eyebrow">LIVE RISK MONITOR</p><h2>Protection state.</h2></div><div className="monitor-actions"><select value={risk} onChange={(event) => setRisk(event.target.value as PerpRiskProfile)}><option>Conservative</option><option>Balanced</option><option>Aggressive</option></select><button className="button button-small" disabled={busy || !account} onClick={refresh}>{busy ? "Reading…" : "Refresh mainnet"}</button></div></div>

      {riskState && <div className={riskState.healthy ? "risk-banner healthy" : "risk-banner danger"}><div><small>HORRIS {risk.toUpperCase()} VERDICT</small><strong>{riskState.healthy ? "PROTECTION CHECKS CLEAR" : "ACTION REQUIRED"}</strong></div><div><span>{riskState.criticalCount} critical</span><span>{riskState.warningCount} warning</span></div></div>}

      {riskState?.alerts.length ? <div className="alert-stack">{riskState.alerts.map((alert, index) => <div className={`risk-alert ${alert.severity}`} key={`${alert.code}-${alert.market}-${index}`}><strong>{alert.severity.toUpperCase()} · {alert.market}</strong><p>{alert.message}</p></div>)}</div> : null}

      {!positions.length ? <div className="empty-state"><span>◎</span><div><strong>No active positions loaded</strong><p>Horris reads UpDown through public contracts; no mainnet signature is required.</p></div></div> : <div className="position-grid">{positions.map((position, index) => { const protection = protectionFor(position); return <article className={protection?.fullyStopProtected ? "position-card protected" : "position-card exposed"} key={`${position.marketToken}-${position.side}-${index}`}><div><small>{position.market}</small><strong>{position.side.toUpperCase()}</strong></div><dl><div><dt>Size</dt><dd>${Number(position.sizeUsd).toFixed(2)}</dd></div><div><dt>Collateral</dt><dd>{Number(position.collateralAmount).toFixed(4)}</dd></div><div><dt>Effective leverage</dt><dd>{position.effectiveLeverage === null ? "—" : `${position.effectiveLeverage.toFixed(2)}×`}</dd></div><div><dt>Stop coverage</dt><dd>{protection ? `${protection.stopCoveragePercent.toFixed(1)}%` : "—"}</dd></div><div><dt>Pending increase</dt><dd>{protection ? `$${protection.pendingIncreaseUsd.toFixed(2)}` : "—"}</dd></div></dl><p>{protection?.fullyStopProtected ? "Active stop coverage satisfies current Horris size check." : "Horris protection gap detected."}</p></article>; })}</div>}

      <div className="monitor-subhead"><span>06</span><h3>Pending UpDown orders</h3></div>
      {!orders.length ? <div className="empty-state compact"><span>·</span><div><strong>No pending orders loaded</strong><p>Protective, increase, decrease and limit orders will appear here when present.</p></div></div> : <div className="order-grid">{orders.map((order) => <article className={order.isFrozen ? "order-card frozen" : "order-card"} key={order.key}><div><small>{order.market}</small><strong>{order.type}</strong></div><dl><div><dt>Side</dt><dd>{order.side.toUpperCase()}</dd></div><div><dt>Size</dt><dd>${Number(order.sizeUsd).toFixed(2)}</dd></div><div><dt>Trigger</dt><dd>{order.triggerPrice ? Number(order.triggerPrice).toFixed(6) : "—"}</dd></div><div><dt>Acceptable</dt><dd>{order.acceptablePrice ? Number(order.acceptablePrice).toFixed(6) : "—"}</dd></div><div><dt>Fee</dt><dd>{Number(order.executionFeeCelo).toFixed(4)} CELO</dd></div><div><dt>Status</dt><dd>{order.isFrozen ? "FROZEN" : "PENDING"}</dd></div></dl><p>{order.updatedAt ? `Updated ${new Date(order.updatedAt * 1000).toLocaleString()}` : order.key}</p></article>)}</div>}
      <p className="status">{status}</p>
    </section>
  );
}
