import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

// Ícone PNG do app do motoboy (manifest / Tela de Início do iOS).
// O caminho começa com "/motoboy" de propósito: o middleware redireciona para
// /motoboy qualquer URL fora desse prefixo quando o aparelho é de motoboy
// (cookie vellox_mb_device), o que quebraria o ícone.
// ?s=180|192|512  ·  &m=1 = versão "maskable" (com margem de segurança).
const TAMANHOS = new Set([180, 192, 512]);

export function GET(req: NextRequest) {
  const s = Number(req.nextUrl.searchParams.get("s"));
  const size = TAMANHOS.has(s) ? s : 192;
  const maskable = req.nextUrl.searchParams.get("m") === "1";
  const raio = maskable ? 0 : Math.round(size * 0.22);
  const icone = Math.round(size * (maskable ? 0.42 : 0.56));

  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: raio,
          background: "linear-gradient(135deg, #FFC72C 0%, #E4002B 55%, #A80021 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* Moto/bike */}
        <svg width={icone} height={icone} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="18.5" cy="17.5" r="3.5" />
          <circle cx="5.5" cy="17.5" r="3.5" />
          <circle cx="15" cy="5" r="1" />
          <path d="M12 17.5V14l-3-3 4-3 2 3h2" />
        </svg>
      </div>
    ),
    {
      width: size,
      height: size,
      headers: { "Cache-Control": "public, max-age=86400, immutable" },
    },
  );
}
