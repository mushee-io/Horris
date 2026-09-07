import HorrisSectionPage from "../../components/HorrisSectionPage";

export default function DocsPage() {
  return <HorrisSectionPage
    code="05"
    eyebrow="DOCS"
    title={<>DOCUMENT THE MACHINE.<br/>INSPECT EVERY BOUNDARY.</>}
    intro="The Horris documentation surface is organized around architecture, execution safety, network capability and operator workflows rather than a single scrolling product page."
    modules={[
      { index: "01", label: "ARCHITECTURE", title: "Start with the protocol lifecycle.", body: "Understand how intent becomes simulation, risk analysis, policy authorization and finally an execution-eligible transaction.", meta: ["/protocol", "AUTHORITY MODEL", "LIFECYCLE"] },
      { index: "02", label: "ENGINE", title: "Inspect AI and deterministic boundaries.", body: "Review how the Groq provider is isolated from execution authority, how proposals are validated and how preflight gates remain fail-closed.", meta: ["/engine", "AI BOUNDARY", "PREFLIGHT"] },
      { index: "03", label: "NETWORK", title: "Verify contracts and capability by chain.", body: "Use the network section to distinguish Celo Sepolia testnet proof, Mento stable routing and UpDown mainnet-only capabilities.", meta: ["/network", "CELO", "DEPLOYMENT EVIDENCE"] },
      { index: "04", label: "OPERATIONS", title: "Use the control terminal for live work.", body: "The terminal contains the actual wallet, stable intent, AI proposal, perp risk, monitoring, vault and execution-history interfaces.", meta: ["/terminal", "WALLET", "LIVE STATE"] },
      { index: "05", label: "RESEARCH", title: "Understand why the safety model exists.", body: "Research notes frame Horris around bounded autonomy, explainability, protection and recovery rather than generic AI automation.", meta: ["/research", "RISK", "RECOVERY"] },
    ]}
    facts={[
      { label: "STAGE", value: "TESTNET", tone: "warn" },
      { label: "AUDIT STATUS", value: "UNAUDITED", tone: "warn" },
      { label: "MAINNET BROADCAST", value: "LOCKED WHERE UNVERIFIED", tone: "safe" },
      { label: "SOURCE", value: "GITHUB / mushee-io/Horris", tone: "safe" },
    ]}
    darkTitle="Documentation should tell the operator what is real, what is simulated and what is blocked."
    darkBody="Horris documentation keeps capability claims narrow and testable. Unknown or unavailable state is displayed as unavailable rather than filled with placeholder success."
  />;
}
