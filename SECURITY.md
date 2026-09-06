# Horris security model

Horris is testnet-stage, unaudited software. Do not use it with production funds.

## Trust model

The Horris vault separates custody from strategy generation. Offchain strategy or AI output is advisory. Funds can move only through the vault's onchain authorization and risk checks.

The current Celo Sepolia deployment model trusts:

- the vault owner, who controls deposits, withdrawals, policy changes, allowlists and agent assignment;
- an optional agent address, which may execute but cannot withdraw or change policy;
- the configured Mento Router and FPMM factory;
- the configured USDC and USDm token contracts;
- Celo Sepolia consensus and RPC availability.

The perpetual subsystem additionally tracks UpDown Celo mainnet contract/market metadata from a pinned public source commit. **No UpDown trade execution is enabled yet.**

## Enforced stablecoin invariants

`HorrisPolicyVault` currently enforces:

- owner-only deposits and withdrawals;
- owner emergency withdrawals remain available while paused;
- optional agent execution can be revoked immediately;
- deposits use actual token balance deltas and reject fee-on-transfer accounting mismatches;
- only contract addresses can be allowlisted as assets or adapters;
- nonzero execution and daily limits are mandatory;
- execution cap cannot exceed the daily cap;
- configurable slippage is hard-capped at 5% by the contract;
- execution deadlines must be current and no more than 30 minutes ahead;
- execution amount cannot exceed accounted vault funds, the per-execution cap or remaining daily budget;
- output assets must be allowlisted and different from the input asset;
- minimum output is checked against the adapter's current onchain Mento quote rather than a caller-reported slippage value;
- adapter allowances are reset before use, set to the exact amount and cleared after execution;
- the vault verifies its actual output-token balance delta against the adapter-reported output;
- input accounting is debited and output accounting is credited after successful execution;
- deposits and executions are protected by a reentrancy lock.

`HorrisMentoAdapter` additionally enforces:

- only the configured Horris vault may execute swaps;
- immutable Router, FPMM factory, input token and output token;
- one to three route hops only;
- route starts at configured USDC and ends at configured USDm;
- every route hop must use the pinned Mento FPMM factory;
- route continuity and nonzero/different assets per hop;
- positive input/minimum output and bounded deadlines;
- exact Router approval that is cleared after execution;
- actual received output is measured before returning tokens to the vault.

## Perpetual risk safeguards

The offchain `lib/perps.ts` engine currently validates:

- leverage caps by Horris risk profile;
- maximum position notional;
- stop-loss direction;
- projected account loss at stop;
- margin utilization;
- stop distance versus gross margin-exhaustion move;
- take-profit direction;
- reward/risk when a take-profit is supplied.

`HorrisPerpPolicy` provides the first onchain venue-independent guard and enforces:

- owner/agent authorization and revocation;
- pause state;
- market allowlisting;
- a contract-level absolute leverage ceiling of 10x;
- a contract-level absolute account-risk ceiling of 5%;
- a contract-level absolute margin-utilization ceiling of 50%;
- configured maximum notional exposure;
- consistency between margin, leverage and submitted notional;
- projected stop-loss account-risk cap;
- stop-distance buffer before gross margin exhaustion.

### Critical perpetual trust boundary

`HorrisPerpPolicy` **does not execute trades, custody margin, read UpDown orders, or independently discover venue prices**. Its normalized proposal values are not sufficient for secure execution if they are supplied by an untrusted caller.

Before perpetual execution is enabled, a dedicated UpDown adapter must derive or independently verify leverage, margin, notional, market, acceptable price and stop data from the exact order it will submit, then couple those verified values to `HorrisPerpPolicy`. Until that exists and is adversarially tested, the dashboard/API remain analysis-only and return `executionEnabled: false`.

The gross margin-exhaustion calculation is deliberately labeled an estimate. It is not an UpDown liquidation-price oracle. Actual liquidation can be affected by venue maintenance margin, fees, funding, price impact, keeper execution, oracle behavior and protocol configuration.

## Frontend and Discord safeguards

- vault execution is simulated with `eth_call` before the wallet is asked to sign;
- the dashboard checks current owner/agent authorization, pause state, accounted USDC, execution cap, remaining daily budget and vault accounting health before execution;
- wallet-direct Mento execution is disabled by default and requires the explicit `NEXT_PUBLIC_ALLOW_WALLET_DIRECT_DEMO=true` testnet flag;
- the perpetual dashboard is read-only risk analysis and has no order-submission button;
- Discord production requests require Ed25519 signature verification and reject stale timestamps;
- Discord commands only produce strategy/risk responses; they do not directly custody or withdraw funds.

## Residual risks

These controls do not make Horris production safe. Important remaining risks include:

- no independent smart-contract audit or formal verification;
- external Mento or future UpDown contract vulnerabilities or governance/configuration changes;
- spot-quote manipulation within underlying liquidity venues; the current Mento MVP does not use a TWAP or independent oracle for execution-price validation;
- owner or agent key compromise;
- malicious or compromised RPC/frontends can present misleading information even though onchain checks still apply;
- contract owner can change allowlists and risk policy within hard-coded safety bounds;
- Celo Sepolia assets have no production value guarantees;
- perpetual venue metadata can become stale and must be re-verified against live bytecode/configuration before adapter release;
- offchain perp analysis may diverge from actual venue mechanics, particularly liquidation, funding and price-impact calculations;
- no production perpetual execution adapter has been approved or enabled yet.

## Incident response

If suspicious behavior is observed on a deployed testnet vault:

1. set the vault to paused;
2. revoke the agent;
3. disable the affected adapter and/or asset policy;
4. withdraw accounted assets to the owner wallet;
5. preserve transaction hashes and logs for investigation;
6. do not resume execution until the cause is understood and a tested fix is deployed.

For a future perpetual adapter, the equivalent incident process must additionally disable the affected market/adapter and prevent creation of new orders before any automation resumes.

## Reporting

For this testnet repository, report security findings through the repository's GitHub issue/discussion channels without publishing private keys, credentials, seed phrases or other secrets.
