"use client";

import { useMemo, useState } from "react";
import { Search, Plus, ChevronRight, Bike, ShoppingBag } from "lucide-react";
import {
  Avatar, PlanoBadge, StatusAssinatura, Vazio, Aviso,
  fmtData, fmtNum, assinaturaVigente, diasRestantes, PLANOS, PLANO_LABEL,
  type EmpresaRow, type Plano,
} from "./ui";

type Filtro = "todas" | "ativas" | "inativas" | "vencendo" | "vencidas";
type Ordem = "recentes" | "antigas" | "nome" | "pedidos" | "motoboys" | "expira";

export default function Lojas({ empresas, error, abrirLoja, onNova }: {
  empresas: EmpresaRow[]; error: string | null; abrirLoja: (id: string) => void; onNova: () => void;
}) {
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [plano, setPlano] = useState<"" | Plano>("");
  const [ordem, setOrdem] = useState<Ordem>("recentes");

  const contagem = useMemo(() => {
    const c = { todas: empresas.length, ativas: 0, inativas: 0, vencendo: 0, vencidas: 0 };
    for (const e of empresas) {
      const vig = assinaturaVigente(e);
      const d = diasRestantes(e.assinatura_expira_em);
      if (vig) c.ativas++; else c.inativas++;
      if (vig && d !== null && d <= 7) c.vencendo++;
      if (e.assinatura_ativa && !vig) c.vencidas++;
    }
    return c;
  }, [empresas]);

  const lista = useMemo(() => {
    const t = q.trim().toLowerCase();
    const out = empresas.filter(e => {
      if (plano && (e.plano ?? "basic") !== plano) return false;
      const vig = assinaturaVigente(e);
      const d = diasRestantes(e.assinatura_expira_em);
      if (filtro === "ativas" && !vig) return false;
      if (filtro === "inativas" && vig) return false;
      if (filtro === "vencendo" && !(vig && d !== null && d <= 7)) return false;
      if (filtro === "vencidas" && !(e.assinatura_ativa && !vig)) return false;
      if (!t) return true;
      return e.nome.toLowerCase().includes(t) || (e.email ?? "").toLowerCase().includes(t)
        || (e.cnpj ?? "").includes(t) || (e.codigo ?? "").toLowerCase().includes(t);
    });
    const exp = (e: EmpresaRow) => e.assinatura_expira_em ? new Date(e.assinatura_expira_em).getTime() : Infinity;
    out.sort((a, b) => {
      switch (ordem) {
        case "antigas": return a.created_at.localeCompare(b.created_at);
        case "nome": return a.nome.localeCompare(b.nome, "pt-BR");
        case "pedidos": return Number(b.total_pedidos) - Number(a.total_pedidos);
        case "motoboys": return Number(b.total_motoboys) - Number(a.total_motoboys);
        case "expira": return exp(a) - exp(b);
        default: return b.created_at.localeCompare(a.created_at);
      }
    });
    return out;
  }, [empresas, q, filtro, plano, ordem]);

  const FILTROS: { v: Filtro; l: string }[] = [
    { v: "todas", l: "Todas" }, { v: "ativas", l: "Ativas" }, { v: "inativas", l: "Inativas" },
    { v: "vencendo", l: "Vencendo" }, { v: "vencidas", l: "Vencidas" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--faint)" }} />
          <input className="gd-input" style={{ paddingLeft: 36 }} placeholder="Buscar por nome, e-mail, CNPJ ou código"
            value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <select className="gd-input md:w-40" value={plano} onChange={e => setPlano(e.target.value as Plano | "")} aria-label="Plano">
            <option value="">Todos os planos</option>
            {PLANOS.map(p => <option key={p} value={p}>{PLANO_LABEL[p]}</option>)}
          </select>
          <select className="gd-input md:w-44" value={ordem} onChange={e => setOrdem(e.target.value as Ordem)} aria-label="Ordenar">
            <option value="recentes">Mais recentes</option>
            <option value="antigas">Mais antigas</option>
            <option value="nome">Nome (A–Z)</option>
            <option value="pedidos">Mais pedidos</option>
            <option value="motoboys">Mais motoboys</option>
            <option value="expira">Vence primeiro</option>
          </select>
          <button className="gd-btn gd-btn-red shrink-0" onClick={onNova} style={{ height: 40 }}>
            <Plus size={16} /> <span className="hidden sm:inline">Nova loja</span>
          </button>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto gd-scroll pb-1" style={{ scrollbarWidth: "none" }}>
        {FILTROS.map(f => (
          <button key={f.v} className="gd-chip" data-on={filtro === f.v} onClick={() => setFiltro(f.v)}>
            {f.l} <span style={{ opacity: 0.6 }}>{contagem[f.v]}</span>
          </button>
        ))}
      </div>

      {error && <Aviso tom="red" titulo="Erro ao carregar empresas">{error}</Aviso>}

      <div className="gd-card overflow-hidden">
        <div className="hidden lg:grid px-5 py-2.5 gd-label" style={{ gridTemplateColumns: "minmax(0,2.2fr) 110px 130px 90px 90px 110px 20px", gap: 12, borderBottom: "1px solid var(--line)", fontSize: 10.5 }}>
          <span>Loja</span><span>Plano</span><span>Assinatura</span><span className="text-right">Pedidos</span><span className="text-right">Motoboys</span><span>Criada</span><span />
        </div>
        {lista.length === 0 ? <Vazio texto="Nenhuma loja encontrada." /> : (
          <ul className="gd-divide">
            {lista.map(e => {
              const d = diasRestantes(e.assinatura_expira_em);
              return (
                <li key={e.id} className="gd-row" onClick={() => abrirLoja(e.id)}>
                  {/* Desktop */}
                  <div className="hidden lg:grid items-center px-5 py-3" style={{ gridTemplateColumns: "minmax(0,2.2fr) 110px 130px 90px 90px 110px 20px", gap: 12 }}>
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar nome={e.nome} size={38} quadrado />
                      <div className="min-w-0">
                        <p className="text-sm font-bold truncate">{e.nome}</p>
                        <p className="text-xs gd-muted truncate">{e.email}</p>
                      </div>
                    </div>
                    <span><PlanoBadge plano={e.plano} /></span>
                    <div>
                      <StatusAssinatura e={e} />
                      {e.assinatura_expira_em && <p className="text-[11px] gd-muted mt-0.5">até {fmtData(e.assinatura_expira_em)}</p>}
                    </div>
                    <span className="text-sm font-bold text-right">{fmtNum(e.total_pedidos)}</span>
                    <span className="text-sm font-bold text-right">{fmtNum(e.total_motoboys)}</span>
                    <span className="text-xs gd-muted">{fmtData(e.created_at)}</span>
                    <ChevronRight size={16} style={{ color: "var(--faint)" }} />
                  </div>
                  {/* Celular / tablet */}
                  <div className="lg:hidden flex items-center gap-3 px-4 py-3">
                    <Avatar nome={e.nome} size={42} quadrado />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <p className="text-sm font-bold truncate">{e.nome}</p>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <PlanoBadge plano={e.plano} />
                        <StatusAssinatura e={e} />
                      </div>
                      <p className="text-xs gd-muted mt-1 flex items-center gap-3">
                        <span className="inline-flex items-center gap-1"><ShoppingBag size={12} /> {fmtNum(e.total_pedidos)}</span>
                        <span className="inline-flex items-center gap-1"><Bike size={12} /> {fmtNum(e.total_motoboys)}</span>
                        {e.assinatura_expira_em && d !== null && d > 0 && <span>{d}d restantes</span>}
                      </p>
                    </div>
                    <ChevronRight size={18} style={{ color: "var(--faint)" }} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <p className="text-xs gd-muted text-center">{lista.length} de {empresas.length} lojas</p>
    </div>
  );
}
