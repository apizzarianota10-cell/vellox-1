"use client";

import { useMemo, useState } from "react";
import { Search, ChevronRight, RefreshCw } from "lucide-react";
import {
  Avatar, StatusMotoboy, Kpi, Carregando, Vazio, Aviso, useJson, fmtBRL, fmtNum, type MotoboyGod,
} from "./ui";

type St = "todos" | "disponivel" | "em_entrega" | "offline";
type Ordem = "status" | "nome" | "entregas" | "ganho" | "hoje" | "recentes";

export default function Motoboys({ abrirMotoboy }: { abrirMotoboy: (id: string) => void }) {
  const { data, loading, error, reload } = useJson<MotoboyGod[]>("/api/god/all-motoboys");
  const [q, setQ] = useState("");
  const [st, setSt] = useState<St>("todos");
  const [ordem, setOrdem] = useState<Ordem>("status");
  const todos = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  const lista = useMemo(() => {
    const t = q.trim().toLowerCase();
    const out = todos.filter(m => {
      if (st !== "todos" && m.status !== st) return false;
      if (!t) return true;
      return m.nome.toLowerCase().includes(t) || (m.empresa_nome ?? "").toLowerCase().includes(t)
        || (m.telefone ?? "").includes(t) || (m.codigo ?? "").toLowerCase().includes(t) || (m.email ?? "").toLowerCase().includes(t);
    });
    if (ordem !== "status") {
      out.sort((a, b) => {
        switch (ordem) {
          case "nome": return a.nome.localeCompare(b.nome, "pt-BR");
          case "entregas": return Number(b.total_entregas) - Number(a.total_entregas);
          case "ganho": return Number(b.ganho_total) - Number(a.ganho_total);
          case "hoje": return Number(b.entregas_hoje) - Number(a.entregas_hoje);
          default: return String(b.created_at).localeCompare(String(a.created_at));
        }
      });
    }
    return out;
  }, [todos, q, st, ordem]);

  const c = useMemo(() => ({
    todos: todos.length,
    disponivel: todos.filter(m => m.status === "disponivel").length,
    em_entrega: todos.filter(m => m.status === "em_entrega").length,
    offline: todos.filter(m => m.status === "offline").length,
    ganhoHoje: todos.reduce((s, m) => s + Number(m.ganho_hoje || 0), 0),
    entregasHoje: todos.reduce((s, m) => s + Number(m.entregas_hoje || 0), 0),
  }), [todos]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Cadastrados" valor={fmtNum(c.todos)} />
        <Kpi label="Online agora" valor={fmtNum(c.disponivel + c.em_entrega)} sub={`${c.em_entrega} em entrega`} />
        <Kpi label="Entregas hoje" valor={fmtNum(c.entregasHoje)} />
        <Kpi destaque label="Ganhos hoje" valor={fmtBRL(c.ganhoHoje)} />
      </div>

      <div className="flex flex-col md:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--faint)" }} />
          <input className="gd-input" style={{ paddingLeft: 36 }} placeholder="Nome, loja, telefone, e-mail ou código" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <select className="gd-input md:w-48" value={ordem} onChange={e => setOrdem(e.target.value as Ordem)} aria-label="Ordenar">
            <option value="status">Status (em entrega 1º)</option>
            <option value="entregas">Mais entregas</option>
            <option value="ganho">Maiores ganhos</option>
            <option value="hoje">Mais entregas hoje</option>
            <option value="nome">Nome (A–Z)</option>
            <option value="recentes">Cadastro recente</option>
          </select>
          <button className="gd-btn shrink-0" style={{ height: 40, width: 40, padding: 0 }} onClick={reload} aria-label="Atualizar">
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
        {([["todos", "Todos"], ["disponivel", "Disponíveis"], ["em_entrega", "Em entrega"], ["offline", "Offline"]] as [St, string][]).map(([v, l]) => (
          <button key={v} className="gd-chip" data-on={st === v} onClick={() => setSt(v)}>{l} <span style={{ opacity: 0.6 }}>{c[v]}</span></button>
        ))}
      </div>

      {error && <Aviso tom="red" titulo="Erro ao carregar motoboys">{error}</Aviso>}

      <div className="gd-card overflow-hidden">
        {loading && !data ? <Carregando texto="Carregando motoboys..." /> : lista.length === 0 ? <Vazio texto="Nenhum motoboy encontrado." /> : (
          <ul className="gd-divide">
            {lista.map(m => (
              <li key={m.id} className="gd-row flex items-center gap-3 px-4 md:px-5 py-3" onClick={() => abrirMotoboy(m.id)}>
                <Avatar nome={m.nome} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="text-sm font-bold truncate">{m.nome}</p>
                    {m.codigo && <span className="hidden sm:inline font-mono text-[11px] px-1.5 rounded" style={{ background: "var(--soft)", color: "var(--muted)" }}>{m.codigo}</span>}
                  </div>
                  <p className="text-xs gd-muted truncate">{m.empresa_nome ?? "Sem loja principal"} · {m.telefone}</p>
                  <div className="sm:hidden mt-1"><StatusMotoboy status={m.status} /></div>
                </div>
                <div className="hidden sm:block"><StatusMotoboy status={m.status} /></div>
                <div className="text-right shrink-0 w-[92px] md:w-[130px]">
                  <p className="text-sm font-extrabold">{fmtNum(m.total_entregas)} <span className="text-xs gd-muted font-semibold">entr.</span></p>
                  <p className="text-xs gd-muted">{fmtBRL(m.ganho_total)}</p>
                  {Number(m.entregas_hoje) > 0 && <p className="text-[11px] font-bold" style={{ color: "var(--ok)" }}>+{m.entregas_hoje} hoje</p>}
                </div>
                <ChevronRight size={16} className="hidden md:block" style={{ color: "var(--faint)" }} />
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-xs gd-muted text-center">{lista.length} de {todos.length} motoboys</p>
    </div>
  );
}
