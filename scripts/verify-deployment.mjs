import { createPublicClient, formatUnits, http } from "viem";
import { celoSepolia } from "viem/chains";

const RPC = process.env.CELO_SEPOLIA_RPC_URL || "https://forno.celo-sepolia.celo-testnet.org";
const VAULT = process.env.NEXT_PUBLIC_HORRIS_VAULT;
const ADAPTER = process.env.NEXT_PUBLIC_HORRIS_MENTO_ADAPTER;
const EXPECTED_AGENT = process.env.HORRIS_AGENT;
const EXPECTED_OWNER = process.env.HORRIS_EXPECTED_OWNER;

const USDC = "0x01C5C0122039549AD1493B8220cABEdD739BC44E";
const USDM = "0xdE9e4C3ce781b4bA68120d6261cbad65ce0aB00b";
const ROUTER = "0xcf6cD45210b3ffE3cA28379C4683F1e60D0C2CCd";
const FACTORY = "0x353ED52bF8482027C0e0b9e3c0e5d96A9F680980";
const ZERO = "0x0000000000000000000000000000000000000000";

function requireAddress(name, value) {
  if (!value || !/^0x[0-9a-fA-F]{40}$/.test(value)) {
    console.error(`${name} must be a valid address.`);
    process.exit(1);
  }
  return value;
}

function same(a, b) { return a.toLowerCase() === b.toLowerCase(); }
function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS: ${message}`);
  }
}

const vault = requireAddress("NEXT_PUBLIC_HORRIS_VAULT", VAULT);
const adapter = requireAddress("NEXT_PUBLIC_HORRIS_MENTO_ADAPTER", ADAPTER);
const client = createPublicClient({ chain: celoSepolia, transport: http(RPC) });

const vaultAbi = [
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "agent", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "maxExecutionAmount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "dailyExecutionLimit", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "maxSlippageBps", stateMutability: "view", inputs: [], outputs: [{ type: "uint16" }] },
  { type: "function", name: "allowedAssets", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "allowedAdapters", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "bool" }] },
];

const adapterAbi = [
  { type: "function", name: "vault", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "router", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "factory", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "tokenIn", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "tokenOut", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
];

const [vaultCode, adapterCode] = await Promise.all([
  client.getCode({ address: vault }),
  client.getCode({ address: adapter }),
]);
assert(Boolean(vaultCode && vaultCode !== "0x"), "vault bytecode exists on Celo Sepolia");
assert(Boolean(adapterCode && adapterCode !== "0x"), "adapter bytecode exists on Celo Sepolia");
if (process.exitCode) process.exit(process.exitCode);

const [owner, agent, executionCap, dailyLimit, slippageBps, usdcAllowed, usdmAllowed, adapterAllowed, adapterVault, router, factory, tokenIn, tokenOut] = await Promise.all([
  client.readContract({ address: vault, abi: vaultAbi, functionName: "owner" }),
  client.readContract({ address: vault, abi: vaultAbi, functionName: "agent" }),
  client.readContract({ address: vault, abi: vaultAbi, functionName: "maxExecutionAmount" }),
  client.readContract({ address: vault, abi: vaultAbi, functionName: "dailyExecutionLimit" }),
  client.readContract({ address: vault, abi: vaultAbi, functionName: "maxSlippageBps" }),
  client.readContract({ address: vault, abi: vaultAbi, functionName: "allowedAssets", args: [USDC] }),
  client.readContract({ address: vault, abi: vaultAbi, functionName: "allowedAssets", args: [USDM] }),
  client.readContract({ address: vault, abi: vaultAbi, functionName: "allowedAdapters", args: [adapter] }),
  client.readContract({ address: adapter, abi: adapterAbi, functionName: "vault" }),
  client.readContract({ address: adapter, abi: adapterAbi, functionName: "router" }),
  client.readContract({ address: adapter, abi: adapterAbi, functionName: "factory" }),
  client.readContract({ address: adapter, abi: adapterAbi, functionName: "tokenIn" }),
  client.readContract({ address: adapter, abi: adapterAbi, functionName: "tokenOut" }),
]);

assert(owner !== ZERO, "vault owner is nonzero");
if (EXPECTED_OWNER) assert(same(owner, requireAddress("HORRIS_EXPECTED_OWNER", EXPECTED_OWNER)), "vault owner matches HORRIS_EXPECTED_OWNER");
if (EXPECTED_AGENT) assert(same(agent, requireAddress("HORRIS_AGENT", EXPECTED_AGENT)), "vault agent matches HORRIS_AGENT");
assert(executionCap === 1_000_000_000n, `execution cap is 1,000 USDC (${formatUnits(executionCap, 6)})`);
assert(dailyLimit === 2_500_000_000n, `daily limit is 2,500 USDC (${formatUnits(dailyLimit, 6)})`);
assert(Number(slippageBps) === 50, "max slippage is 50 bps / 0.50%");
assert(usdcAllowed === true, "USDC is allowlisted");
assert(usdmAllowed === true, "USDm is allowlisted");
assert(adapterAllowed === true, "deployed Mento adapter is allowlisted");
assert(same(adapterVault, vault), "adapter points to the deployed vault");
assert(same(router, ROUTER), "adapter pins the expected Mento Router");
assert(same(factory, FACTORY), "adapter pins the expected Mento FPMM factory");
assert(same(tokenIn, USDC), "adapter input token is native test USDC");
assert(same(tokenOut, USDM), "adapter output token is USDm");

console.log("\nDeployment summary:");
console.log(JSON.stringify({ chainId: celoSepolia.id, rpc: RPC, vault, adapter, owner, agent, executionCap: executionCap.toString(), dailyLimit: dailyLimit.toString(), slippageBps: Number(slippageBps) }, null, 2));

if (process.exitCode) process.exit(process.exitCode);
console.log("\nHorris deployment verification passed.");
