import "server-only";
import { createPublicClient, http, type Address, type Hex } from "viem";
import { celo } from "viem/chains";
import { UPDOWN_CELO } from "./updown";

const RPC = process.env.CELO_MAINNET_RPC_URL || "https://forno.celo.org";

export type UpDownSimulation = {
  chainId: 42220;
  account: Address;
  to: Address;
  value: bigint;
  success: boolean;
  result: Hex | undefined;
  readOnly: true;
  broadcast: false;
};

export async function simulateUnsignedUpDownTransaction(
  account: Address,
  transaction: { to: Address; data: Hex; value: bigint },
): Promise<UpDownSimulation> {
  if (transaction.to.toLowerCase() !== UPDOWN_CELO.exchangeRouter.toLowerCase()) {
    throw new Error("Simulation target is not the pinned UpDown ExchangeRouter");
  }
  if (!transaction.data || transaction.data === "0x") throw new Error("Simulation calldata is empty");
  if (transaction.value < 0n) throw new Error("Simulation value cannot be negative");

  const client = createPublicClient({ chain: celo, transport: http(RPC, { timeout: 15_000 }) });
  const chainId = await client.getChainId();
  if (chainId !== 42220) throw new Error(`UpDown RPC chain mismatch: expected 42220, got ${chainId}`);

  const response = await client.call({
    account,
    to: transaction.to,
    data: transaction.data,
    value: transaction.value,
  });

  return {
    chainId: 42220,
    account,
    to: transaction.to,
    value: transaction.value,
    success: true,
    result: response.data,
    readOnly: true,
    broadcast: false,
  };
}
