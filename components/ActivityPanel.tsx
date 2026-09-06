"use client";

import { useCallback, useEffect, useState } from "react";
import { CELO_SEPOLIA_EXPLORER, publicClient } from "../lib/celo";
import { HORRIS_DEPLOYMENT_BLOCK, HORRIS_VAULT, isHorrisDeployed } from "../lib/horris-contracts";
import { formatExecutionActivity, getVaultActivity, type ExecutionActivity } from "../lib/portfolio";

export default function ActivityPanel({ latestTx }: { latestTx?: `0x${string}` }) {
  const [items, setItems] = useState<ExecutionActivity[]>([]);
  const [status, setStatus] = useState(isHorrisDeployed ? "Loading onchain execution history…" : "Vault activity activates after deployment");

  const refresh = useCallback(async () => {
    if (!HORRIS_VAULT || !isHorrisDeployed) return;
    try {
      const fromBlock = HORRIS_DEPLOYMENT_BLOCK ?? await publicClient.getBlockNumber();
      const activity = await getVaultActivity(publicClient, HORRIS_VAULT, fromBlock);
      setItems(activity.slice(0, 8));
      setStatus(activity.length ? `${activity.length} indexed vault execution${activity.length === 1 ? "" : "s"}` : "No vault execution yet");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not index vault activity");
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh, latestTx]);

  if (!isHorrisDeployed) {
    return <section id="activity" className="shell activity"><div className="activity-head"><div><p className="eyebrow">EXECUTION LOG</p><h2>Every action stays inspectable.</h2></div><span>PRE-DEPLOYMENT</span></div><div className="empty-state"><span>→</span><div><strong>Onchain history ready</strong><p>{status}</p></div></div></section>;
  }

  return <section id="activity" className="shell activity">
    <div className="activity-head"><div><p className="eyebrow">EXECUTION LOG</p><h2>Every vault execution is indexed.</h2></div><span>{status}</span></div>
    {items.length === 0 ? <div className="empty-state"><span>→</span><div><strong>No vault execution yet</strong><p>Deposit test USDC, review a strategy and execute through Horris.</p></div></div> : items.map((item) => {
      const formatted = formatExecutionActivity(item);
      return <div className="empty-state" key={`${item.txHash}-${item.blockNumber}`}><span>✓</span><div><strong>{Number(formatted.amountInFormatted).toFixed(2)} USDC → {Number(formatted.amountOutFormatted).toFixed(2)} USDm</strong><p>Policy slippage {formatted.slippagePercent.toFixed(2)}% · block {item.blockNumber.toString()} · <a href={`${CELO_SEPOLIA_EXPLORER}/tx/${item.txHash}`} target="_blank" rel="noreferrer">Explorer ↗</a></p></div></div>;
    })}
  </section>;
}
