"use client";

import { useMemo, useState } from "react";
import { createWalletClient, custom, formatUnits, type Address, type Hash } from "viem";
import { celoSepolia } from "viem/chains";
import VaultPanel from "../components/VaultPanel";
import ActivityPanel from "../components/ActivityPanel";
import PerpRiskPanel from "../components/PerpRiskPanel";
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

  return <main>
    <nav className="nav shell"><div className="brand">HORRIS<span>.</span></div><div className="navlinks"><a href="#engine">Stable route</a><a href="#perps">Perps</a><a href="#vault">Vault</a><a href="#activity">Activity</a></div><button className="button button-small" onClick={connectWallet}>{address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "Connect wallet"}</button></nav>
    <section className="hero shell"><div><p className="eyebrow">AI EXECUTION INFRASTRUCTURE · CELO</p><h1>Intent in.<br />Risk enforced.<br /><em>Execution out.</em></h1><p className="lede">Horris is becoming the policy layer between users, agents and Celo trading venues — stablecoin execution today, hardened perpetual risk orchestration next.</p></div><div className="network-card"><span className="dot" /> CELO SEPOLIA<strong>{modeLabel}</strong><small>Mento proof adapter hardened · UpDown perp analysis integrated · perp execution locked pending adapter verification.</small></div></section>
    <section id="engine" className="workspace shell"><div className="panel builder"><div className="panel-head"><span>01</span><h2>Set stable intent</h2></div><label>USDC allocation <small>{isHorrisDeployed && vaultState ? `Vault: ${Number(vaultState.usdc).toFixed(2)}` : `Wallet: ${Number(balance).toFixed(2)}`}</small></label><div className="amount-wrap"><input value={amount} onChange={(e) => { setAmount(e.target.value); setQuote(""); }} inputMode="decimal" /><span>USDC</span></div><label>Risk policy</label><div className="risk-grid">{(["Conservative", "Balanced", "Aggressive"] as HorrisRisk[]).map((item) => <button key={item} className={risk === item ? "risk active" : "risk"} onClick={() => { setRisk(item); setQuote(""); }}>{item}</button>)}</div><button className="button primary" disabled={busy} onClick={reviewStrategy}>{busy ? "Checking…" : "Review live strategy"}</button><p className="status">{status}</p></div>
    <div id="policy" className="panel strategy"><div className="panel-head"><span>02</span><h2>Horris stable proposal</h2></div><div className="strategy-title"><div><p>LIVE TESTNET ROUTE</p><h3>{strategy.title}</h3></div><span className="badge">{risk}</span></div><p className="summary">Convert test USDC into Mento USDm through Horris' pinned Mento Router and approved FPMM factory on Celo Sepolia.</p><div className="metrics"><div><small>ROUTE</small><strong>USDC → USDm</strong></div><div><small>MAX EXECUTION</small><strong>{effectiveCap} USDC</strong></div><div><small>POLICY</small><strong>{isHorrisDeployed && vaultState ? `${vaultState.maxSlippagePercent}% onchain` : strategy.target}</strong></div></div><div className="policy-box"><div><span className="check">✓</span><p><strong>Asset policy</strong><small>Input USDC and output USDm are explicitly allowlisted.</small></p></div><div><span className="check">✓</span><p><strong>Route policy</strong><small>Mento Router and FPMM factory are pinned; arbitrary factories are rejected.</small></p></div><div><span className="check">✓</span><p><strong>Risk policy</strong><small>Minimum output is checked against an onchain router quote, not an agent-reported slippage value.</small></p></div></div>{quote && <div className="policy-box"><div><span className="check">→</span><p><strong>{amount} USDC ≈ {Number(quote).toFixed(4)} USDm</strong><small>{isHorrisDeployed ? "The exact vault transaction is simulated against current onchain policy before signing." : ALLOW_WALLET_DIRECT_DEMO ? "Wallet-direct mode is explicitly enabled for testnet demonstration." : "Quote-only mode: deploy the Horris vault to enable execution."}</small></p></div><button className="button primary" disabled={busy || !executionEnabled} onClick={executeStrategy}>{busy ? "Executing…" : isHorrisDeployed ? "Execute through Horris Vault" : ALLOW_WALLET_DIRECT_DEMO ? "Execute wallet-direct demo" : "Deploy Horris to execute"}</button></div>}</div></section>
    <PerpRiskPanel />
    <div id="vault" className="shell"><VaultPanel account={address} /></div>
    <ActivityPanel latestTx={txHash} />
    <footer className="shell"><div className="brand">HORRIS<span>.</span></div><p>AI execution with enforceable risk controls.</p><p>Celo · Testnet MVP</p></footer>
  </main>;
}

declare global { interface Window { ethereum?: { request(args: { method: string; params?: unknown[] }): Promise<any> }; } }
