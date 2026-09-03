import { ImageResponse } from "next/og";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default async function OGImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const { data: empresa } = await supabase
    .from("empresas_publica")
    .select("id, nome")
    .eq("slug", slug.toLowerCase())
    .single();

  if (!empresa) {
    return new ImageResponse(
      <div
        style={{
          width: 1200,
          height: 630,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f7f7f8",
          fontSize: 48,
          color: "#64748b",
        }}
      >
        Loja não encontrada
      </div>
    );
  }

  const { data: config } = await supabase
    .from("configuracao_loja")
    .select("logo_url, banner_url, cor_principal")
    .eq("empresa_id", empresa.id)
    .single();

  const cor = config?.cor_principal ?? "#E4002B";
  const logo = config?.logo_url ?? null;
  const banner = config?.banner_url ?? null;
  const inicial = empresa.nome.charAt(0).toUpperCase();

  return new ImageResponse(
    <div
      style={{
        width: 1200,
        height: 630,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: `linear-gradient(135deg, ${cor}dd 0%, ${cor}88 100%)`,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Banner de fundo */}
      {banner && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={banner}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: 0.35,
          }}
          alt=""
        />
      )}

      {/* Overlay gradiente */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.55) 100%)",
          display: "flex",
        }}
      />

      {/* Conteúdo central */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 28,
          zIndex: 1,
          padding: "0 80px",
          textAlign: "center",
        }}
      >
        {/* Logo ou inicial */}
        <div
          style={{
            width: 140,
            height: 140,
            borderRadius: 36,
            border: "5px solid rgba(255,255,255,0.9)",
            overflow: "hidden",
            background: logo ? "#f0f0f0" : cor,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 8px 40px rgba(0,0,0,0.4)",
          }}
        >
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logo}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
              alt={empresa.nome}
            />
          ) : (
            <div
              style={{
                color: "#fff",
                fontSize: 72,
                fontWeight: 900,
                display: "flex",
              }}
            >
              {inicial}
            </div>
          )}
        </div>

        {/* Nome da empresa */}
        <div
          style={{
            fontSize: 72,
            fontWeight: 900,
            color: "#ffffff",
            lineHeight: 1.1,
            textShadow: "0 3px 24px rgba(0,0,0,0.6)",
            display: "flex",
          }}
        >
          {empresa.nome}
        </div>

        {/* CTA */}
        <div
          style={{
            fontSize: 32,
            fontWeight: 700,
            color: "rgba(255,255,255,0.92)",
            background: "rgba(0,0,0,0.35)",
            padding: "12px 36px",
            borderRadius: 48,
            display: "flex",
          }}
        >
          Faça seu pedido online 🛒
        </div>
      </div>
    </div>,
    { ...size }
  );
}
