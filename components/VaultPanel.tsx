"use client";

import { useEffect, useMemo, useState } from "react";
import { createWalletClient, custom, type Address } from "viem";
import { celoSepolia } from "viem/chains";
import { depositUsdc, getVaultSnapshot, withdrawVaultAsset } from "../lib/vault";
import { HORRIS_VAULT, isHorrisDeployed } from "../lib/horris-contracts";

export default function VaultPanel({ account }: { account?: Address }) {
  const [amount, setAmount] = useState("10");
  const [asset, setAsset] = useState<"USDC" | "USDm">("USDC");
  const [walletAccount, setWalletAccount] = useState<Address | undefined>(account);
  const [snapshot, setSnapshot] = useState<Awaited<ReturnType<typeof getVaultSnapshot>>>();
  const [status, setStatus] = useState(isHorrisDeployed ? "Vault ready" : "Waiting for Celo Sepolia deployment");
  const [busy, setBusy] = useState(false);

  const isOwner = useMemo(() => Boolean(walletAccount && snapshot?.owner && walletAccount.toLowerCase() === snapshot.owner.toLowerCase()), [walletAccount, snapshot?.owner]);
  const isAgent = useMemo(() => Boolean(walletAccount && snapshot?.agent && walletAccount.toLowerCase() === snapshot.agent.toLowerCase()), [walletAccount, snapshot?.agent]);

  async function refresh() {
    if (!isHorrisDeployed) return;
    try {
      const next = await getVaultSnapshot();
      setSnapshot(next);
      if (!next.accountingHealthy) setStatus("Vault accounting invariant warning: raw balances are below accounted balances");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Vault read failed");
    }
  }

  useEffect(() => { setWalletAccount(account); }, [account]);

  useEffect(() => {
    void refresh();
    const provider = window.ethereum as any;
    if (!provider?.request) return;

    let mounted = true;
    async function syncActiveAccount() {
      try {
        const accounts = await provider.request({ method: "eth_accounts" }) as string[];
        if (mounted) setWalletAccount(accounts?.[0] as Address | undefined);
      } catch {
        if (mounted) setWalletAccount(undefined);
      }
    }

    function onAccountsChanged(accounts: string[]) {
      setWalletAccount(accounts?.[0] as Address | undefined);
      setStatus(accounts?.[0] ? "Wallet account changed · permissions refreshed" : "Wallet disconnected");
      void refresh();
    }

    function onChainChanged() {
      setStatus("Network changed · rechecking Celo Sepolia vault access");
      void syncActiveAccount();
      void refresh();
    }

    void syncActiveAccount();
    provider.on?.("accountsChanged", onAccountsChanged);
    provider.on?.("chainChanged", onChainChanged);
    return () => {
      mounted = false;
      provider.removeListener?.("accountsChanged", onAccountsChanged);
      provider.removeListener?.("chainChanged", onChainChanged);
    };
  }, []);

  async function transact(kind: "deposit" | "withdraw") {
    if (!walletAccount || !window.ethereum) return setStatus("Connect the vault owner wallet first");
    if (!isHorrisDeployed) return setStatus("Deploy Horris contracts and configure public addresses first");
    if (!snapshot) return setStatus("Refresh the vault state before transacting");
    if (!snapshot.accountingHealthy) return setStatus("Vault accounting invariant failed; do not transact until investigated");
    if (!isOwner) return setStatus(`Only the Horris vault owner ${snapshot.owner.slice(0, 6)}…${snapshot.owner.slice(-4)} can deposit or withdraw`);
    if (!amount || Number(amount) <= 0) return setStatus(`Enter a valid ${asset} amount`);
    if (kind === "deposit" && asset !== "USDC") return setStatus("Horris deposits use USDC; USDm is created by execution and can be withdrawn");
    if (kind === "withdraw" && Number(amount) > Number(asset === "USDC" ? snapshot.usdc : snapshot.usdm)) return setStatus(`Insufficient accounted ${asset} balance`);

    setBusy(true);
    try {
      const wallet = createWalletClient({ account: walletAccount, chain: celoSepolia, transport: custom(window.ethereum) });
      setStatus(kind === "deposit" ? "Approve and deposit USDC into Horris…" : `Withdraw ${asset} from Horris…`);
      if (kind === "deposit") await depositUsdc(wallet, walletAccount, amount);
      else await withdrawVaultAsset(wallet, walletAccount, amount, asset);
      await refresh();
      setStatus(kind === "deposit" ? "Vault deposit confirmed ✓" : `${asset} withdrawal confirmed ✓`);
    } catch (error: any) {
      setStatus(error?.shortMessage ?? error?.message ?? "Vault transaction failed");
    } finally { setBusy(false); }
  }

  const accessLabel = !walletAccount ? "DISCONNECTED" : isOwner ? "OWNER" : isAgent ? "AGENT · EXECUTE ONLY" : "READ ONLY";

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
      <div className="metrics">
        <div><small>OWNER</small><strong>{snapshot ? `${snapshot.owner.slice(0, 6)}…${snapshot.owner.slice(-4)}` : "—"}</strong></div>
        <div><small>CONNECTED</small><strong>{walletAccount ? `${walletAccount.slice(0, 6)}…${walletAccount.slice(-4)}` : "—"}</strong></div>
        <div><small>ACCESS</small><strong>{accessLabel}</strong></div>
      </div>
      <label>Vault amount</label>
      <div className="amount-wrap"><input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" /><select value={asset} onChange={(event) => setAsset(event.target.value as "USDC" | "USDm")}><option value="USDC">USDC</option><option value="USDm">USDm</option></select></div>
      <div className="risk-grid"><button className="button primary" disabled={busy || !isHorrisDeployed || asset !== "USDC" || !isOwner || !snapshot?.accountingHealthy} onClick={() => transact("deposit")}>Deposit USDC</button><button className="button" disabled={busy || !isHorrisDeployed || !isOwner || !snapshot?.accountingHealthy} onClick={() => transact("withdraw")}>Withdraw {asset}</button></div>
      <p className="status">{snapshot?.paused ? "Vault is paused · deposits and executions are blocked; owner withdrawals remain available." : !walletAccount ? "Connect the vault owner wallet to enable custody controls." : isOwner ? status : isAgent ? "Agent wallet connected · execution only. Switch to the owner wallet to deposit or withdraw." : `Read only · switch to vault owner ${snapshot ? `${snapshot.owner.slice(0, 6)}…${snapshot.owner.slice(-4)}` : "wallet"} for custody controls.`}</p>
    </section>
  );
}
