"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Loader2, X, AlertTriangle, Inbox } from "lucide-react";

// ─── Tipos compartilhados ────────────────────────────────────────────────────

export type Plano = "basic" | "pro" | "enterprise" | "ktl";
export const PLANOS: Plano[] = ["basic", "pro", "enterprise", "ktl"];
export const PLANO_LABEL: Record<Plano, string> = { basic: "Basic", pro: "Pro", enterprise: "Enterprise", ktl: "KTL" };

export interface EmpresaRow {
  id: string;
  nome: string;
  email: string;
  cnpj: string | null;
  codigo: string;
  ativo: boolean;
  assinatura_ativa: boolean;
  assinatura_expira_em: string | null;
  kirvano_subscriber_id: string | null;
  created_at: string;
  total_pedidos: number;
  total_motoboys: number;
  plano: Plano;
}

export interface MotoboyGod {
  id: string;
  nome: string;
  telefone: string;
  email: string | null;
  status: string;
  codigo: string | null;
  posicao_fila: number | null;
  empresa_id: string | null;
  empresa_nome: string | null;
  empresa_plano: Plano | null;
  total_entregas: number;
  entregas_hoje: number;
  ganho_total: number;
  ganho_hoje: number;
  created_at: string;
}

export interface AlvoPremiacao {
  tipo: "empresa" | "motoboy";
  id: string;
  nome: string;
  tituloSugerido?: string;
  periodoRef?: string;
}

export interface Premiacao {
  id: string;
  alvo_tipo: "empresa" | "motoboy";
  empresa_id: string | null;
  motoboy_id: string | null;
  titulo: string;
  mensagem: string;
  beneficio: string | null;
  valor: number | null;
  dias_bonus: number | null;
  dias_aplicados_em: string | null;
  periodo_ref: string | null;
  status: "enviada" | "vista" | "resgatada";
  created_at: string;
  vista_em: string | null;
  resgatada_em: string | null;
  alvo_nome?: string;
}

// ─── Formatação ──────────────────────────────────────────────────────────────

const TZ = "America/Sao_Paulo";
export const fmtBRL = (v: number) =>
  (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const fmtBRLCurto = (v: number) => {
  const n = Number(v) || 0;
  if (Math.abs(n) >= 1_000_000) return `R$ ${(n / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (Math.abs(n) >= 10_000) return `R$ ${(n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return fmtBRL(n);
};
export const fmtNum = (v: number) => (Number(v) || 0).toLocaleString("pt-BR");
export function fmtBytes(b: number | null | undefined): string {
  const n = Number(b) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} MB`;
  return `${(n / 1024 ** 3).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} GB`;
}
export function fmtData(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: TZ });
}
export function fmtDataHora(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: TZ });
}
export function tempoAtras(iso: string | null | undefined): string {
  if (!iso) return "nunca";
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "agora";
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  const d = Math.floor(s / 86400);
  return d === 1 ? "há 1 dia" : `há ${d} dias`;
}
export function diasRestantes(iso: string | null | undefined): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}
export function assinaturaVigente(e: { assinatura_ativa: boolean; assinatura_expira_em: string | null }) {
  return e.assinatura_ativa && (!e.assinatura_expira_em || new Date(e.assinatura_expira_em) > new Date());
}
export const STATUS_MB: Record<string, { label: string; cor: string }> = {
  disponivel: { label: "Disponível", cor: "var(--ok)" },
  em_entrega: { label: "Em entrega", cor: "var(--warn)" },
  offline:    { label: "Offline",    cor: "var(--muted)" },
};
export const STATUS_PEDIDO: Record<string, string> = {
  em_fila: "Na fila", em_preparo: "Em preparo", finalizado: "Pronto", em_coleta: "Em coleta",
  em_rota_de_entrega: "Em rota", aguardando_confirmacao: "Aguardando", entregue: "Entregue", cancelado: "Cancelado",
  pendente: "Pendente", em_rota: "Em rota",
};

// ─── Fetch ───────────────────────────────────────────────────────────────────

export async function api<T = unknown>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(url, {
    ...rest,
    headers: json !== undefined ? { "Content-Type": "application/json", ...(rest.headers ?? {}) } : rest.headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const txt = await res.text();
  let data: unknown = null;
  try { data = txt ? JSON.parse(txt) : null; } catch { data = { error: txt }; }
  if (!res.ok) throw new Error((data as { error?: string } | null)?.error ?? `Erro ${res.status}`);
  return data as T;
}

/** GET simples com loading/erro/recarregar. `url` null = não busca. */
export function useJson<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(!!url);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const load = useCallback(async () => {
    if (!url) return;
    const my = ++seq.current;
    setLoading(true); setError(null);
    try {
      const d = await api<T>(url);
      if (my === seq.current) setData(d);
    } catch (e) {
      if (my === seq.current) setError((e as Error).message);
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, [url]);
  useEffect(() => { load(); }, [load]);
  return { data, loading, error, reload: load, setData };
}

// ─── Estilos (tokens claro/escuro) ───────────────────────────────────────────

export const GOD_CSS = `
.gd{--bg:#f6f5f2;--card:#ffffff;--ink:#16130f;--ink2:#4a453f;--muted:#6f6a63;--faint:#a39e96;--line:#ecebe7;--line2:#dedbd4;--soft:#f3f1ed;--hover:#faf9f7;
--red:#E4002B;--red-ink:#c20025;--red-soft:rgba(228,0,43,.08);--ok:#0f7a43;--ok-soft:rgba(22,163,74,.10);--warn:#a15c00;--warn-soft:rgba(234,179,8,.16);--info:#3b4fd8;--info-soft:rgba(79,70,229,.09);
--gold:#b7791f;--silver:#7c8794;--bronze:#a0522d;
--pl-basic:#6b7280;--pl-pro:#4f46e5;--pl-enterprise:#b45309;--pl-ktl:#0e7490;
--sh:0 1px 2px rgba(16,12,8,.04),0 6px 20px rgba(16,12,8,.05);--sh2:0 20px 60px rgba(16,12,8,.18);--scrim:rgba(22,19,15,.38);
background:var(--bg);color:var(--ink);min-height:100vh;min-height:100dvh;font-feature-settings:"tnum" 1}
.gd[data-mode="dark"]{--bg:#0e0d0c;--card:#181614;--ink:#f3f1ed;--ink2:#d4d0c9;--muted:#a39e96;--faint:#6f6a63;--line:#272421;--line2:#34302c;--soft:#211e1b;--hover:#1d1b18;
--red:#ff2d55;--red-ink:#ff5a78;--red-soft:rgba(255,45,85,.12);--ok:#34d399;--ok-soft:rgba(52,211,153,.12);--warn:#fbbf24;--warn-soft:rgba(251,191,36,.13);--info:#a5b4fc;--info-soft:rgba(129,140,248,.14);
--gold:#f6c453;--silver:#c3cad3;--bronze:#e0905a;
--pl-basic:#9ca3af;--pl-pro:#a5b4fc;--pl-enterprise:#fbbf24;--pl-ktl:#67e8f9;
--sh:0 1px 2px rgba(0,0,0,.3),0 8px 24px rgba(0,0,0,.25);--sh2:0 24px 70px rgba(0,0,0,.6);--scrim:rgba(0,0,0,.6)}
.gd *{box-sizing:border-box}
.gd-card{background:var(--card);border:1px solid var(--line);border-radius:18px;box-shadow:var(--sh)}
.gd-h1{font-size:26px;line-height:1.1;font-weight:800;letter-spacing:-.03em;color:var(--ink)}
.gd-h2{font-size:16px;font-weight:750;letter-spacing:-.02em;color:var(--ink)}
.gd-label{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.gd-muted{color:var(--muted)}
.gd-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:38px;padding:0 14px;border-radius:12px;font-size:13px;font-weight:650;border:1px solid var(--line2);background:var(--card);color:var(--ink);cursor:pointer;transition:background .15s,border-color .15s,transform .05s;white-space:nowrap}
.gd-btn:hover{background:var(--hover);border-color:var(--faint)}
.gd-btn:active{transform:translateY(1px)}
.gd-btn:disabled{opacity:.5;cursor:not-allowed}
.gd-btn-sm{height:32px;padding:0 10px;font-size:12px;border-radius:10px}
.gd-btn-primary{background:var(--ink);color:var(--card);border-color:var(--ink)}
.gd-btn-primary:hover{background:var(--ink2);border-color:var(--ink2)}
.gd-btn-red{background:var(--red);color:#fff;border-color:var(--red)}
.gd-btn-red:hover{background:var(--red-ink);border-color:var(--red-ink)}
.gd-btn-ghost{background:transparent;border-color:transparent}
.gd-btn-ghost:hover{background:var(--soft);border-color:transparent}
.gd-btn-danger{color:var(--red-ink);border-color:color-mix(in srgb,var(--red) 30%,transparent);background:var(--red-soft)}
.gd-btn-danger:hover{background:color-mix(in srgb,var(--red) 14%,transparent);border-color:var(--red)}
.gd-input{width:100%;height:40px;padding:0 12px;border-radius:12px;border:1px solid var(--line2);background:var(--card);color:var(--ink);font-size:16px;outline:none;transition:border-color .15s,box-shadow .15s}
@media (min-width:768px){.gd-input{font-size:14px}}
.gd-input:focus{border-color:var(--ink);box-shadow:0 0 0 3px color-mix(in srgb,var(--ink) 10%,transparent)}
textarea.gd-input{height:auto;padding:10px 12px;resize:vertical;min-height:84px}
select.gd-input{appearance:none;background-image:linear-gradient(45deg,transparent 50%,var(--muted) 50%),linear-gradient(135deg,var(--muted) 50%,transparent 50%);background-position:calc(100% - 16px) 50%,calc(100% - 11px) 50%;background-size:5px 5px;background-repeat:no-repeat;padding-right:30px}
.gd-chip{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 12px;border-radius:999px;border:1px solid var(--line2);background:var(--card);color:var(--ink2);font-size:12.5px;font-weight:600;cursor:pointer;white-space:nowrap}
.gd-chip:hover{border-color:var(--faint)}
.gd-chip[data-on="true"]{background:var(--ink);color:var(--card);border-color:var(--ink)}
.gd-seg{display:inline-flex;padding:3px;border-radius:12px;background:var(--soft);border:1px solid var(--line);gap:2px;max-width:100%;overflow-x:auto;scrollbar-width:none}
.gd-seg::-webkit-scrollbar{display:none}
.gd-seg button{height:30px;padding:0 12px;border-radius:9px;font-size:12.5px;font-weight:650;color:var(--muted);background:transparent;border:0;cursor:pointer;white-space:nowrap}
.gd-seg button[data-on="true"]{background:var(--card);color:var(--ink);box-shadow:0 1px 3px rgba(16,12,8,.12)}
.gd-badge{display:inline-flex;align-items:center;gap:4px;height:22px;padding:0 8px;border-radius:999px;font-size:11px;font-weight:700;white-space:nowrap}
.gd-row{transition:background .12s;cursor:pointer}
.gd-row:hover{background:var(--hover)}
.gd-divide>*+*{border-top:1px solid var(--line)}
.gd-scroll{scrollbar-width:thin;scrollbar-color:var(--line2) transparent}
.gd-nav-item{display:flex;align-items:center;gap:10px;height:40px;padding:0 12px;border-radius:12px;font-size:14px;font-weight:600;color:var(--ink2);cursor:pointer;border:0;background:transparent;width:100%;text-align:left}
.gd-nav-item:hover{background:var(--soft)}
.gd-nav-item[data-on="true"]{background:var(--ink);color:var(--card)}
.gd-tab-item{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;font-size:10.5px;font-weight:650;color:var(--muted);background:transparent;border:0;cursor:pointer;min-width:0;padding-top:6px}
.gd-tab-item[data-on="true"]{color:var(--ink)}
.gd-tab-item[data-on="true"] .gd-tab-ico{background:var(--ink);color:var(--card)}
.gd-tab-ico{display:flex;align-items:center;justify-content:center;width:44px;height:28px;border-radius:999px;transition:background .15s}
.gd-bar{height:8px;border-radius:999px;background:var(--soft);overflow:hidden}
.gd-bar>span{display:block;height:100%;border-radius:999px;background:var(--red)}
@keyframes gd-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes gd-slide{from{transform:translateX(24px);opacity:.4}to{transform:none;opacity:1}}
@keyframes gd-up{from{transform:translateY(40px);opacity:.4}to{transform:none;opacity:1}}
.gd-fade{animation:gd-in .25s ease both}
@media (prefers-reduced-motion:reduce){.gd-fade,.gd-drawer,.gd-sheet{animation:none!important}}
.gd-drawer{animation:gd-up .22s ease both}
@media (min-width:768px){.gd-drawer{animation:gd-slide .22s ease both}}
.gd-sheet{animation:gd-up .22s ease both}
.gd-skel{background:linear-gradient(90deg,var(--soft),var(--line),var(--soft));background-size:200% 100%;animation:gd-sk 1.2s linear infinite;border-radius:10px}
@keyframes gd-sk{to{background-position:-200% 0}}
`;

// ─── Primitivos ──────────────────────────────────────────────────────────────

export function Spinner({ size = 18 }: { size?: number }) {
  return <Loader2 size={size} className="animate-spin" style={{ color: "var(--muted)" }} />;
}

export function Carregando({ texto = "Carregando..." }: { texto?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-14 text-sm gd-muted">
      <Spinner /> {texto}
    </div>
  );
}

export function Vazio({ texto, icone }: { texto: string; icone?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-sm text-center gd-muted">
      <span style={{ color: "var(--faint)" }}>{icone ?? <Inbox size={26} />}</span>
      {texto}
    </div>
  );
}

export function Aviso({ tom = "warn", titulo, children }: { tom?: "warn" | "red" | "info" | "ok"; titulo: string; children?: ReactNode }) {
  const cor = tom === "red" ? "var(--red-ink)" : tom === "info" ? "var(--info)" : tom === "ok" ? "var(--ok)" : "var(--warn)";
  const bg = tom === "red" ? "var(--red-soft)" : tom === "info" ? "var(--info-soft)" : tom === "ok" ? "var(--ok-soft)" : "var(--warn-soft)";
  return (
    <div className="flex gap-3 rounded-2xl p-4" style={{ background: bg, border: `1px solid color-mix(in srgb, ${cor} 25%, transparent)` }}>
      <AlertTriangle size={18} style={{ color: cor, flexShrink: 0, marginTop: 1 }} />
      <div className="min-w-0 text-sm" style={{ color: "var(--ink2)" }}>
        <p className="font-bold" style={{ color: "var(--ink)" }}>{titulo}</p>
        {children && <div className="mt-1 leading-relaxed">{children}</div>}
      </div>
    </div>
  );
}

export function PlanoBadge({ plano }: { plano: Plano | string | null | undefined }) {
  const p = (PLANOS as string[]).includes(plano ?? "") ? (plano as Plano) : "basic";
  const cor = `var(--pl-${p})`;
  return (
    <span className="gd-badge" style={{ color: cor, background: `color-mix(in srgb, ${cor} 12%, transparent)` }}>
      {PLANO_LABEL[p]}
    </span>
  );
}

export function StatusAssinatura({ e }: { e: { assinatura_ativa: boolean; assinatura_expira_em: string | null } }) {
  const vig = assinaturaVigente(e);
  const dias = diasRestantes(e.assinatura_expira_em);
  if (e.assinatura_ativa && !vig) {
    return <span className="gd-badge" style={{ color: "var(--warn)", background: "var(--warn-soft)" }}>Vencida</span>;
  }
  if (vig && dias !== null && dias <= 7) {
    return <span className="gd-badge" style={{ color: "var(--warn)", background: "var(--warn-soft)" }}>Vence em {dias}d</span>;
  }
  return vig
    ? <span className="gd-badge" style={{ color: "var(--ok)", background: "var(--ok-soft)" }}>● Ativa</span>
    : <span className="gd-badge" style={{ color: "var(--red-ink)", background: "var(--red-soft)" }}>Inativa</span>;
}

export function StatusMotoboy({ status }: { status: string }) {
  const s = STATUS_MB[status] ?? STATUS_MB.offline;
  return (
    <span className="gd-badge" style={{ color: s.cor, background: `color-mix(in srgb, ${s.cor} 12%, transparent)` }}>
      <span style={{ width: 6, height: 6, borderRadius: 9, background: s.cor }} /> {s.label}
    </span>
  );
}

export function Avatar({ nome, foto, size = 40, quadrado = false }: { nome: string; foto?: string | null; size?: number; quadrado?: boolean }) {
  const r = quadrado ? Math.round(size * 0.3) : size;
  if (foto) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={foto} alt="" width={size} height={size} style={{ width: size, height: size, borderRadius: r, objectFit: "cover", flexShrink: 0, background: "var(--soft)" }} />;
  }
  return (
    <span className="flex items-center justify-center font-extrabold shrink-0"
      style={{ width: size, height: size, borderRadius: r, background: "var(--soft)", color: "var(--ink2)", fontSize: size * 0.4, border: "1px solid var(--line)" }}>
      {(nome || "?").trim().charAt(0).toUpperCase()}
    </span>
  );
}

export function Seg<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { v: T; l: string }[] }) {
  return (
    <div className="gd-seg" role="tablist">
      {options.map(o => (
        <button key={o.v} type="button" role="tab" aria-selected={value === o.v} data-on={value === o.v} onClick={() => onChange(o.v)}>{o.l}</button>
      ))}
    </div>
  );
}

export function Kpi({ label, valor, sub, icone, destaque }: { label: string; valor: ReactNode; sub?: ReactNode; icone?: ReactNode; destaque?: boolean }) {
  return (
    <div className="gd-card p-4 md:p-5 min-w-0" style={destaque ? { borderColor: "color-mix(in srgb, var(--red) 30%, var(--line))" } : undefined}>
      <div className="flex items-center justify-between gap-2">
        <p className="gd-label truncate">{label}</p>
        {icone && <span style={{ color: destaque ? "var(--red)" : "var(--faint)" }}>{icone}</span>}
      </div>
      <p className="mt-2 font-extrabold truncate" style={{ fontSize: "clamp(20px, 5.4vw, 28px)", letterSpacing: "-0.035em", color: "var(--ink)" }}>{valor}</p>
      {sub && <p className="mt-1 text-xs gd-muted truncate">{sub}</p>}
    </div>
  );
}

export function Secao({ titulo, acao, children, className = "" }: { titulo: ReactNode; acao?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`gd-card overflow-hidden ${className}`}>
      <header className="flex items-center justify-between gap-3 px-4 md:px-5 pt-4 pb-3">
        <h3 className="gd-h2 min-w-0 truncate">{titulo}</h3>
        {acao}
      </header>
      {children}
    </section>
  );
}

export function Campo({ label, valor, mono }: { label: string; valor: ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="gd-label" style={{ fontSize: 10.5 }}>{label}</p>
      <p className={`mt-0.5 text-sm font-semibold break-words ${mono ? "font-mono" : ""}`} style={{ color: "var(--ink)" }}>
        {valor === null || valor === undefined || valor === "" ? <span className="gd-muted font-normal">—</span> : valor}
      </p>
    </div>
  );
}

// ─── Gaveta (detalhe) e modal ────────────────────────────────────────────────

function usePortal() {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => { setEl(document.querySelector<HTMLElement>(".gd") ?? document.body); }, []);
  return el;
}

function useEsc(onClose: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", h); document.body.style.overflow = prev; };
  }, [onClose]);
}

/** Painel lateral no desktop; tela cheia (folha de baixo) no celular. */
export function Drawer({ onClose, titulo, sub, topo, children, largura = 620, z = 60 }: {
  onClose: () => void; titulo: ReactNode; sub?: ReactNode; topo?: ReactNode; children: ReactNode; largura?: number; z?: number;
}) {
  useEsc(onClose);
  const alvo = usePortal();
  if (!alvo) return null;
  return createPortal(
    <div className="fixed inset-0 flex md:justify-end" style={{ zIndex: z }} role="dialog" aria-modal="true">
      <div className="absolute inset-0" style={{ background: "var(--scrim)", backdropFilter: "blur(2px)" }} onClick={onClose} />
      <div className="gd-drawer relative flex flex-col w-full h-full md:h-auto md:my-3 md:mr-3 md:rounded-[22px] overflow-hidden"
        style={{ maxWidth: largura, marginLeft: "auto", background: "var(--bg)", boxShadow: "var(--sh2)", border: "1px solid var(--line)" }}>
        <header className="flex items-start gap-3 px-4 md:px-6 py-3 md:py-4 shrink-0"
          style={{ background: "var(--card)", borderBottom: "1px solid var(--line)", paddingTop: "max(12px, env(safe-area-inset-top))" }}>
          <div className="min-w-0 flex-1">
            <div className="gd-h2 truncate" style={{ fontSize: 18 }}>{titulo}</div>
            {sub && <div className="text-xs gd-muted mt-0.5 truncate">{sub}</div>}
          </div>
          <button className="gd-btn gd-btn-ghost gd-btn-sm" style={{ width: 36, padding: 0 }} onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </header>
        {topo}
        <div className="flex-1 overflow-y-auto gd-scroll px-3 md:px-6 py-4 md:py-5" style={{ paddingBottom: "max(24px, env(safe-area-inset-bottom))" }}>
          {children}
        </div>
      </div>
    </div>,
    alvo,
  );
}

export function Modal({ onClose, titulo, children, largura = 480, z = 80 }: { onClose: () => void; titulo: ReactNode; children: ReactNode; largura?: number; z?: number }) {
  useEsc(onClose);
  const alvo = usePortal();
  if (!alvo) return null;
  return createPortal(
    <div className="fixed inset-0 flex items-end md:items-center justify-center md:p-4" style={{ zIndex: z }} role="dialog" aria-modal="true">
      <div className="absolute inset-0" style={{ background: "var(--scrim)", backdropFilter: "blur(2px)" }} onClick={onClose} />
      <div className="gd-sheet relative w-full rounded-t-[22px] md:rounded-[22px] overflow-hidden flex flex-col"
        style={{ maxWidth: largura, maxHeight: "92dvh", background: "var(--card)", boxShadow: "var(--sh2)", border: "1px solid var(--line)" }}>
        <header className="flex items-center gap-3 px-5 py-4 shrink-0" style={{ borderBottom: "1px solid var(--line)" }}>
          <div className="gd-h2 flex-1 min-w-0 truncate">{titulo}</div>
          <button className="gd-btn gd-btn-ghost gd-btn-sm" style={{ width: 34, padding: 0 }} onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </header>
        <div className="overflow-y-auto gd-scroll p-5" style={{ paddingBottom: "max(20px, env(safe-area-inset-bottom))" }}>{children}</div>
      </div>
    </div>,
    alvo,
  );
}

// ─── Gráfico de barras (SVG, sem libs) ───────────────────────────────────────

export interface PontoSerie { dia: string; pedidos: number; faturamento: number }

/** Uma série por vez (sem eixo duplo): barras por dia com tooltip ao passar/tocar. */
export function GraficoDias({ serie, metrica, altura = 200 }: { serie: PontoSerie[]; metrica: "pedidos" | "faturamento"; altura?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 720, H = altura, padL = 44, padR = 8, padT = 12, padB = 26;
  const vals = serie.map(s => metrica === "pedidos" ? s.pedidos : s.faturamento);
  const max = Math.max(1, ...vals);
  // escala "bonita"
  const mag = Math.pow(10, Math.floor(Math.log10(max)));
  const topo = Math.ceil(max / mag) * mag;
  const n = Math.max(1, serie.length);
  const passo = (W - padL - padR) / n;
  const bw = Math.max(2, Math.min(22, passo - 2));
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / topo);
  const fmtV = (v: number) => metrica === "pedidos" ? fmtNum(v) : fmtBRLCurto(v);
  const fmtEixo = (v: number) => metrica === "pedidos" ? fmtNum(v) : v >= 1000 ? `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k` : String(Math.round(v));
  const rotDia = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
  const cadaRotulo = Math.ceil(n / 7);
  const h = hover !== null ? serie[hover] : null;

  return (
    <div className="relative w-full" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" role="img"
        aria-label={`Gráfico de ${metrica} por dia`} style={{ display: "block", overflow: "visible" }}>
        {[0, 0.5, 1].map(f => (
          <g key={f}>
            <line x1={padL} x2={W - padR} y1={y(topo * f)} y2={y(topo * f)} stroke="var(--line)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <text x={padL - 8} y={y(topo * f) + 4} textAnchor="end" fontSize={11} fill="var(--faint)">{fmtEixo(topo * f)}</text>
          </g>
        ))}
        {serie.map((s, i) => {
          const v = vals[i];
          const x = padL + i * passo + (passo - bw) / 2;
          const yy = y(v);
          const hh = Math.max(v > 0 ? 2 : 0, H - padB - yy);
          return (
            <g key={s.dia}>
              <rect x={padL + i * passo} y={padT} width={passo} height={H - padT - padB} fill="transparent"
                onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} style={{ cursor: "pointer" }} />
              <rect x={x} y={H - padB - hh} width={bw} height={hh} rx={Math.min(4, bw / 2)}
                fill={hover === i ? "var(--red-ink)" : "var(--red)"} opacity={hover === null || hover === i ? 1 : 0.45} pointerEvents="none" />
              {i % cadaRotulo === 0 && (
                <text x={padL + i * passo + passo / 2} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--faint)">{rotDia(s.dia)}</text>
              )}
            </g>
          );
        })}
      </svg>
      {h && (
        <div className="absolute pointer-events-none rounded-xl px-3 py-2 text-xs"
          style={{
            left: `clamp(0px, calc(${((padL + (hover! + 0.5) * passo) / W) * 100}% - 70px), calc(100% - 140px))`, top: -6,
            width: 140, background: "var(--ink)", color: "var(--card)", boxShadow: "var(--sh2)",
          }}>
          <p className="font-bold">{rotDia(h.dia)}</p>
          <p>{fmtNum(h.pedidos)} pedidos</p>
          <p>{fmtBRL(h.faturamento)}</p>
        </div>
      )}
      <span className="sr-only">{serie.map(s => `${rotDia(s.dia)}: ${fmtV(metrica === "pedidos" ? s.pedidos : s.faturamento)}`).join("; ")}</span>
    </div>
  );
}

// ─── Toast simples ───────────────────────────────────────────────────────────

export function useToast() {
  const [msg, setMsg] = useState<{ t: string; erro?: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((t: string, erro = false) => {
    setMsg({ t, erro });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 3200);
  }, []);
  const node = msg ? (
    <div className="fixed left-1/2 -translate-x-1/2 px-4 py-3 rounded-2xl text-sm font-semibold gd-fade"
      style={{ zIndex: 120, bottom: "calc(84px + env(safe-area-inset-bottom))", background: msg.erro ? "var(--red)" : "var(--ink)", color: msg.erro ? "#fff" : "var(--card)", boxShadow: "var(--sh2)", maxWidth: "calc(100vw - 32px)" }}>
      {msg.t}
    </div>
  ) : null;
  return { show, node };
}
