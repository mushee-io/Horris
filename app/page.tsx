"use client";

import { useMemo, useState } from "react";
import { createWalletClient, custom } from "viem";
import { celoAlfajores } from "viem/chains";

type Risk = "Conservative" | "Balanced" | "Aggressive";

const strategies = {
  Conservative: {
    title: "Stable Yield",
    summary: "Prioritize low-volatility stablecoin lending opportunities with strict drawdown limits.",
    allocation: "USDC lending",
    maxDrawdown: "3%",
    target: "4–7% APY",
  },
  Balanced: {
    title: "Adaptive Yield",
    summary: "Route capital across vetted Celo DeFi opportunities while maintaining moderate exposure limits.",
    allocation: "USDC + diversified yield",
    maxDrawdown: "7%",
    target: "7–12% APY",
  },
  Aggressive: {
    title: "Opportunity Capture",
    summary: "Allow wider strategy selection and faster rebalancing while keeping hard policy caps enforced.",
    allocation: "Multi-strategy",
    maxDrawdown: "15%",
    target: "12%+ APY",
  },
} as const;

export default function Home() {
  const [address, setAddress] = useState<string>("");
  const [risk, setRisk] = useState<Risk>("Balanced");
  const [amount, setAmount] = useState("250");
  const [status, setStatus] = useState("Strategy ready for review");

  const strategy = useMemo(() => strategies[risk], [risk]);

  async function connectWallet() {
    if (!window.ethereum) {
      setStatus("No injected wallet detected. Install MetaMask or another EVM wallet.");
      return;
    }

    try {
      const client = createWalletClient({ chain: celoAlfajores, transport: custom(window.ethereum) });
      const [account] = await client.requestAddresses();
      setAddress(account);
      setStatus("Wallet connected on Celo Alfajores");
    } catch {
      setStatus("Wallet connection was cancelled");
    }
  }

  function simulatePolicyCheck() {
    if (!address) {
      setStatus("Connect a wallet before running policy checks");
      return;
    }
    if (!amount || Number(amount) <= 0) {
      setStatus("Enter a valid allocation amount");
      return;
    }
    setStatus(`Policy checks passed for ${amount} USDC · ${risk} profile`);
  }

  return (
    <main>
      <nav className="nav shell">
        <div className="brand">HORIS<span>.</span></div>
        <div className="navlinks">
          <a href="#engine">Engine</a>
          <a href="#policy">Risk Policy</a>
          <a href="#activity">Activity</a>
        </div>
        <button className="button button-small" onClick={connectWallet}>
          {address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "Connect wallet"}
        </button>
      </nav>

      <section className="hero shell">
        <div>
          <p className="eyebrow">AI EXECUTION INFRASTRUCTURE · CELO</p>
          <h1>Automate DeFi.<br />Keep risk <em>onchain.</em></h1>
          <p className="lede">Horis turns user intent into DeFi execution while hard policy limits control what the AI is allowed to do.</p>
        </div>
        <div className="network-card">
          <span className="dot" /> CELO ALFAJORES
          <strong>Testnet-first MVP</strong>
          <small>Execution is simulated until protocol adapters and audited contracts are enabled.</small>
        </div>
      </section>

      <section id="engine" className="workspace shell">
        <div className="panel builder">
          <div className="panel-head"><span>01</span><h2>Build strategy</h2></div>

          <label>Allocation</label>
          <div className="amount-wrap">
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
            <span>USDC</span>
          </div>

          <label>Risk profile</label>
          <div className="risk-grid">
            {(["Conservative", "Balanced", "Aggressive"] as Risk[]).map((item) => (
              <button key={item} className={risk === item ? "risk active" : "risk"} onClick={() => setRisk(item)}>{item}</button>
            ))}
          </div>

          <button className="button primary" onClick={simulatePolicyCheck}>Run policy check</button>
          <p className="status">{status}</p>
        </div>

        <div id="policy" className="panel strategy">
          <div className="panel-head"><span>02</span><h2>AI proposal</h2></div>
          <div className="strategy-title">
            <div><p>PROPOSED STRATEGY</p><h3>{strategy.title}</h3></div>
            <span className="badge">{risk}</span>
          </div>
          <p className="summary">{strategy.summary}</p>

          <div className="metrics">
            <div><small>ALLOCATION</small><strong>{strategy.allocation}</strong></div>
            <div><small>MAX DRAWDOWN</small><strong>{strategy.maxDrawdown}</strong></div>
            <div><small>TARGET</small><strong>{strategy.target}</strong></div>
          </div>

          <div className="policy-box">
            <div><span className="check">✓</span><p><strong>Asset allowlist</strong><small>Only approved assets can be touched.</small></p></div>
            <div><span className="check">✓</span><p><strong>Drawdown ceiling</strong><small>Execution halts above your configured risk cap.</small></p></div>
            <div><span className="check">✓</span><p><strong>User-controlled exit</strong><small>Pause and withdrawal authority remains with the user.</small></p></div>
          </div>
        </div>
      </section>

      <section id="activity" className="shell activity">
        <div className="activity-head"><div><p className="eyebrow">EXECUTION LOG</p><h2>Everything the agent does is visible.</h2></div><span>0 LIVE EXECUTIONS</span></div>
        <div className="empty-state">
          <span>→</span>
          <div><strong>No live executions yet</strong><p>Connect a wallet and review a strategy. Testnet contract execution comes next.</p></div>
        </div>
      </section>

      <footer className="shell"><div className="brand">HORIS<span>.</span></div><p>AI execution with enforceable risk controls.</p><p>Celo · 2026</p></footer>
    </main>
  );
}

declare global {
  interface Window {
    ethereum?: any;
  }
}
