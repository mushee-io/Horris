import { DEFAULT_HORRIS_MENTO_ADAPTER, DEFAULT_HORRIS_VAULT } from "./horris-contracts";

export type HorrisRuntimeReadiness = {
  aiConfigured: boolean;
  vaultConfigured: boolean;
  mentoAdapterConfigured: boolean;
  perpAuthorizationConfigured: boolean;
  celoSepoliaRpcConfigured: boolean;
  celoMainnetRpcConfigured: boolean;
  readyForVercelSmokeTest: boolean;
};

const has = (value: string | undefined) => typeof value === "string" && value.trim().length > 0;
const address = (value: string | undefined) => typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value.trim());
function configuredAddress(override: string | undefined, fallback: string) {
  if (override !== undefined && override.trim().length > 0) return address(override);
  return address(fallback);
}

export function getHorrisRuntimeReadiness(env: NodeJS.ProcessEnv = process.env): HorrisRuntimeReadiness {
  const aiConfigured = has(env.GROQ_API_KEY);
  const vaultConfigured = configuredAddress(env.NEXT_PUBLIC_HORRIS_VAULT, DEFAULT_HORRIS_VAULT);
  const mentoAdapterConfigured = configuredAddress(env.NEXT_PUBLIC_HORRIS_MENTO_ADAPTER, DEFAULT_HORRIS_MENTO_ADAPTER);
  const perpAuthorizationConfigured = address(env.HORRIS_UPDOWN_AUTHORIZATION);

  // Both network clients have pinned public RPC fallbacks in code, so explicit
  // environment overrides are optional for a Vercel smoke test.
  const celoSepoliaRpcConfigured = true;
  const celoMainnetRpcConfigured = true;

  return {
    aiConfigured,
    vaultConfigured,
    mentoAdapterConfigured,
    perpAuthorizationConfigured,
    celoSepoliaRpcConfigured,
    celoMainnetRpcConfigured,
    readyForVercelSmokeTest: aiConfigured && vaultConfigured && mentoAdapterConfigured,
  };
}
