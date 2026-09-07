"use client";

import { useEffect, useMemo, useState } from "react";
import { createWalletClient, custom, formatUnits, type Address, type Hash } from "viem";
import { celoSepolia } from "viem/chains";
import ActivityPanel from "../../components/ActivityPanel";
import HorrisAiDock from "../../components/HorrisAiDock";
import HorrisRouteFooter from "../../components/HorrisRouteFooter";
import HorrisRouteNav from "../../components/HorrisRouteNav";
import PerpMonitorPanel from "../../components/PerpMonitorPanel";
import PerpRiskPanel from "../../components/PerpRiskPanel";
import VaultPanel from "../../components/VaultPanel";
import { TOKENS, celoSepoliaWalletParams, publicClient } from "../../lib/celo";
import { ALLOW_WALLET_DIRECT_DEMO, isHorrisDeployed } from "../../lib/horris-contracts";
import { buildUsdMSwap, buildVaultUsdMPlan, getUsdMQuote, riskPolicy, type HorrisRisk } from "../../lib/mento";
import { executeVaultMentoPlan } from "../../lib/vault-execution";
import { getVaultSnapshot } from "../../lib/vault";

const erc20Abi = [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] }] as const;
const strategies = {
  Conservative: { title: "Stable Conversion", target: "0.25% max slippage" },
  Balanced: { title: "Adaptive Stable Route", target: "0.50% max slippage" },
  Aggressive: { title: "Fast Stable Route", target: "1.00% max slippage" },
} as const;
type VaultSnapshot = Awaited<ReturnType<typeof getVaultSnapshot>>;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const short = (value?: string) => value ? `${value.slice(0, 6)}…${value.slice(-4)}` : "—";

export default function TerminalPage() {
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

  return <main className="horris-site terminal-route-page">
    <HorrisRouteNav />
    <section className="control-terminal terminal-route" id="terminal">
      <div className="terminal-titlebar"><span>06</span><small>HORRIS CONTROL TERMINAL</small><em>INSTITUTIONAL TOOLS FOR AUTONOMOUS EXECUTION.</em></div>
      <nav className="terminal-nav"><strong>HORRIS</strong><a href="#terminal">TERMINAL</a><a href="#perps">AGENTS</a><a href="#activity">EXECUTIONS</a><a href="#policy">POLICIES</a><a href="#monitor">RISK</a><a href="#network">NETWORK</a><div className="terminal-right"><span>NETWORK / <b>CELO</b></span><span>WALLET / <b>{short(address)}</b></span><span>SYSTEM / <b className={networkOnline ? "safe-text" : "warn-text"}>{networkOnline ? "OPERATIONAL" : "AWAITING DATA"}</b></span><button onClick={connectWallet}>{address ? "CONNECTED" : "CONNECT WALLET"}</button></div></nav>
      <div className="telemetry-strip"><div><small>SYSTEM STATUS</small><strong>{networkOnline ? "OPERATIONAL" : "AWAITING DATA"}</strong></div><div><small>CONFIGURED AGENT</small><strong>{agentConfigured}</strong></div><div><small>VAULT USDC</small><strong>{vaultState ? Number(vaultState.usdc).toFixed(2) : "—"}</strong></div><div><small>EXECUTION MODE</small><strong>{modeLabel}</strong></div><div><small>BLOCK</small><strong>{blockNumber?.toString() ?? "—"}</strong></div><div><small>SESSION</small><strong className={txHash ? "safe-text" : "muted-text"}>{txHash ? "CONFIRMED" : "NO EXECUTION"}</strong></div></div>

      <div className="terminal-main-grid">
        <section className="execution-feed" id="activity"><header className="terminal-panel-head"><div><span>EXECUTION FEED</span><strong>[ LIVE SESSION ]</strong></div><small>{status.toUpperCase()}</small></header><div className="table-wrap"><table><thead><tr><th>TIME</th><th>ACTOR</th><th>ACTION</th><th>PROTOCOL</th><th>VALUE</th><th>RISK</th><th>STATUS</th><th>TX</th></tr></thead><tbody>{txHash ? <tr className="executed-row"><td>SESSION</td><td>{walletRole}</td><td>SWAP</td><td>MENTO</td><td>{amount} USDC</td><td>{risk}</td><td>CONFIRMED</td><td>{short(txHash)}</td></tr> : quote ? <tr className="review-row"><td>SESSION</td><td>{walletRole}</td><td>SIMULATE</td><td>MENTO</td><td>{amount} USDC</td><td>{risk}</td><td>PREFLIGHT</td><td>—</td></tr> : <tr><td colSpan={8} className="table-empty">NO EXECUTIONS · CONNECT WALLET AND REVIEW AN INTENT</td></tr>}</tbody></table></div></section>

        <aside className="agent-inspector"><header className="terminal-panel-head"><div><span>AGENT INSPECTOR</span><strong>{address ? short(address) : "NOT CONNECTED"}</strong></div><small>{walletRole}</small></header><dl><div><dt>NETWORK</dt><dd>CELO SEPOLIA</dd></div><div><dt>ROLE</dt><dd>{walletRole}</dd></div><div><dt>AGENT</dt><dd>{agentConfigured}</dd></div><div><dt>DAILY LIMIT</dt><dd>{vaultState ? `${Number(vaultState.dailyLimit).toFixed(2)} USDC` : "—"}</dd></div><div><dt>EXECUTION CAP</dt><dd>{vaultState ? `${Number(vaultState.executionCap).toFixed(2)} USDC` : "—"}</dd></div><div><dt>RISK PROFILE</dt><dd>{risk}</dd></div><div><dt>VAULT STATE</dt><dd>{vaultState ? (vaultState.paused ? "PAUSED" : "ACTIVE") : "—"}</dd></div></dl><button className="terminal-action" onClick={connectWallet}>{address ? "[ REFRESH WALLET ]" : "[ CONNECT WALLET ]"}</button></aside>

        <section className="terminal-execution-builder"><header className="terminal-panel-head"><div><span>INTENT BUILDER</span><strong>STABLE EXECUTION / MENTO</strong></div><small>[ POLICY FIRST ]</small></header><div className="execution-builder-grid"><div className="terminal-form"><label>USDC ALLOCATION <small>{isHorrisDeployed && vaultState ? `VAULT ${Number(vaultState.usdc).toFixed(2)}` : `WALLET ${Number(balance).toFixed(2)}`}</small></label><div className="terminal-input-group"><input value={amount} onChange={(e) => { setAmount(e.target.value); setQuote(""); }} inputMode="decimal"/><span>USDC</span></div><label>RISK POLICY</label><div className="terminal-segmented">{(["Conservative", "Balanced", "Aggressive"] as HorrisRisk[]).map((item) => <button key={item} className={risk === item ? "active" : ""} onClick={() => { setRisk(item); setQuote(""); }}>{item.toUpperCase()}</button>)}</div><button className="terminal-action orange" disabled={busy} onClick={reviewStrategy}>{busy ? "CHECKING…" : "[ SIMULATE + REVIEW ]"}</button><p className="terminal-status-line">{status}</p></div><div className="route-inspector" id="policy"><small>POLICY / ROUTE</small><h3>{strategy.title.toUpperCase()}</h3><dl><div><dt>ROUTE</dt><dd>USDC → USDm</dd></div><div><dt>MAX EXECUTION</dt><dd>{effectiveCap} USDC</dd></div><div><dt>SLIPPAGE POLICY</dt><dd>{vaultState ? `${vaultState.maxSlippagePercent}% ONCHAIN` : strategy.target}</dd></div><div><dt>QUOTE</dt><dd>{quote ? `${Number(quote).toFixed(4)} USDm` : "—"}</dd></div><div><dt>MODE</dt><dd>{modeLabel}</dd></div></dl>{quote && <button className="terminal-action" disabled={busy || !executionEnabled} onClick={executeStrategy}>{busy ? "EXECUTING…" : executionEnabled ? "[ EXECUTE APPROVED ROUTE ]" : "[ EXECUTION LOCKED ]"}</button>}</div></div></section>

        <HorrisAiDock />
      </div>

      <div className="terminal-subsystems"><div id="perps"><PerpRiskPanel account={address}/></div><div id="monitor"><PerpMonitorPanel account={address}/></div><div id="network"><VaultPanel account={address}/></div><ActivityPanel latestTx={txHash}/></div>
    </section>
    <HorrisRouteFooter />
  </main>;
}

declare global { interface Window { ethereum?: { request(args: { method: string; params?: unknown[] }): Promise<any> }; } } }
