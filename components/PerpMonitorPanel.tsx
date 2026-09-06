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

export default function PerpMonitorPanel({ account }: { account?: Address }) {
  const [positions, setPositions] = useState<Position[]>([]);
  const [status, setStatus] = useState(account ? "Reading UpDown positions…" : "Connect a wallet to monitor UpDown positions");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    if (!account) {
      setPositions([]);
      setStatus("Connect a wallet to monitor UpDown positions");
      return;
    }
    setBusy(true);
    setStatus("Reading live UpDown positions from Celo mainnet…");
    try {
      const response = await fetch(`/api/perps/positions?account=${account}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Position read failed");
      setPositions(data.positions);
      setStatus(data.positions.length ? `${data.positions.length} live position${data.positions.length === 1 ? "" : "s"} found` : "No live UpDown positions for this address");
    } catch (error) {
      setPositions([]);
      setStatus(error instanceof Error ? error.message : "Position read failed");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { void refresh(); }, [account]);

  return (
    <section className="perp-monitor shell" aria-label="UpDown position monitor">
      <div className="activity-head"><div><p className="eyebrow">LIVE RISK MONITOR</p><h2>Open positions.</h2></div><button className="button button-small" disabled={busy || !account} onClick={refresh}>{busy ? "Reading…" : "Refresh mainnet"}</button></div>
      {!positions.length ? <div className="empty-state"><span>◎</span><div><strong>Read-only UpDown monitor</strong><p>{status}. Horris does not require a mainnet signature to inspect the connected address.</p></div></div> : <div className="position-grid">{positions.map((position, index) => <article className="position-card" key={`${position.marketToken}-${position.side}-${index}`}><div><small>{position.market}</small><strong>{position.side.toUpperCase()}</strong></div><dl><div><dt>Size</dt><dd>${Number(position.sizeUsd).toFixed(2)}</dd></div><div><dt>Collateral</dt><dd>{Number(position.collateralAmount).toFixed(4)}</dd></div><div><dt>Effective leverage</dt><dd>{position.effectiveLeverage === null ? "—" : `${position.effectiveLeverage.toFixed(2)}×`}</dd></div></dl><p>{position.increasedAt ? `Opened/updated ${new Date(position.increasedAt * 1000).toLocaleString()}` : "Timestamp unavailable"}</p></article>)}</div>}
      <p className="status">{status}</p>
    </section>
  );
}
