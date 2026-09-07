# Horris Celo Sepolia deployment runbook

Horris is testnet-stage and unaudited. Use dedicated testnet wallets and test assets only.

## Release gate

Before Vercel deployment, the exact Git commit must pass GitHub CI, typecheck/build and contract tests. Horris must remain fail-closed: AI proposes only; deterministic policy, exact venue preflight, replay-safe authorization and explicit wallet approval are independent gates. Submitted entries must not be blindly retried while confirmation is uncertain. A live position without confirmed active stop coverage, or with a critical protection alert, freezes new exposure and routes the lifecycle to protection/recovery.

No genuine UpDown Celo Sepolia deployment is configured in Horris. UpDown remains Celo-mainnet review-only and all signing/broadcast paths stay disabled. Do not fabricate testnet fills. Mento Celo Sepolia liquidity failures also remain fail-closed.

## Server-only AI configuration

Set `GROQ_API_KEY` only in the server deployment environment. Never prefix it with `NEXT_PUBLIC_`, commit it, log it, or return it from an API route. `GROQ_MODEL` is optional and defaults to `openai/gpt-oss-120b`.

## Pinned Celo Sepolia dependencies

- USDC: `0x01C5C0122039549AD1493B8220cABEdD739BC44E`
- USDm: `0xdE9e4C3ce781b4bA68120d6261cbad65ce0aB00b`
- Mento v3 Router: `0xcf6cD45210b3ffE3cA28379C4683F1e60D0C2CCd`
- Mento FPMM Factory: `0x353ED52bF8482027C0e0b9e3c0e5d96A9F680980`

Stop and re-review if upstream deployments change.

## Existing Horris Celo Sepolia deployment

- Vault: `0xEd97E9c79599cFB671D59063F8aE446b9C5e0497`
- Mento adapter: `0xbf1abbE40d9B4Fea970Cf9E2b397109eC1D06CEc`
- Owner/deployer: `0xB11c08D9aCfB8C71207e497Ae40cFC8aF1052A51`
- Agent: `0x5DD6B8FaE358299dac805c912FD5c3078861178f`

The adapter address is deterministically derived from the same deployer sequence as the known vault: the vault is deployer CREATE nonce 0 and the adapter is the immediately following CREATE nonce 1 in `DeployHorris.s.sol`. The app pins both public testnet addresses by default. Explorer/source verification should still be completed as release evidence, but no address guessing is required anymore.

The existing deployment has already accepted a real 5 USDC vault deposit. Mento swap execution remains fail-closed where the external Sepolia pool lacks sufficient USDm liquidity.

## Vercel configuration

The public vault/adapter addresses are pinned in code and repeated in `.env.example`, so they do not need to be manually re-entered unless intentionally overriding the deployment. For the first Vercel smoke test the only required secret is:

```bash
GROQ_API_KEY=<server-secret>
GROQ_MODEL=openai/gpt-oss-120b
NEXT_PUBLIC_ALLOW_WALLET_DIRECT_DEMO=false
```

`NEXT_PUBLIC_HORRIS_DEPLOYMENT_BLOCK` is optional until the exact deployment block is recorded. Never put private keys, bot tokens, or Groq credentials in `NEXT_PUBLIC_*` variables.

## Vercel smoke test

After first deployment: load `/api/health`; verify `readyForVercelSmokeTest` is true; load the terminal; call the Horris AI dock with a harmless test intent; confirm the Groq key is absent from browser bundles, logs and responses; confirm malformed AI/provider failures remain non-executable; connect a test wallet; run policy/preflight without signing; confirm unsupported venue/liquidity paths remain locked; and verify live unprotected exposure freezes new risk.

## Discord

If enabled, configure `DISCORD_PUBLIC_KEY`, `DISCORD_APPLICATION_ID`, `DISCORD_BOT_TOKEN`, and optional `DISCORD_GUILD_ID` server-side. Verify signatures/stale requests and keep advisory commands incapable of withdrawing funds or bypassing policy.

## Evidence and verification

Preserve the exact deployed git SHA and Blockscout evidence for vault, adapter, deployment, deposits and any genuine executions. Verify contract source with the exact compiler/settings from `foundry.toml`. Do not claim a transaction that did not occur.

## Mainnet

Horris is unaudited. Mainnet transaction execution stays disabled until contracts, calldata authorization, recovery behavior, venue assumptions and wallet UX receive independent security review.
