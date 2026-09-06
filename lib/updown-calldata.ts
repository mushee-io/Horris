import { encodeFunctionData, keccak256, type Address, type Hex } from "viem";
import { UPDOWN_CELO } from "./updown";
import type { UnsignedUpDownIncreaseOrderPlan } from "./updown-order";
import type { UnsignedUpDownProtectionPlan } from "./updown-protection";

const exchangeRouterAbi = [
  {
    type: "function",
    name: "sendWnt",
    stateMutability: "payable",
    inputs: [{ name: "receiver", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "sendTokens",
    stateMutability: "payable",
    inputs: [{ name: "token", type: "address" }, { name: "receiver", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "createOrder",
    stateMutability: "payable",
    inputs: [{
      name: "params",
      type: "tuple",
      components: [
        {
          name: "addresses",
          type: "tuple",
          components: [
            { name: "receiver", type: "address" },
            { name: "cancellationReceiver", type: "address" },
            { name: "callbackContract", type: "address" },
            { name: "uiFeeReceiver", type: "address" },
            { name: "market", type: "address" },
            { name: "initialCollateralToken", type: "address" },
            { name: "swapPath", type: "address[]" },
          ],
        },
        {
          name: "numbers",
          type: "tuple",
          components: [
            { name: "sizeDeltaUsd", type: "uint256" },
            { name: "initialCollateralDeltaAmount", type: "uint256" },
            { name: "triggerPrice", type: "uint256" },
            { name: "acceptablePrice", type: "uint256" },
            { name: "executionFee", type: "uint256" },
            { name: "callbackGasLimit", type: "uint256" },
            { name: "minOutputAmount", type: "uint256" },
            { name: "validFromTime", type: "uint256" },
          ],
        },
        { name: "orderType", type: "uint8" },
        { name: "decreasePositionSwapType", type: "uint8" },
        { name: "isLong", type: "bool" },
        { name: "shouldUnwrapNativeToken", type: "bool" },
        { name: "autoCancel", type: "bool" },
        { name: "referralCode", type: "bytes32" },
      ],
    }],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    type: "function",
    name: "multicall",
    stateMutability: "payable",
    inputs: [{ name: "data", type: "bytes[]" }],
    outputs: [{ name: "results", type: "bytes[]" }],
  },
] as const;

export type UpDownUnsignedTransaction = {
  chainId: 42220;
  to: Address;
  value: bigint;
  data: Hex;
  calldataHash: Hex;
  approval: {
    token: Address;
    spender: Address;
    minimumAmount: bigint;
  } | null;
  calls: readonly string[];
  executionEnabled: false;
};

export function encodeUnsignedUpDownMulticall(
  plan: UnsignedUpDownIncreaseOrderPlan,
  executionFeeWei: bigint,
): UpDownUnsignedTransaction {
  if (!plan.riskApproved || plan.executionEnabled !== false) throw new Error("Only approved, unsigned Horris plans can be encoded");
  if (executionFeeWei <= 0n) throw new Error("A positive live execution fee is required");

  const params = {
    ...plan.params,
    numbers: {
      ...plan.params.numbers,
      executionFee: executionFeeWei,
    },
  };

  const sendWnt = encodeFunctionData({ abi: exchangeRouterAbi, functionName: "sendWnt", args: [plan.orderVault, executionFeeWei] });
  const sendTokens = encodeFunctionData({
    abi: exchangeRouterAbi,
    functionName: "sendTokens",
    args: [plan.params.addresses.initialCollateralToken, plan.orderVault, plan.params.numbers.initialCollateralDeltaAmount],
  });
  const createOrder = encodeFunctionData({ abi: exchangeRouterAbi, functionName: "createOrder", args: [params] });
  const data = encodeFunctionData({ abi: exchangeRouterAbi, functionName: "multicall", args: [[sendWnt, sendTokens, createOrder]] });

  return {
    chainId: 42220,
    to: plan.exchangeRouter,
    value: executionFeeWei,
    data,
    calldataHash: keccak256(data),
    approval: {
      token: plan.params.addresses.initialCollateralToken,
      spender: UPDOWN_CELO.router,
      minimumAmount: plan.params.numbers.initialCollateralDeltaAmount,
    },
    calls: ["sendWnt", "sendTokens", "createOrder"],
    executionEnabled: false,
  };
}

export function encodeUnsignedUpDownProtectionMulticall(
  plan: UnsignedUpDownProtectionPlan,
  executionFeeWei: bigint,
): UpDownUnsignedTransaction {
  if (plan.executionEnabled !== false) throw new Error("Only unsigned Horris protection plans can be encoded");
  if (executionFeeWei <= 0n) throw new Error("A positive live decrease-order execution fee is required");
  if (plan.params.numbers.initialCollateralDeltaAmount !== 0n) throw new Error("Protection orders must not send additional collateral");
  if (plan.params.orderType !== 5 && plan.params.orderType !== 6) throw new Error("Unsupported protection order type");

  const params = {
    ...plan.params,
    numbers: {
      ...plan.params.numbers,
      executionFee: executionFeeWei,
    },
  };
  const sendWnt = encodeFunctionData({ abi: exchangeRouterAbi, functionName: "sendWnt", args: [plan.orderVault, executionFeeWei] });
  const createOrder = encodeFunctionData({ abi: exchangeRouterAbi, functionName: "createOrder", args: [params] });
  const data = encodeFunctionData({ abi: exchangeRouterAbi, functionName: "multicall", args: [[sendWnt, createOrder]] });

  return {
    chainId: 42220,
    to: plan.exchangeRouter,
    value: executionFeeWei,
    data,
    calldataHash: keccak256(data),
    approval: null,
    calls: ["sendWnt", "createOrder"],
    executionEnabled: false,
  };
}
