import { Mento, deadlineFromMinutes } from "@mento-protocol/mento-sdk";
import { encodeAbiParameters, formatUnits, parseUnits, type Address, type Hex } from "viem";
import { celoSepolia } from "viem/chains";
import { CELO_SEPOLIA_RPC, TOKENS } from "./celo";

export type HorrisRisk = "Conservative" | "Balanced" | "Aggressive";

export const riskPolicy = {
  Conservative: { slippage: 0.25, maxAllocation: 250 },
  Balanced: { slippage: 0.5, maxAllocation: 1000 },
  Aggressive: { slippage: 1, maxAllocation: 5000 },
} as const;

export async function getMento() { return Mento.create(celoSepolia.id, CELO_SEPOLIA_RPC); }

export async function getUsdMQuote(amount: string) {
  const amountIn = parseUnits(amount, TOKENS.USDC.decimals);
  const mento = await getMento();
  const expectedOut = await mento.quotes.getAmountOut(TOKENS.USDC.address, TOKENS.USDm.address, amountIn);
  return { amountIn, amountOut: expectedOut, formattedOut: formatUnits(expectedOut, TOKENS.USDm.decimals) };
}

export async function buildUsdMSwap(amount: string, owner: Address, risk: HorrisRisk) {
  const amountIn = parseUnits(amount, TOKENS.USDC.decimals);
  const policy = riskPolicy[risk];
  if (Number(amount) > policy.maxAllocation) throw new Error(`${risk} policy caps a single execution at ${policy.maxAllocation} USDC`);
  const mento = await getMento();
  return mento.swap.buildSwapTransaction(TOKENS.USDC.address, TOKENS.USDm.address, amountIn, owner, owner, {
    slippageTolerance: policy.slippage,
    deadline: deadlineFromMinutes(5),
  });
}

export async function buildVaultUsdMPlan(amount: string, risk: HorrisRisk) {
  const amountIn = parseUnits(amount, TOKENS.USDC.decimals);
  const policy = riskPolicy[risk];
  if (amountIn <= 0n) throw new Error("Amount must be positive");
  if (Number(amount) > policy.maxAllocation) throw new Error(`${risk} policy caps a single execution at ${policy.maxAllocation} USDC`);

  const mento = await getMento();
  const deadline = deadlineFromMinutes(5);
  const prepared = await mento.swap.prepareSwap({
    tokenIn: TOKENS.USDC.address,
    tokenOut: TOKENS.USDm.address,
    amountIn,
    slippageTolerance: policy.slippage,
    deadline,
  });

  if (!prepared.routerRoutes.length || prepared.routerRoutes.length > 3) throw new Error("Unsupported Mento route length");
  const routeData = encodeAbiParameters(
    [{ type: "tuple[]", components: [{ name: "from", type: "address" }, { name: "to", type: "address" }, { name: "factory", type: "address" }] }],
    [prepared.routerRoutes.map((route) => ({ from: route.from, to: route.to, factory: route.factory }))],
  ) as Hex;

  return {
    amount,
    amountIn,
    amountOutMin: prepared.amountOutMin,
    expectedAmountOut: prepared.expectedAmountOut,
    formattedOut: formatUnits(prepared.expectedAmountOut, TOKENS.USDm.decimals),
    routeData,
    risk,
    deadline: Number(deadline),
    hops: prepared.routerRoutes.length,
  };
}
