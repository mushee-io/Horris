import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const required = [
  "app/api/health/route.ts",
  "app/api/perps/advisor/route.ts",
  "app/api/perps/order-preview/route.ts",
  "app/api/perps/protection-preview/route.ts",
  "app/api/perps/risk-state/route.ts",
  "components/HorrisAiDock.tsx",
  "lib/runtime-config.ts",
  "lib/horris-contracts.ts",
  "lib/groq-perp-advisor.ts",
  "lib/perp-ai-boundary.ts",
  "lib/perp-safety-orchestrator.ts",
  "lib/perp-lifecycle.ts",
  "lib/perp-monitor.ts",
  "lib/updown-capabilities.ts",
  "docs/DEPLOYMENT.md",
  ".env.example",
];

const failures = [];
for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) failures.push(`missing required release file: ${file}`);
}

const envExample = fs.readFileSync(path.join(root, ".env.example"), "utf8");
if (!envExample.includes("GROQ_API_KEY=")) failures.push(".env.example must document GROQ_API_KEY");
if (/NEXT_PUBLIC_[A-Z0-9_]*(GROQ|PRIVATE|SECRET|TOKEN|KEY)/.test(envExample)) failures.push("sensitive server credential appears under NEXT_PUBLIC_ in .env.example");
if (!envExample.includes("NEXT_PUBLIC_ALLOW_WALLET_DIRECT_DEMO=false")) failures.push("wallet-direct demo must default to disabled");

const advisor = fs.readFileSync(path.join(root, "app/api/perps/advisor/route.ts"), "utf8");
if (!advisor.includes("executionEnabled: false")) failures.push("AI advisor must remain explicitly non-executable");
if (!advisor.includes("requestGroqPerpProposal")) failures.push("AI advisor route is not wired to the Groq provider boundary");

const groq = fs.readFileSync(path.join(root, "lib/groq-perp-advisor.ts"), "utf8");
if (!groq.includes("process.env.GROQ_API_KEY")) failures.push("Groq provider must read its key from server environment");
if (groq.includes("NEXT_PUBLIC_GROQ")) failures.push("Groq provider must never read a public browser environment variable");

const deployment = fs.readFileSync(path.join(root, "lib/horris-contracts.ts"), "utf8");
if (!deployment.includes("0xEd97E9c79599cFB671D59063F8aE446b9C5e0497")) failures.push("real Celo Sepolia vault must remain pinned");
if (!deployment.includes("0xbf1abbE40d9B4Fea970Cf9E2b397109eC1D06CEc")) failures.push("real Celo Sepolia Mento adapter must remain pinned");

const capabilities = fs.readFileSync(path.join(root, "lib/updown-capabilities.ts"), "utf8");
if (!capabilities.includes("testnetExecutionSupported: false")) failures.push("UpDown testnet execution must remain explicitly unsupported");
if (!capabilities.includes("broadcastSupported: false")) failures.push("UpDown broadcast must remain explicitly disabled");

const riskState = fs.readFileSync(path.join(root, "app/api/perps/risk-state/route.ts"), "utf8");
if (!riskState.includes("freezeNewRisk")) failures.push("live risk-state route must expose freezeNewRisk");

const health = fs.readFileSync(path.join(root, "app/api/health/route.ts"), "utf8");
if (!health.includes("getHorrisRuntimeReadiness")) failures.push("health endpoint must report deploy-time readiness without exposing secrets");
if (!health.includes("secretsExposed: false")) failures.push("health endpoint must explicitly declare secrets are not exposed");

const aiDock = fs.readFileSync(path.join(root, "components/HorrisAiDock.tsx"), "utf8");
if (!aiDock.includes("/api/perps/advisor")) failures.push("dashboard AI dock must use the hardened Horris advisor endpoint");
if (!aiDock.includes("Execution locked")) failures.push("dashboard AI dock must visibly keep execution locked");

if (failures.length) {
  console.error("Horris release gate failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("Horris release gate passed: real testnet deployment pinned, AI server-only/non-executable, UpDown broadcast locked, protection freeze wired, and Vercel runtime readiness observable.");
