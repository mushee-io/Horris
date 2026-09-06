import { formatUnits, parseAbiItem, type Address, type Hash, type PublicClient } from "viem";
import { TOKENS } from "./celo";

export type PortfolioSnapshot = {
  usdc: number;
  usdm: number;
  stableValue: number;
};

export type ExecutionActivity = {
  txHash: Hash;
  blockNumber: bigint;
  adapter: Address;
  assetIn: Address;
  amountIn: bigint;
  amountOut: bigint;
  slippageBps: number;
};

const erc20BalanceAbi = [{
  type: "function",
  name: "balanceOf",
  stateMutability: "view",
  inputs: [{ name: "account", type: "address" }],
  outputs: [{ name: "", type: "uint256" }],
}] as const;

const executionEvent = parseAbiItem(
  "event ExecutionCompleted(address indexed adapter,address indexed assetIn,uint256 amountIn,uint256 amountOut,uint16 slippageBps)",
);

export async function getPortfolio(client: PublicClient, account: Address): Promise<PortfolioSnapshot> {
  const [usdcRaw, usdmRaw] = await Promise.all([
    client.readContract({ address: TOKENS.USDC.address, abi: erc20BalanceAbi, functionName: "balanceOf", args: [account] }),
    client.readContract({ address: TOKENS.USDm.address, abi: erc20BalanceAbi, functionName: "balanceOf", args: [account] }),
  ]);
  const usdc = Number(formatUnits(usdcRaw, TOKENS.USDC.decimals));
  const usdm = Number(formatUnits(usdmRaw, TOKENS.USDm.decimals));
  return { usdc, usdm, stableValue: usdc + usdm };
}

export async function getVaultActivity(client: PublicClient, vault: Address, fromBlock: bigint): Promise<ExecutionActivity[]> {
  const logs = await client.getLogs({ address: vault, event: executionEvent, fromBlock, toBlock: "latest" });
  return logs.map((log) => ({
    txHash: log.transactionHash,
    blockNumber: log.blockNumber,
    adapter: log.args.adapter!,
    assetIn: log.args.assetIn!,
    amountIn: log.args.amountIn!,
    amountOut: log.args.amountOut!,
    slippageBps: Number(log.args.slippageBps!),
  })).reverse();
}
