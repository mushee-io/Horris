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

const field: React.CSSProperties = { background: "#0a0a0a", color: "#fff", border: "1px solid #2a2a2a", padding: "9px 10px", width: "100%", font: "inherit" };

export default function HorrisAiDock() {
  const [open, setOpen] = useState(false);
  const [market, setMarket] = useState("BTC");
  const [side, setSide] = useState<Side>("long");
  const [risk, setRisk] = useState<Risk>("Balanced");
  const [accountBalanceUsd, setAccountBalanceUsd] = useState("5000");
  const [entryPrice, setEntryPrice] = useState("100000");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AiResult>();
  const [status, setStatus] = useState("AI proposes. Horris policy decides.");

  async function askHorris() {
    setBusy(true); setResult(undefined); setStatus("Requesting bounded AI proposal…");
    try {
      const response = await fetch("/api/perps/advisor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ market, side, risk, accountBalanceUsd: Number(accountBalanceUsd), entryPrice: Number(entryPrice) }) });
      const data = await response.json() as AiResult;
      if (!response.ok) throw new Error(data.error ?? "Horris AI unavailable");
      setResult(data);
      setStatus(data.review?.accepted ? "Proposal passed deterministic Horris policy review ✓" : "AI proposal was blocked by Horris policy");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Horris AI unavailable");
    } finally { setBusy(false); }
  }

  return <div style={{ position: "fixed", right: 16, bottom: 16, zIndex: 50, width: open ? 390 : "auto", maxWidth: "calc(100vw - 24px)", fontFamily: "inherit" }}>
    {!open ? <button onClick={() => setOpen(true)} style={{ background: "#fff", color: "#000", border: "1px solid #000", padding: "12px 16px", fontWeight: 800, cursor: "pointer" }}>HORRIS AI ↗</button> :
    <div style={{ background: "#050505", color: "#fff", border: "1px solid #333", boxShadow: "0 20px 60px rgba(0,0,0,.45)", padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start", marginBottom: 14 }}><div><small style={{ letterSpacing: 1.4 }}>UNTRUSTED AI PROPOSAL</small><strong style={{ display: "block", fontSize: 19, marginTop: 3 }}>Ask Horris</strong></div><button aria-label="Close Horris AI" onClick={() => setOpen(false)} style={{ background: "transparent", border: 0, color: "#aaa", cursor: "pointer", fontSize: 18 }}>×</button></div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <label><small>Market</small><select style={field} value={market} onChange={(e) => setMarket(e.target.value)}>{["BTC","ETH","CELO","EURm","JPYm","NGNm","AUDm","GBPm"].map((m) => <option key={m}>{m}</option>)}</select></label>
        <label><small>Side</small><select style={field} value={side} onChange={(e) => setSide(e.target.value as Side)}><option value="long">Long</option><option value="short">Short</option></select></label>
        <label><small>Risk</small><select style={field} value={risk} onChange={(e) => setRisk(e.target.value as Risk)}><option>Conservative</option><option>Balanced</option><option>Aggressive</option></select></label>
        <label><small>Account USD</small><input style={field} inputMode="decimal" value={accountBalanceUsd} onChange={(e) => setAccountBalanceUsd(e.target.value)} /></label>
        <label style={{ gridColumn: "1 / -1" }}><small>Entry price</small><input style={field} inputMode="decimal" value={entryPrice} onChange={(e) => setEntryPrice(e.target.value)} /></label>
      </div>
      <button disabled={busy} onClick={askHorris} style={{ width: "100%", marginTop: 10, padding: "11px 12px", border: 0, background: "#fff", color: "#000", fontWeight: 800, cursor: busy ? "wait" : "pointer" }}>{busy ? "Thinking…" : "Generate bounded proposal"}</button>
      <p style={{ color: "#aaa", fontSize: 12, lineHeight: 1.45 }}>{status}</p>
      {result?.proposal && <div style={{ borderTop: "1px solid #252525", paddingTop: 10, fontSize: 13, lineHeight: 1.6 }}><strong>{result.proposal.market} · {result.proposal.side.toUpperCase()} · {result.proposal.leverage}×</strong><div>Margin ${result.proposal.marginUsd.toFixed(2)}</div><div>Stop {result.proposal.stopLoss} · TP {result.proposal.takeProfit}</div><p style={{ color: "#bbb", marginBottom: 4 }}>{result.proposal.rationale}</p><small style={{ color: "#888" }}>Execution locked · authority: {result.review?.authority ?? "horris-policy"}</small></div>}
    </div>}
  </div>;
}
