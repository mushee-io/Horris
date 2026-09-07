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

export function getHorrisRuntimeReadiness(env: NodeJS.ProcessEnv = process.env): HorrisRuntimeReadiness {
  const aiConfigured = has(env.GROQ_API_KEY);
  const vaultConfigured = address(env.NEXT_PUBLIC_HORRIS_VAULT);
  const mentoAdapterConfigured = address(env.NEXT_PUBLIC_HORRIS_MENTO_ADAPTER);
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
