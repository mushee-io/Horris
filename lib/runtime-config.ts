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

export function getHorrisRuntimeReadiness(env: NodeJS.ProcessEnv = process.env): HorrisRuntimeReadiness {
  const aiConfigured = has(env.GROQ_API_KEY);
  const vaultConfigured = has(env.NEXT_PUBLIC_HORRIS_VAULT);
  const mentoAdapterConfigured = has(env.NEXT_PUBLIC_HORRIS_MENTO_ADAPTER);
  const perpAuthorizationConfigured = has(env.HORRIS_UPDOWN_AUTHORIZATION);
  const celoSepoliaRpcConfigured = has(env.CELO_SEPOLIA_RPC_URL) || true;
  const celoMainnetRpcConfigured = has(env.CELO_MAINNET_RPC_URL) || true;
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
