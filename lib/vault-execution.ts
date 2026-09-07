import { parseUnits, type Address, type Hex, type WalletClient } from "viem";
import { TOKENS, publicClient } from "./celo";
import { HORRIS_MENTO_ADAPTER, HORRIS_VAULT, horrisVaultAbi } from "./horris-contracts";
import type { HorrisRisk } from "./mento";
import { riskPolicy } from "./mento";
import { getVaultSnapshot } from "./vault";

export type VaultExecutionPlan = {
  amount: string;
  amountOutMin: bigint;
  routeData: Hex;
  risk: HorrisRisk;
  deadline?: number;
};

export class VaultExecutionUnavailableError extends Error {
  readonly code = "TESTNET_LIQUIDITY_UNAVAILABLE" as const;

  constructor() {
    super("Mento testnet execution liquidity is currently unavailable. No transaction was submitted.");
    this.name = "VaultExecutionUnavailableError";
  }
}

function isMentoLiquidityError(error: unknown) {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return text.toLowerCase().includes("insufficientliquidity") || text.toLowerCase().includes("0xbb55fd27");
}

export async function executeVaultMentoPlan(wallet: WalletClient, account: Address, plan: VaultExecutionPlan) {
  if (!HORRIS_VAULT || !HORRIS_MENTO_ADAPTER) throw new Error("Horris vault deployment is not configured");
  if (!plan.routeData || plan.routeData === "0x") throw new Error("Mento route data is required");
  if (plan.amountOutMin <= 0n) throw new Error("Minimum output must be positive");

  const amount = Number(plan.amount);
  const amountIn = parseUnits(plan.amount, TOKENS.USDC.decimals);
  const policy = riskPolicy[plan.risk];
  if (!policy) throw new Error("Unknown Horris risk policy");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Execution amount must be positive");
  if (amount > policy.maxAllocation) throw new Error(`${plan.risk} execution cap exceeded`);

  const snapshot = await getVaultSnapshot();
  const normalized = account.toLowerCase();
  const authorized = normalized === snapshot.owner.toLowerCase() || (snapshot.agent !== "0x0000000000000000000000000000000000000000" && normalized === snapshot.agent.toLowerCase());
  if (!authorized) throw new Error("Connected wallet is not authorized to execute this Horris vault");
  if (snapshot.paused) throw new Error("Horris vault is paused");
  if (!snapshot.accountingHealthy) throw new Error("Vault accounting invariant failed");
  if (amount > Number(snapshot.usdc)) throw new Error(`Vault has only ${Number(snapshot.usdc).toFixed(2)} accounted USDC`);
  if (amount > Number(snapshot.executionCap)) throw new Error(`Onchain execution cap is ${Number(snapshot.executionCap).toFixed(2)} USDC`);
  const remainingDaily = Math.max(0, Number(snapshot.dailyLimit) - Number(snapshot.spentToday));
  if (amount > remainingDaily) throw new Error(`Only ${remainingDaily.toFixed(2)} USDC remains under today's onchain limit`);
  if (policy.slippage > snapshot.maxSlippagePercent) throw new Error(`${plan.risk} requires ${policy.slippage}% slippage but the vault allows only ${snapshot.maxSlippagePercent}%`);

  const now = Math.floor(Date.now() / 1000);
  const deadline = plan.deadline ?? now + 5 * 60;
  if (deadline < now || deadline > now + 30 * 60) throw new Error("Execution deadline must be within 30 minutes");

  let request;
  try {
    ({ request } = await publicClient.simulateContract({
      account,
      address: HORRIS_VAULT,
      abi: horrisVaultAbi,
      functionName: "execute",
      args: [HORRIS_MENTO_ADAPTER, TOKENS.USDC.address, amountIn, plan.amountOutMin, plan.routeData, BigInt(deadline)],
    }));
  } catch (error) {
    if (isMentoLiquidityError(error)) throw new VaultExecutionUnavailableError();
    throw error;
  }

  // Never ask the wallet to sign unless the exact onchain execution simulation succeeded.
  const hash = await wallet.writeContract(request);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("Horris vault execution reverted");
  return { hash, receipt };
}
