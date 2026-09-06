"use client";

import { useEffect, useState } from "react";
import { createWalletClient, custom, type Address } from "viem";
import { celoSepolia } from "viem/chains";
import { depositUsdc, getVaultSnapshot, withdrawVaultAsset } from "../lib/vault";
import { HORRIS_VAULT, isHorrisDeployed } from "../lib/horris-contracts";

export default function VaultPanel({ account }: { account?: Address }) {
  const [amount, setAmount] = useState("10");
  const [asset, setAsset] = useState<"USDC" | "USDm">("USDC");
  const [snapshot, setSnapshot] = useState<Awaited<ReturnType<typeof getVaultSnapshot>>>();
  const [status, setStatus] = useState(isHorrisDeployed ? "Vault ready" : "Waiting for Celo Sepolia deployment");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    if (!isHorrisDeployed) return;
    try { setSnapshot(await getVaultSnapshot()); } catch (error) { setStatus(error instanceof Error ? error.message : "Vault read failed"); }
  }

  useEffect(() => { void refresh(); }, []);

  async function transact(kind: "deposit" | "withdraw") {
    if (!account || !window.ethereum) return setStatus("Connect the vault owner wallet first");
    if (!isHorrisDeployed) return setStatus("Deploy Horris contracts and configure public addresses first");
    if (!amount || Number(amount) <= 0) return setStatus(`Enter a valid ${asset} amount`);
    if (kind === "deposit" && asset !== "USDC") return setStatus("Horris deposits use USDC; USDm is created by execution and can be withdrawn");
    setBusy(true);
    try {
      const wallet = createWalletClient({ account, chain: celoSepolia, transport: custom(window.ethereum) });
      setStatus(kind === "deposit" ? "Approve and deposit USDC into Horris…" : `Withdraw ${asset} from Horris…`);
      if (kind === "deposit") await depositUsdc(wallet, account, amount);
      else await withdrawVaultAsset(wallet, account, amount, asset);
      await refresh();
      setStatus(kind === "deposit" ? "Vault deposit confirmed ✓" : `${asset} withdrawal confirmed ✓`);
    } catch (error: any) {
      setStatus(error?.shortMessage ?? error?.message ?? "Vault transaction failed");
    } finally { setBusy(false); }
  }

  return (
    <section className="panel builder" aria-label="Horris vault">
      <div className="panel-head"><span>03</span><h2>Policy vault</h2></div>
      <p className="summary">{isHorrisDeployed ? "Onchain custody with owner-controlled deposits, withdrawals and execution limits." : "The dashboard is deployment-aware. Add the Celo Sepolia vault and adapter addresses to activate these controls."}</p>
      <div className="metrics">
        <div><small>VAULT</small><strong>{HORRIS_VAULT ? `${HORRIS_VAULT.slice(0, 6)}…${HORRIS_VAULT.slice(-4)}` : "NOT DEPLOYED"}</strong></div>
        <div><small>USDC</small><strong>{snapshot ? Number(snapshot.usdc).toFixed(2) : "—"}</strong></div>
        <div><small>USDm</small><strong>{snapshot ? Number(snapshot.usdm).toFixed(2) : "—"}</strong></div>
      </div>
      <div className="metrics">
        <div><small>DAILY SPENT</small><strong>{snapshot ? `${Number(snapshot.spentToday).toFixed(2)} / ${Number(snapshot.dailyLimit).toFixed(2)}` : "—"}</strong></div>
        <div><small>EXECUTION CAP</small><strong>{snapshot ? Number(snapshot.executionCap).toFixed(2) : "—"} USDC</strong></div>
        <div><small>MAX SLIPPAGE</small><strong>{snapshot ? `${snapshot.maxSlippagePercent.toFixed(2)}%` : "—"}</strong></div>
      </div>
      <label>Vault amount</label>
      <div className="amount-wrap"><input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" /><select value={asset} onChange={(event) => setAsset(event.target.value as "USDC" | "USDm")}><option value="USDC">USDC</option><option value="USDm">USDm</option></select></div>
      <div className="risk-grid"><button className="button primary" disabled={busy || !isHorrisDeployed || asset !== "USDC"} onClick={() => transact("deposit")}>Deposit USDC</button><button className="button" disabled={busy || !isHorrisDeployed} onClick={() => transact("withdraw")}>Withdraw {asset}</button></div>
      <p className="status">{snapshot?.paused ? "Vault is paused · deposits and executions are blocked; owner withdrawals remain available." : status}</p>
    </section>
  );
}
