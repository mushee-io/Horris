import "server-only";
import { createPublicClient, encodeAbiParameters, formatEther, http, keccak256 } from "viem";
import { celo } from "viem/chains";
import { UPDOWN_CELO } from "./updown";

const CELO_MAINNET_RPC = process.env.CELO_MAINNET_RPC_URL || "https://forno.celo.org";
const FACTOR_DENOMINATOR = 10n ** 30n;
const BUFFER_BPS = 12_500n;
const BPS = 10_000n;

const dataStoreAbi = [{
  type: "function",
  name: "getUint",
  stateMutability: "view",
  inputs: [{ name: "key", type: "bytes32" }],
  outputs: [{ name: "value", type: "uint256" }],
}] as const;

function keyOfString(value: string) {
  return keccak256(encodeAbiParameters([{ type: "string" }], [value]));
}

function applyFactor(value: bigint, factor: bigint) {
  return value * factor / FACTOR_DENOMINATOR;
}

export type UpDownExecutionFeeKind = "increase" | "decrease";
export type UpDownExecutionFeeEstimate = {
  kind: UpDownExecutionFeeKind;
  chainId: 42220;
  gasPriceWei: bigint;
  estimatedGasLimit: bigint;
  estimatedFeeWei: bigint;
  bufferedFeeWei: bigint;
  bufferedFeeCelo: string;
  source: "live-datastore";
};

export async function estimateUpDownExecutionFee(kind: UpDownExecutionFeeKind): Promise<UpDownExecutionFeeEstimate> {
  const client = createPublicClient({
    chain: celo,
    transport: http(CELO_MAINNET_RPC, { timeout: 12_000 }),
  });
  const gasLimitKey = kind === "increase" ? "INCREASE_ORDER_GAS_LIMIT" : "DECREASE_ORDER_GAS_LIMIT";

  const [chainId, actionGasLimit, singleSwapGasLimit, baseGasFee, gasFeePerOracle, gasFeeMultiplier, gasPrice] = await Promise.all([
    client.getChainId(),
    client.readContract({ address: UPDOWN_CELO.dataStore, abi: dataStoreAbi, functionName: "getUint", args: [keyOfString(gasLimitKey)] }),
    client.readContract({ address: UPDOWN_CELO.dataStore, abi: dataStoreAbi, functionName: "getUint", args: [keyOfString("SINGLE_SWAP_GAS_LIMIT")] }),
    client.readContract({ address: UPDOWN_CELO.dataStore, abi: dataStoreAbi, functionName: "getUint", args: [keyOfString("ESTIMATED_GAS_FEE_BASE_AMOUNT_V2_1")] }),
    client.readContract({ address: UPDOWN_CELO.dataStore, abi: dataStoreAbi, functionName: "getUint", args: [keyOfString("ESTIMATED_GAS_FEE_PER_ORACLE_PRICE")] }),
    client.readContract({ address: UPDOWN_CELO.dataStore, abi: dataStoreAbi, functionName: "getUint", args: [keyOfString("ESTIMATED_GAS_FEE_MULTIPLIER_FACTOR")] }),
    client.getGasPrice(),
  ]);

  if (chainId !== 42220) throw new Error(`UpDown RPC chain mismatch: expected 42220, got ${chainId}`);
  if (actionGasLimit <= 0n || gasPrice <= 0n) throw new Error(`UpDown live ${kind} fee inputs are invalid`);

  const swapCount = 0n;
  const oraclePriceCount = 3n;
  const callbackGasLimit = 0n;
  const estimatedGasLimit = actionGasLimit + singleSwapGasLimit * swapCount + callbackGasLimit;
  const estimatedLimit = baseGasFee + gasFeePerOracle * oraclePriceCount + applyFactor(estimatedGasLimit, gasFeeMultiplier);
  const estimatedFeeWei = estimatedLimit * gasPrice;
  if (estimatedFeeWei <= 0n) throw new Error(`UpDown live ${kind} execution fee resolved to zero`);
  const bufferedFeeWei = (estimatedFeeWei * BUFFER_BPS + (BPS - 1n)) / BPS;

  return {
    kind,
    chainId: 42220,
    gasPriceWei: gasPrice,
    estimatedGasLimit,
    estimatedFeeWei,
    bufferedFeeWei,
    bufferedFeeCelo: formatEther(bufferedFeeWei),
    source: "live-datastore",
  };
}

export function estimateUpDownIncreaseExecutionFee() {
  return estimateUpDownExecutionFee("increase");
}

export function estimateUpDownDecreaseExecutionFee() {
  return estimateUpDownExecutionFee("decrease");
}
