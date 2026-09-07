import HorrisSectionPage from "../../components/HorrisSectionPage";

export default function ResearchPage() {
  return <HorrisSectionPage
    code="04"
    eyebrow="RESEARCH"
    title={<>RISK BEFORE SPEED.<br/>EXPLAINABILITY BEFORE SCALE.</>}
    intro="Horris research focuses on bounded autonomy: how intelligent agents can act onchain without collapsing proposal, policy and execution into one opaque system."
    modules={[
      { index: "01", label: "BOUNDARIES", title: "Treat intelligence as untrusted input.", body: "The safest agent architecture assumes model output can be malformed, overconfident or adversarial and validates it before deterministic policy sees it.", meta: ["HOSTILE INPUT", "SCHEMA LIMITS", "NO SELF-APPROVAL"] },
      { index: "02", label: "RISK", title: "Measure capital exposure directly.", body: "Horris evaluates notional, account risk, margin utilization, leverage, stop distance and protection gaps instead of substituting an AI confidence score for risk.", meta: ["EXPOSURE", "LEVERAGE", "STOP COVERAGE"] },
      { index: "03", label: "AUTHORITY", title: "Separate recommendation from permission.", body: "A useful AI can recommend an action without becoming the authority that permits that action. Horris preserves that separation throughout the lifecycle.", meta: ["PROPOSAL ≠ AUTHORITY", "POLICY ≠ MODEL", "WALLET ≠ AGENT"] },
      { index: "04", label: "RECOVERY", title: "Design for failure after execution.", body: "Protection state, frozen orders, stale stops and critical alerts are first-class research problems because execution safety continues after transaction submission.", meta: ["MONITOR", "FREEZE NEW RISK", "RECOVERY"] },
    ]}
    facts={[
      { label: "PRIMARY PRINCIPLE", value: "BOUNDED AUTONOMY", tone: "safe" },
      { label: "MODEL CONFIDENCE", value: "NON-AUTHORITATIVE", tone: "warn" },
      { label: "RISK SOURCE", value: "DETERMINISTIC", tone: "safe" },
      { label: "UNKNOWN STATE", value: "DO NOT ADVANCE", tone: "danger" },
    ]}
    darkTitle="A safe autonomous system must be able to say no."
    darkBody="The Horris research direction is built around explicit rejection, explainable policy, fresh state reads and narrow authorization rather than chasing maximum automation at any cost."
  />;
}
