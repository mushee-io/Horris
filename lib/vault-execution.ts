import { parseUnits, type Address, type Hex, type WalletClient } from "viem";
import { TOKENS, publicClient } from "./celo";
import { HORRIS_MENTO_ADAPTER, HORRIS_VAULT, horrisVaultAbi } from "./horris-contracts";
import type { HorrisRisk } from "./mento";
import { riskPolicy } from "./mento";

export type VaultExecutionPlan = {
  amount: string;
  amountOutMin: bigint;
  routeData: Hex;
  risk: HorrisRisk;
  deadline?: number;
};

export async function executeVaultMentoPlan(wallet: WalletClient, account: Address, plan: VaultExecutionPlan) {
  if (!HORRIS_VAULT || !HORRIS_MENTO_ADAPTER) throw new Error("Horris vault deployment is not configured");
  if (!plan.routeData || plan.routeData === "0x") throw new Error("Mento route data is required");
  if (plan.amountOutMin <= 0n) throw new Error("Minimum output must be positive");

  const amountIn = parseUnits(plan.amount, TOKENS.USDC.decimals);
  const policy = riskPolicy[plan.risk];
  if (Number(plan.amount) > policy.maxAllocation) throw new Error(`${plan.risk} execution cap exceeded`);

  const slippageBps = Math.round(policy.slippage * 100);
  const now = Math.floor(Date.now() / 1000);
  const deadline = plan.deadline ?? now + 5 * 60;
  if (deadline < now || deadline > now + 30 * 60) throw new Error("Execution deadline must be within 30 minutes");

  const { request } = await publicClient.simulateContract({
    account,
    address: HORRIS_VAULT,
    abi: horrisVaultAbi,
    functionName: "execute",
    args: [HORRIS_MENTO_ADAPTER, TOKENS.USDC.address, amountIn, plan.amountOutMin, slippageBps, plan.routeData, BigInt(deadline)],
  });

  const hash = await wallet.writeContract(request);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("Horris vault execution reverted");
  return { hash, receipt };
}
