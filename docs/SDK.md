# Horris SDK

Horris exposes a small typed TypeScript surface for risk analysis, bounded strategy proposals, execution gating, delegated-agent checks and unsigned UpDown order compilation.

```ts
import { HorrisSDK } from "../lib/horris-sdk";

const analysis = HorrisSDK.analyzePerpIntent({
  market: "BTC",
  side: "long",
  marginUsd: 100,
  leverage: 2,
  accountBalanceUsd: 5000,
  entryPrice: 100000,
  stopLoss: 99000,
  takeProfit: 102000,
  risk: "Balanced",
});
```

## Safety boundary

The SDK does not bypass Horris policy. AI or agent callers may propose actions, but deterministic risk checks, live venue preflight, authorization checks and wallet/user controls remain authoritative. Mainnet signing/submission stays disabled until the execution path is explicitly enabled and verified.

## Main surfaces

- `analyzePerpIntent` — deterministic risk policy.
- `proposeBoundedPerpIntent` — bounded planning proposal.
- `derivePerpExecutionGate` — fail-closed execution state.
- `canPerpAgentProceed` — scoped/expiring agent delegation check.
- `buildUnsignedUpDownIncreaseOrderPlan` — unsigned UpDown entry compiler.
- `buildUnsignedUpDownCancelPlan` — unsigned cancellation compiler.
- `getUpDownMarket`, `markets`, `celo` — pinned venue registry.
