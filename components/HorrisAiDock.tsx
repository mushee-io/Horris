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

const field: React.CSSProperties = { background: "#0d0d0d", color: "#fff", border: "1px solid #404040", padding: "10px", width: "100%", font: "inherit", outline: "none" };

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

  return <div style={{ position: "fixed", right: 16, bottom: 16, zIndex: 80, width: open ? 410 : "auto", maxWidth: "calc(100vw - 24px)", fontFamily: "Arial, Helvetica, sans-serif" }}>
    {!open ? <button onClick={() => setOpen(true)} style={{ background: "#0b0b0b", color: "#fff", border: "1px solid #fff", padding: "13px 17px", fontWeight: 800, cursor: "pointer", clipPath: "polygon(0 0,100% 0,100% 72%,90% 100%,0 100%)", boxShadow: "0 18px 48px rgba(0,0,0,.24)" }}>HORRIS AI&nbsp;&nbsp;↗</button> :
    <div style={{ background: "#080808", color: "#fff", border: "1px solid #4a4a4a", boxShadow: "0 30px 90px rgba(0,0,0,.5)", padding: 18, clipPath: "polygon(0 0,100% 0,100% 94%,94% 100%,0 100%)", backgroundImage: "linear-gradient(rgba(255,255,255,.055) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.055) 1px,transparent 1px)", backgroundSize: "32px 32px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start", marginBottom: 18, paddingBottom: 14, borderBottom: "1px solid #333" }}><div><small style={{ letterSpacing: 1.7, fontFamily: "ui-monospace, Menlo, monospace", color: "#aaa" }}>// UNTRUSTED AI PROPOSAL</small><strong style={{ display: "block", fontSize: 24, marginTop: 5, letterSpacing: -1 }}>Ask Horris.</strong></div><button aria-label="Close Horris AI" onClick={() => setOpen(false)} style={{ background: "transparent", border: 0, color: "#aaa", cursor: "pointer", fontSize: 20 }}>×</button></div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
        <label><small>MARKET</small><select style={field} value={market} onChange={(e) => setMarket(e.target.value)}>{["BTC","ETH","CELO","EURm","JPYm","NGNm","AUDm","GBPm"].map((m) => <option key={m}>{m}</option>)}</select></label>
        <label><small>SIDE</small><select style={field} value={side} onChange={(e) => setSide(e.target.value as Side)}><option value="long">Long</option><option value="short">Short</option></select></label>
        <label><small>RISK</small><select style={field} value={risk} onChange={(e) => setRisk(e.target.value as Risk)}><option>Conservative</option><option>Balanced</option><option>Aggressive</option></select></label>
        <label><small>ACCOUNT USD</small><input style={field} inputMode="decimal" value={accountBalanceUsd} onChange={(e) => setAccountBalanceUsd(e.target.value)} /></label>
        <label style={{ gridColumn: "1 / -1" }}><small>ENTRY PRICE</small><input style={field} inputMode="decimal" value={entryPrice} onChange={(e) => setEntryPrice(e.target.value)} /></label>
      </div>
      <button disabled={busy} onClick={askHorris} style={{ width: "100%", marginTop: 12, padding: "12px", border: "1px solid #fff", background: "#fff", color: "#000", fontWeight: 900, cursor: busy ? "wait" : "pointer", clipPath: "polygon(0 0,100% 0,100% 72%,96% 100%,0 100%)" }}>{busy ? "ANALYZING…" : "GENERATE BOUNDED PROPOSAL ↗"}</button>
      <p style={{ color: "#aaa", fontSize: 11, lineHeight: 1.5, fontFamily: "ui-monospace, Menlo, monospace" }}>{status}</p>
      {result?.proposal && <div style={{ borderTop: "1px solid #353535", paddingTop: 12, fontSize: 13, lineHeight: 1.65 }}><strong>{result.proposal.market} · {result.proposal.side.toUpperCase()} · {result.proposal.leverage}×</strong><div>Margin ${result.proposal.marginUsd.toFixed(2)}</div><div>Stop {result.proposal.stopLoss} · TP {result.proposal.takeProfit}</div><p style={{ color: "#bbb", marginBottom: 5 }}>{result.proposal.rationale}</p><small style={{ color: "#777", fontFamily: "ui-monospace, Menlo, monospace" }}>EXECUTION LOCKED · AUTHORITY: {result.review?.authority ?? "horris-policy"}</small></div>}
    </div>}
  </div>;
}
