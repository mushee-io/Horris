import type { Address } from "viem";

function optionalAddress(value?: string): Address | undefined {
  return value?.startsWith("0x") && value.length === 42 ? value as Address : undefined;
}

function optionalBlock(value?: string): bigint | undefined {
  if (!value || !/^\d+$/.test(value)) return undefined;
  return BigInt(value);
}

// Real Celo Sepolia deployment used by the Horris MVP. The adapter is the
// deterministic CREATE sibling of the vault from the same deployer script.
export const DEFAULT_HORRIS_VAULT = "0xEd97E9c79599CFB671D59063F8aE446b9C5e0497" as Address;
export const DEFAULT_HORRIS_MENTO_ADAPTER = "0xbf1abbE40d9B4Fea970Cf9E2b397109eC1D06CEc" as Address;

export const HORRIS_VAULT = optionalAddress(process.env.NEXT_PUBLIC_HORRIS_VAULT) ?? DEFAULT_HORRIS_VAULT;
export const HORRIS_MENTO_ADAPTER = optionalAddress(process.env.NEXT_PUBLIC_HORRIS_MENTO_ADAPTER) ?? DEFAULT_HORRIS_MENTO_ADAPTER;
export const HORRIS_DEPLOYMENT_BLOCK = optionalBlock(process.env.NEXT_PUBLIC_HORRIS_DEPLOYMENT_BLOCK);
export const ALLOW_WALLET_DIRECT_DEMO = process.env.NEXT_PUBLIC_ALLOW_WALLET_DIRECT_DEMO === "true";

export const horrisVaultAbi = [
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  { type: "function", name: "agent", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  { type: "function", name: "deposit", stateMutability: "nonpayable", inputs: [{ name: "asset", type: "address" }, { name: "amount", type: "uint256" }], outputs: [] },
  { type: "function", name: "withdraw", stateMutability: "nonpayable", inputs: [{ name: "asset", type: "address" }, { name: "amount", type: "uint256" }, { name: "recipient", type: "address" }], outputs: [] },
  { type: "function", name: "execute", stateMutability: "nonpayable", inputs: [{ name: "adapter", type: "address" }, { name: "assetIn", type: "address" }, { name: "amountIn", type: "uint256" }, { name: "amountOutMin", type: "uint256" }, { name: "routeData", type: "bytes" }, { name: "deadline", type: "uint256" }], outputs: [{ name: "amountOut", type: "uint256" }] },
  { type: "function", name: "vaultBalance", stateMutability: "view", inputs: [{ name: "asset", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "depositedByAsset", stateMutability: "view", inputs: [{ name: "", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "paused", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "maxExecutionAmount", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "dailyExecutionLimit", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "spentToday", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "maxSlippageBps", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint16" }] },
  { type: "event", name: "ExecutionCompleted", inputs: [{ name: "adapter", type: "address", indexed: true }, { name: "assetIn", type: "address", indexed: true }, { name: "assetOut", type: "address", indexed: true }, { name: "amountIn", type: "uint256", indexed: false }, { name: "amountOut", type: "uint256", indexed: false }, { name: "slippageBps", type: "uint16", indexed: false }], anonymous: false },
] as const;

export const erc20ApprovalAbi = [
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
] as const;

export const isHorrisDeployed = Boolean(HORRIS_VAULT && HORRIS_MENTO_ADAPTER);
