import HorrisSectionPage from "../../components/HorrisSectionPage";

export default function NetworkPage() {
  return <HorrisSectionPage
    code="03"
    eyebrow="NETWORK"
    title={<>CELO IS THE RAIL.<br/>HORRIS IS THE CONTROL PLANE.</>}
    intro="Horris uses Celo for stable-value movement, live contract state and execution evidence while keeping venue capabilities explicit across testnet and mainnet."
    modules={[
      { index: "01", label: "CELO SEPOLIA", title: "Real testnet custody and execution proof.", body: "The Horris policy vault and pinned Mento adapter are deployed on Celo Sepolia and used for real USDC testnet funding and route preflight.", meta: ["CHAIN ID 11142220", "REAL VAULT", "REAL USDC"] },
      { index: "02", label: "MENTO", title: "Stablecoin routing under policy.", body: "USDC → USDm execution is constrained to the pinned Router, factory and token pair. External liquidity failures are detected before broadcast where possible.", meta: ["PINNED ROUTER", "PINNED FACTORY", "LIVE QUOTE"] },
      { index: "03", label: "UPDOWN", title: "Mainnet venue capability is explicit.", body: "Horris verifies UpDown mainnet infrastructure for reads, previews and simulations. It does not fabricate a Celo Sepolia perp venue when genuine testnet deployment is unavailable.", meta: ["MAINNET READS", "UNSIGNED PREVIEWS", "NO FAKE FILLS"] },
      { index: "04", label: "EVIDENCE", title: "Every claim should resolve to chain state.", body: "Vault state, transaction hashes, calldata and explorer evidence remain inspectable so the operator can distinguish real execution from planning or simulation.", meta: ["BLOCKSCOUT", "TX HASHES", "ACCOUNTING"] },
    ]}
    facts={[
      { label: "TESTNET NETWORK", value: "CELO SEPOLIA", tone: "safe" },
      { label: "VAULT", value: "0xEd97…0497", tone: "safe" },
      { label: "MENTO ADAPTER", value: "0xbf1a…6CEc", tone: "safe" },
      { label: "UPDOWN TESTNET", value: "NOT VERIFIED", tone: "warn" },
    ]}
    darkTitle="Network capability is a permission, not an assumption."
    darkBody="Horris only enables execution paths that are backed by verified contracts, live state and the required authority. Missing infrastructure remains visibly unavailable instead of being mocked."
  />;
}
