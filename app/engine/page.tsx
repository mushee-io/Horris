import HorrisSectionPage from "../../components/HorrisSectionPage";

export default function EnginePage() {
  return <HorrisSectionPage
    code="02"
    eyebrow="ENGINE"
    title={<>THE EXECUTION ENGINE.<br/>INTELLIGENCE UNDER CONTROL.</>}
    intro="The Horris engine separates proposal generation from execution authority. AI can structure a trade idea; Horris policy, live preflight and explicit authorization decide whether it may advance."
    modules={[
      { index: "01", label: "AI PROPOSAL", title: "Models propose. They do not execute.", body: "Groq produces a structured proposal that is treated as untrusted input and reviewed by the hostile-input boundary before policy evaluation.", meta: ["SERVER-SIDE MODEL KEY", "STRICT STRUCTURED OUTPUT", "EXECUTABLE = FALSE"] },
      { index: "02", label: "POLICY CORE", title: "Deterministic rules are authoritative.", body: "Risk profiles, leverage limits, stop requirements, allocation caps and allowed actions are checked independently of model confidence.", meta: ["RISK CAPS", "ALLOWLISTS", "HARD REJECTIONS"] },
      { index: "03", label: "PREFLIGHT", title: "Compile the exact transaction first.", body: "Horris resolves live venue state, builds the exact call path and simulates it before any wallet-signing stage can be reached.", meta: ["LIVE STATE", "EXACT CALLDATA", "SIMULATION GATE"] },
      { index: "04", label: "AUTHORIZATION", title: "Authority is narrow and replay-safe.", body: "EIP-712 authorization binds calldata, context, nonce and expiry so a previously approved action cannot be silently repurposed.", meta: ["NONCE", "EXPIRY", "CALLDATA HASH"] },
      { index: "05", label: "PROTECTION", title: "Execution is not the end of risk.", body: "The monitor continuously reasons about positions, stop coverage, frozen orders and new-risk freezes after entry.", meta: ["PROTECTION", "MONITOR", "RECOVERY"] },
    ]}
    facts={[
      { label: "MODEL", value: "GROQ / GPT-OSS", tone: "safe" },
      { label: "AI EXECUTION", value: "DISABLED", tone: "safe" },
      { label: "SIGNING", value: "EXPLICIT ONLY", tone: "warn" },
      { label: "FAILURE MODE", value: "FAIL-CLOSED", tone: "safe" },
    ]}
    darkTitle="The model is never the wallet."
    darkBody="Horris keeps intelligence, policy, authorization and execution as separate authority layers so no AI response can silently become an onchain action."
  />;
}
