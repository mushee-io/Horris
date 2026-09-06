import { Mento, deadlineFromMinutes } from "@mento-protocol/mento-sdk";
import { formatUnits, parseUnits, type Address } from "viem";
import { celoSepolia } from "viem/chains";
import { CELO_SEPOLIA_RPC, TOKENS } from "./celo";

export type HorrisRisk = "Conservative" | "Balanced" | "Aggressive";

export const riskPolicy = {
  Conservative: { slippage: 0.25, maxAllocation: 250 },
  Balanced: { slippage: 0.5, maxAllocation: 1000 },
  Aggressive: { slippage: 1, maxAllocation: 5000 },
} as const;

export async function getMento() {
  return Mento.create(celoSepolia.id, CELO_SEPOLIA_RPC);
}

export async function getUsdMQuote(amount: string) {
  const amountIn = parseUnits(amount, TOKENS.USDC.decimals);
  const mento = await getMento();
  const expectedOut = await mento.quotes.getAmountOut(
    TOKENS.USDC.address,
    TOKENS.USDm.address,
    amountIn,
  );

  return {
    amountIn,
    amountOut: expectedOut,
    formattedOut: formatUnits(expectedOut, TOKENS.USDm.decimals),
  };
}

export async function buildUsdMSwap(amount: string, owner: Address, risk: HorrisRisk) {
  const amountIn = parseUnits(amount, TOKENS.USDC.decimals);
  const policy = riskPolicy[risk];

  if (Number(amount) > policy.maxAllocation) {
    throw new Error(`${risk} policy caps a single execution at ${policy.maxAllocation} USDC`);
  }

  const mento = await getMento();
  return mento.swap.buildSwapTransaction(
    TOKENS.USDC.address,
    TOKENS.USDm.address,
    amountIn,
    owner,
    owner,
    {
      slippageTolerance: policy.slippage,
      deadline: deadlineFromMinutes(5),
    },
  );
}
