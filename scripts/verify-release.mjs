import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const required = [
  "app/api/perps/advisor/route.ts",
  "app/api/perps/order-preview/route.ts",
  "app/api/perps/protection-preview/route.ts",
  "app/api/perps/risk-state/route.ts",
  "lib/groq-perp-advisor.ts",
  "lib/perp-ai-boundary.ts",
  "lib/perp-safety-orchestrator.ts",
  "lib/perp-lifecycle.ts",
  "lib/perp-monitor.ts",
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

const advisor = fs.readFileSync(path.join(root, "app/api/perps/advisor/route.ts"), "utf8");
if (!advisor.includes("executionEnabled: false")) failures.push("AI advisor must remain explicitly non-executable");
if (!advisor.includes("requestGroqPerpProposal")) failures.push("AI advisor route is not wired to the Groq provider boundary");

const groq = fs.readFileSync(path.join(root, "lib/groq-perp-advisor.ts"), "utf8");
if (!groq.includes("process.env.GROQ_API_KEY")) failures.push("Groq provider must read its key from server environment");
if (groq.includes("NEXT_PUBLIC_GROQ")) failures.push("Groq provider must never read a public browser environment variable");

const riskState = fs.readFileSync(path.join(root, "app/api/perps/risk-state/route.ts"), "utf8");
if (!riskState.includes("freezeNewRisk")) failures.push("live risk-state route must expose freezeNewRisk");

if (failures.length) {
  console.error("Horris release gate failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("Horris release gate passed: AI remains non-executable, secrets are server-only, and protection freeze wiring is present.");
