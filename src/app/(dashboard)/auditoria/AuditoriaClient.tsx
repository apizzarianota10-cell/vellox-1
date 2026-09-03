"use client";

import { useState } from "react";
import { Shield, Package, Trash2, RotateCcw, Users, UserMinus, ChevronDown } from "lucide-react";

interface LogEntry {
  id: string;
  acao: string;
  descricao: string;
  meta: Record<string, unknown> | null;
  created_at: string;
}

interface Props {
  logs: LogEntry[];
}

const ACAO_CFG: Record<string, { label: string; color: string; bg: string; Icon: React.ElementType }> = {
  pedido_criado:       { label: "Pedido criado",    color: "#22c55e", bg: "rgba(34,197,94,0.1)",   Icon: Package },
  pedido_excluido:     { label: "Pedido excluído",  color: "#E4002B", bg: "rgba(228,0,43,0.1)",   Icon: Trash2 },
  status_atualizado:   { label: "Status atualizado",color: "#60a5fa", bg: "rgba(96,165,250,0.1)",  Icon: RotateCcw },
  motoboy_cadastrado:  { label: "Motoboy cadastrado",color: "#fbbf24", bg: "rgba(251,191,36,0.1)", Icon: Users },
  motoboy_removido:    { label: "Motoboy removido", color: "#E4002B", bg: "rgba(228,0,43,0.1)",  Icon: UserMinus },
};

const FILTROS = [
  { key: "todos",             label: "Todos" },
  { key: "pedido_criado",     label: "Pedidos criados" },
  { key: "pedido_excluido",   label: "Pedidos excluídos" },
  { key: "status_atualizado", label: "Status atualizados" },
  { key: "motoboy_cadastrado",label: "Motoboys cadastrados" },
  { key: "motoboy_removido",  label: "Motoboys removidos" },
];

function timeAgo(d: string) {
  const diff = (Date.now() - new Date(d).getTime()) / 1000;
  if (diff < 60)     return "agora";
  if (diff < 3600)   return `${Math.floor(diff / 60)}min atrás`;
  if (diff < 86400)  return `${Math.floor(diff / 3600)}h atrás`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d atrás`;
  return new Date(d).toLocaleDateString("pt-BR");
}

export default function AuditoriaClient({ logs }: Props) {
  const [filtro, setFiltro]   = useState("todos");
  const [visivel, setVisivel] = useState(30);
  const [expandido, setExpandido] = useState<string | null>(null);

  const filtrados = filtro === "todos" ? logs : logs.filter(l => l.acao === filtro);
  const exibidos  = filtrados.slice(0, visivel);

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6" style={{ background: "var(--bg-base)", minHeight: "100%" }}>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-1)" }}>Auditoria</h1>
          <p className="text-sm mt-1" style={{ color: "#64748b" }}>
            {filtrados.length} registro{filtrados.length !== 1 ? "s" : ""} encontrado{filtrados.length !== 1 ? "s" : ""}
          </p>
        </div>
        {/* Filtro */}
        <div className="flex gap-1 p-1 rounded-xl flex-wrap" style={{ background: "var(--bg-1)", border: "1px solid var(--border-1)" }}>
          {FILTROS.map(({ key, label }) => (
            <button key={key} onClick={() => { setFiltro(key); setVisivel(30); }}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap"
              style={filtro === key
                ? { background: "rgba(168,0,33,0.2)", color: "#E4002B" }
                : { color: "#64748b" }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-2)", border: "1px solid var(--border-1)" }}>
        {exibidos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{ background: "rgba(228,0,43,0.08)" }}>
              <Shield size={22} style={{ color: "#E4002B" }} />
            </div>
            <p className="text-sm font-medium" style={{ color: "#64748b" }}>Nenhum registro encontrado</p>
          </div>
        ) : (
          <>
            {exibidos.map((entry, i) => {
              const cfg = ACAO_CFG[entry.acao] ?? { label: entry.acao, color: "#64748b", bg: "rgba(100,116,139,0.1)", Icon: Shield };
              const { Icon } = cfg;
              const hasMeta = entry.meta && Object.keys(entry.meta).length > 0;
              const isOpen  = expandido === entry.id;

              return (
                <div key={entry.id} style={{ borderBottom: i < exibidos.length - 1 ? "1px solid var(--border-1)" : "none" }}>
                  <div className="flex items-start gap-3 px-4 py-3.5">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                      style={{ background: cfg.bg }}>
                      <Icon size={14} style={{ color: cfg.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                          style={{ background: cfg.bg, color: cfg.color }}>
                          {cfg.label}
                        </span>
                        <span className="text-xs" style={{ color: "#64748b" }}>{timeAgo(entry.created_at)}</span>
                        <span className="text-xs hidden sm:inline" style={{ color: "#374151" }}>
                          {new Date(entry.created_at).toLocaleString("pt-BR")}
                        </span>
                      </div>
                      <p className="text-sm mt-1 leading-snug" style={{ color: "var(--text-1)" }}>{entry.descricao}</p>
                    </div>
                    {hasMeta && (
                      <button onClick={() => setExpandido(isOpen ? null : entry.id)}
                        className="shrink-0 mt-1" style={{ color: "#64748b" }}>
                        <ChevronDown size={14} style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
                      </button>
                    )}
                  </div>
                  {isOpen && hasMeta && (
                    <div className="px-4 pb-3 ml-11">
                      <pre className="text-xs rounded-xl p-3 overflow-x-auto"
                        style={{ background: "var(--bg-base)", color: "#64748b", border: "1px solid var(--border-1)" }}>
                        {JSON.stringify(entry.meta, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
            {filtrados.length > visivel && (
              <div className="px-4 py-3" style={{ borderTop: "1px solid var(--border-1)" }}>
                <button onClick={() => setVisivel(v => v + 30)}
                  className="w-full py-2 rounded-xl text-sm font-semibold transition-all"
                  style={{ background: "var(--bg-base)", color: "#64748b", border: "1px solid var(--border-1)" }}>
                  Carregar mais ({filtrados.length - visivel} restantes)
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
