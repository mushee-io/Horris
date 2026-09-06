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

## Enforced invariants

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

## Frontend and Discord safeguards

- vault execution is simulated with `eth_call` before the wallet is asked to sign;
- the dashboard checks current owner/agent authorization, pause state, accounted USDC, execution cap, remaining daily budget and vault accounting health before execution;
- wallet-direct Mento execution is disabled by default and requires the explicit `NEXT_PUBLIC_ALLOW_WALLET_DIRECT_DEMO=true` testnet flag;
- Discord production requests require Ed25519 signature verification and reject stale timestamps;
- Discord commands only produce strategy/risk responses; they do not directly custody or withdraw funds.

## Residual risks

These controls do not make Horris production safe. Important remaining risks include:

- no independent smart-contract audit or formal verification;
- external Mento Router/factory/token vulnerabilities or governance changes;
- spot-quote manipulation within the underlying liquidity venues; the current MVP does not use a TWAP or independent oracle for execution-price validation;
- owner or agent key compromise;
- malicious or compromised RPC/frontends can present misleading information even though onchain checks still apply;
- contract owner can change allowlists and risk policy within the hard-coded safety bounds;
- Celo Sepolia assets have no production value guarantees;
- the current adapter proves stablecoin execution plumbing and is not yet the final perpetuals execution venue for Horris.

## Incident response

If suspicious behavior is observed on a deployed testnet vault:

1. set the vault to paused;
2. revoke the agent;
3. disable the affected adapter and/or asset policy;
4. withdraw accounted assets to the owner wallet;
5. preserve transaction hashes and logs for investigation;
6. do not resume execution until the cause is understood and a tested fix is deployed.

## Reporting

For this testnet repository, report security findings through the repository's GitHub issue/discussion channels without publishing private keys, credentials, seed phrases or other secrets.
