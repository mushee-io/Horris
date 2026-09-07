import { NextResponse } from "next/server";
import { getHorrisRuntimeReadiness } from "../../../lib/runtime-config";

export async function GET() {
  const readiness = getHorrisRuntimeReadiness();
  const deployment = {
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? "local",
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
  };

  return NextResponse.json({
    service: "horris",
    ok: true,
    readiness,
    deployment,
    secretsExposed: false,
    executionEnabled: false,
  }, { headers: { "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff" } });
}
