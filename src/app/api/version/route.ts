import { NextResponse } from "next/server";

// Identificador do deploy atualmente no ar — a Vercel injeta essas env vars
// automaticamente a cada build/deploy (VERCEL_GIT_COMMIT_SHA muda a cada
// commit). Como essa rota roda no servidor, sempre reflete o que está
// REALMENTE rodando agora, não o que o navegador carregou há um tempo.
const VERSION =
  process.env.VERCEL_GIT_COMMIT_SHA ??
  process.env.VERCEL_DEPLOYMENT_ID ??
  "dev";

export async function GET() {
  return NextResponse.json({ version: VERSION }, { headers: { "Cache-Control": "no-store" } });
}
