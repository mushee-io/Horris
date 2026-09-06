import { encodeFunctionData, keccak256, type Address, type Hex } from "viem";
import { UPDOWN_CELO } from "./updown";
import type { HorrisUpDownOrder } from "./updown-orders";

const exchangeRouterAbi = [{ type: "function", name: "cancelOrder", stateMutability: "nonpayable", inputs: [{ name: "key", type: "bytes32" }], outputs: [] }] as const;

export type UnsignedUpDownCancelPlan = {
  venue: "UpDown"; chainId: 42220; to: Address; data: Hex; value: 0n; calldataHash: Hex; orderKey: Hex; orderType: number; market: string;
  reason: "frozen-order" | "pending-increase" | "orphan-stop" | "manual-review";
  executionEnabled: false;
};

export function buildUnsignedUpDownCancelPlan(order: HorrisUpDownOrder, reason: UnsignedUpDownCancelPlan["reason"]): UnsignedUpDownCancelPlan {
  if (!/^0x[0-9a-fA-F]{64}$/.test(order.key)) throw new Error("A valid 32-byte UpDown order key is required");
  if (reason === "frozen-order" && !order.isFrozen) throw new Error("Order is not frozen");
  if (reason === "pending-increase" && ![2, 3, 8].includes(order.orderType)) throw new Error("Order is not an increase order");
  if (reason === "orphan-stop" && order.orderType !== 6) throw new Error("Order is not a stop-loss order");

  const data = encodeFunctionData({ abi: exchangeRouterAbi, functionName: "cancelOrder", args: [order.key] });
  return { venue: "UpDown", chainId: 42220, to: UPDOWN_CELO.exchangeRouter, data, value: 0n, calldataHash: keccak256(data), orderKey: order.key, orderType: order.orderType, market: order.market, reason, executionEnabled: false };
}
