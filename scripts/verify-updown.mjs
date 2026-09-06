import { createPublicClient, http } from "viem";
import { celo } from "viem/chains";

const RPC = process.env.CELO_MAINNET_RPC_URL || "https://forno.celo.org";
const SOURCE_COMMIT = "33d93fcd5ff0ffb98872dc2964600933f7153052";

const CONTRACTS = {
  ExchangeRouter: "0x20095BB2Fe7C8d25D15d6e5985b29755Ef57EecE",
  Router: "0x5C1e75b8425F9B0de50F8aA5846189fe8676e463",
  OrderVault: "0x3153298B530048dD4E079cB9156d9A2DFdA9F0Dc",
  DepositVault: "0x2690A62C0c19F91f0d59A104955322451F951F90",
  WithdrawalVault: "0x0336b6eDa5F1889092005ebb78648c2a02d406e3",
  WNT: "0x471EcE3750Da237f93B8E339c536989b8978a438",
  DataStore: "0x2808EFda9b6c464208d14aF22A793AD1725D5836",
  Reader: "0x357A2044aD1DfE8c93e7dcf352DD4785b1C6CD93",
  ChainlinkPriceFeedProvider: "0x3f1932ba80878364575d91B822272044E76C87e3",
};

const MARKETS = [
  ["BTC", "0xDbBe49A7165F40C79D00bCD3B456AaE887c3d771", "0x57433eD8eC1FAD60b8E1dcFdD1fBD56aBA19C04C", 8],
  ["ETH", "0x3d069FFd681B68BF281077516dd9006C2e4c818A", "0x4C2675e9067Cd7Fc859165AC5F37f1D82d825A1E", 18],
  ["CELO", "0x1f39c2B41af79973b25F65E7a4234bc22aF250D7", "0x5B1B6DCB4E907b9755E27Db88bD62B9750a13C60", 18],
  ["EURm", "0x38995e0D3c25EE78D45A45A1311A2CA0544b0E6B", "0x2350246BAE36EE301B108cA8fE58D795A8DBdb4e", 18],
  ["JPYm", "0xaaB05004Ac382adE5E70eEFC3C67035b5F31b990", "0x29206D4B6183A29Ef5B68494B0850330e98f27F4", 18],
  ["NGNm", "0x1B07C05466D7dC15244969EbCf23520Aba4df9e7", "0xEb8A6C14e625A05F06eA914Db627dd65175b4505", 18],
  ["AUDm", "0x22476a639D1bBDDE1919A226347360b32A2385Fe", "0x91CA0318Fc30D728640f0E6329205eE1F538F17B", 18],
  ["GBPm", "0xc439330b3D59Be316936Ff62d1d22b377656Fc20", "0x7Ef503a2722cdfa7E99f2A59771f7E2390c2DF76", 18],
];

const USDT = "0xd96a1ac57a180a3819633bCE3dC602Bd8972f595";
const erc20Abi = [
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
];

const client = createPublicClient({ chain: celo, transport: http(RPC, { timeout: 15_000 }) });
let failed = false;

function pass(message) { console.log(`PASS: ${message}`); }
function fail(message) { failed = true; console.error(`FAIL: ${message}`); }

async function requireCode(label, address) {
  const code = await client.getCode({ address });
  if (!code || code === "0x") fail(`${label} has no bytecode at ${address}`);
  else pass(`${label} bytecode exists at ${address}`);
}

console.log(`Horris UpDown verifier · Celo mainnet (${celo.id})`);
console.log(`Pinned UpDown source commit: ${SOURCE_COMMIT}`);
console.log(`RPC: ${RPC}\n`);

for (const [label, address] of Object.entries(CONTRACTS)) await requireCode(label, address);
await requireCode("UpDown USDT", USDT);

const [usdtDecimals, usdtSymbol] = await Promise.all([
  client.readContract({ address: USDT, abi: erc20Abi, functionName: "decimals" }),
  client.readContract({ address: USDT, abi: erc20Abi, functionName: "symbol" }).catch(() => "<unavailable>"),
]);
if (Number(usdtDecimals) !== 6) fail(`USDT decimals changed: expected 6, got ${usdtDecimals}`);
else pass(`USDT decimals = 6 (${usdtSymbol})`);

for (const [symbol, marketToken, indexToken, expectedDecimals] of MARKETS) {
  await requireCode(`${symbol} market`, marketToken);
  await requireCode(`${symbol} index token`, indexToken);
  const decimals = await client.readContract({ address: indexToken, abi: erc20Abi, functionName: "decimals" });
  if (Number(decimals) !== expectedDecimals) fail(`${symbol} index decimals changed: expected ${expectedDecimals}, got ${decimals}`);
  else pass(`${symbol} index decimals = ${expectedDecimals}`);
}

const chainId = await client.getChainId();
if (chainId !== 42220) fail(`RPC returned unexpected chain ID ${chainId}`);
else pass("RPC chain ID = 42220");

if (failed) {
  console.error("\nUpDown verification FAILED. Keep Horris perp execution disabled.");
  process.exit(1);
}

console.log("\nUpDown deployment sanity checks passed.");
console.log("This verifies address/code/token metadata only; it does NOT prove order semantics, protocol safety, or Horris adapter readiness.");
