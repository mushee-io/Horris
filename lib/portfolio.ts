import { formatUnits, parseAbiItem, type Address, type Hash } from "viem";
import { TOKENS } from "./celo";

export type PortfolioSnapshot = { usdc: number; usdm: number; stableValue: number };
export type ExecutionActivity = { txHash: Hash; blockNumber: bigint; adapter: Address; assetIn: Address; amountIn: bigint; amountOut: bigint; slippageBps: number };

type HorrisReadClient = {
  readContract: (args: any) => Promise<any>;
  getLogs: (args: any) => Promise<any[]>;
};

const erc20BalanceAbi = [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] }] as const;
const executionEvent = parseAbiItem("event ExecutionCompleted(address indexed adapter,address indexed assetIn,uint256 amountIn,uint256 amountOut,uint16 slippageBps)");

export async function getPortfolio(client: HorrisReadClient, account: Address): Promise<PortfolioSnapshot> {
  const [usdcRaw, usdmRaw] = await Promise.all([
    client.readContract({ address: TOKENS.USDC.address, abi: erc20BalanceAbi, functionName: "balanceOf", args: [account] }) as Promise<bigint>,
    client.readContract({ address: TOKENS.USDm.address, abi: erc20BalanceAbi, functionName: "balanceOf", args: [account] }) as Promise<bigint>,
  ]);
  const usdc = Number(formatUnits(usdcRaw, TOKENS.USDC.decimals));
  const usdm = Number(formatUnits(usdmRaw, TOKENS.USDm.decimals));
  return { usdc, usdm, stableValue: usdc + usdm };
}

export async function getVaultActivity(client: HorrisReadClient, vault: Address, fromBlock: bigint): Promise<ExecutionActivity[]> {
  const logs = await client.getLogs({ address: vault, event: executionEvent, fromBlock, toBlock: "latest" });
  return logs.map((log: any) => ({
    txHash: log.transactionHash as Hash,
    blockNumber: log.blockNumber as bigint,
    adapter: log.args.adapter as Address,
    assetIn: log.args.assetIn as Address,
    amountIn: log.args.amountIn as bigint,
    amountOut: log.args.amountOut as bigint,
    slippageBps: Number(log.args.slippageBps),
  })).reverse();
}

export function formatExecutionActivity(activity: ExecutionActivity) {
  return { ...activity, amountInFormatted: formatUnits(activity.amountIn, TOKENS.USDC.decimals), amountOutFormatted: formatUnits(activity.amountOut, TOKENS.USDm.decimals), slippagePercent: activity.slippageBps / 100 };
}
