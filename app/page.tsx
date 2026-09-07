"use client";

import { useEffect, useState } from "react";
import HorrisRouteFooter from "../components/HorrisRouteFooter";
import { publicClient } from "../lib/celo";
import { ALLOW_WALLET_DIRECT_DEMO, isHorrisDeployed } from "../lib/horris-contracts";
import { riskPolicy } from "../lib/mento";
import { getVaultSnapshot } from "../lib/vault";

const protocolStages = [
  { no: "01", title: "INTENT", copy: "Understand the requested action and structure bounded transaction inputs." },
  { no: "02", title: "SIMULATION", copy: "Model the exact route and stress the intended state transition." },
  { no: "03", title: "RISK", copy: "Evaluate exposure, leverage, slippage and adverse execution conditions." },
  { no: "04", title: "POLICY", copy: "Apply deterministic limits, allowlists and authorization constraints." },
  { no: "05", title: "EXECUTION", copy: "Only approved actions progress to explicit wallet authorization." },
] as const;
const trajectoryPaths = [
  "M20 300 C130 110 230 420 355 238 S575 120 680 270",
  "M15 210 C140 360 220 70 350 250 S560 410 690 190",
  "M55 390 C160 170 245 355 355 235 S525 80 655 350",
  "M30 145 C145 285 240 145 355 250 S560 300 665 105",
  "M80 70 C190 230 235 115 350 235 S520 335 625 55",
  "M70 455 C170 300 260 420 355 245 S545 165 650 435",
  "M105 250 C190 250 265 180 355 240 S500 260 600 250",
  "M150 35 C205 180 285 115 360 235 S485 410 555 465",
  "M155 470 C215 330 270 365 355 245 S490 75 560 25",
  "M5 330 C150 395 245 235 355 245 S545 230 695 330",
  "M15 105 C135 125 255 300 355 240 S560 130 690 120",
  "M100 420 C210 275 260 180 355 240 S490 325 615 390",
] as const;
type VaultSnapshot = Awaited<ReturnType<typeof getVaultSnapshot>>;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const short = (value?: string) => value ? `${value.slice(0, 6)}…${value.slice(-4)}` : "—";

export default function Home() {
  const [vaultState, setVaultState] = useState<VaultSnapshot>();
  const [blockNumber, setBlockNumber] = useState<bigint>();
  const [networkOnline, setNetworkOnline] = useState(false);
  const amount = "10";
  const risk = "Balanced" as const;
  const policy = riskPolicy[risk];

  useEffect(() => {
    let mounted = true;
    async function refreshTelemetry() {
      try {
        const block = await publicClient.getBlockNumber();
        if (mounted) { setBlockNumber(block); setNetworkOnline(true); }
        if (isHorrisDeployed) {
          const snapshot = await getVaultSnapshot();
          if (mounted) setVaultState(snapshot);
        }
      } catch {
        if (mounted) setNetworkOnline(false);
      }
    }
    void refreshTelemetry();
    const timer = window.setInterval(() => void refreshTelemetry(), 30_000);
    return () => { mounted = false; window.clearInterval(timer); };
  }, []);

  const modeLabel = isHorrisDeployed ? "VAULT MODE" : ALLOW_WALLET_DIRECT_DEMO ? "WALLET DEMO" : "EXECUTION LOCKED";
  const agentConfigured = vaultState?.agent && vaultState.agent !== ZERO_ADDRESS ? short(vaultState.agent) : "—";
  const decision = Number(amount) <= policy.maxAllocation ? "WITHIN LIMIT" : "BLOCKED";

  return <main className="horris-site">
    <nav className="marketing-nav technical-grid" id="top">
      <a className="wordmark" href="/">HORRIS</a>
      <div className="marketing-links"><a href="/protocol">PROTOCOL</a><a href="/engine">ENGINE</a><a href="/network">NETWORK</a><a href="/research">RESEARCH</a><a href="/docs">DOCS</a></div>
      <span className="nav-note">[ ] BUILD A SAFER ONCHAIN FUTURE [ ]</span>
      <a className="signal-button" href="/terminal">LAUNCH TERMINAL <b>→</b></a>
    </nav>

    <section className="machine-hero technical-grid">
      <div className="anchor a1"/><div className="anchor a2"/><div className="anchor a3"/><div className="anchor a4"/>
      <div className="hero-rail"><span>01</span><small>AUTONOMOUS<br/>EXECUTION LAYER</small></div>
      <div className="hero-copy-new">
        <h1>HORRIS</h1>
        <h2>AI EXECUTION<br/>WITHOUT<br/>BLIND RISK.</h2>
        <p>Horris is an autonomous execution and risk layer that evaluates intent, simulates outcomes, applies policy, and executes onchain actions.</p>
        <div className="hero-cta-row"><a className="signal-button" href="/terminal">LAUNCH TERMINAL <b>→</b></a><a className="technical-button" href="/protocol">READ PROTOCOL</a></div>
        <div className="hero-footnote">// TRUSTED INTELLIGENCE<br/>// FOR AN OPEN ECONOMY</div>
      </div>
      <div className="trajectory-field" aria-hidden="true">
        <svg viewBox="0 0 700 500" role="presentation">
          {trajectoryPaths.map((path, index) => <path key={path} d={path} className={index % 4 === 0 ? "trajectory hot" : "trajectory"} />)}
          {[[355,240],[160,170],[545,165],[610,310],[205,315],[490,92],[570,400]].map(([cx,cy], index) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={index === 0 ? 6 : 3} className={index < 3 ? "node hot-node" : "node"} />)}
        </svg>
        <span className="trajectory-label intent">INTENT</span><span className="trajectory-label simulate">SIMULATE</span><span className="trajectory-label assess">ASSESS</span><span className="trajectory-label policy-label">POLICY</span><span className="trajectory-label execute">EXECUTE</span>
        <div className="crosshair cross-one"/><div className="crosshair cross-two"/><div className="crosshair cross-three"/>
      </div>
      <aside className="telemetry-panel">
        <header><strong>HORRIS / LIVE</strong><span className={networkOnline ? "sem-dot green" : "sem-dot amber"}/><small>{networkOnline ? "OPERATIONAL" : "AWAITING DATA"}</small></header>
        <dl><div><dt>NETWORK</dt><dd>CELO SEPOLIA</dd></div><div><dt>ENGINE</dt><dd className={networkOnline ? "safe-text" : "muted-text"}>{networkOnline ? "ONLINE" : "AWAITING DATA"}</dd></div><div><dt>AGENT</dt><dd>{agentConfigured}</dd></div><div><dt>VAULT USDC</dt><dd>{vaultState ? Number(vaultState.usdc).toFixed(2) : "—"}</dd></div><div><dt>RISK ENGINE</dt><dd>ENFORCED</dd></div><div><dt>BLOCK</dt><dd>{blockNumber?.toString() ?? "—"}</dd></div></dl>
        <footer>// REAL-TIME STATE<br/>// FAIL-CLOSED EXECUTION</footer>
      </aside>
    </section>

    <section className="protocol-section technical-grid">
      <div className="section-marker"><span>02</span><small>THE HORRIS PROTOCOL</small></div>
      <div className="protocol-heading"><h2>INTENT <i>→</i> SIMULATE <i>→</i> ASSESS <i>→</i> AUTHORIZE <i>→</i> EXECUTE</h2><p>FIVE LAYERS.<br/>ONE DISCIPLINED SYSTEM.</p></div>
      <div className="protocol-modules">{protocolStages.map((stage, index) => <article key={stage.no}><header><span>{stage.no}</span><strong>{stage.title}</strong><b>{index < protocolStages.length - 1 ? "→" : "↯"}</b></header><p>{stage.copy}</p></article>)}</div>
    </section>

    <section className="risk-editorial technical-grid">
      <div className="section-marker"><span>03</span><small>RISK EVALUATION</small></div>
      <div className="risk-statement"><h2>EVERY ACTION<br/>IS EVALUATED<br/>BEFORE EXECUTION.</h2><p>Autonomous does not mean uncontrolled. Horris assesses risk in real time, applying deterministic policy and live route context before capital moves.</p><small>— BETTER DECISIONS. A SAFER ECONOMY.</small></div>
      <div className="risk-verdict-grid">
        <article className="verdict-panel"><header><span className="sem-dot green"/><strong>LIVE INTENT</strong><small>[ {decision} ]</small></header><dl><div><dt>WALLET</dt><dd>—</dd></div><div><dt>ACTION</dt><dd>USDC → USDm</dd></div><div><dt>VALUE</dt><dd>{amount} USDC</dd></div><div><dt>RISK PROFILE</dt><dd>{risk}</dd></div><div><dt>QUOTE</dt><dd>—</dd></div><div><dt>DECISION</dt><dd className={decision === "BLOCKED" ? "danger-text" : "safe-text"}>{decision}</dd></div></dl></article>
        <article className="verdict-panel policy-boundary"><header><span className="sem-dot red"/><strong>POLICY BOUNDARY</strong><small>[ DETERMINISTIC ]</small></header><dl><div><dt>MAX ALLOCATION</dt><dd>{policy.maxAllocation} USDC</dd></div><div><dt>MAX SLIPPAGE</dt><dd>{policy.slippage}%</dd></div><div><dt>VAULT CAP</dt><dd>{vaultState ? `${Number(vaultState.executionCap).toFixed(2)} USDC` : "—"}</dd></div><div><dt>ACCOUNTING</dt><dd>{vaultState ? (vaultState.accountingHealthy ? "HEALTHY" : "BLOCKED") : "—"}</dd></div><div><dt>EXECUTION</dt><dd>{modeLabel}</dd></div><div><dt>AUTHORITY</dt><dd>HORRIS POLICY</dd></div></dl></article>
      </div>
    </section>

    <HorrisRouteFooter />
  </main>;
}
