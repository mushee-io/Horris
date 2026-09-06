"use client";

import { useEffect, useState } from "react";
import { createWalletClient, custom, type Address } from "viem";
import { celoSepolia } from "viem/chains";
import { depositUsdc, getVaultSnapshot, withdrawUsdc } from "../lib/vault";
import { HORRIS_VAULT, isHorrisDeployed } from "../lib/horris-contracts";

export default function VaultPanel({ account }: { account?: Address }) {
  const [amount, setAmount] = useState("10");
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
    if (!amount || Number(amount) <= 0) return setStatus("Enter a valid USDC amount");
    setBusy(true);
    try {
      const wallet = createWalletClient({ account, chain: celoSepolia, transport: custom(window.ethereum) });
      setStatus(kind === "deposit" ? "Approve and deposit USDC into Horris…" : "Withdraw USDC from Horris…");
      if (kind === "deposit") await depositUsdc(wallet, account, amount);
      else await withdrawUsdc(wallet, account, amount);
      await refresh();
      setStatus(kind === "deposit" ? "Vault deposit confirmed ✓" : "Vault withdrawal confirmed ✓");
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
        <div><small>DAILY SPENT</small><strong>{snapshot ? `${Number(snapshot.spentToday).toFixed(2)} / ${Number(snapshot.dailyLimit).toFixed(2)}` : "—"}</strong></div>
      </div>
      <label>Vault amount</label>
      <div className="amount-wrap"><input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" /><span>USDC</span></div>
      <div className="risk-grid"><button className="button primary" disabled={busy || !isHorrisDeployed} onClick={() => transact("deposit")}>Deposit</button><button className="button" disabled={busy || !isHorrisDeployed} onClick={() => transact("withdraw")}>Withdraw</button></div>
      <p className="status">{status}</p>
    </section>
  );
}
