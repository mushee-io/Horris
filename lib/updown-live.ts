import "server-only";
import { createPublicClient, encodeAbiParameters, formatEther, formatUnits, http, keccak256, type Address } from "viem";
import { celo } from "viem/chains";
import { UPDOWN_CELO, UPDOWN_MARKETS } from "./updown";

const CELO_MAINNET_RPC = process.env.CELO_MAINNET_RPC_URL || "https://forno.celo.org";
const FACTOR_DENOMINATOR = 10n ** 30n;
const BUFFER_BPS = 12_500n;
const BPS = 10_000n;
const MAX_ORACLE_AGE_SECONDS = 10 * 60;

const dataStoreAbi = [{ type: "function", name: "getUint", stateMutability: "view", inputs: [{ name: "key", type: "bytes32" }], outputs: [{ name: "value", type: "uint256" }] }] as const;
const oracleAbi = [{
  type: "function", name: "getOraclePrice", stateMutability: "view",
  inputs: [{ name: "token", type: "address" }, { name: "data", type: "bytes" }],
  outputs: [{ name: "", type: "tuple", components: [
    { name: "token", type: "address" }, { name: "min", type: "uint256" }, { name: "max", type: "uint256" },
    { name: "timestamp", type: "uint256" }, { name: "provider", type: "address" },
  ] }],
}] as const;

function keyOfString(value: string) { return keccak256(encodeAbiParameters([{ type: "string" }], [value])); }
function applyFactor(value: bigint, factor: bigint) { return value * factor / FACTOR_DENOMINATOR; }
function client() { return createPublicClient({ chain: celo, transport: http(CELO_MAINNET_RPC, { timeout: 12_000 }) }); }

export type UpDownExecutionFeeKind = "increase" | "decrease";
export type UpDownExecutionFeeEstimate = {
  kind: UpDownExecutionFeeKind; chainId: 42220; gasPriceWei: bigint; estimatedGasLimit: bigint; estimatedFeeWei: bigint;
  bufferedFeeWei: bigint; bufferedFeeCelo: string; source: "live-datastore";
};

export type UpDownOraclePrice = {
  chainId: 42220;
  market: string;
  token: Address;
  min: string;
  max: string;
  mid: string;
  timestamp: number;
  ageSeconds: number;
  source: Address;
};

export async function estimateUpDownExecutionFee(kind: UpDownExecutionFeeKind): Promise<UpDownExecutionFeeEstimate> {
  const publicClient = client();
  const gasLimitKey = kind === "increase" ? "INCREASE_ORDER_GAS_LIMIT" : "DECREASE_ORDER_GAS_LIMIT";
  const [chainId, actionGasLimit, singleSwapGasLimit, baseGasFee, gasFeePerOracle, gasFeeMultiplier, gasPrice] = await Promise.all([
    publicClient.getChainId(),
    publicClient.readContract({ address: UPDOWN_CELO.dataStore, abi: dataStoreAbi, functionName: "getUint", args: [keyOfString(gasLimitKey)] }),
    publicClient.readContract({ address: UPDOWN_CELO.dataStore, abi: dataStoreAbi, functionName: "getUint", args: [keyOfString("SINGLE_SWAP_GAS_LIMIT")] }),
    publicClient.readContract({ address: UPDOWN_CELO.dataStore, abi: dataStoreAbi, functionName: "getUint", args: [keyOfString("ESTIMATED_GAS_FEE_BASE_AMOUNT_V2_1")] }),
    publicClient.readContract({ address: UPDOWN_CELO.dataStore, abi: dataStoreAbi, functionName: "getUint", args: [keyOfString("ESTIMATED_GAS_FEE_PER_ORACLE_PRICE")] }),
    publicClient.readContract({ address: UPDOWN_CELO.dataStore, abi: dataStoreAbi, functionName: "getUint", args: [keyOfString("ESTIMATED_GAS_FEE_MULTIPLIER_FACTOR")] }),
    publicClient.getGasPrice(),
  ]);
  if (chainId !== 42220) throw new Error(`UpDown RPC chain mismatch: expected 42220, got ${chainId}`);
  if (actionGasLimit <= 0n || gasPrice <= 0n) throw new Error(`UpDown live ${kind} fee inputs are invalid`);
  const estimatedGasLimit = actionGasLimit;
  const estimatedLimit = baseGasFee + gasFeePerOracle * 3n + applyFactor(estimatedGasLimit + singleSwapGasLimit * 0n, gasFeeMultiplier);
  const estimatedFeeWei = estimatedLimit * gasPrice;
  if (estimatedFeeWei <= 0n) throw new Error(`UpDown live ${kind} execution fee resolved to zero`);
  const bufferedFeeWei = (estimatedFeeWei * BUFFER_BPS + (BPS - 1n)) / BPS;
  return { kind, chainId: 42220, gasPriceWei: gasPrice, estimatedGasLimit, estimatedFeeWei, bufferedFeeWei, bufferedFeeCelo: formatEther(bufferedFeeWei), source: "live-datastore" };
}

export async function getUpDownOraclePrice(marketToken: Address): Promise<UpDownOraclePrice> {
  const market = UPDOWN_MARKETS.find((item) => item.marketToken.toLowerCase() === marketToken.toLowerCase());
  if (!market) throw new Error("Market is not in the pinned UpDown registry");
  const publicClient = client();
  const [chainId, price] = await Promise.all([
    publicClient.getChainId(),
    publicClient.readContract({ address: UPDOWN_CELO.chainlinkPriceFeedProvider, abi: oracleAbi, functionName: "getOraclePrice", args: [market.indexToken, "0x"] }),
  ]);
  if (chainId !== 42220) throw new Error(`UpDown RPC chain mismatch: expected 42220, got ${chainId}`);
  if (price.token.toLowerCase() !== market.indexToken.toLowerCase()) throw new Error("UpDown oracle token mismatch");
  if (price.min <= 0n || price.max <= 0n || price.max < price.min) throw new Error("UpDown oracle returned invalid bounds");
  const timestamp = Number(price.timestamp);
  const now = Math.floor(Date.now() / 1000);
  const ageSeconds = Math.max(0, now - timestamp);
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0 || timestamp > now + 60) throw new Error("UpDown oracle timestamp is invalid");
  if (ageSeconds > MAX_ORACLE_AGE_SECONDS) throw new Error(`UpDown oracle price is stale (${ageSeconds}s old)`);
  const indexDecimals = market.symbol === "BTC" ? 8 : 18;
  const priceDecimals = 30 - indexDecimals;
  const mid = (price.min + price.max) / 2n;
  return {
    chainId: 42220,
    market: `${market.symbol}/${market.quoteSymbol}`,
    token: market.indexToken,
    min: formatUnits(price.min, priceDecimals),
    max: formatUnits(price.max, priceDecimals),
    mid: formatUnits(mid, priceDecimals),
    timestamp,
    ageSeconds,
    source: price.provider,
  };
}

export function estimateUpDownIncreaseExecutionFee() { return estimateUpDownExecutionFee("increase"); }
export function estimateUpDownDecreaseExecutionFee() { return estimateUpDownExecutionFee("decrease"); }
