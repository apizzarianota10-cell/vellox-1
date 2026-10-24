"use client";

// Seção "Avaliações" da página da loja + selo de nota do topo.
// Dados reais (pedidos avaliados depois da entrega) vindos do servidor.

import { useState } from "react";
import { Star, X } from "lucide-react";
import type { ResumoAvaliacoes } from "@/lib/avaliacoesLoja";

function notaTexto(n: number) { return n.toFixed(1).replace(".", ","); }

function dataCurta(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const dias = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (dias <= 0) return "hoje";
  if (dias === 1) return "ontem";
  if (dias < 7) return `há ${dias} dias`;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: dias > 300 ? "numeric" : undefined }).replace(".", "");
}

function Estrelas({ nota, size = 13 }: { nota: number; size?: number }) {
  return (
    <span role="img" aria-label={`${nota} de 5 estrelas`} style={{ display: "inline-flex", gap: 1 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} size={size} aria-hidden fill={i <= nota ? "#f59e0b" : "none"} style={{ color: i <= nota ? "#f59e0b" : "#d6d3d1" }} />
      ))}
    </span>
  );
}

/** Chip do topo: "★ 4,8 · 23 avaliações" — rola até a seção. */
export function SeloNotaLoja({ resumo }: { resumo?: ResumoAvaliacoes }) {
  if (!resumo || resumo.total < 1 || resumo.media == null) return null;
  const temSecao = resumo.recentes.length > 0;
  const conteudo = (
    <>
      <Star size={12} aria-hidden style={{ fill: "#f59e0b", color: "#f59e0b" }} />
      <strong style={{ color: "#0f172a" }}>{notaTexto(resumo.media)}</strong>
      <span>· {resumo.total} avaliaç{resumo.total === 1 ? "ão" : "ões"}</span>
    </>
  );
  const estilo: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 999,
    background: "#fffbeb", border: "1px solid #fde68a", fontSize: 12, fontWeight: 600, color: "#92400e",
  };
  return temSecao ? (
    <a href="#avaliacoes" aria-label={`Nota ${notaTexto(resumo.media)} de 5, ${resumo.total} avaliações. Ver avaliações`} style={{ ...estilo, textDecoration: "none" }}>{conteudo}</a>
  ) : (
    <span style={estilo} aria-label={`Nota ${notaTexto(resumo.media)} de 5, ${resumo.total} avaliações`}>{conteudo}</span>
  );
}

export default function AvaliacoesLoja({ resumo }: { resumo?: ResumoAvaliacoes }) {
  const [fotoAberta, setFotoAberta] = useState<string | null>(null);
  if (!resumo || !resumo.recentes.length) return null;

  return (
    <section id="avaliacoes" aria-labelledby="avaliacoes-titulo" style={{ maxWidth: 720, margin: "0 auto", padding: "20px 20px 4px", scrollMarginTop: 70 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
        <h2 id="avaliacoes-titulo" style={{ fontSize: 17, fontWeight: 900, color: "#0f172a", margin: 0, letterSpacing: "-0.02em" }}>Avaliações</h2>
        {resumo.media != null && resumo.total > 0 && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "#64748b", flexShrink: 0 }}>
            <Star size={14} aria-hidden style={{ fill: "#f59e0b", color: "#f59e0b" }} />
            <strong style={{ color: "#0f172a", fontWeight: 900 }}>{notaTexto(resumo.media)}</strong>
            <span>({resumo.total})</span>
          </span>
        )}
      </div>

      <div className="vellox-hscroll" role="list" style={{
        display: "flex", gap: 12, overflowX: "auto", scrollSnapType: "x mandatory",
        margin: "0 -20px", padding: "2px 20px 10px", scrollPaddingLeft: 20, scrollbarWidth: "none",
      }}>
        {resumo.recentes.map((a, i) => (
          <article key={i} role="listitem" style={{
            flex: "0 0 min(78vw, 280px)", scrollSnapAlign: "start", background: "#fff", borderRadius: 16,
            border: "1px solid #f0f0f0", boxShadow: "0 1px 4px rgba(0,0,0,0.04)", padding: 14,
            display: "flex", flexDirection: "column", gap: 8, minWidth: 0,
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <Estrelas nota={a.nota} />
              <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, whiteSpace: "nowrap" }}>{dataCurta(a.data)}</span>
            </div>
            <div style={{ display: "flex", gap: 10, minWidth: 0 }}>
              {a.foto_url && (
                <button type="button" onClick={() => setFotoAberta(a.foto_url)} aria-label={`Ver foto enviada por ${a.nome}`}
                  style={{ flexShrink: 0, width: 64, height: 64, borderRadius: 12, overflow: "hidden", border: "none", padding: 0, cursor: "zoom-in", background: "#f8fafc" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.foto_url} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                </button>
              )}
              <p style={{
                fontSize: 13, color: a.comentario ? "#334155" : "#94a3b8", margin: 0, lineHeight: 1.45, minWidth: 0,
                overflowWrap: "anywhere", display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden",
              }}>
                {a.comentario ?? "Avaliou sem comentário."}
              </p>
            </div>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#64748b", margin: "auto 0 0" }}>{a.nome}</p>
          </article>
        ))}
      </div>

      {fotoAberta && (
        <div role="dialog" aria-modal="true" aria-label="Foto da avaliação" onClick={() => setFotoAberta(null)}
          onKeyDown={e => { if (e.key === "Escape") setFotoAberta(null); }}
          style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.82)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={fotoAberta} alt="Foto enviada por um cliente" style={{ maxWidth: "100%", maxHeight: "86dvh", borderRadius: 16, objectFit: "contain" }} />
          <button type="button" onClick={() => setFotoAberta(null)} aria-label="Fechar foto" autoFocus
            style={{ position: "absolute", top: 16, right: 16, width: 44, height: 44, borderRadius: 999, background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <X size={20} />
          </button>
        </div>
      )}
    </section>
  );
}
