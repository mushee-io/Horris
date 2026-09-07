import { describe, expect, it } from "vitest";
import { getHorrisRuntimeReadiness } from "../lib/runtime-config";

describe("Horris runtime readiness", () => {
  it("keeps the Vercel smoke-test gate closed without the server AI secret", () => {
    const state = getHorrisRuntimeReadiness({ NODE_ENV: "test" } as NodeJS.ProcessEnv);
    expect(state.readyForVercelSmokeTest).toBe(false);
    expect(state.aiConfigured).toBe(false);
    expect(state.vaultConfigured).toBe(true);
    expect(state.mentoAdapterConfigured).toBe(true);
  });

  it("becomes smoke-test ready with the server AI secret and pinned deployment defaults", () => {
    const state = getHorrisRuntimeReadiness({ NODE_ENV: "test", GROQ_API_KEY: "test-only" } as NodeJS.ProcessEnv);
    expect(state.readyForVercelSmokeTest).toBe(true);
    expect(state.celoSepoliaRpcConfigured).toBe(true);
    expect(state.celoMainnetRpcConfigured).toBe(true);
  });

  it("accepts valid explicit deployment overrides", () => {
    const state = getHorrisRuntimeReadiness({
      NODE_ENV: "test",
      GROQ_API_KEY: "test-only",
      NEXT_PUBLIC_HORRIS_VAULT: "0x1111111111111111111111111111111111111111",
      NEXT_PUBLIC_HORRIS_MENTO_ADAPTER: "0x2222222222222222222222222222222222222222",
    } as NodeJS.ProcessEnv);
    expect(state.readyForVercelSmokeTest).toBe(true);
  });

  it("rejects malformed explicit contract overrides instead of silently using defaults", () => {
    const state = getHorrisRuntimeReadiness({
      NODE_ENV: "test",
      GROQ_API_KEY: "test-only",
      NEXT_PUBLIC_HORRIS_VAULT: "not-an-address",
      NEXT_PUBLIC_HORRIS_MENTO_ADAPTER: "0x1234",
      HORRIS_UPDOWN_AUTHORIZATION: "configured-but-invalid",
    } as NodeJS.ProcessEnv);
    expect(state.vaultConfigured).toBe(false);
    expect(state.mentoAdapterConfigured).toBe(false);
    expect(state.perpAuthorizationConfigured).toBe(false);
    expect(state.readyForVercelSmokeTest).toBe(false);
  });
});
