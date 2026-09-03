import { createClient } from "@/lib/supabase/server";
import {
  Package, Users, Bike, CheckCircle, TrendingUp, Clock,
  Map as MapIcon, ArrowRight, DollarSign, Flame, TrendingDown, BarChart2, Trophy,
  Timer as TimerIcon,
} from "lucide-react";
import Link from "next/link";
import CodigoCopy from "@/components/dashboard/CodigoCopy";
import DbError from "@/components/DbError";
import type { Pedido, Motoboy } from "@/types";

interface DashboardStats {
  total: number; emRota: number; entregues: number; pendentes: number; emPreparo: number;
  faturamento: number; lucroMotoboys: number; totalHoje: number; entreguesHoje: number;
  canceladosHoje: number; faturamentoHoje: number; tempoMedioMin: number | null;
  rankingHoje: { nome: string; count: number; ganho: number }[];
}

async function getStats(empresaId: string) {
  const supabase = await createClient();
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const hojeISO = hoje.toISOString();

  // Contagens/somas de todos os pedidos são calculadas no banco (get_dashboard_stats)
  // — só os últimos 8 pedidos e a lista de motoboys precisam vir inteiros pra cá.
  const [statsRes, motoboysRes, recentesRes] = await Promise.all([
    supabase.rpc("get_dashboard_stats", { p_empresa_id: empresaId }),
    supabase.from("motoboys").select("*").eq("empresa_id", empresaId),
    supabase.from("pedidos").select("*").eq("empresa_id", empresaId).order("created_at", { ascending: false }).limit(8),
  ]);

  if (statsRes.error || motoboysRes.error || recentesRes.error) return null;

  const s = statsRes.data as DashboardStats;
  const m = (motoboysRes.data ?? []) as Motoboy[];

  return {
    total:                s.total,
    emRota:               s.emRota,
    entregues:            s.entregues,
    pendentes:            s.pendentes,
    emPreparo:            s.emPreparo,
    motoboyDisponiveis:   m.filter((x) => x.status === "disponivel").length,
    motoboyEmEntrega:     m.filter((x) => x.status === "em_entrega").length,
    motoboyTotal:         m.length,
    pedidosRecentes:      (recentesRes.data ?? []) as Pedido[],
    motoboys:             m,
    faturamento:          s.faturamento,
    lucroMotoboys:        s.lucroMotoboys,
    totalHoje:            s.totalHoje,
    entreguesHoje:        s.entreguesHoje,
    canceladosHoje:       s.canceladosHoje,
    faturamentoHoje:      s.faturamentoHoje,
    tempoMedioMin:        s.tempoMedioMin,
    rankingHoje:          s.rankingHoje ?? [],
    hojeISO,
  };
}

const STATUS_CFG: Record<string, { label: string; color: string; dot: string; bg: string }> = {
  em_fila:                { label: "Na fila",    color: "#64748b", dot: "#94a3b8",  bg: "rgba(148,163,184,0.12)" },
  em_preparo:             { label: "Em preparo", color: "#d97706", dot: "#f59e0b",  bg: "rgba(245,158,11,0.15)" },
  finalizado:             { label: "Finalizado", color: "#2563eb", dot: "#3b82f6",  bg: "rgba(59,130,246,0.12)" },
  em_coleta:              { label: "Coleta",     color: "#A80021", dot: "#E4002B",  bg: "rgba(228,0,43,0.12)" },
  em_rota_de_entrega:     { label: "Em rota",    color: "#7c3aed", dot: "#8b5cf6",  bg: "rgba(139,92,246,0.12)" },
  aguardando_confirmacao: { label: "Confirmar",  color: "#d97706", dot: "#f59e0b",  bg: "rgba(245,158,11,0.15)" },
  entregue:               { label: "Entregue",   color: "#16a34a", dot: "#22c55e",  bg: "rgba(34,197,94,0.12)" },
  cancelado:              { label: "Cancelado",  color: "#A80021", dot: "#E4002B",  bg: "rgba(228,0,43,0.10)" },
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: empresa } = await supabase.from("empresas").select("*").eq("id", user.id).single();
  const stats = await getStats(user.id);

  if (!stats) return <DbError message="Erro ao carregar o painel. Tente novamente." />;

  const hora = new Date().getHours();
  const saudacao = hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
  const taxaSucesso = stats.total > 0 ? Math.round((stats.entregues / stats.total) * 100) : 0;
  const margem = stats.faturamento;

  const cards = [
    { label: "Pedidos",        value: stats.total,                icon: Package,    color: "#E4002B", sub: `${stats.pendentes} aguardando`,             href: "/pedidos"  },
    { label: "Em rota",        value: stats.emRota,               icon: Bike,       color: "#E4002B", sub: `${stats.motoboyEmEntrega} motoboy${stats.motoboyEmEntrega !== 1 ? "s" : ""} ativo${stats.motoboyEmEntrega !== 1 ? "s" : ""}`, href: "/mapa" },
    { label: "Entregues",      value: stats.entregues,            icon: CheckCircle,color: "#16a34a", sub: taxaSucesso > 0 ? `${taxaSucesso}% de sucesso` : "Nenhuma entrega", href: "/pedidos" },
    { label: "Motoboys livres",value: stats.motoboyDisponiveis,   icon: Users,      color: "#334155", sub: `de ${stats.motoboyTotal} cadastrados`,      href: "/motoboys" },
  ];

  const cardStyle = {
    background: "var(--bg-1)",
    border: "1px solid var(--border-1)",
    boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
  };
  const sectionStyle = {
    ...cardStyle,
    borderRadius: 12,
    padding: "20px 22px",
  };
  const iconBoxStyle = (color: string) => ({
    width: 32, height: 32, borderRadius: 8,
    background: "var(--bg-2)", border: "1px solid var(--border-1)",
    display: "flex", alignItems: "center", justifyContent: "center",
    color,
    flexShrink: 0,
  });

  return (
    <div style={{ background: "var(--bg-base)", minHeight: "100%" }}>
      <div className="px-4 py-5 md:px-6 md:py-7 flex flex-col" style={{ maxWidth: 1400, margin: "0 auto", gap: 16 }}>

        {/* ── Header ───────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-4)", marginBottom: 5 }}>
              {saudacao} · {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
            </p>
            <h1 style={{ fontSize: "clamp(19px, 5vw, 25px)", fontWeight: 800, color: "var(--text-1)", letterSpacing: "-0.02em", margin: 0 }}>
              {empresa?.nome ?? "Painel"}
            </h1>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {empresa?.codigo && <CodigoCopy codigo={empresa.codigo} />}
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "6px 12px", borderRadius: 8,
              background: "var(--bg-2)", border: "1px solid var(--border-1)",
              fontSize: 11.5, fontWeight: 700, color: "var(--text-3)",
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#16a34a", display: "inline-block" }} />
              Ao vivo
            </div>
          </div>
        </div>

        {/* ── Stat cards ───────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {cards.map(({ label, value, icon: Icon, color, sub, href }) => (
            <Link key={label} href={href}
              className="rounded-xl transition-colors duration-150 p-4 md:p-5"
              style={{
                ...cardStyle,
                borderRadius: 12,
                display: "flex", flexDirection: "column", gap: 10,
                textDecoration: "none",
              }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={iconBoxStyle(color)}>
                  <Icon size={16} />
                </div>
                <ArrowRight size={13} style={{ color: "var(--text-5)" }} />
              </div>
              <div>
                <p style={{ fontSize: "clamp(24px, 6vw, 32px)", fontWeight: 800, color: "var(--text-1)", letterSpacing: "-0.03em", lineHeight: 1, margin: "0 0 5px" }}>
                  {value}
                </p>
                <p style={{ fontSize: "clamp(11px, 2.8vw, 12.5px)", fontWeight: 600, color: "var(--text-3)", margin: 0 }}>{label}</p>
                <p style={{ fontSize: "clamp(10px, 2.4vw, 11px)", fontWeight: 500, color: "var(--text-4)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</p>
              </div>
            </Link>
          ))}
        </div>

        {/* ── Activity pill ────────────────────────────────────────── */}
        {(stats.emRota > 0 || stats.emPreparo > 0 || stats.pendentes > 0) && (
          <div style={{
            display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
            padding: "10px 18px", borderRadius: 10,
            background: "var(--bg-1)", border: "1px solid var(--border-1)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Flame size={12} color="#E4002B" />
              <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-3)" }}>
                Em andamento
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
              {stats.pendentes > 0 && (
                <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "var(--text-3)" }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#94a3b8", display: "inline-block" }} />
                  {stats.pendentes} na fila
                </span>
              )}
              {stats.emPreparo > 0 && (
                <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "var(--text-3)" }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#f59e0b", display: "inline-block" }} />
                  {stats.emPreparo} em preparo
                </span>
              )}
              {stats.emRota > 0 && (
                <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "var(--text-3)" }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#8b5cf6", display: "inline-block" }} />
                  {stats.emRota} em rota
                </span>
              )}
            </div>
          </div>
        )}

        {/* ── Financeiro ───────────────────────────────────────────── */}
        <div className="p-4 md:p-5" style={{ ...cardStyle, borderRadius: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <div style={iconBoxStyle("#16a34a")}>
                <DollarSign size={15} />
              </div>
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)" }}>Financeiro</span>
            </div>
            <Link href="/financeiro"
              style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: "var(--text-4)", textDecoration: "none" }}>
              Ver detalhes <ArrowRight size={12} />
            </Link>
          </div>

          <div className="grid grid-cols-3 gap-2 md:gap-3">
            {[
              { label: "Faturamento",   value: stats.faturamento,   sub: "receita total",    icon: <TrendingUp size={13} style={{ color: "var(--text-4)" }} /> },
              { label: "Motoboys",      value: stats.lucroMotoboys, sub: "taxas do cliente", icon: <Bike size={13} style={{ color: "var(--text-4)" }} /> },
              { label: "Líquido",       value: margem,              sub: "valor alimentos",  icon: <TrendingDown size={13} style={{ color: "var(--text-4)" }} /> },
            ].map(({ label, value, sub, icon }) => (
              <div key={label} className="rounded-lg px-3 py-3 md:px-4 md:py-4"
                style={{ background: "var(--bg-2)", border: "1px solid var(--border-1)", minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 8, overflow: "hidden" }}>
                  {icon}
                  <span style={{ fontSize: "clamp(8px, 2vw, 11px)", fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.03em", textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
                </div>
                <p style={{ fontSize: "clamp(13px, 3.5vw, 21px)", fontWeight: 800, color: "var(--text-1)", letterSpacing: "-0.02em", margin: "0 0 3px", lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden" }}>
                  R${value.toFixed(2)}
                </p>
                <p style={{ fontSize: "clamp(9px, 2.2vw, 11px)", fontWeight: 500, color: "var(--text-4)", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Relatório do dia ─────────────────────────────────────── */}
        <div className="p-4 md:p-5" style={{ ...cardStyle, borderRadius: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <div style={iconBoxStyle("#334155")}>
                <BarChart2 size={15} />
              </div>
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)" }}>Relatório de hoje</span>
            </div>
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-4)" }}>
              {new Date().toLocaleDateString("pt-BR", { day: "numeric", month: "short" })}
            </span>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" style={{ marginBottom: stats.rankingHoje.length > 0 ? 18 : 0 }}>
            {[
              { label: "Pedidos hoje",  value: String(stats.totalHoje),                                  icon: <Package size={13} style={{ color: "var(--text-4)" }} /> },
              { label: "Entregues",     value: String(stats.entreguesHoje),                              icon: <CheckCircle size={13} style={{ color: "var(--text-4)" }} /> },
              { label: "Faturado hoje", value: `R$${stats.faturamentoHoje.toFixed(2)}`,                  icon: <DollarSign size={13} style={{ color: "var(--text-4)" }} /> },
              { label: "Tempo médio",   value: stats.tempoMedioMin ? `${stats.tempoMedioMin}min` : "—",  icon: <TimerIcon size={13} style={{ color: "var(--text-4)" }} /> },
            ].map(({ label, value, icon }) => (
              <div key={label} className="rounded-lg px-3 py-3 md:px-4 md:py-[14px]"
                style={{ background: "var(--bg-2)", border: "1px solid var(--border-1)", minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 6, overflow: "hidden" }}>
                  {icon}
                  <span style={{ fontSize: "clamp(9px, 2.2vw, 11px)", fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
                </div>
                <p style={{ fontSize: "clamp(16px, 4.5vw, 21px)", fontWeight: 800, color: "var(--text-1)", margin: 0, letterSpacing: "-0.02em", whiteSpace: "nowrap", overflow: "hidden" }}>{value}</p>
              </div>
            ))}
          </div>

          {stats.rankingHoje.length > 0 && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                <Trophy size={12} style={{ color: "var(--text-4)" }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Ranking motoboys hoje</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {stats.rankingHoje.map((mb, i) => (
                  <div key={mb.nome} style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "10px 14px", borderRadius: 8,
                    background: "var(--bg-2)",
                    border: "1px solid var(--border-1)",
                  }}>
                    <span style={{
                      fontSize: 11, fontWeight: 800, color: "var(--text-3)", width: 20, height: 20, borderRadius: 6,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: "var(--bg-1)", border: "1px solid var(--border-1)", flexShrink: 0,
                    }}>
                      {i + 1}
                    </span>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: "var(--text-1)" }}>{mb.nome}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)" }}>R${mb.ganho.toFixed(2)}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", background: "var(--bg-1)", border: "1px solid var(--border-1)", padding: "3px 10px", borderRadius: 999 }}>
                      {mb.count} entrega{mb.count !== 1 ? "s" : ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Pedidos + Motoboys ────────────────────────────────────── */}
        <div className="grid lg:grid-cols-3 gap-4">

          {/* Pedidos recentes */}
          <div className="lg:col-span-2"
            style={{ ...cardStyle, borderRadius: 12, overflow: "hidden" }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "16px 20px", borderBottom: "1px solid var(--border-1)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <div style={iconBoxStyle("#E4002B")}>
                  <Clock size={15} />
                </div>
                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)" }}>Pedidos recentes</span>
              </div>
              <Link href="/pedidos"
                style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: "var(--text-4)", textDecoration: "none" }}>
                Ver todos <ArrowRight size={12} />
              </Link>
            </div>

            {stats.pedidosRecentes.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "56px 24px", gap: 12 }}>
                <div style={{ width: 52, height: 52, borderRadius: 12, background: "var(--bg-2)", border: "1px solid var(--border-1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Package size={22} style={{ color: "var(--text-5)" }} />
                </div>
                <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text-4)", margin: 0 }}>Nenhum pedido ainda</p>
                <Link href="/pedidos"
                  style={{ fontSize: 12, fontWeight: 700, padding: "8px 18px", borderRadius: 8, background: "var(--bg-2)", color: "#E4002B", border: "1px solid var(--border-1)", textDecoration: "none" }}>
                  Criar primeiro pedido
                </Link>
              </div>
            ) : (
              <div>
                {stats.pedidosRecentes.map((pedido, i) => {
                  const cfg = STATUS_CFG[pedido.status] ?? STATUS_CFG.em_fila;
                  return (
                    <div key={pedido.id}
                      className="flex items-center gap-4"
                      style={{
                        padding: "12px 20px",
                        borderBottom: i < stats.pedidosRecentes.length - 1 ? "1px solid var(--border-1)" : "none",
                      }}>
                      <span style={{ width: 9, height: 9, borderRadius: "50%", background: cfg.dot, flexShrink: 0, boxShadow: `0 0 0 3px ${cfg.bg}` }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {pedido.cliente_nome}
                        </p>
                        {pedido.endereco_entrega && (
                          <p style={{ fontSize: 11, color: "var(--text-4)", margin: "2px 0 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {pedido.endereco_entrega}
                          </p>
                        )}
                      </div>
                      {pedido.valor_pedido > 0 && (
                        <span style={{ fontSize: 13, fontWeight: 800, color: "#16a34a", flexShrink: 0 }}>
                          R${pedido.valor_pedido.toFixed(2)}
                        </span>
                      )}
                      <span style={{
                        fontSize: 11, fontWeight: 700,
                        padding: "4px 10px", borderRadius: 999,
                        background: cfg.bg, color: cfg.color,
                        flexShrink: 0, whiteSpace: "nowrap",
                      }}>
                        {cfg.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Motoboys */}
          <div style={{ ...cardStyle, borderRadius: 12, overflow: "hidden" }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "16px 20px", borderBottom: "1px solid var(--border-1)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <div style={iconBoxStyle("#334155")}>
                  <Users size={15} />
                </div>
                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)" }}>Motoboys</span>
              </div>
              <Link href="/motoboys"
                style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: "var(--text-4)", textDecoration: "none" }}>
                Gerenciar <ArrowRight size={12} />
              </Link>
            </div>

            {stats.motoboys.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "56px 24px", gap: 12 }}>
                <div style={{ width: 52, height: 52, borderRadius: 12, background: "var(--bg-2)", border: "1px solid var(--border-1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Users size={22} style={{ color: "var(--text-5)" }} />
                </div>
                <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text-4)", margin: 0 }}>Nenhum motoboy</p>
                <Link href="/motoboys"
                  style={{ fontSize: 12, fontWeight: 700, padding: "8px 18px", borderRadius: 8, background: "var(--bg-2)", color: "var(--text-2)", border: "1px solid var(--border-1)", textDecoration: "none" }}>
                  Cadastrar motoboy
                </Link>
              </div>
            ) : (
              <div>
                {stats.motoboys.slice(0, 6).map((m, i) => {
                  const isDisp = m.status === "disponivel";
                  const isRota = m.status === "em_entrega";
                  const dotColor = isDisp ? "#22c55e" : isRota ? "#E4002B" : "#94a3b8";
                  const labelColor = isDisp ? "#16a34a" : isRota ? "#A80021" : "var(--text-3)";
                  const labelBg = isDisp ? "rgba(34,197,94,0.1)" : isRota ? "rgba(228,0,43,0.1)" : "var(--bg-input)";
                  const labelText = isDisp ? "Livre" : isRota ? "Em rota" : "Offline";
                  const avatarBg = isDisp ? "rgba(34,197,94,0.1)" : isRota ? "rgba(228,0,43,0.1)" : "var(--bg-input)";
                  return (
                    <div key={m.id}
                      className="flex items-center gap-3"
                      style={{
                        padding: "12px 20px",
                        borderBottom: i < Math.min(stats.motoboys.length, 6) - 1 ? "1px solid var(--border-1)" : "none",
                      }}>
                      <div style={{
                        width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
                        background: avatarBg, color: dotColor,
                        border: `1.5px solid ${dotColor}40`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 12.5, fontWeight: 800,
                      }}>
                        {m.nome.charAt(0).toUpperCase()}
                      </div>
                      <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)", flex: 1, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {m.nome}
                      </p>
                      <div style={{
                        display: "flex", alignItems: "center", gap: 5,
                        padding: "4px 10px", borderRadius: 999,
                        background: labelBg, flexShrink: 0,
                      }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: dotColor, display: "inline-block" }} />
                        <span style={{ fontSize: 11, fontWeight: 700, color: labelColor }}>{labelText}</span>
                      </div>
                    </div>
                  );
                })}
                {stats.motoboys.length > 6 && (
                  <div style={{ padding: "10px 20px", borderTop: "1px solid var(--border-1)" }}>
                    <p style={{ fontSize: 11, color: "var(--text-4)", margin: 0 }}>+{stats.motoboys.length - 6} outros cadastrados</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Mapa CTA ─────────────────────────────────────────────── */}
        <Link href="/mapa"
          className="flex items-center justify-between transition-colors duration-150"
          style={{
            ...cardStyle,
            borderRadius: 12,
            padding: "16px 20px",
            textDecoration: "none",
          }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={iconBoxStyle("#16a34a")}>
              <MapIcon size={17} />
            </div>
            <div>
              <p style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-1)", margin: "0 0 3px" }}>Rastreamento ao vivo</p>
              <p style={{ fontSize: 12, color: "var(--text-4)", margin: 0 }}>
                {stats.motoboyEmEntrega > 0
                  ? `${stats.motoboyEmEntrega} motoboy${stats.motoboyEmEntrega !== 1 ? "s" : ""} em rota agora`
                  : "Nenhum motoboy em rota no momento"}
              </p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, color: "var(--text-3)" }}>
            Abrir mapa <ArrowRight size={14} />
          </div>
        </Link>

      </div>
    </div>
  );
}
