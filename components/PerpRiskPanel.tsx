"use client";

import { useMemo, useState } from "react";
import { perpRiskPolicy, type PerpRiskAnalysis, type PerpRiskProfile, type PerpSide } from "../lib/perps";
import { UPDOWN_MARKETS } from "../lib/updown";

type Result = {
  venue: string;
  executionEnabled: boolean;
  analysis: PerpRiskAnalysis;
  nextStep: string;
};

export default function PerpRiskPanel() {
  const [market, setMarket] = useState("BTC");
  const [side, setSide] = useState<PerpSide>("long");
  const [risk, setRisk] = useState<PerpRiskProfile>("Balanced");
  const [marginUsd, setMarginUsd] = useState("100");
  const [leverage, setLeverage] = useState("3");
  const [accountBalanceUsd, setAccountBalanceUsd] = useState("1000");
  const [entryPrice, setEntryPrice] = useState("100000");
  const [stopLoss, setStopLoss] = useState("98000");
  const [takeProfit, setTakeProfit] = useState("104000");
  const [result, setResult] = useState<Result>();
  const [status, setStatus] = useState("Venue execution locked · risk analysis only");
  const [busy, setBusy] = useState(false);

  const policy = useMemo(() => perpRiskPolicy[risk], [risk]);

  async function analyze() {
    setBusy(true);
    setResult(undefined);
    setStatus("Running Horris perpetual risk checks…");
    try {
      const response = await fetch("/api/perps/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          market,
          side,
          risk,
          marginUsd,
          leverage,
          accountBalanceUsd,
          entryPrice,
          stopLoss,
          takeProfit,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Risk analysis failed");
      setResult(data);
      setStatus(data.analysis.approved ? "Horris approved the risk plan ✓" : "Horris blocked this trade plan");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Risk analysis failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="perps" className="perp-section shell">
      <div className="perp-head">
        <div>
          <p className="eyebrow">PERPETUAL EXECUTION LAYER</p>
          <h2>Risk first. Venue second.</h2>
          <p className="summary">Horris now understands Celo perpetual trade intent before execution. The current venue registry targets UpDown, while order submission remains deliberately disabled until a dedicated onchain adapter passes the same security bar as Mento.</p>
        </div>
        <div className="perp-lock"><span className="dot" /> UPDOWN · CELO MAINNET<strong>Execution locked</strong><small>Analysis is read-only. No perp order is submitted from this interface.</small></div>
      </div>

      <div className="workspace perp-workspace">
        <div className="panel builder">
          <div className="panel-head"><span>04</span><h2>Perp intent</h2></div>
          <div className="field-grid">
            <label>Market<select value={market} onChange={(event) => setMarket(event.target.value)}>{UPDOWN_MARKETS.map((item) => <option key={item.symbol}>{item.symbol}</option>)}</select></label>
            <label>Side<select value={side} onChange={(event) => setSide(event.target.value as PerpSide)}><option value="long">Long</option><option value="short">Short</option></select></label>
            <label>Account balance<input value={accountBalanceUsd} onChange={(event) => setAccountBalanceUsd(event.target.value)} inputMode="decimal" /></label>
            <label>Margin<input value={marginUsd} onChange={(event) => setMarginUsd(event.target.value)} inputMode="decimal" /></label>
            <label>Entry price<input value={entryPrice} onChange={(event) => setEntryPrice(event.target.value)} inputMode="decimal" /></label>
            <label>Leverage<input value={leverage} onChange={(event) => setLeverage(event.target.value)} inputMode="decimal" /></label>
            <label>Stop loss<input value={stopLoss} onChange={(event) => setStopLoss(event.target.value)} inputMode="decimal" /></label>
            <label>Take profit<input value={takeProfit} onChange={(event) => setTakeProfit(event.target.value)} inputMode="decimal" /></label>
          </div>

          <label>Risk profile</label>
          <div className="risk-grid">{(["Conservative", "Balanced", "Aggressive"] as PerpRiskProfile[]).map((item) => <button key={item} className={risk === item ? "risk active" : "risk"} onClick={() => setRisk(item)}>{item}</button>)}</div>
          <div className="perp-policy-strip"><span>Max leverage {policy.maxLeverage}×</span><span>Max account risk {policy.maxAccountRiskPercent}%</span><span>Max margin {policy.maxMarginUtilizationPercent}%</span></div>
          <button className="button primary" disabled={busy} onClick={analyze}>{busy ? "Analyzing…" : "Analyze perp risk"}</button>
          <p className="status">{status}</p>
        </div>

        <div className="panel strategy">
          <div className="panel-head"><span>05</span><h2>Risk verdict</h2></div>
          {!result ? <div className="empty-state"><span>↗</span><div><strong>No risk plan yet</strong><p>Enter a trade setup and Horris will calculate notional, stop-loss exposure, account risk, margin usage and reward/risk.</p></div></div> : <>
            <div className="strategy-title"><div><p>{result.venue.toUpperCase()} RISK PLAN</p><h3>{result.analysis.approved ? "APPROVED" : "BLOCKED"}</h3></div><span className="badge">{risk}</span></div>
            <div className="metrics"><div><small>NOTIONAL</small><strong>${result.analysis.notionalUsd.toFixed(2)}</strong></div><div><small>ACCOUNT RISK</small><strong>{result.analysis.accountRiskPercent.toFixed(2)}%</strong></div><div><small>STOP DISTANCE</small><strong>{result.analysis.stopDistancePercent.toFixed(2)}%</strong></div></div>
            <div className="policy-box">{result.analysis.checks.map((check) => <div key={check.code}><span className="check">{check.passed ? "✓" : "×"}</span><p><strong>{check.label}</strong><small>{check.detail}</small></p></div>)}</div>
            <p className="status">{result.nextStep}</p>
          </>}
        </div>
      </div>
    </section>
  );
}
