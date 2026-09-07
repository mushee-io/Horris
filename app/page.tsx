"use client";

import { useMemo, useState } from "react";
import { createWalletClient, custom, formatUnits, type Address, type Hash } from "viem";
import { celoSepolia } from "viem/chains";
import VaultPanel from "../components/VaultPanel";
import ActivityPanel from "../components/ActivityPanel";
import PerpRiskPanel from "../components/PerpRiskPanel";
import PerpMonitorPanel from "../components/PerpMonitorPanel";
import { TOKENS, celoSepoliaWalletParams, publicClient } from "../lib/celo";
import { buildUsdMSwap, buildVaultUsdMPlan, getUsdMQuote, riskPolicy, type HorrisRisk } from "../lib/mento";
import { ALLOW_WALLET_DIRECT_DEMO, isHorrisDeployed } from "../lib/horris-contracts";
import { executeVaultMentoPlan } from "../lib/vault-execution";
import { getVaultSnapshot } from "../lib/vault";

const erc20Abi = [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] }] as const;
const strategies = {
  Conservative: { title: "Stable Conversion", maxDrawdown: "3%", target: "0.25% max slippage" },
  Balanced: { title: "Adaptive Stable Route", maxDrawdown: "7%", target: "0.50% max slippage" },
  Aggressive: { title: "Fast Stable Route", maxDrawdown: "15%", target: "1.00% max slippage" },
} as const;

type VaultSnapshot = Awaited<ReturnType<typeof getVaultSnapshot>>;

const featureCards = [
  { no: "01", tag: "PERPS", title: "Perps", copy: "AI-native perpetual planning with deterministic Horris risk controls.", icon: "rings" },
  { no: "02", tag: "POLICY", title: "Policy Engine", copy: "Onchain policy and replay-safe authorization for intelligent execution.", icon: "hex" },
  { no: "03", tag: "SAFETY", title: "Execution Guard", copy: "Exact preflight, protection checks and fail-closed execution boundaries.", icon: "pyramid" },
  { no: "04", tag: "INFRA", title: "Celo Infrastructure", copy: "Built for agents, traders and applications moving value on Celo.", icon: "stack" },
] as const;

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
  const strategy = useMemo(() => strategies[risk], [risk]);
  const policy = riskPolicy[risk];
  const executionEnabled = isHorrisDeployed || ALLOW_WALLET_DIRECT_DEMO;

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
    const isAgent = snapshot.agent !== "0x0000000000000000000000000000000000000000" && normalized === snapshot.agent.toLowerCase();
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

    setBusy(true);
    setTxHash(undefined);
    setQuote("");
    try {
      if (isHorrisDeployed) {
        const snapshot = await refreshVault();
        if (!snapshot) throw new Error("Vault state unavailable");
        const blocked = validateVaultReview(snapshot, address, allocation);
        if (blocked) throw new Error(blocked);
      } else if (ALLOW_WALLET_DIRECT_DEMO) {
        if (allocation > Number(balance)) throw new Error(`Insufficient test USDC · balance ${Number(balance).toFixed(2)} USDC`);
      }

      setStatus("Horris is checking the Mento route…");
      const result = await getUsdMQuote(amount);
      setQuote(result.formattedOut);
      if (isHorrisDeployed) setStatus(`Onchain policy preflight passed · live route found for ${amount} USDC`);
      else if (ALLOW_WALLET_DIRECT_DEMO) setStatus(`Demo preflight passed · live route found for ${amount} USDC`);
      else setStatus(`Quote ready · deploy Horris to enable execution`);
    } catch (error: any) {
      setStatus(error?.message ?? "No valid Mento route found");
    } finally {
      setBusy(false);
    }
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
    } finally {
      setBusy(false);
    }
  }

  const modeLabel = isHorrisDeployed ? "Vault execution mode" : ALLOW_WALLET_DIRECT_DEMO ? "Wallet-direct demo enabled" : "Quote-only · deployment required";
  const effectiveCap = isHorrisDeployed && vaultState ? Math.min(policy.maxAllocation, Number(vaultState.executionCap)) : policy.maxAllocation;

  return <main className="site-frame">
    <nav className="masthead grid-shell">
      <a className="horris-mark" href="#top"><span className="h-icon">H</span><strong>Horris</strong></a>
      <div className="mast-nav"><a href="#product">Product</a><a href="#console">Execution</a><a href="#perps">Perps</a><a href="#monitor">Monitor</a><a href="#docs">Docs</a></div>
      <div className="mast-status"><span className="status-dot" /> TESTNET LIVE</div>
      <button className="cut-button" onClick={connectWallet}>{address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "Connect Wallet"}<span>↗</span></button>
    </nav>

    <section id="top" className="hero-grid grid-shell">
      <div className="section-index">01</div>
      <div className="hero-copy">
        <div className="micro-row"><span className="micro-tag"><i /> LIVE</span><span>THE EXECUTION LAYER<br/>FOR AN INTELLIGENT ONCHAIN ECONOMY</span></div>
        <h1>AI execution,<br/><span>governed.</span></h1>
        <p>Horris turns trade intent into policy-checked onchain execution.</p>
        <div className="hero-actions"><a className="cut-button dark" href="#console">Open Execution <span>↗</span></a><a className="outline-button" href="#product">Explore Product <span>↗</span></a></div>
      </div>
      <div className="hero-art" aria-hidden="true">
        <div className="orbit orbit-a"/><div className="orbit orbit-b"/>
        <div className="float-cube cube-a"/><div className="float-cube cube-b"/><div className="float-cube cube-c"/>
        <div className="float-sphere"/><div className="float-slab slab-a"/><div className="float-slab slab-b"/>
        <div className="hero-axis">INTENT<br/>POLICY<br/>EXECUTION<br/>CONTROL</div>
      </div>
      <aside className="manifesto-panel">
        <span>// GLOBAL EXECUTION INFRASTRUCTURE</span>
        <h2>OPEN<br/>EXECUTION<br/>WITHOUT<br/>BLIND TRUST.</h2>
        <p>AI meets crypto.<br/>Policy meets performance.</p>
        <b>↗</b>
      </aside>
    </section>

    <section id="product" className="feature-matrix grid-shell">
      <div className="section-index">02</div>
      {featureCards.map((feature) => <article className="feature-card" key={feature.tag}>
        <div className="feature-top"><span>{feature.tag}</span><b>↗</b></div>
        <div className={`mono-icon ${feature.icon}`} aria-hidden="true"><i/><i/><i/></div>
        <h3>{feature.title}</h3>
        <p>{feature.copy}</p>
        <footer><span>{feature.no}</span><small>HORRIS / {feature.tag}</small></footer>
      </article>)}
      <aside className="metrics-panel">
        <div className="metrics-label">// SYSTEM STATUS</div>
        <div className="bars"><i/><i/><i/><i/><i/></div>
        <strong>99.99%</strong><small>READINESS TARGET</small>
        <div className="metric-strip"><span>AI<em>GROQ</em></span><span>POLICY<em>LOCKED</em></span><span>EXEC<em>FAIL-CLOSED</em></span></div>
      </aside>
    </section>

    <section className="infra-band grid-shell">
      <div className="section-index inverse">03</div>
      <div className="infra-copy">
        <span>// THE INFRASTRUCTURE LAYER</span>
        <h2>The execution<br/>layer for what’s next.</h2>
        <p>Horris provides infrastructure for AI agents, traders and applications to execute onchain with policy, safety and transparent control.</p>
        <a href="#console" className="outline-button light">Enter Console <span>↗</span></a>
      </div>
      <div className="infra-art" aria-hidden="true">
        <div className="planet"/><div className="planet-ring ring-one"/><div className="planet-ring ring-two"/>
        <div className="mini-cube mini-one"/><div className="mini-cube mini-two"/><div className="mini-cube mini-three"/>
        <span>AGENTS<br/>TRADERS<br/>APPLICATIONS<br/>ONCHAIN</span>
      </div>
      <div className="infra-side"><span>[ A MORE OPEN ECONOMY ]</span><h3>Execution<br/>for everyone.</h3><p>From autonomous agents to global traders, Horris unlocks a safer execution layer.</p><div className="celo-note">BUILT ON CELO <b>↗</b></div></div>
    </section>

    <section id="console" className="console-intro grid-shell">
      <div className="section-index">04</div>
      <div><span className="mono-label">LIVE EXECUTION CONSOLE</span><h2>Policy before action.</h2><p>The visual system changes. The safety model does not. Every action below still runs through the existing Horris policy and preflight boundaries.</p></div>
      <div className="console-status"><span className="status-dot" /> CELO SEPOLIA<strong>{modeLabel}</strong><small>Mento proof adapter hardened · UpDown execution remains intentionally locked where genuine venue support is unavailable.</small></div>
    </section>

    <section id="engine" className="workspace shell technical-workspace"><div className="panel builder"><div className="panel-head"><span>01</span><h2>Set stable intent</h2></div><label>USDC allocation <small>{isHorrisDeployed && vaultState ? `Vault: ${Number(vaultState.usdc).toFixed(2)}` : `Wallet: ${Number(balance).toFixed(2)}`}</small></label><div className="amount-wrap"><input value={amount} onChange={(e) => { setAmount(e.target.value); setQuote(""); }} inputMode="decimal" /><span>USDC</span></div><label>Risk policy</label><div className="risk-grid">{(["Conservative", "Balanced", "Aggressive"] as HorrisRisk[]).map((item) => <button key={item} className={risk === item ? "risk active" : "risk"} onClick={() => { setRisk(item); setQuote(""); }}>{item}</button>)}</div><button className="button primary" disabled={busy} onClick={reviewStrategy}>{busy ? "Checking…" : "Review live strategy"}</button><p className="status">{status}</p></div>
    <div id="policy" className="panel strategy"><div className="panel-head"><span>02</span><h2>Horris stable proposal</h2></div><div className="strategy-title"><div><p>LIVE TESTNET ROUTE</p><h3>{strategy.title}</h3></div><span className="badge">{risk}</span></div><p className="summary">Convert test USDC into Mento USDm through Horris&apos; pinned Mento Router and approved FPMM factory on Celo Sepolia.</p><div className="metrics"><div><small>ROUTE</small><strong>USDC → USDm</strong></div><div><small>MAX EXECUTION</small><strong>{effectiveCap} USDC</strong></div><div><small>POLICY</small><strong>{isHorrisDeployed && vaultState ? `${vaultState.maxSlippagePercent}% onchain` : strategy.target}</strong></div></div><div className="policy-box"><div><span className="check">✓</span><p><strong>Asset policy</strong><small>Input USDC and output USDm are explicitly allowlisted.</small></p></div><div><span className="check">✓</span><p><strong>Route policy</strong><small>Mento Router and FPMM factory are pinned; arbitrary factories are rejected.</small></p></div><div><span className="check">✓</span><p><strong>Risk policy</strong><small>Minimum output is checked against an onchain router quote, not an agent-reported slippage value.</small></p></div></div>{quote && <div className="policy-box"><div><span className="check">→</span><p><strong>{amount} USDC ≈ {Number(quote).toFixed(4)} USDm</strong><small>{isHorrisDeployed ? "The exact vault transaction is simulated against current onchain policy before signing." : ALLOW_WALLET_DIRECT_DEMO ? "Wallet-direct mode is explicitly enabled for testnet demonstration." : "Quote-only mode: deploy the Horris vault to enable execution."}</small></p></div><button className="button primary" disabled={busy || !executionEnabled} onClick={executeStrategy}>{busy ? "Executing…" : isHorrisDeployed ? "Execute through Horris Vault" : ALLOW_WALLET_DIRECT_DEMO ? "Execute wallet-direct demo" : "Deploy Horris to execute"}</button></div>}</div></section>

    <PerpRiskPanel account={address} />
    <div id="monitor"><PerpMonitorPanel account={address} /></div>
    <div id="vault" className="shell"><VaultPanel account={address} /></div>
    <ActivityPanel latestTx={txHash} />

    <footer id="docs" className="site-footer grid-shell"><a className="horris-mark" href="#top"><span className="h-icon inverted">H</span><strong>Horris</strong></a><p>AI EXECUTION<br/>FOR A SAFER ONCHAIN ECONOMY.</p><nav><a href="#product">Product</a><a href="#console">Execution</a><a href="#perps">Perps</a><a href="#monitor">Monitor</a></nav><small>// CELO TESTNET · HORRIS</small></footer>
  </main>;
}

declare global { interface Window { ethereum?: { request(args: { method: string; params?: unknown[] }): Promise<any> }; } }
