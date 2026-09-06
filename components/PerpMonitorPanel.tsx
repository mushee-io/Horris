"use client";

import { useEffect, useState } from "react";
import type { Address } from "viem";

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

export default function PerpMonitorPanel({ account }: { account?: Address }) {
  const [positions, setPositions] = useState<Position[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [status, setStatus] = useState(account ? "Reading UpDown risk state…" : "Connect a wallet to monitor UpDown positions and orders");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    if (!account) {
      setPositions([]);
      setOrders([]);
      setStatus("Connect a wallet to monitor UpDown positions and orders");
      return;
    }
    setBusy(true);
    setStatus("Reading live UpDown positions and pending orders from Celo mainnet…");
    try {
      const [positionResponse, orderResponse] = await Promise.all([
        fetch(`/api/perps/positions?account=${account}`, { cache: "no-store" }),
        fetch(`/api/perps/orders?account=${account}`, { cache: "no-store" }),
      ]);
      const [positionData, orderData] = await Promise.all([positionResponse.json(), orderResponse.json()]);
      if (!positionResponse.ok) throw new Error(positionData.error ?? "Position read failed");
      if (!orderResponse.ok) throw new Error(orderData.error ?? "Pending order read failed");
      setPositions(positionData.positions);
      setOrders(orderData.orders);
      setStatus(`${positionData.positions.length} open position${positionData.positions.length === 1 ? "" : "s"} · ${orderData.orders.length} pending order${orderData.orders.length === 1 ? "" : "s"}`);
    } catch (error) {
      setPositions([]);
      setOrders([]);
      setStatus(error instanceof Error ? error.message : "UpDown risk-state read failed");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { void refresh(); }, [account]);

  return (
    <section className="perp-monitor shell" aria-label="UpDown risk monitor">
      <div className="activity-head"><div><p className="eyebrow">LIVE RISK MONITOR</p><h2>Positions + orders.</h2></div><button className="button button-small" disabled={busy || !account} onClick={refresh}>{busy ? "Reading…" : "Refresh mainnet"}</button></div>

      {!positions.length ? <div className="empty-state"><span>◎</span><div><strong>No active positions loaded</strong><p>Horris reads UpDown through the public Reader contract; no mainnet signature is required.</p></div></div> : <div className="position-grid">{positions.map((position, index) => <article className="position-card" key={`${position.marketToken}-${position.side}-${index}`}><div><small>{position.market}</small><strong>{position.side.toUpperCase()}</strong></div><dl><div><dt>Size</dt><dd>${Number(position.sizeUsd).toFixed(2)}</dd></div><div><dt>Collateral</dt><dd>{Number(position.collateralAmount).toFixed(4)}</dd></div><div><dt>Effective leverage</dt><dd>{position.effectiveLeverage === null ? "—" : `${position.effectiveLeverage.toFixed(2)}×`}</dd></div></dl><p>{position.increasedAt ? `Opened/updated ${new Date(position.increasedAt * 1000).toLocaleString()}` : "Timestamp unavailable"}</p></article>)}</div>}

      <div className="monitor-subhead"><span>06</span><h3>Pending UpDown orders</h3></div>
      {!orders.length ? <div className="empty-state compact"><span>·</span><div><strong>No pending orders loaded</strong><p>Protective, increase, decrease and limit orders will appear here when present.</p></div></div> : <div className="order-grid">{orders.map((order) => <article className={order.isFrozen ? "order-card frozen" : "order-card"} key={order.key}><div><small>{order.market}</small><strong>{order.type}</strong></div><dl><div><dt>Side</dt><dd>{order.side.toUpperCase()}</dd></div><div><dt>Size</dt><dd>${Number(order.sizeUsd).toFixed(2)}</dd></div><div><dt>Trigger</dt><dd>{order.triggerPrice ? Number(order.triggerPrice).toFixed(6) : "—"}</dd></div><div><dt>Acceptable</dt><dd>{order.acceptablePrice ? Number(order.acceptablePrice).toFixed(6) : "—"}</dd></div><div><dt>Fee</dt><dd>{Number(order.executionFeeCelo).toFixed(4)} CELO</dd></div><div><dt>Status</dt><dd>{order.isFrozen ? "FROZEN" : "PENDING"}</dd></div></dl><p>{order.updatedAt ? `Updated ${new Date(order.updatedAt * 1000).toLocaleString()}` : order.key}</p></article>)}</div>}
      <p className="status">{status}</p>
    </section>
  );
}
