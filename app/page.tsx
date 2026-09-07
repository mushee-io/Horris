"use client";

import { useEffect, useMemo, useState } from "react";
import { createWalletClient, custom, formatUnits, type Address, type Hash } from "viem";
import { celoSepolia } from "viem/chains";
import VaultPanel from "../components/VaultPanel";
import ActivityPanel from "../components/ActivityPanel";
import PerpRiskPanel from "../components/PerpRiskPanel";
import PerpMonitorPanel from "../components/PerpMonitorPanel";
import HorrisAiDock from "../components/HorrisAiDock";
import { TOKENS, celoSepoliaWalletParams, publicClient } from "../lib/celo";
import { buildUsdMSwap, buildVaultUsdMPlan, getUsdMQuote, riskPolicy, type HorrisRisk } from "../lib/mento";
import { ALLOW_WALLET_DIRECT_DEMO, isHorrisDeployed } from "../lib/horris-contracts";
import { executeVaultMentoPlan } from "../lib/vault-execution";
import { getVaultSnapshot } from "../lib/vault";

const erc20Abi = [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] }] as const;
const strategies = {
  Conservative: { title: "Stable Conversion", target: "0.25% max slippage" },
  Balanced: { title: "Adaptive Stable Route", target: "0.50% max slippage" },
  Aggressive: { title: "Fast Stable Route", target: "1.00% max slippage" },
} as const;
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
  const [address, setAddress] = useState<Address>();
  const [risk, setRisk] = useState<HorrisRisk>("Balanced");
  const [amount, setAmount] = useState("10");
  const [quote, setQuote] = useState("");
  const [balance, setBalance] = useState("0");
  const [vaultState, setVaultState] = useState<VaultSnapshot>();
  const [status, setStatus] = useState("Connect a wallet to begin");
  const [busy, setBusy] = useState(false);
  const [txHash, setTxHash] = useState<Hash>();
  const [blockNumber, setBlockNumber] = useState<bigint>();
  const [networkOnline, setNetworkOnline] = useState(false);
  const strategy = useMemo(() => strategies[risk], [risk]);
  const policy = riskPolicy[risk];
  const executionEnabled = isHorrisDeployed || ALLOW_WALLET_DIRECT_DEMO;

  useEffect(() => {
    let mounted = true;
    async function refreshTelemetry() {
      try {
        const block = await publicClient.getBlockNumber();
        if (mounted) { setBlockNumber(block); setNetworkOnline(true); }
        if (isHorrisDeployed) await refreshVault();
      } catch {
        if (mounted) setNetworkOnline(false);
      }
    }
    void refreshTelemetry();
    const timer = window.setInterval(() => void refreshTelemetry(), 30_000);
    return () => { mounted = false; window.clearInterval(timer); };
  }, []);

  async function ensureCeloSepolia() {
    if (!window.ethereum) throw new Error("No injected EVM wallet detected");
    try {
      await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: celoSepoliaWalletParams.chainId }] });
    } catch (error: any) {
      if (error?.code !== 4902) throw error;
      await window.ethereum.request({ method: "wallet_addEthereumChain", params: [celoSepoliaWalletParams] });
    }
  }

  async function refreshBalance(account: Address) {
    const raw = await publicClient.readContract({ address: TOKENS.USDC.address, abi: erc20Abi, functionName: "balanceOf", args: [account] });
    setBalance(formatUnits(raw, TOKENS.USDC.decimals));
  }

  async function refreshVault() {
    if (!isHorrisDeployed) return undefined;
    const snapshot = await getVaultSnapshot();
    setVaultState(snapshot);
    return snapshot;
  }

  async function connectWallet() {
    if (!window.ethereum) return setStatus("Install MetaMask or another EVM wallet first");
    try {
      await ensureCeloSepolia();
      const client = createWalletClient({ chain: celoSepolia, transport: custom(window.ethereum) });
      const [account] = await client.requestAddresses();
      setAddress(account);
      await Promise.all([refreshBalance(account), refreshVault()]);
      setStatus("Wallet connected · Celo Sepolia");
    } catch (error: any) {
      setStatus(error?.message ?? "Wallet connection failed");
    }
  }

  function validateVaultReview(snapshot: VaultSnapshot, account: Address, allocation: number) {
    const normalized = account.toLowerCase();
    const isOwner = normalized === snapshot.owner.toLowerCase();
    const isAgent = snapshot.agent !== ZERO_ADDRESS && normalized === snapshot.agent.toLowerCase();
    if (!isOwner && !isAgent) return "Connected wallet is not authorized to execute this Horris vault";
    if (snapshot.paused) return "Horris vault is paused";
    if (!snapshot.accountingHealthy) return "Vault accounting invariant failed; execution is disabled";
    if (allocation > Number(snapshot.usdc)) return `Vault has only ${Number(snapshot.usdc).toFixed(2)} accounted USDC`;
    if (allocation > Number(snapshot.executionCap)) return `Onchain execution cap is ${Number(snapshot.executionCap).toFixed(2)} USDC`;
    const remainingDaily = Math.max(0, Number(snapshot.dailyLimit) - Number(snapshot.spentToday));
    if (allocation > remainingDaily) return `Only ${remainingDaily.toFixed(2)} USDC remains under today's onchain limit`;
    if (policy.slippage > snapshot.maxSlippagePercent) return `${risk} requires ${policy.slippage}% slippage while this vault allows ${snapshot.maxSlippagePercent}%`;
    return undefined;
  }

  async function reviewStrategy() {
    if (!address) return setStatus("Connect your wallet first");
    const allocation = Number(amount);
    if (!amount || !Number.isFinite(allocation) || allocation <= 0) return setStatus("Enter a valid USDC amount");
    if (allocation > policy.maxAllocation) return setStatus(`${risk} profile allows max ${policy.maxAllocation} USDC per proposal`);
    setBusy(true); setTxHash(undefined); setQuote("");
    try {
      if (isHorrisDeployed) {
        const snapshot = await refreshVault();
        if (!snapshot) throw new Error("Vault state unavailable");
        const blocked = validateVaultReview(snapshot, address, allocation);
        if (blocked) throw new Error(blocked);
      } else if (ALLOW_WALLET_DIRECT_DEMO && allocation > Number(balance)) {
        throw new Error(`Insufficient test USDC · balance ${Number(balance).toFixed(2)} USDC`);
      }
      setStatus("Horris is checking the Mento route…");
      const result = await getUsdMQuote(amount);
      setQuote(result.formattedOut);
      if (isHorrisDeployed) setStatus(`Onchain policy preflight passed · live route found for ${amount} USDC`);
      else if (ALLOW_WALLET_DIRECT_DEMO) setStatus(`Demo preflight passed · live route found for ${amount} USDC`);
      else setStatus("Quote ready · execution remains locked");
    } catch (error: any) {
      setStatus(error?.message ?? "No valid Mento route found");
    } finally { setBusy(false); }
  }

  async function executeStrategy() {
    if (!address || !window.ethereum || !quote) return setStatus("Review a valid strategy before execution");
    if (!executionEnabled) return setStatus("Execution is locked until Horris contracts are deployed");
    setBusy(true);
    try {
      await ensureCeloSepolia();
      const wallet = createWalletClient({ account: address, chain: celoSepolia, transport: custom(window.ethereum) });
      if (isHorrisDeployed) {
        const snapshot = await refreshVault();
        if (!snapshot) throw new Error("Vault state unavailable");
        const blocked = validateVaultReview(snapshot, address, Number(amount));
        if (blocked) throw new Error(blocked);
        setStatus("Building approved Mento route for the Horris vault…");
        const plan = await buildVaultUsdMPlan(amount, risk);
        setStatus(`Simulating onchain Horris policy + ${plan.hops}-hop Mento execution…`);
        const result = await executeVaultMentoPlan(wallet, address, plan);
        setTxHash(result.hash);
        await refreshVault();
        setStatus("Horris vault execution confirmed on Celo Sepolia ✓");
        return;
      }
      if (!ALLOW_WALLET_DIRECT_DEMO) throw new Error("Wallet-direct execution is disabled");
      setStatus("Preparing explicitly enabled wallet-direct test transaction…");
      const { approval, swap } = await buildUsdMSwap(amount, address, risk);
      if (approval) {
        setStatus("Approve Mento Router to spend this USDC amount…");
        const approvalHash = await wallet.sendTransaction({ account: address, chain: celoSepolia, to: approval.to as Address, data: approval.data as `0x${string}`, value: BigInt(approval.value ?? "0") });
        await publicClient.waitForTransactionReceipt({ hash: approvalHash });
      }
      setStatus("Execute USDC → USDm on Mento…");
      const hash = await wallet.sendTransaction({ account: address, chain: celoSepolia, to: swap.params.to as Address, data: swap.params.data as `0x${string}`, value: BigInt(swap.params.value ?? "0") });
      setTxHash(hash);
      await publicClient.waitForTransactionReceipt({ hash });
      await refreshBalance(address);
      setStatus("Wallet-direct demo execution confirmed on Celo Sepolia ✓");
    } catch (error: any) {
      setStatus(error?.shortMessage ?? error?.message ?? "Execution failed");
    } finally { setBusy(false); }
  }

  const modeLabel = isHorrisDeployed ? "VAULT MODE" : ALLOW_WALLET_DIRECT_DEMO ? "WALLET DEMO" : "EXECUTION LOCKED";
  const effectiveCap = isHorrisDeployed && vaultState ? Math.min(policy.maxAllocation, Number(vaultState.executionCap)) : policy.maxAllocation;
  const agentConfigured = vaultState?.agent && vaultState.agent !== ZERO_ADDRESS ? short(vaultState.agent) : "—";
  const walletRole = !address ? "NOT CONNECTED" : !vaultState ? "—" : address.toLowerCase() === vaultState.owner.toLowerCase() ? "OWNER" : address.toLowerCase() === vaultState.agent.toLowerCase() ? "AGENT" : "UNAUTHORIZED";
  const intentWithinLimit = Number.isFinite(Number(amount)) && Number(amount) > 0 && Number(amount) <= policy.maxAllocation;
  const decision = txHash ? "EXECUTED" : quote ? "PREFLIGHT PASS" : intentWithinLimit ? "WITHIN LIMIT" : "BLOCKED";

  return <main className="horris-site">
    <nav className="marketing-nav technical-grid" id="top">
      <a className="wordmark" href="#top">HORRIS</a>
      <div className="marketing-links"><a href="#protocol">PROTOCOL</a><a href="#terminal">ENGINE</a><a href="#network">NETWORK</a><a href="#research">RESEARCH</a><a href="#docs">DOCS</a></div>
      <span className="nav-note">[ ] BUILD A SAFER ONCHAIN FUTURE [ ]</span>
      <a className="signal-button" href="#terminal">LAUNCH TERMINAL <b>→</b></a>
    </nav>

    <section className="machine-hero technical-grid">
      <div className="anchor a1"/><div className="anchor a2"/><div className="anchor a3"/><div className="anchor a4"/>
      <div className="hero-rail"><span>01</span><small>AUTONOMOUS<br/>EXECUTION LAYER</small></div>
      <div className="hero-copy-new">
        <h1>HORRIS</h1>
        <h2>AI EXECUTION<br/>WITHOUT<br/>BLIND RISK.</h2>
        <p>Horris is an autonomous execution and risk layer that evaluates intent, simulates outcomes, applies policy, and executes onchain actions.</p>
        <div className="hero-cta-row"><a className="signal-button" href="#terminal">LAUNCH TERMINAL <b>→</b></a><a className="technical-button" href="#protocol">READ PROTOCOL</a></div>
        <div className="hero-footnote">// TRUSTED INTELLIGENCE<br/>// FOR AN OPEN ECONOMY</div>
      </div>
      <div className="trajectory-field" aria-hidden="true">
        <svg viewBox="0 0 700 500" role="presentation">
          {trajectoryPaths.map((path, index) => <path key={path} d={path} className={index % 4 === 0 ? "trajectory hot" : "trajectory"} />)}
          {[ [355,240], [160,170], [545,165], [610,310], [205,315], [490,92], [570,400] ].map(([cx,cy], index) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={index === 0 ? 6 : 3} className={index < 3 ? "node hot-node" : "node"} />)}
        </svg>
        <span className="trajectory-label intent">INTENT</span><span className="trajectory-label simulate">SIMULATE</span><span className="trajectory-label assess">ASSESS</span><span className="trajectory-label policy-label">POLICY</span><span className="trajectory-label execute">EXECUTE</span>
        <div className="crosshair cross-one"/><div className="crosshair cross-two"/><div className="crosshair cross-three"/>
      </div>
      <aside className="telemetry-panel">
        <header><strong>HORRIS / LIVE</strong><span className={networkOnline ? "sem-dot green" : "sem-dot amber"}/><small>{networkOnline ? "OPERATIONAL" : "AWAITING DATA"}</small></header>
        <dl>
          <div><dt>NETWORK</dt><dd>CELO SEPOLIA</dd></div>
          <div><dt>ENGINE</dt><dd className={networkOnline ? "safe-text" : "muted-text"}>{networkOnline ? "ONLINE" : "AWAITING DATA"}</dd></div>
          <div><dt>AGENT</dt><dd>{agentConfigured}</dd></div>
          <div><dt>VAULT USDC</dt><dd>{vaultState ? Number(vaultState.usdc).toFixed(2) : "—"}</dd></div>
          <div><dt>RISK ENGINE</dt><dd>ENFORCED</dd></div>
          <div><dt>BLOCK</dt><dd>{blockNumber?.toString() ?? "—"}</dd></div>
        </dl>
        <footer>// REAL-TIME STATE<br/>// FAIL-CLOSED EXECUTION</footer>
      </aside>
    </section>

    <section id="protocol" className="protocol-section technical-grid">
      <div className="section-marker"><span>02</span><small>THE HORRIS PROTOCOL</small></div>
      <div className="protocol-heading"><h2>INTENT <i>→</i> SIMULATE <i>→</i> ASSESS <i>→</i> AUTHORIZE <i>→</i> EXECUTE</h2><p>FIVE LAYERS.<br/>ONE DISCIPLINED SYSTEM.</p></div>
      <div className="protocol-modules">{protocolStages.map((stage, index) => <article key={stage.no}><header><span>{stage.no}</span><strong>{stage.title}</strong><b>{index < protocolStages.length - 1 ? "→" : "↯"}</b></header><p>{stage.copy}</p></article>)}</div>
    </section>

    <section id="research" className="risk-editorial technical-grid">
      <div className="section-marker"><span>03</span><small>RISK EVALUATION</small></div>
      <div className="risk-statement"><h2>EVERY ACTION<br/>IS EVALUATED<br/>BEFORE EXECUTION.</h2><p>Autonomous does not mean uncontrolled. Horris assesses risk in real time, applying deterministic policy and live route context before capital moves.</p><small>— BETTER DECISIONS. A SAFER ECONOMY.</small></div>
      <div className="risk-verdict-grid">
        <article className="verdict-panel"><header><span className="sem-dot green"/><strong>LIVE INTENT</strong><small>[ {decision} ]</small></header><dl><div><dt>WALLET</dt><dd>{short(address)}</dd></div><div><dt>ACTION</dt><dd>USDC → USDm</dd></div><div><dt>VALUE</dt><dd>{amount || "—"} USDC</dd></div><div><dt>RISK PROFILE</dt><dd>{risk}</dd></div><div><dt>QUOTE</dt><dd>{quote ? `${Number(quote).toFixed(4)} USDm` : "—"}</dd></div><div><dt>DECISION</dt><dd className={decision === "BLOCKED" ? "danger-text" : "safe-text"}>{decision}</dd></div></dl></article>
        <article className="verdict-panel policy-boundary"><header><span className="sem-dot red"/><strong>POLICY BOUNDARY</strong><small>[ DETERMINISTIC ]</small></header><dl><div><dt>MAX ALLOCATION</dt><dd>{policy.maxAllocation} USDC</dd></div><div><dt>MAX SLIPPAGE</dt><dd>{policy.slippage}%</dd></div><div><dt>VAULT CAP</dt><dd>{vaultState ? `${Number(vaultState.executionCap).toFixed(2)} USDC` : "—"}</dd></div><div><dt>ACCOUNTING</dt><dd>{vaultState ? (vaultState.accountingHealthy ? "HEALTHY" : "BLOCKED") : "—"}</dd></div><div><dt>EXECUTION</dt><dd>{modeLabel}</dd></div><div><dt>AUTHORITY</dt><dd>HORRIS POLICY</dd></div></dl></article>
      </div>
    </section>

    <section id="terminal" className="control-terminal">
      <div className="terminal-titlebar"><span>04</span><small>HORRIS CONTROL TERMINAL</small><em>INSTITUTIONAL TOOLS FOR AUTONOMOUS EXECUTION.</em></div>
      <nav className="terminal-nav"><strong>HORRIS</strong><a href="#terminal">TERMINAL</a><a href="#perps">AGENTS</a><a href="#activity">EXECUTIONS</a><a href="#policy">POLICIES</a><a href="#monitor">RISK</a><a href="#network">NETWORK</a><div className="terminal-right"><span>NETWORK / <b>CELO</b></span><span>WALLET / <b>{short(address)}</b></span><span>SYSTEM / <b className={networkOnline ? "safe-text" : "warn-text"}>{networkOnline ? "OPERATIONAL" : "AWAITING DATA"}</b></span><button onClick={connectWallet}>{address ? "CONNECTED" : "CONNECT WALLET"}</button></div></nav>
      <div className="telemetry-strip"><div><small>SYSTEM STATUS</small><strong>{networkOnline ? "OPERATIONAL" : "AWAITING DATA"}</strong></div><div><small>CONFIGURED AGENT</small><strong>{agentConfigured}</strong></div><div><small>VAULT USDC</small><strong>{vaultState ? Number(vaultState.usdc).toFixed(2) : "—"}</strong></div><div><small>EXECUTION MODE</small><strong>{modeLabel}</strong></div><div><small>BLOCK</small><strong>{blockNumber?.toString() ?? "—"}</strong></div><div><small>SESSION</small><strong className={txHash ? "safe-text" : "muted-text"}>{txHash ? "CONFIRMED" : "NO EXECUTION"}</strong></div></div>

      <div className="terminal-main-grid">
        <section className="execution-feed" id="activity">
          <header className="terminal-panel-head"><div><span>EXECUTION FEED</span><strong>[ LIVE SESSION ]</strong></div><small>{status.toUpperCase()}</small></header>
          <div className="table-wrap"><table><thead><tr><th>TIME</th><th>ACTOR</th><th>ACTION</th><th>PROTOCOL</th><th>VALUE</th><th>RISK</th><th>STATUS</th><th>TX</th></tr></thead><tbody>
            {txHash ? <tr className="executed-row"><td>SESSION</td><td>{walletRole}</td><td>SWAP</td><td>MENTO</td><td>{amount} USDC</td><td>{risk}</td><td>CONFIRMED</td><td>{short(txHash)}</td></tr> : quote ? <tr className="review-row"><td>SESSION</td><td>{walletRole}</td><td>SIMULATE</td><td>MENTO</td><td>{amount} USDC</td><td>{risk}</td><td>PREFLIGHT</td><td>—</td></tr> : <tr><td colSpan={8} className="table-empty">NO EXECUTIONS · CONNECT WALLET AND REVIEW AN INTENT</td></tr>}
          </tbody></table></div>
        </section>

        <aside className="agent-inspector">
          <header className="terminal-panel-head"><div><span>AGENT INSPECTOR</span><strong>{address ? short(address) : "NOT CONNECTED"}</strong></div><small>{walletRole}</small></header>
          <dl><div><dt>NETWORK</dt><dd>CELO SEPOLIA</dd></div><div><dt>ROLE</dt><dd>{walletRole}</dd></div><div><dt>AGENT</dt><dd>{agentConfigured}</dd></div><div><dt>DAILY LIMIT</dt><dd>{vaultState ? `${Number(vaultState.dailyLimit).toFixed(2)} USDC` : "—"}</dd></div><div><dt>EXECUTION CAP</dt><dd>{vaultState ? `${Number(vaultState.executionCap).toFixed(2)} USDC` : "—"}</dd></div><div><dt>RISK PROFILE</dt><dd>{risk}</dd></div><div><dt>VAULT STATE</dt><dd>{vaultState ? (vaultState.paused ? "PAUSED" : "ACTIVE") : "—"}</dd></div></dl>
          <button className="terminal-action" onClick={connectWallet}>{address ? "[ REFRESH WALLET ]" : "[ CONNECT WALLET ]"}</button>
        </aside>

        <section className="terminal-execution-builder">
          <header className="terminal-panel-head"><div><span>INTENT BUILDER</span><strong>STABLE EXECUTION / MENTO</strong></div><small>[ POLICY FIRST ]</small></header>
          <div className="execution-builder-grid">
            <div className="terminal-form">
              <label>USDC ALLOCATION <small>{isHorrisDeployed && vaultState ? `VAULT ${Number(vaultState.usdc).toFixed(2)}` : `WALLET ${Number(balance).toFixed(2)}`}</small></label>
              <div className="terminal-input-group"><input value={amount} onChange={(e) => { setAmount(e.target.value); setQuote(""); }} inputMode="decimal"/><span>USDC</span></div>
              <label>RISK POLICY</label><div className="terminal-segmented">{(["Conservative", "Balanced", "Aggressive"] as HorrisRisk[]).map((item) => <button key={item} className={risk === item ? "active" : ""} onClick={() => { setRisk(item); setQuote(""); }}>{item.toUpperCase()}</button>)}</div>
              <button className="terminal-action orange" disabled={busy} onClick={reviewStrategy}>{busy ? "CHECKING…" : "[ SIMULATE + REVIEW ]"}</button>
              <p className="terminal-status-line">{status}</p>
            </div>
            <div className="route-inspector" id="policy"><small>POLICY / ROUTE</small><h3>{strategy.title.toUpperCase()}</h3><dl><div><dt>ROUTE</dt><dd>USDC → USDm</dd></div><div><dt>MAX EXECUTION</dt><dd>{effectiveCap} USDC</dd></div><div><dt>SLIPPAGE POLICY</dt><dd>{vaultState ? `${vaultState.maxSlippagePercent}% ONCHAIN` : strategy.target}</dd></div><div><dt>QUOTE</dt><dd>{quote ? `${Number(quote).toFixed(4)} USDm` : "—"}</dd></div><div><dt>MODE</dt><dd>{modeLabel}</dd></div></dl>{quote && <button className="terminal-action" disabled={busy || !executionEnabled} onClick={executeStrategy}>{busy ? "EXECUTING…" : executionEnabled ? "[ EXECUTE APPROVED ROUTE ]" : "[ EXECUTION LOCKED ]"}</button>}</div>
          </div>
        </section>

        <HorrisAiDock />
      </div>

      <div className="terminal-subsystems">
        <div id="perps"><PerpRiskPanel account={address}/></div>
        <div id="monitor"><PerpMonitorPanel account={address}/></div>
        <div id="network"><VaultPanel account={address}/></div>
        <ActivityPanel latestTx={txHash}/>
      </div>
    </section>

    <footer id="docs" className="editorial-footer technical-grid">
      <div className="section-marker"><span>05</span><small>BUILDING A SAFER ONCHAIN TOMORROW</small></div>
      <h2>There is precision<br/>in controlled autonomy.</h2>
      <div className="footer-columns"><div><strong>Developers</strong><a href="#protocol">Protocol</a><a href="#terminal">SDK Surface</a><a href="#terminal">API</a><a href="#monitor">Status</a></div><div><strong>Resources</strong><a href="#research">Research</a><a href="#policy">Security Model</a><a href="#protocol">Architecture</a></div><div><strong>System</strong><a href="#terminal">Terminal</a><a href="#monitor">Risk</a><a href="#network">Network</a></div><div><strong>Legal & Risk</strong><span>TESTNET STAGE</span><span>UNAUDITED</span><span>NO MAINNET EXECUTION</span></div></div>
      <div className="footer-bottom"><strong>HORRIS</strong><span>AUTONOMOUS EXECUTION FOR A MORE OPEN ECONOMY.</span><em>INTELLIGENCE × DISCIPLINE × CONTROL</em></div>
    </footer>
  </main>;
}

declare global { interface Window { ethereum?: { request(args: { method: string; params?: unknown[] }): Promise<any> }; } }
