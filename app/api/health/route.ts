import { NextResponse } from "next/server";
import { getHorrisRuntimeReadiness } from "../../../lib/runtime-config";

export async function GET() {
  const readiness = getHorrisRuntimeReadiness();
  return NextResponse.json({
    service: "horris",
    ok: true,
    readiness,
    secretsExposed: false,
    executionEnabled: false,
  }, { headers: { "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff" } });
}
