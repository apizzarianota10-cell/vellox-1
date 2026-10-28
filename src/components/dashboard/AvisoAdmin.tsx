"use client";

/**
 * Pop-up de avisos do dono da plataforma (enviados pelo painel /god).
 *
 * - Lê `avisos_admin` com o client do navegador; o RLS (schema_v76) só devolve
 *   os da própria loja e só deixa preencher visto_em/confirmado_em.
 * - Mostra um por vez, o mais recente primeiro.
 * - Aparece na hora via realtime (INSERT na tabela) e, como reserva, checa a
 *   cada 2 minutos e quando a aba volta ao foco.
 * - "Exigir confirmação": só fecha com "Li e entendi" (grava confirmado_em).
 * - Sem a v76 a tabela não existe e o componente não aparece.
 *
 * Montado em src/app/(dashboard)/layout.tsx: <AvisoAdmin empresaId={empresa.id} />
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Info, AlertTriangle, Siren, Database, X, ExternalLink, CheckCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Nivel = "info" | "atencao" | "urgente";
interface DadosBanco {
  total_bytes?: number; db_bytes?: number; arquivos_bytes?: number; linhas?: number;
  pct_plataforma?: number; limite_bytes?: number | null;
  top?: { nome: string; bytes: number; linhas: number | null }[];
}
interface AvisoRow {
  id: string;
  tipo: "aviso" | "banco_cheio";
  nivel: Nivel;
  titulo: string;
  mensagem: string;
  acao_label: string | null;
  acao_url: string | null;
  exige_confirmacao: boolean;
  dados: DadosBanco | null;
  created_at: string;
}

const COR: Record<Nivel, { cor: string; escuro: string; rotulo: string; ic: typeof Info }> = {
  info:    { cor: "#2563eb", escuro: "#1d4ed8", rotulo: "Informação", ic: Info },
  atencao: { cor: "#d97706", escuro: "#b45309", rotulo: "Atenção",    ic: AlertTriangle },
  urgente: { cor: "#E4002B", escuro: "#b00021", rotulo: "Urgente",    ic: Siren },
};
const CAMPOS = "id, tipo, nivel, titulo, mensagem, acao_label, acao_url, exige_confirmacao, dados, created_at";
const CHECK_MS = 2 * 60 * 1000;

function fmtBytes(b: number | null | undefined) {
  const n = Number(b) || 0;
  if (n < 1024 ** 2) return `${(n / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
  return `${(n / 1024 ** 3).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} GB`;
}
const linkSeguro = (u: string | null) => !!u && (/^https?:\/\/\S+$/.test(u) || /^\/[^/\s]\S*$/.test(u));

export default function AvisoAdmin({ empresaId }: { empresaId: string | null | undefined }) {
  const [fila, setFila] = useState<AvisoRow[]>([]);
  const [salvando, setSalvando] = useState(false);
  const dispensados = useRef<Set<string>>(new Set());

  const carregar = useCallback(async () => {
    if (!empresaId) return;
    const { data, error } = await createClient()
      .from("avisos_admin")
      .select(CAMPOS)
      .eq("empresa_id", empresaId)
      .is("visto_em", null)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) return; // sem a v76: não mostra nada
    setFila(((data ?? []) as AvisoRow[]).filter(a => !dispensados.current.has(a.id)));
  }, [empresaId]);

  useEffect(() => {
    if (!empresaId) return;
    const supabase = createClient();
    carregar();
    const canal = supabase
      .channel(`avisos-admin-${empresaId}-${Math.random().toString(36).slice(2, 7)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "avisos_admin", filter: `empresa_id=eq.${empresaId}` }, (p) => {
        const novo = p.new as AvisoRow & { visto_em?: string | null };
        if (!novo?.id || novo.visto_em || dispensados.current.has(novo.id)) return;
        setFila(f => f.some(a => a.id === novo.id) ? f : [novo, ...f]);
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "avisos_admin" }, (p) => {
        const id = (p.old as { id?: string })?.id;
        if (id) setFila(f => f.filter(a => a.id !== id));
      })
      .subscribe();
    const t = setInterval(carregar, CHECK_MS);
    const vis = () => { if (document.visibilityState === "visible") carregar(); };
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", vis); supabase.removeChannel(canal); };
  }, [empresaId, carregar]);

  const atual = fila[0];

  // Esc fecha só quando não exige confirmação
  useEffect(() => {
    if (!atual || atual.exige_confirmacao) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") marcar(false); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atual?.id]);

  async function marcar(confirmar: boolean) {
    if (!atual || salvando) return;
    setSalvando(true);
    const agora = new Date().toISOString(); // o banco troca pelo horário dele (trigger)
    const patch = confirmar ? { visto_em: agora, confirmado_em: agora } : { visto_em: agora };
    const { error } = await createClient().from("avisos_admin").update(patch).eq("id", atual.id);
    setSalvando(false);
    if (error && confirmar) return; // confirmação precisa gravar; deixa o pop-up aberto
    dispensados.current.add(atual.id);
    setFila(f => f.filter(a => a.id !== atual.id));
  }

  if (!atual) return null;

  const c = COR[atual.nivel] ?? COR.info;
  const Ic = atual.tipo === "banco_cheio" ? Database : c.ic;
  const d = atual.tipo === "banco_cheio" ? atual.dados : null;
  const pct = d?.limite_bytes && d.total_bytes ? Math.min(100, Math.round((d.total_bytes / d.limite_bytes) * 100)) : null;
  const externo = !!atual.acao_url && /^https?:/.test(atual.acao_url);
  const fechar = atual.exige_confirmacao ? undefined : () => marcar(false);

  return (
    <div role="alertdialog" aria-modal="true" aria-labelledby="aviso-admin-titulo" aria-describedby="aviso-admin-texto"
      style={{ position: "fixed", inset: 0, zIndex: 9995, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <style>{`@keyframes aviso-admin-in{from{opacity:0;transform:translateY(14px) scale(.97)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.aviso-admin-card{animation:none!important}}`}</style>
      <div onClick={fechar} style={{ position: "absolute", inset: 0, background: "rgba(10,8,6,0.55)", backdropFilter: "blur(3px)" }} />
      <div className="aviso-admin-card" style={{
        position: "relative", width: "100%", maxWidth: 460, maxHeight: "calc(100dvh - 32px)", display: "flex", flexDirection: "column",
        borderRadius: 22, overflow: "hidden", background: "var(--bg-1, #fff)", color: "var(--text-1, #16130f)",
        border: "1px solid var(--border-1, #ecebe7)", boxShadow: "0 30px 80px rgba(0,0,0,0.35)", animation: "aviso-admin-in .28s ease both",
      }}>
        <div style={{ height: 5, background: c.cor, flexShrink: 0 }} />
        <div style={{ padding: "20px 22px 0", display: "flex", gap: 14, alignItems: "flex-start", flexShrink: 0 }}>
          <span style={{ width: 46, height: 46, borderRadius: 14, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: `${c.cor}1a`, color: c.cor }}>
            <Ic size={23} />
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: c.cor }}>
              {atual.tipo === "banco_cheio" ? "Espaço de dados" : c.rotulo} · Vellox
            </p>
            <h2 id="aviso-admin-titulo" style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.25, marginTop: 3 }}>{atual.titulo}</h2>
          </div>
          {fechar && (
            <button onClick={fechar} aria-label="Fechar" style={{ width: 34, height: 34, borderRadius: 10, border: 0, flexShrink: 0, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-3, #f1efeb)", color: "var(--text-3, #6f6a63)" }}>
              <X size={17} />
            </button>
          )}
        </div>

        <div style={{ padding: "14px 22px 0", overflowY: "auto", flex: 1 }}>
          {d && (
            <div style={{ borderRadius: 16, padding: 14, marginBottom: 14, background: "var(--bg-2, #f6f5f2)", border: "1px solid var(--border-1, #ecebe7)" }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.03em" }}>{fmtBytes(d.total_bytes)}</span>
                <span style={{ fontSize: 12, color: "var(--text-3, #6f6a63)" }}>
                  {pct != null ? `${pct}% de ${fmtBytes(d.limite_bytes)}` : d.pct_plataforma != null ? `${d.pct_plataforma}% da plataforma` : ""}
                </span>
              </div>
              {pct != null && (
                <div style={{ height: 9, borderRadius: 99, background: "var(--bg-3, #e8e6e1)", overflow: "hidden", marginTop: 8 }}>
                  <div style={{ width: `${Math.max(3, pct)}%`, height: "100%", borderRadius: 99, background: pct >= 90 ? COR.urgente.cor : pct >= 70 ? COR.atencao.cor : COR.info.cor }} />
                </div>
              )}
              {d.top && d.top.length > 0 && (
                <ul style={{ marginTop: 10, display: "grid", gap: 6 }}>
                  {d.top.map(t => {
                    const max = d.top![0].bytes || 1;
                    return (
                      <li key={t.nome} style={{ fontSize: 12.5 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                          <span>{t.nome}</span><b>{fmtBytes(t.bytes)}</b>
                        </div>
                        <div style={{ height: 4, borderRadius: 99, background: "var(--bg-3, #e8e6e1)", marginTop: 3, overflow: "hidden" }}>
                          <div style={{ width: `${(t.bytes / max) * 100}%`, height: "100%", background: c.cor, opacity: 0.7 }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
          {atual.mensagem && (
            <p id="aviso-admin-texto" style={{ fontSize: 14.5, lineHeight: 1.6, color: "var(--text-2, #4a453f)", whiteSpace: "pre-line", overflowWrap: "anywhere" }}>{atual.mensagem}</p>
          )}
        </div>

        <div style={{ padding: "16px 22px", paddingBottom: "max(16px, env(safe-area-inset-bottom))", display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>
          {linkSeguro(atual.acao_url) && (
            <a href={atual.acao_url!} target={externo ? "_blank" : undefined} rel={externo ? "noopener noreferrer" : undefined}
              onClick={() => { if (!atual.exige_confirmacao) marcar(false); }}
              style={{ height: 46, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontWeight: 800, fontSize: 14.5, textDecoration: "none", background: c.cor, color: "#fff" }}>
              {atual.acao_label || "Abrir"} {externo && <ExternalLink size={15} />}
            </a>
          )}
          <button onClick={() => marcar(atual.exige_confirmacao)} disabled={salvando}
            style={{
              height: 46, borderRadius: 14, fontWeight: 800, fontSize: 14.5, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              ...(linkSeguro(atual.acao_url)
                ? { background: "transparent", color: "var(--text-1, #16130f)", border: "1px solid var(--border-2, #dedbd4)" }
                : { background: c.cor, color: "#fff", border: 0 }),
              opacity: salvando ? 0.7 : 1,
            }}>
            {atual.exige_confirmacao ? <><CheckCheck size={17} /> Li e entendi</> : "Entendi"}
          </button>
          {fila.length > 1 && <p style={{ textAlign: "center", fontSize: 12, color: "var(--text-3, #6f6a63)" }}>+{fila.length - 1} aviso{fila.length > 2 ? "s" : ""} na fila</p>}
        </div>
      </div>
    </div>
  );
}
