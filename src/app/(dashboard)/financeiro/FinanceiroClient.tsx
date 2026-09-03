"use client";

import { useState } from "react";
import { DollarSign, TrendingUp, Bike, ArrowDownRight, Download, Clock, CheckCircle, Package } from "lucide-react";
import type { Pedido, Motoboy } from "@/types";

type Period = "semana" | "mes" | "tudo";

interface Props {
  pedidos: Pedido[];
  motoboys: Motoboy[];
}

function periodStart(p: Period): Date | null {
  const now = new Date();
  if (p === "semana") return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  if (p === "mes")    return new Date(now.getFullYear(), now.getMonth(), 1);
  return null;
}

function exportCSV(pedidos: Pedido[]) {
  const header = ["Data", "Cliente", "Endereço", "Itens", "Valor Pedido", "Valor Motoboy", "Status", "Motoboy"];
  const rows = pedidos.map((p) => [
    new Date(p.created_at).toLocaleDateString("pt-BR"),
    p.cliente_nome,
    `"${p.endereco_entrega}"`,
    `"${p.descricao_itens ?? ""}"`,
    p.valor_pedido.toFixed(2).replace(".", ","),
    p.valor_motoboy.toFixed(2).replace(".", ","),
    p.status,
    p.motoboy?.nome ?? "-",
  ]);
  const csv = [header, ...rows].map((r) => r.join(";")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `pedidos-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function FinanceiroClient({ pedidos: allPedidos, motoboys }: Props) {
  const [period, setPeriod] = useState<Period>("mes");

  const start = periodStart(period);
  const pedidos = allPedidos.filter((p) => {
    if (p.status !== "entregue") return false;
    if (!start) return true;
    return new Date(p.created_at) >= start;
  });

  const receita     = pedidos.reduce((s, p) => s + p.valor_pedido, 0);
  const custoMoto   = pedidos.reduce((s, p) => s + p.valor_motoboy, 0);
  const margem      = receita - custoMoto;
  const ticketMedio = pedidos.length > 0 ? receita / pedidos.length : 0;

  // Operacional
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const amanha = new Date(hoje); amanha.setDate(amanha.getDate() + 1);
  const entregasHoje = allPedidos.filter(p =>
    p.status === "entregue" &&
    new Date(p.created_at) >= hoje && new Date(p.created_at) < amanha
  );
  const receitaHoje = entregasHoje.reduce((s, p) => s + p.valor_pedido, 0);

  const temposMin = pedidos
    .filter(p => p.status === "entregue")
    .map(p => (new Date(p.updated_at).getTime() - new Date(p.created_at).getTime()) / 60000)
    .filter(t => t > 0 && t < 300);
  const tempoMedioMin = temposMin.length > 0
    ? Math.round(temposMin.reduce((s, t) => s + t, 0) / temposMin.length)
    : null;

  const cancelados = allPedidos.filter(p => {
    if (p.status !== "cancelado") return false;
    if (!start) return true;
    return new Date(p.created_at) >= start;
  });
  const totalFinalizado = pedidos.length + cancelados.length;
  const taxaSucesso = totalFinalizado > 0 ? Math.round((pedidos.length / totalFinalizado) * 100) : null;

  // Por motoboy
  const porMotoboy = motoboys.map((m) => {
    const entregas   = pedidos.filter((p) => p.motoboy_id === m.id);
    const canceladosM = cancelados.filter(p => p.motoboy_id === m.id);
    const totalM     = entregas.length + canceladosM.length;
    return {
      motoboy: m,
      quantidade: entregas.length,
      ganhos: entregas.reduce((s, p) => s + p.valor_motoboy, 0),
      taxa: totalM > 0 ? Math.round((entregas.length / totalM) * 100) : null,
    };
  }).filter((r) => r.quantidade > 0)
    .sort((a, b) => b.quantidade - a.quantidade);

  // Por dia (últimos 7 dias para sparkline)
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    d.setHours(0, 0, 0, 0);
    const next = new Date(d); next.setDate(next.getDate() + 1);
    const count = allPedidos.filter((p) => p.status === "entregue" && new Date(p.created_at) >= d && new Date(p.created_at) < next).length;
    return { label: d.toLocaleDateString("pt-BR", { weekday: "short" }), count };
  });
  const maxDay = Math.max(...last7.map((d) => d.count), 1);

  const PERIODS: { key: Period; label: string }[] = [
    { key: "semana", label: "7 dias" },
    { key: "mes",    label: "Este mês" },
    { key: "tudo",   label: "Tudo" },
  ];

  const cards = [
    { label: "Receita bruta",    value: `R$ ${receita.toFixed(2)}`,      icon: TrendingUp,     color: "#22c55e", bg: "rgba(34,197,94,0.08)"   },
    { label: "Pago a motoboys",  value: `R$ ${custoMoto.toFixed(2)}`,    icon: Bike,           color: "#fbbf24", bg: "rgba(251,191,36,0.08)"  },
    { label: "Margem",           value: `R$ ${margem.toFixed(2)}`,       icon: DollarSign,     color: "#60a5fa", bg: "rgba(96,165,250,0.08)"  },
    { label: "Ticket médio",     value: `R$ ${ticketMedio.toFixed(2)}`,  icon: ArrowDownRight, color: "#a78bfa", bg: "rgba(167,139,250,0.08)" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6" style={{ background: "var(--bg-base)", minHeight: "100%" }}>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-1)" }}>Financeiro</h1>
          <p className="text-sm mt-1" style={{ color: "#64748b" }}>
            {pedidos.length} entrega{pedidos.length !== 1 ? "s" : ""} no período
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Period selector */}
          <div className="flex gap-1 p-1 rounded-xl" style={{ background: "var(--bg-1)", border: "1px solid var(--border-1)" }}>
            {PERIODS.map(({ key, label }) => (
              <button key={key} onClick={() => setPeriod(key)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={period === key
                  ? { background: "rgba(168,0,33,0.2)", color: "#E4002B" }
                  : { color: "#64748b" }}>
                {label}
              </button>
            ))}
          </div>
          {/* Export */}
          <button
            onClick={() => exportCSV(pedidos)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all"
            style={{ background: "rgba(96,165,250,0.1)", color: "#60a5fa", border: "1px solid rgba(96,165,250,0.2)" }}
          >
            <Download size={14} /> Exportar CSV
          </button>
        </div>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="rounded-2xl p-5"
            style={{ background: bg, border: `1px solid ${color}22` }}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs uppercase tracking-wide font-semibold" style={{ color: color + "aa" }}>{label}</p>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: color + "22" }}>
                <Icon size={15} style={{ color }} />
              </div>
            </div>
            <p className="text-2xl font-black" style={{ color: "var(--text-1)" }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Cards operacionais */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-2xl p-5" style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.18)" }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs uppercase tracking-wide font-semibold" style={{ color: "#fbbf24aa" }}>Entregas hoje</p>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(251,191,36,0.18)" }}>
              <Package size={15} style={{ color: "#fbbf24" }} />
            </div>
          </div>
          <p className="text-2xl font-black" style={{ color: "var(--text-1)" }}>{entregasHoje.length}</p>
          {receitaHoje > 0 && (
            <p className="text-xs mt-1" style={{ color: "#64748b" }}>R$ {receitaHoje.toFixed(2)}</p>
          )}
        </div>

        <div className="rounded-2xl p-5" style={{ background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.18)" }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs uppercase tracking-wide font-semibold" style={{ color: "#60a5faaa" }}>Tempo médio</p>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(96,165,250,0.18)" }}>
              <Clock size={15} style={{ color: "#60a5fa" }} />
            </div>
          </div>
          <p className="text-2xl font-black" style={{ color: "var(--text-1)" }}>
            {tempoMedioMin !== null ? `${tempoMedioMin} min` : "—"}
          </p>
          <p className="text-xs mt-1" style={{ color: "#64748b" }}>do pedido à entrega</p>
        </div>

        <div className="rounded-2xl p-5" style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.18)" }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs uppercase tracking-wide font-semibold" style={{ color: "#22c55eaa" }}>Taxa de sucesso</p>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(34,197,94,0.18)" }}>
              <CheckCircle size={15} style={{ color: "#22c55e" }} />
            </div>
          </div>
          <p className="text-2xl font-black" style={{ color: "var(--text-1)" }}>
            {taxaSucesso !== null ? `${taxaSucesso}%` : "—"}
          </p>
          <p className="text-xs mt-1" style={{ color: "#64748b" }}>entregues vs cancelados</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Gráfico de barras — últimos 7 dias */}
        <div className="lg:col-span-2 rounded-2xl p-5" style={{ background: "var(--bg-2)", border: "1px solid var(--border-1)" }}>
          <h2 className="font-semibold mb-5 text-sm" style={{ color: "var(--text-1)" }}>Entregas — últimos 7 dias</h2>
          <div className="flex items-end gap-2 h-32">
            {last7.map(({ label, count }) => (
              <div key={label} className="flex-1 flex flex-col items-center gap-2">
                <span className="text-xs font-bold" style={{ color: "#475569" }}>{count || ""}</span>
                <div className="w-full rounded-t-lg transition-all"
                  style={{
                    height: `${(count / maxDay) * 96}px`,
                    minHeight: count > 0 ? "6px" : "2px",
                    background: count > 0
                      ? "linear-gradient(180deg, #E4002B, #a84400)"
                      : "#1a1a1a",
                  }}
                />
                <span className="text-xs capitalize" style={{ color: "#374151" }}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Por motoboy */}
        <div className="rounded-2xl p-5" style={{ background: "var(--bg-2)", border: "1px solid var(--border-1)" }}>
          <h2 className="font-semibold mb-4 text-sm" style={{ color: "var(--text-1)" }}>Por motoboy</h2>
          {porMotoboy.length === 0 ? (
            <p className="text-xs py-8 text-center" style={{ color: "#374151" }}>
              Sem entregas no período
            </p>
          ) : (
            <div className="space-y-3">
              {porMotoboy.map(({ motoboy, quantidade, ganhos, taxa }, i) => (
                <div key={motoboy.id} className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                    style={{ background: i === 0 ? "rgba(251,191,36,0.15)" : "#1a1a1a", color: i === 0 ? "#fbbf24" : "#475569" }}>
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: "var(--text-1)" }}>{motoboy.nome}</p>
                    <p className="text-xs" style={{ color: "#475569" }}>
                      {quantidade} entrega{quantidade !== 1 ? "s" : ""}
                      {taxa !== null && <span style={{ color: taxa >= 90 ? "#22c55e" : taxa >= 70 ? "#fbbf24" : "#E4002B" }}> · {taxa}%</span>}
                    </p>
                  </div>
                  <span className="text-sm font-bold shrink-0" style={{ color: "#fbbf24" }}>
                    R${ganhos.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Total entregas por status no período (todos os pedidos, não só entregues) */}
      <div className="rounded-2xl p-4 md:p-5" style={{ background: "var(--bg-2)", border: "1px solid var(--border-1)" }}>
        <h2 className="font-semibold mb-4 text-sm" style={{ color: "var(--text-1)" }}>Todos os pedidos no período</h2>

        {/* Cards mobile */}
        <div className="space-y-2 md:hidden">
          {pedidos.slice(0, 20).map((p) => (
            <div key={p.id} className="rounded-xl p-3" style={{ background: "var(--bg-base)", border: "1px solid var(--border-1)" }}>
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <span className="font-semibold text-sm truncate" style={{ color: "var(--text-1)" }}>{p.cliente_nome}</span>
                <span className="text-xs px-2 py-0.5 rounded-full font-medium shrink-0"
                  style={{
                    background: p.status === "entregue" ? "rgba(34,197,94,0.1)" : "rgba(251,191,36,0.1)",
                    color: p.status === "entregue" ? "#4ade80" : "#fbbf24",
                  }}>
                  {p.status}
                </span>
              </div>
              {p.descricao_itens && (
                <p className="text-xs truncate mb-1.5" style={{ color: "var(--text-4)" }}>{p.descricao_itens}</p>
              )}
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: "#64748b" }}>
                  {new Date(p.created_at).toLocaleDateString("pt-BR")} · {p.motoboy?.nome ?? "—"}
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold" style={{ color: "#22c55e" }}>R${p.valor_pedido.toFixed(2)}</span>
                  <span className="text-xs font-semibold" style={{ color: "#fbbf24" }}>+R${p.valor_motoboy.toFixed(2)}</span>
                </div>
              </div>
            </div>
          ))}
          {pedidos.length > 20 && (
            <p className="text-xs text-center pt-1" style={{ color: "#374151" }}>
              Exibindo 20 de {pedidos.length} — exporte o CSV para ver todos
            </p>
          )}
        </div>

        {/* Tabela desktop */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-1)" }}>
                {["Data", "Cliente", "Itens", "Valor Pedido", "Motoboy", "Ganho Motoboy", "Status"].map((h) => (
                  <th key={h} className="text-left pb-3 pr-4 text-xs font-semibold uppercase tracking-wide"
                    style={{ color: "#374151" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pedidos.slice(0, 20).map((p) => (
                <tr key={p.id} style={{ borderBottom: "1px solid #111" }}>
                  <td className="py-2.5 pr-4 text-xs" style={{ color: "#64748b" }}>
                    {new Date(p.created_at).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="py-2.5 pr-4 font-medium" style={{ color: "var(--text-1)" }}>{p.cliente_nome}</td>
                  <td className="py-2.5 pr-4 text-xs max-w-32 truncate" style={{ color: "#64748b" }}>
                    {p.descricao_itens ?? "—"}
                  </td>
                  <td className="py-2.5 pr-4 font-semibold" style={{ color: "var(--text-1)" }}>R${p.valor_pedido.toFixed(2)}</td>
                  <td className="py-2.5 pr-4 text-xs" style={{ color: "#475569" }}>
                    {p.motoboy?.nome ?? "—"}
                  </td>
                  <td className="py-2.5 pr-4 text-xs font-semibold" style={{ color: "#fbbf24" }}>
                    R${p.valor_motoboy.toFixed(2)}
                  </td>
                  <td className="py-2.5">
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{
                        background: p.status === "entregue" ? "rgba(34,197,94,0.1)" : "rgba(251,191,36,0.1)",
                        color: p.status === "entregue" ? "#4ade80" : "#fbbf24",
                      }}>
                      {p.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {pedidos.length > 20 && (
            <p className="text-xs mt-3 text-center" style={{ color: "#374151" }}>
              Exibindo 20 de {pedidos.length} — exporte o CSV para ver todos
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

