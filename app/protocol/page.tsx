import HorrisSectionPage from "../../components/HorrisSectionPage";

export default function ProtocolPage() {
  return <HorrisSectionPage
    code="01"
    eyebrow="PROTOCOL"
    title={<>INTENT → SIMULATE →<br/>ASSESS → AUTHORIZE →<br/>EXECUTE.</> as unknown as string}
    intro="Horris turns untrusted intent into a bounded execution lifecycle. Each stage narrows authority before capital can move."
    modules={[
      { index: "01", label: "INTENT", title: "Structure the requested action.", body: "Inputs are normalized into a bounded transaction intent before any model output can influence execution.", meta: ["MARKET / ACTION", "CAPITAL / LIMITS", "RISK PROFILE"] },
      { index: "02", label: "SIMULATION", title: "Model the exact state transition.", body: "The route is compiled and simulated against current chain state so Horris can inspect what would actually happen.", meta: ["EXACT CALLDATA", "LIVE ROUTE STATE", "NO BROADCAST"] },
      { index: "03", label: "RISK", title: "Measure adverse outcomes.", body: "Exposure, leverage, loss, slippage, stop distance and policy constraints are evaluated independently of AI confidence.", meta: ["DETERMINISTIC", "FAIL-CLOSED", "EXPLAINABLE"] },
      { index: "04", label: "POLICY", title: "Apply hard authority boundaries.", body: "Allowlists, caps, replay-safe authorization, deadlines and execution constraints decide whether the lifecycle may advance.", meta: ["NO AI AUTHORITY", "REPLAY SAFE", "LIMIT ENFORCED"] },
      { index: "05", label: "EXECUTION", title: "Require explicit wallet authority.", body: "Only approved, simulated and authorized actions become eligible for explicit wallet approval and onchain execution.", meta: ["USER APPROVAL", "ONCHAIN EVIDENCE", "PROTECTION AFTER ENTRY"] },
    ]}
    facts={[
      { label: "AI AUTHORITY", value: "NONE", tone: "safe" },
      { label: "POLICY AUTHORITY", value: "HORRIS", tone: "safe" },
      { label: "UNVERIFIED ROUTES", value: "BLOCKED", tone: "danger" },
      { label: "EXECUTION MODEL", value: "FAIL-CLOSED", tone: "safe" },
    ]}
    darkTitle="Autonomy is permitted only inside explicit boundaries."
    darkBody="Horris is designed so intelligence can propose, but deterministic policy remains the authority that decides whether execution may progress."
  />;
}
