import "server-only";
import { createPublicClient, formatEther, formatUnits, http, type Address } from "viem";
import { celo } from "viem/chains";
import { UPDOWN_CELO } from "./updown";
import { estimateUpDownIncreaseExecutionFee, getUpDownOraclePrice } from "./updown-live";

const RPC = process.env.CELO_MAINNET_RPC_URL || "https://forno.celo.org";
const USDT = "0xd96a1ac57a180a3819633bCE3dC602Bd8972f595" as Address;
const erc20Abi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
] as const;

export type UpDownReadinessCheck = { code: string; passed: boolean; detail: string };
export type UpDownEntryReadiness = {
  chainId: 42220;
  account: Address;
  marketToken: Address;
  requiredCollateral: bigint;
  usdtBalance: bigint;
  routerAllowance: bigint;
  nativeCeloBalance: bigint;
  requiredExecutionFee: bigint;
  approvalRequired: boolean;
  readyForSimulation: boolean;
  readyForSubmission: false;
  checks: UpDownReadinessCheck[];
  oracle: Awaited<ReturnType<typeof getUpDownOraclePrice>>;
};

export async function getUpDownEntryReadiness(account: Address, marketToken: Address, requiredCollateral: bigint): Promise<UpDownEntryReadiness> {
  if (requiredCollateral <= 0n) throw new Error("Required collateral must be positive");
  const client = createPublicClient({ chain: celo, transport: http(RPC, { timeout: 12_000 }) });
  const requiredCode = [UPDOWN_CELO.exchangeRouter, UPDOWN_CELO.router, UPDOWN_CELO.orderVault, UPDOWN_CELO.dataStore] as const;

  const [chainId, usdtBalance, routerAllowance, nativeCeloBalance, fee, oracle, ...codes] = await Promise.all([
    client.getChainId(),
    client.readContract({ address: USDT, abi: erc20Abi, functionName: "balanceOf", args: [account] }),
    client.readContract({ address: USDT, abi: erc20Abi, functionName: "allowance", args: [account, UPDOWN_CELO.router] }),
    client.getBalance({ address: account }),
    estimateUpDownIncreaseExecutionFee(),
    getUpDownOraclePrice(marketToken),
    ...requiredCode.map((address) => client.getCode({ address })),
  ]);

  if (chainId !== 42220) throw new Error(`UpDown RPC chain mismatch: expected 42220, got ${chainId}`);
  const codeHealthy = codes.every((code) => Boolean(code && code !== "0x"));
  const approvalRequired = routerAllowance < requiredCollateral;
  const checks: UpDownReadinessCheck[] = [
    { code: "VENUE_BYTECODE", passed: codeHealthy, detail: codeHealthy ? "Pinned ExchangeRouter, Router, OrderVault and DataStore have bytecode." : "One or more pinned UpDown contracts have no bytecode." },
    { code: "USDT_BALANCE", passed: usdtBalance >= requiredCollateral, detail: `${formatUnits(usdtBalance, 6)} USDT available; ${formatUnits(requiredCollateral, 6)} required.` },
    { code: "ROUTER_ALLOWANCE", passed: !approvalRequired, detail: approvalRequired ? `${formatUnits(routerAllowance, 6)} USDT approved to Router; ${formatUnits(requiredCollateral, 6)} required.` : "Router allowance covers the exact requested collateral." },
    { code: "EXECUTION_FEE", passed: nativeCeloBalance >= fee.bufferedFeeWei, detail: `${formatEther(nativeCeloBalance)} CELO available; ${fee.bufferedFeeCelo} CELO buffered fee required.` },
    { code: "ORACLE_FRESH", passed: oracle.ageSeconds <= 600, detail: `UpDown oracle age ${oracle.ageSeconds}s; mid ${oracle.mid}.` },
  ];

  // A missing allowance can be fixed by an explicit approval, so it does not invalidate transaction simulation readiness.
  const hardChecks = checks.filter((check) => check.code !== "ROUTER_ALLOWANCE");
  const readyForSimulation = hardChecks.every((check) => check.passed);
  return {
    chainId: 42220,
    account,
    marketToken,
    requiredCollateral,
    usdtBalance,
    routerAllowance,
    nativeCeloBalance,
    requiredExecutionFee: fee.bufferedFeeWei,
    approvalRequired,
    readyForSimulation,
    readyForSubmission: false,
    checks,
    oracle,
  };
}
