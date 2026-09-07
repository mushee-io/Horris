"use client";

import { useState } from "react";

type Risk = "Conservative" | "Balanced" | "Aggressive";
type Side = "long" | "short";
type AiResult = {
  proposal?: { market: string; side: Side; risk: Risk; marginUsd: number; leverage: number; accountBalanceUsd: number; entryPrice: number; stopLoss: number; takeProfit: number; rationale: string };
  review?: { accepted: boolean; executable: false; authority: "horris-policy"; malformed?: string[] };
  executionEnabled: false;
  error?: string;
};

export default function HorrisAiDock() {
  const [market, setMarket] = useState("BTC");
  const [side, setSide] = useState<Side>("long");
  const [risk, setRisk] = useState<Risk>("Balanced");
  const [accountBalanceUsd, setAccountBalanceUsd] = useState("5000");
  const [entryPrice, setEntryPrice] = useState("100000");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AiResult>();
  const [status, setStatus] = useState("AI proposes. Deterministic Horris policy decides.");

  async function askHorris() {
    setBusy(true);
    setResult(undefined);
    setStatus("REQUESTING BOUNDED AI PROPOSAL…");
    try {
      const response = await fetch("/api/perps/advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ market, side, risk, accountBalanceUsd: Number(accountBalanceUsd), entryPrice: Number(entryPrice) }),
      });
      const data = await response.json() as AiResult;
      if (!response.ok) throw new Error(data.error ?? "Horris AI unavailable");
      setResult(data);
      setStatus(data.review?.accepted ? "PROPOSAL PASSED HORRIS POLICY REVIEW" : "PROPOSAL BLOCKED BY HORRIS POLICY");
    } catch (error) {
      setStatus(error instanceof Error ? error.message.toUpperCase() : "HORRIS AI UNAVAILABLE");
    } finally {
      setBusy(false);
    }
  }

  return <section className="ai-console" aria-label="Horris AI proposal console">
    <header className="terminal-panel-head">
      <div><span>AI / ADVISOR</span><strong>UNTRUSTED PROPOSAL INPUT</strong></div>
      <small>[ EXECUTION LOCKED ]</small>
    </header>
    <div className="ai-form-grid">
      <label>MARKET<select value={market} onChange={(e) => setMarket(e.target.value)}>{["BTC","ETH","CELO","EURm","JPYm","NGNm","AUDm","GBPm"].map((m) => <option key={m}>{m}</option>)}</select></label>
      <label>SIDE<select value={side} onChange={(e) => setSide(e.target.value as Side)}><option value="long">LONG</option><option value="short">SHORT</option></select></label>
      <label>RISK<select value={risk} onChange={(e) => setRisk(e.target.value as Risk)}><option>Conservative</option><option>Balanced</option><option>Aggressive</option></select></label>
      <label>ACCOUNT USD<input inputMode="decimal" value={accountBalanceUsd} onChange={(e) => setAccountBalanceUsd(e.target.value)} /></label>
      <label className="ai-wide">ENTRY PRICE<input inputMode="decimal" value={entryPrice} onChange={(e) => setEntryPrice(e.target.value)} /></label>
    </div>
    <button className="terminal-action orange" disabled={busy} onClick={askHorris}>{busy ? "ANALYZING…" : "[ GENERATE BOUNDED PROPOSAL ]"}</button>
    <p className="terminal-status-line">{status}</p>
    <div className="ai-result">
      {!result?.proposal ? <div className="terminal-empty"><span>—</span><p>AWAITING PROPOSAL</p></div> : <>
        <div className="ai-result-top"><strong>{result.proposal.market} / {result.proposal.side.toUpperCase()}</strong><span>{result.proposal.leverage}×</span></div>
        <dl>
          <div><dt>MARGIN</dt><dd>${result.proposal.marginUsd.toFixed(2)}</dd></div>
          <div><dt>STOP</dt><dd>{result.proposal.stopLoss}</dd></div>
          <div><dt>TAKE PROFIT</dt><dd>{result.proposal.takeProfit}</dd></div>
          <div><dt>AUTHORITY</dt><dd>{result.review?.authority ?? "horris-policy"}</dd></div>
        </dl>
        <p>{result.proposal.rationale}</p>
        <small>EXECUTION ENABLED: NO · MODEL HAS NO SIGNING AUTHORITY</small>
      </>}
    </div>
  </section>;
}
