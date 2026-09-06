"use client";

import { useMemo, useState } from "react";
import { createWalletClient, custom, formatUnits, type Address, type Hash } from "viem";
import { celoSepolia } from "viem/chains";
import VaultPanel from "../components/VaultPanel";
import { CELO_SEPOLIA_EXPLORER, TOKENS, celoSepoliaWalletParams, publicClient } from "../lib/celo";
import { buildUsdMSwap, getUsdMQuote, riskPolicy, type HorrisRisk } from "../lib/mento";
import { isHorrisDeployed } from "../lib/horris-contracts";

const erc20Abi = [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] }] as const;
const strategies = {
  Conservative: { title: "Stable Conversion", maxDrawdown: "3%", target: "0.25% max slippage" },
  Balanced: { title: "Adaptive Stable Route", maxDrawdown: "7%", target: "0.50% max slippage" },
  Aggressive: { title: "Fast Stable Route", maxDrawdown: "15%", target: "1.00% max slippage" },
} as const;

export default function Home() {
  const [address, setAddress] = useState<Address>();
  const [risk, setRisk] = useState<HorrisRisk>("Balanced");
  const [amount, setAmount] = useState("10");
  const [quote, setQuote] = useState("");
  const [balance, setBalance] = useState("0");
  const [status, setStatus] = useState("Connect a wallet to begin");
  const [busy, setBusy] = useState(false);
  const [txHash, setTxHash] = useState<Hash>();
  const strategy = useMemo(() => strategies[risk], [risk]);
  const policy = riskPolicy[risk];

  async function ensureCeloSepolia() {
    if (!window.ethereum) throw new Error("No injected EVM wallet detected");
    try { await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: celoSepoliaWalletParams.chainId }] }); }
    catch (error: any) { if (error?.code !== 4902) throw error; await window.ethereum.request({ method: "wallet_addEthereumChain", params: [celoSepoliaWalletParams] }); }
  }

  async function refreshBalance(account: Address) {
    const raw = await publicClient.readContract({ address: TOKENS.USDC.address, abi: erc20Abi, functionName: "balanceOf", args: [account] });
    setBalance(formatUnits(raw, TOKENS.USDC.decimals));
  }

  async function connectWallet() {
    if (!window.ethereum) return setStatus("Install MetaMask or another EVM wallet first");
    try {
      await ensureCeloSepolia();
      const client = createWalletClient({ chain: celoSepolia, transport: custom(window.ethereum) });
      const [account] = await client.requestAddresses(); setAddress(account); await refreshBalance(account); setStatus("Wallet connected · Celo Sepolia");
    } catch (error: any) { setStatus(error?.message ?? "Wallet connection failed"); }
  }

  async function reviewStrategy() {
    if (!address) return setStatus("Connect your wallet first");
    if (!amount || Number(amount) <= 0) return setStatus("Enter a valid USDC amount");
    if (Number(amount) > policy.maxAllocation) return setStatus(`${risk} policy allows max ${policy.maxAllocation} USDC per execution`);
    if (Number(amount) > Number(balance)) return setStatus(`Insufficient test USDC · balance ${Number(balance).toFixed(2)} USDC`);
    setBusy(true); setTxHash(undefined); setStatus("Horris is checking the Mento route…");
    try { const result = await getUsdMQuote(amount); setQuote(result.formattedOut); setStatus(`Policy passed · live route found for ${amount} USDC`); }
    catch (error: any) { setQuote(""); setStatus(error?.message ?? "No valid Mento route found"); }
    finally { setBusy(false); }
  }

  async function executeStrategy() {
    if (!address || !window.ethereum || !quote) return setStatus("Review a valid strategy before execution");
    setBusy(true); setStatus("Preparing policy-compliant transaction…");
    try {
      await ensureCeloSepolia();
      const wallet = createWalletClient({ account: address, chain: celoSepolia, transport: custom(window.ethereum) });
      const { approval, swap } = await buildUsdMSwap(amount, address, risk);
      if (approval) {
        setStatus("Approve Mento Router to spend this USDC amount…");
        const approvalHash = await wallet.sendTransaction({ account: address, chain: celoSepolia, to: approval.to as Address, data: approval.data as `0x${string}`, value: BigInt(approval.value ?? "0") });
        await publicClient.waitForTransactionReceipt({ hash: approvalHash });
      }
      setStatus("Execute USDC → USDm on Mento…");
      const hash = await wallet.sendTransaction({ account: address, chain: celoSepolia, to: swap.params.to as Address, data: swap.params.data as `0x${string}`, value: BigInt(swap.params.value ?? "0") });
      setTxHash(hash); setStatus("Transaction submitted · waiting for Celo confirmation…"); await publicClient.waitForTransactionReceipt({ hash }); await refreshBalance(address); setStatus("Execution confirmed on Celo Sepolia ✓");
    } catch (error: any) { setStatus(error?.shortMessage ?? error?.message ?? "Execution failed"); }
    finally { setBusy(false); }
  }

  return <main>
    <nav className="nav shell"><div className="brand">HORRIS<span>.</span></div><div className="navlinks"><a href="#engine">Engine</a><a href="#policy">Policy</a><a href="#vault">Vault</a><a href="#activity">Activity</a></div><button className="button button-small" onClick={connectWallet}>{address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "Connect wallet"}</button></nav>
    <section className="hero shell"><div><p className="eyebrow">AI EXECUTION INFRASTRUCTURE · CELO</p><h1>Intent in.<br />Policy checked.<br /><em>Execution out.</em></h1><p className="lede">Horris turns strategy intent into transparent Celo transactions with deterministic policy between the agent and user funds.</p></div><div className="network-card"><span className="dot" /> CELO SEPOLIA<strong>{isHorrisDeployed ? "Vault mode configured" : "Wallet-direct demo mode"}</strong><small>Mento · USDC → USDm · testnet assets only.</small></div></section>
    <section id="engine" className="workspace shell">
      <div className="panel builder"><div className="panel-head"><span>01</span><h2>Set intent</h2></div><label>USDC allocation <small>Wallet: {Number(balance).toFixed(2)}</small></label><div className="amount-wrap"><input value={amount} onChange={(e) => { setAmount(e.target.value); setQuote(""); }} inputMode="decimal" /><span>USDC</span></div><label>Risk policy</label><div className="risk-grid">{(["Conservative", "Balanced", "Aggressive"] as HorrisRisk[]).map((item) => <button key={item} className={risk === item ? "risk active" : "risk"} onClick={() => { setRisk(item); setQuote(""); }}>{item}</button>)}</div><button className="button primary" disabled={busy} onClick={reviewStrategy}>{busy ? "Checking…" : "Review live strategy"}</button><p className="status">{status}</p></div>
      <div id="policy" className="panel strategy"><div className="panel-head"><span>02</span><h2>Horris proposal</h2></div><div className="strategy-title"><div><p>LIVE TESTNET ROUTE</p><h3>{strategy.title}</h3></div><span className="badge">{risk}</span></div><p className="summary">Convert test USDC into Mento USDm through the approved Mento Router on Celo Sepolia.</p><div className="metrics"><div><small>ROUTE</small><strong>USDC → USDm</strong></div><div><small>MAX EXECUTION</small><strong>{policy.maxAllocation} USDC</strong></div><div><small>POLICY</small><strong>{strategy.target}</strong></div></div><div className="policy-box"><div><span className="check">✓</span><p><strong>Asset policy</strong><small>Input USDC and output USDm are explicitly defined.</small></p></div><div><span className="check">✓</span><p><strong>Target policy</strong><small>Execution is built by the official Mento SDK.</small></p></div><div><span className="check">✓</span><p><strong>Risk policy</strong><small>{strategy.maxDrawdown} profile · {policy.slippage}% transaction slippage ceiling.</small></p></div></div>{quote && <div className="policy-box"><div><span className="check">→</span><p><strong>{amount} USDC ≈ {Number(quote).toFixed(4)} USDm</strong><small>Live testnet quote. Final output is protected by the selected slippage policy.</small></p></div><button className="button primary" disabled={busy} onClick={executeStrategy}>{busy ? "Executing…" : "Execute wallet-direct demo"}</button></div>}</div>
    </section>
    <div id="vault" className="shell"><VaultPanel account={address} /></div>
    <section id="activity" className="shell activity"><div className="activity-head"><div><p className="eyebrow">EXECUTION LOG</p><h2>Every action stays inspectable.</h2></div><span>{txHash ? "1 TESTNET EXECUTION" : "0 EXECUTIONS"}</span></div><div className="empty-state"><span>{txHash ? "✓" : "→"}</span><div><strong>{txHash ? "Transaction submitted" : "No execution yet"}</strong><p>{txHash ? <a href={`${CELO_SEPOLIA_EXPLORER}/tx/${txHash}`} target="_blank" rel="noreferrer">View transaction on Celo Sepolia explorer ↗</a> : "Connect a wallet, review the live quote, then explicitly approve execution."}</p></div></div></section>
    <footer className="shell"><div className="brand">HORRIS<span>.</span></div><p>AI execution with enforceable risk controls.</p><p>Celo · Testnet MVP</p></footer>
  </main>;
}

declare global { interface Window { ethereum?: { request(args: { method: string; params?: unknown[] }): Promise<any> }; } }
