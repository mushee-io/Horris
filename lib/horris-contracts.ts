import type { Address } from "viem";

function optionalAddress(value?: string): Address | undefined {
  return value?.startsWith("0x") && value.length === 42 ? value as Address : undefined;
}

export const HORRIS_VAULT = optionalAddress(process.env.NEXT_PUBLIC_HORRIS_VAULT);
export const HORRIS_MENTO_ADAPTER = optionalAddress(process.env.NEXT_PUBLIC_HORRIS_MENTO_ADAPTER);
export const HORRIS_DEPLOYMENT_BLOCK = process.env.NEXT_PUBLIC_HORRIS_DEPLOYMENT_BLOCK ? BigInt(process.env.NEXT_PUBLIC_HORRIS_DEPLOYMENT_BLOCK) : undefined;

export const horrisVaultAbi = [
  { type: "function", name: "deposit", stateMutability: "nonpayable", inputs: [{ name: "asset", type: "address" }, { name: "amount", type: "uint256" }], outputs: [] },
  { type: "function", name: "withdraw", stateMutability: "nonpayable", inputs: [{ name: "asset", type: "address" }, { name: "amount", type: "uint256" }, { name: "recipient", type: "address" }], outputs: [] },
  { type: "function", name: "execute", stateMutability: "nonpayable", inputs: [{ name: "adapter", type: "address" }, { name: "assetIn", type: "address" }, { name: "amountIn", type: "uint256" }, { name: "amountOutMin", type: "uint256" }, { name: "slippageBps", type: "uint16" }, { name: "routeData", type: "bytes" }, { name: "deadline", type: "uint256" }], outputs: [{ name: "amountOut", type: "uint256" }] },
  { type: "function", name: "vaultBalance", stateMutability: "view", inputs: [{ name: "asset", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "depositedByAsset", stateMutability: "view", inputs: [{ name: "", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "paused", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "maxExecutionAmount", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "dailyExecutionLimit", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "spentToday", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "maxSlippageBps", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint16" }] },
] as const;

export const erc20ApprovalAbi = [
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
] as const;

export const isHorrisDeployed = Boolean(HORRIS_VAULT && HORRIS_MENTO_ADAPTER);
