import { ImageResponse } from "next/og";
import { createClient } from "@supabase/supabase-js";
import { precoVitrine, brl, SELECT_PRECO_VITRINE, type ProdutoPrecoInfo } from "@/lib/precoVitrine";

// Imagem de prévia (Open Graph / Twitter) da loja e de cada prato.
//   /loja/<slug>/og                 → cartão da loja
//   /loja/<slug>/og?produto=<id>    → cartão do prato (foto, nome, preço, loja)
// É uma rota (e não opengraph-image.tsx) porque a imagem do arquivo
// convencional não recebe searchParams e tem prioridade sobre o
// openGraph.images do generateMetadata — o prato precisa da própria imagem.

export const runtime = "nodejs";

const W = 1200;
const H = 630;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const CACHE = { "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" };

/**
 * Baixa a imagem e devolve um data: URI — só JPEG/PNG/GIF (o gerador não
 * entende WebP/AVIF; nesse caso a prévia sai sem a foto em vez de quebrar).
 */
async function imagemSegura(url: string | null | undefined, largura = 900): Promise<string | null> {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  // Cloudinary: pede JPEG já redimensionado (WebP não é suportado aqui)
  const alvo = /res\.cloudinary\.com\/.+\/upload\//.test(url)
    ? url.replace("/upload/", `/upload/f_jpg,q_auto,w_${largura}/`)
    : url;
  try {
    const res = await fetch(alvo, { signal: AbortSignal.timeout(4500) });
    if (!res.ok) return null;
    const tipo = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!["image/jpeg", "image/jpg", "image/png", "image/gif"].includes(tipo)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 6 * 1024 * 1024) return null;
    return `data:${tipo === "image/jpg" ? "image/jpeg" : tipo};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

function corValida(c: string | null | undefined) {
  return c && /^#[0-9a-f]{6}$/i.test(c) ? c : "#E4002B";
}

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const produtoParam = new URL(req.url).searchParams.get("produto");

  const { data: empresa } = await supabase
    .from("empresas_publica")
    .select("id, nome")
    .eq("slug", slug.toLowerCase())
    .single();

  if (!empresa) {
    return new ImageResponse(
      <div style={{ width: W, height: H, display: "flex", alignItems: "center", justifyContent: "center", background: "#f7f7f8", fontSize: 48, color: "#64748b" }}>
        Loja não encontrada
      </div>,
      { width: W, height: H },
    );
  }

  const { data: config } = await supabase
    .from("configuracao_loja")
    .select("logo_url, banner_url, cor_principal")
    .eq("empresa_id", empresa.id)
    .single();

  const cor = corValida(config?.cor_principal);
  const inicial = String(empresa.nome).charAt(0).toUpperCase();

  // ── Cartão do prato ────────────────────────────────────────────────
  if (produtoParam && UUID_RE.test(produtoParam)) {
    const { data: prod } = await supabase
      .from("produtos")
      .select(`id, nome, imagem_url, ativo, ${SELECT_PRECO_VITRINE}`)
      .eq("id", produtoParam)
      .eq("empresa_id", empresa.id)
      .maybeSingle();

    if (prod && prod.ativo !== false) {
      const { preco, aPartirDe } = precoVitrine(prod as unknown as ProdutoPrecoInfo);
      const [foto, logo] = await Promise.all([
        imagemSegura(prod.imagem_url as string | null, 900),
        imagemSegura(config?.logo_url, 200),
      ]);
      const nome = String(prod.nome);
      const tamNome = nome.length > 42 ? 50 : nome.length > 24 ? 60 : 72;

      return new ImageResponse(
        <div style={{ width: W, height: H, display: "flex", background: "#fffdf8", fontFamily: "sans-serif" }}>
          {/* Foto do prato */}
          <div style={{ width: 630, height: H, display: "flex", position: "relative", overflow: "hidden", background: `linear-gradient(135deg, ${cor} 0%, ${cor}99 100%)`, alignItems: "center", justifyContent: "center" }}>
            {foto
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={foto} alt="" width={630} height={630} style={{ width: 630, height: 630, objectFit: "cover" }} />
              : <div style={{ display: "flex", fontSize: 220 }}>🍽️</div>}
          </div>

          {/* Texto */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "56px 56px 48px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
              <div style={{ width: 76, height: 76, borderRadius: 22, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: cor, border: "3px solid #fff", boxShadow: "0 6px 20px rgba(0,0,0,0.15)" }}>
                {logo
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={logo} alt="" width={76} height={76} style={{ width: 76, height: 76, objectFit: "cover" }} />
                  : <div style={{ display: "flex", color: "#fff", fontSize: 40, fontWeight: 900 }}>{inicial}</div>}
              </div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", fontSize: 30, fontWeight: 800, color: "#16130f", maxWidth: 380 }}>{String(empresa.nome).slice(0, 34)}</div>
                <div style={{ display: "flex", fontSize: 22, color: "#6f6a63", marginTop: 2 }}>Peça online pelo Vellox</div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
              <div style={{ display: "flex", fontSize: 26, fontWeight: 800, letterSpacing: 4, color: "#A80021", textTransform: "uppercase" }}>Olha que delícia</div>
              <div style={{ display: "flex", fontSize: tamNome, fontWeight: 900, color: "#16130f", lineHeight: 1.05, letterSpacing: -1.5 }}>
                {nome.length > 70 ? `${nome.slice(0, 68)}…` : nome}
              </div>
              {preco > 0 && (
                <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                  {aPartirDe && <div style={{ display: "flex", fontSize: 28, color: "#4a453f", fontWeight: 700 }}>a partir de</div>}
                  <div style={{ display: "flex", fontSize: 58, fontWeight: 900, color: "#fff", background: "#E4002B", padding: "6px 26px", borderRadius: 999 }}>{brl(preco)}</div>
                </div>
              )}
            </div>

            <div style={{ display: "flex", fontSize: 24, color: "#6f6a63" }}>appvellox.online</div>
          </div>
        </div>,
        { width: W, height: H, headers: CACHE },
      );
    }
  }

  // ── Cartão da loja (o mesmo de antes) ──────────────────────────────
  const [logo, banner] = await Promise.all([
    imagemSegura(config?.logo_url, 300),
    imagemSegura(config?.banner_url, 1200),
  ]);

  return new ImageResponse(
    <div
      style={{
        width: W,
        height: H,
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
          width={W}
          height={H}
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
              width={140}
              height={140}
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
    { width: W, height: H, headers: CACHE },
  );
}
