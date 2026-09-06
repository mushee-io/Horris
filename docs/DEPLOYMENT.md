# Horris deployment runbook

Never place private keys, Discord secrets, RPC secrets or authorizer keys in Git, issue comments, chat logs or screenshots.

## 1. Pre-release gate

- CI green on the exact release commit.
- `npm audit` and TypeScript/Vitest/Next build green.
- Foundry tests/build green.
- UpDown pinned-contract verifier reviewed.
- Signing/submission remains disabled until deployment verification is complete.

## 2. Celo Sepolia stable path

Use a dedicated funded deployment signer outside source control.

Required secure runtime values: `DEPLOYER_PRIVATE_KEY`, `HORRIS_AGENT`.

Deploy `script/DeployHorris.s.sol` to Celo Sepolia (chain 11142220), record deployment tx/block and vault/adapter addresses, then run `npm run verify:deployment` against the deployed addresses.

Configure the frontend only after verification:

```env
NEXT_PUBLIC_HORRIS_VAULT=<verified vault>
NEXT_PUBLIC_HORRIS_MENTO_ADAPTER=<verified adapter>
NEXT_PUBLIC_HORRIS_DEPLOYMENT_BLOCK=<deployment block>
NEXT_PUBLIC_ALLOW_WALLET_DIRECT_DEMO=false
```

E2E proof: deposit a small test USDC amount, execute policy-approved USDC→USDm through the Mento adapter, verify accounting/events, withdraw USDm, then test pause and agent revoke.

## 3. Perp authorization stack

Do not enable UpDown broadcast for this deployment step.

Secure runtime values: `DEPLOYER_PRIVATE_KEY`, `HORRIS_PERP_AUTHORIZER`, `HORRIS_PERP_OWNER`.

Deploy `script/DeployHorrisPerpGuard.s.sol`, record Policy/Guard/Authorization addresses, configure verifier env values and run `npm run verify:perp-guard`. If long-term ownership was proposed to a multisig/admin, that owner must explicitly accept ownership on all three contracts. Rerun the verifier after acceptance.

## 4. Execution release gate

Before any mainnet signing/broadcast UI is enabled, prove all of these on the exact release commit:

1. risk rejection cannot produce executable calldata;
2. exact entry calldata passes live preflight and `eth_call`;
3. EIP-712 authorization binds the exact calldata hash and passes read-only simulation;
4. submitted entry is confirmed from fresh UpDown state rather than transaction hash alone;
5. confirmed entry freezes new exposure until active stop coverage is confirmed;
6. protection failure retries are bounded and stale/frozen protection fails closed;
7. recovery can generate reviewed reduce/close/cancel plans without duplicate entry submission;
8. replay, expired authorization, stale oracle and RPC failure tests pass.

## 5. Vercel

Create the Horris project from the GitHub repository, configure public contract addresses and server-only secrets in Vercel environment settings, deploy Preview first, run wallet/mobile/API checks, then promote the validated deployment to Production. Never expose server-only Discord or authorization credentials through `NEXT_PUBLIC_*` variables.

## 6. Discord

Configure the Discord application credentials as server-only environment values, register commands, verify Ed25519 interaction signatures, then test `/help`, `/strategy`, `/risk`, `/perp-risk` and `/perp-status` in the production server. Alerts remain advisory until the separately reviewed execution permission flow is enabled.
