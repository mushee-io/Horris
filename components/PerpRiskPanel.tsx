"use client";

import { useMemo, useState } from "react";
import type { Address } from "viem";
import { perpRiskPolicy, type PerpRiskAnalysis, type PerpRiskProfile, type PerpSide } from "../lib/perps";
import { derivePerpLifecycle } from "../lib/perp-lifecycle";
import { UPDOWN_MARKETS } from "../lib/updown";

type Result = { venue: string; executionEnabled: boolean; analysis: PerpRiskAnalysis; nextStep: string };
type AuthorizationPreview = {
  available: boolean; reason?: string; expiresAt?: string; signingEnabled?: false; submissionEnabled?: false; note?: string;
  typedData?: { domain: { name: string; version: string; chainId: number; verifyingContract: Address }; primaryType: "Authorization"; message: { calldataHash: `0x${string}`; receiver: Address; market: Address; accountBalanceUsdE18: string; stopDistanceBps: number; nonce: string; deadline: string } };
};
type OrderPreview = {
  exchangeRouter: Address; orderVault: Address; executionEnabled: false; preflightPassed: boolean; feeResolvedAt: string; nextStep: string; authorizationPreview: AuthorizationPreview;
  liveExecutionFee: { bufferedFeeWei: string; bufferedFeeCelo: string; source: "live-readiness" };
  readiness: { approvalRequired: boolean; readyForSimulation: boolean; readyForSubmission: false; checks: { code: string; passed: boolean; detail: string }[]; oracle: { mid: string; ageSeconds: number } };
  simulation: { success?: boolean; skipped?: boolean; reverted?: boolean; reason?: string };
  unsignedTransaction: { chainId: 42220; to: Address; value: string; data: `0x${string}`; calldataHash: `0x${string}`; approval: { token: Address; spender: Address; minimumAmount: string }; calls: ["sendWnt", "sendTokens", "createOrder"]; executionEnabled: false };
  human: { market: string; side: PerpSide; notionalUsd: number; acceptablePrice: number; acceptablePriceSlippageBps: number }; warnings: string[];
};

export default function PerpRiskPanel({ account }: { account?: Address }) {
  const [market, setMarket] = useState("BTC"); const [side, setSide] = useState<PerpSide>("long"); const [risk, setRisk] = useState<PerpRiskProfile>("Balanced");
  const [marginUsd, setMarginUsd] = useState("100"); const [leverage, setLeverage] = useState("3"); const [accountBalanceUsd, setAccountBalanceUsd] = useState("1000");
  const [entryPrice, setEntryPrice] = useState("100000"); const [stopLoss, setStopLoss] = useState("98000"); const [takeProfit, setTakeProfit] = useState("104000");
  const [result, setResult] = useState<Result>(); const [orderPreview, setOrderPreview] = useState<OrderPreview>();
  const [status, setStatus] = useState("Execution locked · awaiting deterministic Horris policy"); const [busy, setBusy] = useState(false);

  const policy = useMemo(() => perpRiskPolicy[risk], [risk]);
  const payload = { market, side, risk, marginUsd, leverage, accountBalanceUsd, entryPrice, stopLoss, takeProfit };
  const lifecycle = useMemo(() => derivePerpLifecycle({
    riskApproved: result?.analysis.approved ?? false,
    preflightPassed: orderPreview?.preflightPassed ?? false,
    authorizationAvailable: orderPreview?.authorizationPreview.available ?? false,
    authorizationSimulationPassed: false,
    userSignaturePresent: false,
    entrySubmitted: false,
    entryConfirmed: false,
    protectionConfirmed: false,
    criticalAlert: false,
  }), [result, orderPreview]);

  function invalidate() { setResult(undefined); setOrderPreview(undefined); }
  async function analyze() {
    setBusy(true); invalidate(); setStatus("Running deterministic Horris risk policy…");
    try { const response = await fetch("/api/perps/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Risk analysis failed"); setResult(data); setStatus(data.analysis.approved ? "Horris policy approved the proposal ✓" : "Horris policy blocked the proposal"); }
    catch (error) { setStatus(error instanceof Error ? error.message : "Risk analysis failed"); } finally { setBusy(false); }
  }
  async function compileOrderPreview() {
    if (!account) return setStatus("Connect a wallet to compile the receiver-specific UpDown order preview");
    if (!result?.analysis.approved) return setStatus("Horris policy must approve the proposal first");
    setBusy(true); setOrderPreview(undefined); setStatus("Compiling exact order + live Celo readiness + simulation gate…");
    try { const response = await fetch("/api/perps/order-preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, receiver: account, acceptablePriceSlippageBps: 50 }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Order preview failed"); setOrderPreview(data); setStatus(data.preflightPassed ? "Exact transaction preflight passed ✓ · authorization/signing remain gated" : "Unsigned order compiled · deterministic readiness blocks progression"); }
    catch (error) { setStatus(error instanceof Error ? error.message : "Order preview failed"); } finally { setBusy(false); }
  }

  return <section id="perps" className="perp-section shell">
    <div className="perp-head"><div><p className="eyebrow">PERPETUAL EXECUTION LAYER</p><h2>AI proposes. Horris decides.</h2><p className="summary">Trade intent is untrusted input. Deterministic policy, live venue preflight and replay-safe authorization decide whether the lifecycle may advance. AI output cannot bypass the execution gate.</p></div><div className="perp-lock"><span className="dot" /> UPDOWN · CELO MAINNET<strong>Execution gated</strong><small>Compile, inspect and simulate exact transactions. Signing and submission stay locked until every authority check is verified.</small></div></div>
    <div className="perp-policy-strip"><span>ANALYZE</span><span>POLICY</span><span>PREFLIGHT</span><span>AUTHORIZE</span><span>SIGN</span><span>EXECUTE</span><span>PROTECT</span><span>MONITOR</span></div>
    <div className="order-preview"><small>HORRIS LIFECYCLE</small><strong>{lifecycle.stage.toUpperCase()}</strong><p>{lifecycle.nextAction}</p><p>Execution: {lifecycle.executionAllowed ? "eligible for explicit wallet approval" : "locked"} · Safety: {lifecycle.safe ? "safe" : "attention required"}</p></div>
    <div className="workspace perp-workspace">
      <div className="panel builder"><div className="panel-head"><span>04</span><h2>Perp intent</h2></div><div className="field-grid">
        <label>Market<select value={market} onChange={(e) => { setMarket(e.target.value); invalidate(); }}>{UPDOWN_MARKETS.map((item) => <option key={item.symbol}>{item.symbol}</option>)}</select></label>
        <label>Side<select value={side} onChange={(e) => { setSide(e.target.value as PerpSide); invalidate(); }}><option value="long">Long</option><option value="short">Short</option></select></label>
        <label>Account balance<input value={accountBalanceUsd} onChange={(e) => { setAccountBalanceUsd(e.target.value); invalidate(); }} inputMode="decimal" /></label><label>Margin<input value={marginUsd} onChange={(e) => { setMarginUsd(e.target.value); invalidate(); }} inputMode="decimal" /></label>
        <label>Entry price<input value={entryPrice} onChange={(e) => { setEntryPrice(e.target.value); invalidate(); }} inputMode="decimal" /></label><label>Leverage<input value={leverage} onChange={(e) => { setLeverage(e.target.value); invalidate(); }} inputMode="decimal" /></label>
        <label>Stop loss<input value={stopLoss} onChange={(e) => { setStopLoss(e.target.value); invalidate(); }} inputMode="decimal" /></label><label>Take profit<input value={takeProfit} onChange={(e) => { setTakeProfit(e.target.value); invalidate(); }} inputMode="decimal" /></label>
      </div><label>Risk profile</label><div className="risk-grid">{(["Conservative", "Balanced", "Aggressive"] as PerpRiskProfile[]).map((item) => <button key={item} className={risk === item ? "risk active" : "risk"} onClick={() => { setRisk(item); invalidate(); }}>{item}</button>)}</div><div className="perp-policy-strip"><span>Max leverage {policy.maxLeverage}×</span><span>Max account risk {policy.maxAccountRiskPercent}%</span><span>Max margin {policy.maxMarginUtilizationPercent}%</span></div><button className="button primary" disabled={busy} onClick={analyze}>{busy ? "Analyzing…" : "Run Horris policy"}</button><p className="status">{status}</p></div>
      <div className="panel strategy"><div className="panel-head"><span>05</span><h2>Policy + execution gate</h2></div>{!result ? <div className="empty-state"><span>↗</span><div><strong>No proposal evaluated</strong><p>Horris independently verifies leverage, loss exposure, margin usage, stop distance and reward/risk before venue interaction.</p></div></div> : <><div className="strategy-title"><div><p>{result.venue.toUpperCase()} POLICY VERDICT</p><h3>{result.analysis.approved ? "APPROVED" : "BLOCKED"}</h3></div><span className="badge">{risk}</span></div><div className="metrics"><div><small>NOTIONAL</small><strong>${result.analysis.notionalUsd.toFixed(2)}</strong></div><div><small>ACCOUNT RISK</small><strong>{result.analysis.accountRiskPercent.toFixed(2)}%</strong></div><div><small>STOP DISTANCE</small><strong>{result.analysis.stopDistancePercent.toFixed(2)}%</strong></div></div><div className="policy-box">{result.analysis.checks.map((check) => <div key={check.code}><span className="check">{check.passed ? "✓" : "×"}</span><p><strong>{check.label}</strong><small>{check.detail}</small></p></div>)}</div>{result.analysis.approved && <button className="button primary" disabled={busy || !account} onClick={compileOrderPreview}>{!account ? "Connect wallet for preflight" : "Compile + preflight exact order"}</button>}{orderPreview && <><div className="order-preview"><small>UNSIGNED MULTICALL · {orderPreview.preflightPassed ? "PREFLIGHT PASS" : "PREFLIGHT BLOCKED"}</small><strong>{orderPreview.human.market} · {orderPreview.human.side.toUpperCase()} · ${orderPreview.human.notionalUsd.toFixed(2)}</strong><p>Calls: {orderPreview.unsignedTransaction.calls.join(" → ")}</p><p>Acceptable price: {orderPreview.human.acceptablePrice.toFixed(6)} · {orderPreview.human.acceptablePriceSlippageBps} bps</p><p>Live oracle: {Number(orderPreview.readiness.oracle.mid).toFixed(6)} · age {orderPreview.readiness.oracle.ageSeconds}s</p><p>Execution fee: {Number(orderPreview.liveExecutionFee.bufferedFeeCelo).toFixed(6)} CELO</p><p>Calldata: {orderPreview.unsignedTransaction.calldataHash.slice(0, 12)}…{orderPreview.unsignedTransaction.calldataHash.slice(-8)}</p><p>{orderPreview.simulation.success ? "Exact eth_call succeeded" : orderPreview.simulation.reason ?? "Simulation not passed"}</p></div><div className="policy-box">{orderPreview.readiness.checks.map((check) => <div key={check.code}><span className="check">{check.passed ? "✓" : "×"}</span><p><strong>{check.code.replaceAll("_", " ")}</strong><small>{check.detail}</small></p></div>)}</div><div className="protection-preview"><small>EIP-712 AUTHORIZATION · REVIEW ONLY</small>{orderPreview.authorizationPreview.available && orderPreview.authorizationPreview.typedData ? <><strong>Replay-safe exact authorization prepared</strong><p>Verifier: {orderPreview.authorizationPreview.typedData.domain.verifyingContract.slice(0, 10)}…{orderPreview.authorizationPreview.typedData.domain.verifyingContract.slice(-8)}</p><p>Nonce: {orderPreview.authorizationPreview.typedData.message.nonce.slice(0, 18)}…</p><p>Calldata hash: {orderPreview.authorizationPreview.typedData.message.calldataHash.slice(0, 14)}…{orderPreview.authorizationPreview.typedData.message.calldataHash.slice(-10)}</p><p>Expires: {orderPreview.authorizationPreview.expiresAt ? new Date(orderPreview.authorizationPreview.expiresAt).toLocaleTimeString() : "—"} · no signing or broadcast</p></> : <><strong>Authorization withheld</strong><p>{orderPreview.authorizationPreview.reason ?? "Authorization contract is not configured."}</p></>}</div></>}<p className="status">{orderPreview?.nextStep ?? result.nextStep}</p></>}</div>
    </div>
  </section>;
}
