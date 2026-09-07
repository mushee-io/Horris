import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const required = [
  "app/api/health/route.ts",
  "app/api/perps/advisor/route.ts",
  "app/api/perps/order-preview/route.ts",
  "app/api/perps/protection-preview/route.ts",
  "app/api/perps/risk-state/route.ts",
  "app/erc8004/page.tsx",
  "components/HorrisAiDock.tsx",
  "lib/http-safety.ts",
  "lib/runtime-config.ts",
  "lib/horris-contracts.ts",
  "lib/erc8004.ts",
  "lib/groq-perp-advisor.ts",
  "lib/perp-advisor.ts",
  "lib/perp-ai-boundary.ts",
  "lib/perp-safety-orchestrator.ts",
  "lib/perp-lifecycle.ts",
  "lib/perp-monitor.ts",
  "lib/updown-capabilities.ts",
  "public/.well-known/agent-registration.json",
  "public/horris-agent.svg",
  "docs/DEPLOYMENT.md",
  ".env.example",
  "next.config.ts",
];

const failures = [];
for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) failures.push(`missing required release file: ${file}`);
}

const envExample = fs.readFileSync(path.join(root, ".env.example"), "utf8");
if (!envExample.includes("GROQ_API_KEY=")) failures.push(".env.example must document GROQ_API_KEY");
if (/NEXT_PUBLIC_[A-Z0-9_]*(GROQ|PRIVATE|SECRET|TOKEN|KEY)/.test(envExample)) failures.push("sensitive server credential appears under NEXT_PUBLIC_ in .env.example");
if (!envExample.includes("NEXT_PUBLIC_ALLOW_WALLET_DIRECT_DEMO=false")) failures.push("wallet-direct demo must default to disabled");
if (!envExample.includes("DO NOT SET PRIVATE KEYS IN VERCEL")) failures.push(".env.example must explicitly keep deployment private keys out of Vercel");

const advisor = fs.readFileSync(path.join(root, "app/api/perps/advisor/route.ts"), "utf8");
if (!advisor.includes("executionEnabled: false")) failures.push("AI advisor must remain explicitly non-executable");
if (!advisor.includes("requestGroqPerpProposal")) failures.push("AI advisor route is not wired to the Groq provider boundary");
if (!advisor.includes("readBoundedJson")) failures.push("AI advisor must enforce a streamed body-size limit");
if (!advisor.includes("checkBurstRateLimit")) failures.push("AI advisor must enforce burst protection");
if (!advisor.includes("isCrossSiteBrowserRequest")) failures.push("AI advisor must reject cross-site browser requests");

const groq = fs.readFileSync(path.join(root, "lib/groq-perp-advisor.ts"), "utf8");
if (!groq.includes("process.env.GROQ_API_KEY")) failures.push("Groq provider must read its key from server environment");
if (groq.includes("NEXT_PUBLIC_GROQ")) failures.push("Groq provider must never read a public browser environment variable");
if (!groq.includes('redirect: "error"')) failures.push("Groq provider must reject redirects");
if (!groq.includes('cache: "no-store"')) failures.push("Groq provider requests must not be cached");
if (!groq.includes("maxProviderResponseBytes")) failures.push("Groq provider response size must be bounded");
if (!groq.includes("rationale must be qualitative only") || !groq.includes("sanitizeRationale")) failures.push("AI rationale must be kept qualitative and sanitized before clients receive it");
if (!groq.includes("Numeric risk and P/L explanations are generated only by deterministic Horris policy")) failures.push("numeric risk/P&L authority must remain with deterministic Horris policy");

const deterministicAdvisor = fs.readFileSync(path.join(root, "lib/perp-advisor.ts"), "utf8");
if (deterministicAdvisor.includes("Math.max(1, Math.min(maxMarginByUtilization")) failures.push("bounded advisor must not force a one-dollar margin onto micro balances");
if (!deterministicAdvisor.includes("recommendedMarginUsd = Math.min(maxMarginByUtilization")) failures.push("bounded advisor must clamp margin to profile utilization for every balance size");

const deployment = fs.readFileSync(path.join(root, "lib/horris-contracts.ts"), "utf8");
if (!deployment.includes("0xEd97E9c79599CFB671D59063F8aE446b9C5e0497")) failures.push("real Celo Sepolia vault must remain pinned");
if (!deployment.includes("0xbf1abbE40d9B4Fea970Cf9E2b397109eC1D06CEc")) failures.push("real Celo Sepolia Mento adapter must remain pinned");
if (!deployment.includes("must be a valid 20-byte EVM address")) failures.push("malformed deployment overrides must fail closed");

const capabilities = fs.readFileSync(path.join(root, "lib/updown-capabilities.ts"), "utf8");
if (!capabilities.includes("testnetExecutionSupported: false")) failures.push("UpDown testnet execution must remain explicitly unsupported");
if (!capabilities.includes("broadcastSupported: false")) failures.push("UpDown broadcast must remain explicitly disabled");

const riskState = fs.readFileSync(path.join(root, "app/api/perps/risk-state/route.ts"), "utf8");
if (!riskState.includes("freezeNewRisk")) failures.push("live risk-state route must expose freezeNewRisk");

const health = fs.readFileSync(path.join(root, "app/api/health/route.ts"), "utf8");
if (!health.includes("getHorrisRuntimeReadiness")) failures.push("health endpoint must report deploy-time readiness without exposing secrets");
if (!health.includes("secretsExposed: false")) failures.push("health endpoint must explicitly declare secrets are not exposed");
if (!health.includes("executionEnabled: false")) failures.push("health endpoint must state execution is disabled");

const aiDock = fs.readFileSync(path.join(root, "components/HorrisAiDock.tsx"), "utf8");
if (!aiDock.includes("/api/perps/advisor")) failures.push("dashboard AI dock must use the hardened Horris advisor endpoint");
if (!/execution locked/i.test(aiDock)) failures.push("dashboard AI dock must visibly keep execution locked");

const erc8004 = fs.readFileSync(path.join(root, "lib/erc8004.ts"), "utf8");
const erc8004Page = fs.readFileSync(path.join(root, "app/erc8004/page.tsx"), "utf8");
if (!erc8004.includes("42220") || !erc8004.includes("0x8004A169FB4a3325136EB29fA0ceB6D2e539a432")) failures.push("ERC-8004 must remain pinned to the Celo mainnet Identity Registry");
if (!erc8004.includes("https://horris-delta.vercel.app/.well-known/agent-registration.json")) failures.push("ERC-8004 agent URI must remain pinned to the canonical Horris registration file");
if (!erc8004Page.includes("simulateContract") || !erc8004Page.includes("writeContract") || !erc8004Page.includes("waitForTransactionReceipt")) failures.push("ERC-8004 registration must simulate before explicit wallet submission and wait for confirmation");
if (!erc8004Page.includes("getBytecode") || !erc8004Page.includes('eventName: "Registered"')) failures.push("ERC-8004 registration must verify registry bytecode and the Registered event");
if (/privateKey|seedPhrase|mnemonic/.test(erc8004Page)) failures.push("ERC-8004 browser registration must never request or embed wallet secrets");

let agentRegistration;
try {
  agentRegistration = JSON.parse(fs.readFileSync(path.join(root, "public/.well-known/agent-registration.json"), "utf8"));
} catch {
  failures.push("ERC-8004 agent registration metadata must be valid JSON");
}
if (agentRegistration) {
  if (agentRegistration.type !== "https://eips.ethereum.org/EIPS/eip-8004#registration-v1") failures.push("ERC-8004 registration metadata type is invalid");
  if (agentRegistration.name !== "Horris" || agentRegistration.active !== true) failures.push("ERC-8004 metadata must identify active Horris");
  if (!Array.isArray(agentRegistration.services) || !agentRegistration.services.some((service) => service?.name === "web" && service?.endpoint === "https://horris-delta.vercel.app/")) failures.push("ERC-8004 metadata must advertise the canonical Horris web service");
  if (!Array.isArray(agentRegistration.registrations)) failures.push("ERC-8004 metadata must expose the registrations list");
}

const nextConfig = fs.readFileSync(path.join(root, "next.config.ts"), "utf8");
for (const directive of ["Content-Security-Policy", "frame-ancestors 'none'", "object-src 'none'", "Strict-Transport-Security", "X-Frame-Options", "Referrer-Policy"]) {
  if (!nextConfig.includes(directive)) failures.push(`security header missing: ${directive}`);
}

if (failures.length) {
  console.error("Horris release gate failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("Horris release gate passed: deployment pinned, public config fail-closed, AI server-only/non-executable and qualitative, numeric risk math policy-authoritative, micro-balances bounded, anti-abuse limits active, ERC-8004 identity registration pinned/simulated/wallet-owned, CSP/security headers enforced, UpDown broadcast locked, protection freeze wired, and Vercel readiness observable.");
