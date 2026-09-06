import { formatUnits, parseUnits, type Address, type WalletClient } from "viem";
import { TOKENS, publicClient } from "./celo";
import { erc20ApprovalAbi, horrisVaultAbi, HORRIS_VAULT } from "./horris-contracts";

function requireVault() {
  if (!HORRIS_VAULT) throw new Error("Horris vault has not been deployed/configured yet");
  return HORRIS_VAULT;
}

export async function getVaultSnapshot() {
  const vault = requireVault();
  const [usdc, usdm, paused, executionCap, dailyLimit, spentToday, slippage] = await Promise.all([
    publicClient.readContract({ address: vault, abi: horrisVaultAbi, functionName: "vaultBalance", args: [TOKENS.USDC.address] }),
    publicClient.readContract({ address: vault, abi: horrisVaultAbi, functionName: "vaultBalance", args: [TOKENS.USDm.address] }),
    publicClient.readContract({ address: vault, abi: horrisVaultAbi, functionName: "paused" }),
    publicClient.readContract({ address: vault, abi: horrisVaultAbi, functionName: "maxExecutionAmount" }),
    publicClient.readContract({ address: vault, abi: horrisVaultAbi, functionName: "dailyExecutionLimit" }),
    publicClient.readContract({ address: vault, abi: horrisVaultAbi, functionName: "spentToday" }),
    publicClient.readContract({ address: vault, abi: horrisVaultAbi, functionName: "maxSlippageBps" }),
  ]);

  return {
    usdc: formatUnits(usdc, TOKENS.USDC.decimals),
    usdm: formatUnits(usdm, TOKENS.USDm.decimals),
    paused,
    executionCap: formatUnits(executionCap, TOKENS.USDC.decimals),
    dailyLimit: formatUnits(dailyLimit, TOKENS.USDC.decimals),
    spentToday: formatUnits(spentToday, TOKENS.USDC.decimals),
    maxSlippagePercent: Number(slippage) / 100,
  };
}

export async function depositUsdc(wallet: WalletClient, account: Address, amount: string) {
  const vault = requireVault();
  const value = parseUnits(amount, TOKENS.USDC.decimals);
  const allowance = await publicClient.readContract({ address: TOKENS.USDC.address, abi: erc20ApprovalAbi, functionName: "allowance", args: [account, vault] });

  if (allowance < value) {
    const approval = await wallet.writeContract({ account, chain: wallet.chain, address: TOKENS.USDC.address, abi: erc20ApprovalAbi, functionName: "approve", args: [vault, value] });
    await publicClient.waitForTransactionReceipt({ hash: approval });
  }

  const hash = await wallet.writeContract({ account, chain: wallet.chain, address: vault, abi: horrisVaultAbi, functionName: "deposit", args: [TOKENS.USDC.address, value] });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export async function withdrawUsdc(wallet: WalletClient, account: Address, amount: string) {
  const vault = requireVault();
  const value = parseUnits(amount, TOKENS.USDC.decimals);
  const hash = await wallet.writeContract({ account, chain: wallet.chain, address: vault, abi: horrisVaultAbi, functionName: "withdraw", args: [TOKENS.USDC.address, value, account] });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}
