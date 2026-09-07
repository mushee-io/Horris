"use client";

import { useMemo, useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  formatEther,
  http,
  parseEventLogs,
  type Address,
  type EIP1193Provider,
  type Hash,
} from "viem";
import { celo } from "viem/chains";
import {
  CELO_MAINNET_RPC,
  ERC8004_AGENT_REGISTRY,
  ERC8004_AGENT_URI,
  ERC8004_EXPLORER_BASE,
  ERC8004_IDENTITY_ABI,
  ERC8004_IDENTITY_REGISTRY,
} from "../../lib/erc8004";

const publicClient = createPublicClient({ chain: celo, transport: http(CELO_MAINNET_RPC) });

type Step = "idle" | "connecting" | "checking" | "confirming" | "pending" | "done" | "error";

type RegistrationResult = {
  agentId: bigint;
  owner: Address;
  hash: Hash;
};

function injectedProvider() {
  if (typeof window === "undefined") return null;
  return (window as unknown as { ethereum?: EIP1193Provider }).ethereum ?? null;
}

function shortAddress(value: string) {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function friendlyError(error: unknown) {
  if (error instanceof Error) {
    const message = error.message.replace(/\s+/g, " ");
    if (/rejected|denied|cancelled|canceled/i.test(message)) return "Transaction cancelled in your wallet. Nothing was registered.";
    if (/insufficient funds/i.test(message)) return "This wallet does not have enough CELO for network gas.";
    if (/already known/i.test(message)) return "The wallet already submitted this transaction. Wait for it to confirm.";
    return message.slice(0, 280);
  }
  return "ERC-8004 registration failed safely. No private key or seed phrase was requested.";
}

export default function Erc8004RegistrationPage() {
  const [step, setStep] = useState<Step>("idle");
  const [account, setAccount] = useState<Address | null>(null);
  const [balance, setBalance] = useState<string>("—");
  const [message, setMessage] = useState("Connect the wallet that should own the Horris ERC-8004 identity.");
  const [result, setResult] = useState<RegistrationResult | null>(null);

  const busy = step === "connecting" || step === "checking" || step === "confirming" || step === "pending";
  const buttonLabel = useMemo(() => {
    if (step === "connecting") return "CONNECTING WALLET…";
    if (step === "checking") return "CHECKING CELO + REGISTRY…";
    if (step === "confirming") return "CONFIRM IN WALLET…";
    if (step === "pending") return "WAITING FOR CELO…";
    if (step === "done") return "HORRIS REGISTERED ✓";
    return "CONNECT WALLET + REGISTER";
  }, [step]);

  async function register() {
    if (busy || step === "done") return;
    setResult(null);
    setStep("connecting");
    setMessage("Connecting to your browser wallet…");

    try {
      const provider = injectedProvider();
      if (!provider) throw new Error("No EVM browser wallet detected. Install MetaMask or another EVM wallet and open this page again.");

      const walletClient = createWalletClient({ chain: celo, transport: custom(provider) });
      let addresses = await walletClient.requestAddresses();
      if (!addresses.length) throw new Error("The wallet did not return an account.");
      const owner = addresses[0];
      setAccount(owner);

      setStep("checking");
      setMessage("Switching to Celo mainnet and validating the official ERC-8004 registry…");
      try {
        await walletClient.switchChain({ id: celo.id });
      } catch {
        await walletClient.addChain({ chain: celo });
        await walletClient.switchChain({ id: celo.id });
      }

      addresses = await walletClient.requestAddresses();
      if (!addresses.length) throw new Error("The wallet disconnected while switching to Celo.");
      const activeOwner = addresses[0];
      setAccount(activeOwner);

      const [code, nativeBalance, existingCount] = await Promise.all([
        publicClient.getBytecode({ address: ERC8004_IDENTITY_REGISTRY }),
        publicClient.getBalance({ address: activeOwner }),
        publicClient.readContract({
          address: ERC8004_IDENTITY_REGISTRY,
          abi: ERC8004_IDENTITY_ABI,
          functionName: "balanceOf",
          args: [activeOwner],
        }),
      ]);

      if (!code || code === "0x") throw new Error("The ERC-8004 Identity Registry contract was not found on Celo. Registration has been stopped.");
      setBalance(Number(formatEther(nativeBalance)).toFixed(4));
      if (nativeBalance === 0n) throw new Error("This wallet has no CELO. Add a small amount of CELO for gas, then try again.");

      if (existingCount > 0n) {
        const proceed = window.confirm(
          `This wallet already owns ${existingCount.toString()} ERC-8004 identity token${existingCount === 1n ? "" : "s"} on this registry. Registering Horris will mint another agent identity. Continue?`,
        );
        if (!proceed) {
          setStep("idle");
          setMessage("Registration cancelled before any transaction was submitted.");
          return;
        }
      }

      setStep("confirming");
      setMessage("Horris is ready. Your wallet will ask you to approve one ERC-8004 registration transaction.");

      const simulation = await publicClient.simulateContract({
        address: ERC8004_IDENTITY_REGISTRY,
        abi: ERC8004_IDENTITY_ABI,
        functionName: "register",
        args: [ERC8004_AGENT_URI],
        account: activeOwner,
      });

      const hash = await walletClient.writeContract(simulation.request);
      setStep("pending");
      setMessage("Registration submitted. Waiting for Celo confirmation…");

      const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 120_000 });
      if (receipt.status !== "success") throw new Error("The registration transaction reverted on Celo.");

      const registered = parseEventLogs({
        abi: ERC8004_IDENTITY_ABI,
        eventName: "Registered",
        logs: receipt.logs,
        strict: true,
      }).find((log) => log.address.toLowerCase() === ERC8004_IDENTITY_REGISTRY.toLowerCase());

      if (!registered) throw new Error("The transaction confirmed, but Horris could not find the ERC-8004 Registered event. Check the transaction on CeloScan.");
      if (registered.args.owner.toLowerCase() !== activeOwner.toLowerCase()) throw new Error("The confirmed ERC-8004 owner did not match the connected wallet.");
      if (registered.args.agentURI !== ERC8004_AGENT_URI) throw new Error("The confirmed ERC-8004 agent URI did not match the Horris registration file.");

      setResult({ agentId: registered.args.agentId, owner: registered.args.owner, hash });
      setStep("done");
      setMessage("Horris now has an on-chain ERC-8004 identity on Celo.");
    } catch (error) {
      setStep("error");
      setMessage(friendlyError(error));
    }
  }

  return (
    <main style={{ minHeight: "100vh", background: "#080808", color: "#f5f2e9", padding: "clamp(24px,5vw,64px)", fontFamily: "Inter, Arial, sans-serif" }}>
      <div style={{ maxWidth: 1040, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 20, borderBottom: "1px solid #343434", paddingBottom: 18 }}>
          <strong style={{ letterSpacing: "-.04em", fontSize: 24 }}>HORRIS</strong>
          <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 11, letterSpacing: ".12em", color: "#8d8d8d" }}>ERC-8004 / CELO / IDENTITY</span>
        </div>

        <section style={{ padding: "clamp(48px,9vw,110px) 0 54px", display: "grid", gridTemplateColumns: "minmax(0,1.35fr) minmax(260px,.65fr)", gap: "clamp(32px,7vw,90px)", borderBottom: "1px solid #343434" }}>
          <div>
            <p style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 11, letterSpacing: ".13em", color: "#8d8d8d" }}>REGISTER / 01</p>
            <h1 style={{ margin: "18px 0 24px", fontSize: "clamp(56px,9vw,118px)", lineHeight: .82, letterSpacing: "-.075em", fontWeight: 800 }}>ONCHAIN<br />IDENTITY.</h1>
            <p style={{ maxWidth: 650, fontSize: "clamp(17px,2vw,22px)", lineHeight: 1.55, color: "#b8b8b3" }}>
              Register Horris under ERC-8004 on Celo so the agent is discoverable and verifiable across the agent ecosystem.
            </p>
          </div>
          <div style={{ alignSelf: "end", borderTop: "1px solid #454545", paddingTop: 18, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12, lineHeight: 1.8, color: "#a5a5a0" }}>
            <div>NETWORK&nbsp;&nbsp; CELO MAINNET</div>
            <div>CHAIN ID&nbsp; 42220</div>
            <div>STANDARD&nbsp; ERC-8004</div>
            <div>OWNER&nbsp;&nbsp;&nbsp;&nbsp; {account ? shortAddress(account) : "NOT CONNECTED"}</div>
            <div>CELO&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; {balance}</div>
          </div>
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "220px minmax(0,1fr)", borderBottom: "1px solid #343434" }}>
          <div style={{ padding: "34px 24px 34px 0", borderRight: "1px solid #343434" }}>
            <span style={{ fontSize: 42, letterSpacing: "-.06em" }}>02</span>
            <p style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 11, color: "#777", lineHeight: 1.5 }}>IDENTITY<br />REGISTRY</p>
          </div>
          <div style={{ padding: "34px 0 34px clamp(24px,5vw,56px)" }}>
            <div style={{ display: "grid", gap: 18 }}>
              <div>
                <small style={{ display: "block", color: "#777", marginBottom: 7, letterSpacing: ".1em" }}>REGISTRY</small>
                <code style={{ overflowWrap: "anywhere", color: "#ddd" }}>{ERC8004_IDENTITY_REGISTRY}</code>
              </div>
              <div>
                <small style={{ display: "block", color: "#777", marginBottom: 7, letterSpacing: ".1em" }}>AGENT REGISTRY ID</small>
                <code style={{ overflowWrap: "anywhere", color: "#ddd" }}>{ERC8004_AGENT_REGISTRY}</code>
              </div>
              <div>
                <small style={{ display: "block", color: "#777", marginBottom: 7, letterSpacing: ".1em" }}>AGENT URI</small>
                <a href={ERC8004_AGENT_URI} target="_blank" rel="noreferrer" style={{ overflowWrap: "anywhere", color: "#f5f2e9" }}>{ERC8004_AGENT_URI}</a>
              </div>
            </div>
          </div>
        </section>

        <section style={{ padding: "42px 0" }}>
          <div style={{ border: "1px solid #333", padding: "clamp(24px,4vw,40px)", background: "#0d0d0d" }}>
            <p style={{ margin: 0, color: step === "error" ? "#ff8f8f" : "#c3c3bd", lineHeight: 1.6 }}>{message}</p>
            {result && (
              <div style={{ marginTop: 28, paddingTop: 24, borderTop: "1px solid #303030", display: "grid", gap: 12 }}>
                <div><span style={{ color: "#777" }}>AGENT ID&nbsp;&nbsp;</span><strong style={{ fontSize: 26 }}>{result.agentId.toString()}</strong></div>
                <div><span style={{ color: "#777" }}>OWNER&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span><code>{result.owner}</code></div>
                <div><span style={{ color: "#777" }}>TX&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span><a href={`${ERC8004_EXPLORER_BASE}/tx/${result.hash}`} target="_blank" rel="noreferrer" style={{ color: "#f5f2e9", overflowWrap: "anywhere" }}>{result.hash}</a></div>
                <p style={{ margin: "8px 0 0", color: "#a7a7a2" }}>Keep the Agent ID. We use it to finalize the registration entry in Horris&apos;s public ERC-8004 metadata.</p>
              </div>
            )}

            <button
              type="button"
              onClick={register}
              disabled={busy || step === "done"}
              style={{ marginTop: 30, width: "100%", minHeight: 58, border: "1px solid #f5f2e9", background: step === "done" ? "#202020" : "#f5f2e9", color: step === "done" ? "#d2d2cc" : "#080808", fontWeight: 800, letterSpacing: ".035em", cursor: busy || step === "done" ? "not-allowed" : "pointer" }}
            >
              {buttonLabel}
            </button>

            <div style={{ marginTop: 24, display: "grid", gap: 7, color: "#777", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 11, lineHeight: 1.6 }}>
              <span>✓ ONE REGISTRATION TRANSACTION</span>
              <span>✓ NO PRIVATE KEY OR SEED PHRASE</span>
              <span>✓ WALLET REMAINS THE ERC-721 OWNER</span>
              <span>✓ CONTRACT + URI VERIFIED BEFORE SUBMISSION</span>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
