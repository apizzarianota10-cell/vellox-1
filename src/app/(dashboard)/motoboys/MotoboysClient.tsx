"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Wifi, WifiOff, Users, Search, UserCheck, Loader2, X, History, TrendingUp, Package, AlertTriangle, MessageCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { log } from "@/lib/auditoria";
import ChatMotoboy from "@/components/ChatMotoboy";
import type { Motoboy, MotoboystStatus, Pedido } from "@/types";

const STATUS_CONFIG: Record<MotoboystStatus, { label: string; color: string; bg: string }> = {
  disponivel: { label: "Disponível", color: "#22c55e", bg: "rgba(34,197,94,0.1)" },
  em_entrega: { label: "Em entrega", color: "#fbbf24", bg: "rgba(251,191,36,0.1)" },
  offline:    { label: "Offline",    color: "var(--text-3)", bg: "rgba(71,85,105,0.1)" },
};

const LIMITE_PLANO: Record<string, number> = { basic: 3, pro: 9999, enterprise: 9999 };
const NOME_PLANO: Record<string, string>   = { basic: "Básico", pro: "Pro", enterprise: "Business" };

interface Props {
  motoboys: Motoboy[];
  empresaId: string;
  plano: string;
  assinaturaAtiva: boolean;
}

export default function MotoboysClient({ motoboys: initial, empresaId, plano, assinaturaAtiva }: Props) {
  const router = useRouter();
  const [motoboys, setMotoboys] = useState(initial);
  const limite = LIMITE_PLANO[plano] ?? 3;
  const atingiuLimite = !assinaturaAtiva && motoboys.length >= limite;
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Motoboy | null>(null);
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [saving, setSaving] = useState(false);

  // Contratar por email ou código
  type ModoBusca = "email" | "codigo";
  const [modoBusca, setModoBusca] = useState<ModoBusca>("email");
  const [emailBusca, setEmailBusca] = useState("");
  const [codigoBusca, setCodigoBusca] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [motoboyEncontrado, setMotoboyEncontrado] = useState<{ id: string; nome: string; telefone: string; email: string; empresa_id: string | null } | null>(null);
  const [erroBusca, setErroBusca] = useState("");
  const [enviandoConvite, setEnviandoConvite] = useState(false);
  const [conviteEnviado, setConviteEnviado]   = useState(false);

  // Histórico
  const [historico, setHistorico] = useState<{ motoboy: Motoboy; pedidos: Pedido[] } | null>(null);
  const [loadingHistorico, setLoadingHistorico] = useState(false);

  // Excluir motoboy
  const [deleteTarget, setDeleteTarget] = useState<Motoboy | null>(null);
  const [deletingMb,   setDeletingMb]   = useState(false);

  // Chat
  const [chatMotoboy, setChatMotoboy] = useState<Motoboy | null>(null);

  const supabase = createClient();

  const [ganhosDia, setGanhosDia] = useState<Record<string, { valor: number; entregas: number }>>({});

  useEffect(() => {
    const channel = supabase
      .channel("motoboys-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "motoboys", filter: `empresa_id=eq.${empresaId}` }, () => router.refresh())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [empresaId, router, supabase]);

  useEffect(() => {
    async function loadGanhos() {
      const hoje = new Date().toISOString().split("T")[0];
      const { data } = await supabase
        .from("pedidos")
        .select("motoboy_id, valor_motoboy")
        .eq("empresa_id", empresaId)
        .in("status", ["entregue", "aguardando_confirmacao"])
        .gte("updated_at", `${hoje}T00:00:00`)
        .lte("updated_at", `${hoje}T23:59:59`);
      if (!data) return;
      const g: Record<string, { valor: number; entregas: number }> = {};
      for (const p of data) {
        if (!p.motoboy_id) continue;
        if (!g[p.motoboy_id]) g[p.motoboy_id] = { valor: 0, entregas: 0 };
        g[p.motoboy_id].valor += p.valor_motoboy ?? 0;
        g[p.motoboy_id].entregas++;
      }
      setGanhosDia(g);
    }
    loadGanhos();
    const ch = supabase
      .channel("ganhos-realtime")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "pedidos", filter: `empresa_id=eq.${empresaId}` }, loadGanhos)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [empresaId]); // eslint-disable-line

  function openCreate() {
    setEditing(null);
    setNome("");
    setTelefone("");
    setShowForm(true);
  }

  function openEdit(m: Motoboy) {
    setEditing(m);
    setNome(m.nome);
    setTelefone(m.telefone);
    setShowForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editing && atingiuLimite) return;
    setSaving(true);

    if (editing) {
      await supabase.from("motoboys").update({ nome, telefone }).eq("id", editing.id);
    } else {
      const nextPos = motoboys.filter((m) => m.status === "disponivel").length + 1;
      await supabase.from("motoboys").insert({
        empresa_id: empresaId,
        nome,
        telefone,
        status: "disponivel" as MotoboystStatus,
        posicao_fila: nextPos,
      });
      log(supabase, empresaId, "motoboy_cadastrado",
        `Motoboy ${nome} cadastrado`,
        { nome, telefone },
      );
    }

    setSaving(false);
    setShowForm(false);
    router.refresh();
  }

  async function buscarMotoboy(e: React.FormEvent) {
    e.preventDefault();
    setBuscando(true);
    setErroBusca("");
    setMotoboyEncontrado(null);

    let data: unknown, error: unknown;
    if (modoBusca === "email") {
      ({ data, error } = await supabase.rpc("get_motoboy_by_email", { p_email: emailBusca.trim().toLowerCase() }));
    } else {
      ({ data, error } = await supabase.rpc("get_motoboy_by_codigo", { p_codigo: codigoBusca.trim().toUpperCase() }));
    }

    if (error || !data || (Array.isArray(data) && data.length === 0)) {
      setErroBusca(modoBusca === "email" ? "Nenhum motoboy encontrado com esse email." : "Nenhum motoboy encontrado com esse código.");
    } else {
      const mb = (Array.isArray(data) ? data[0] : data) as { id: string; nome: string; telefone: string; email: string; empresa_id: string | null };
      if (mb.empresa_id === empresaId) {
        setErroBusca("Este motoboy já faz parte da sua equipe.");
      } else {
        setMotoboyEncontrado(mb);
      }
    }
    setBuscando(false);
  }

  async function enviarConvite() {
    if (!motoboyEncontrado) return;
    setEnviandoConvite(true);
    const { data, error } = await supabase.rpc("send_convite", {
      p_motoboy_id: motoboyEncontrado.id,
    });
    if (error) {
      setErroBusca(error.message.includes("equipe") ? "Este motoboy já faz parte da sua equipe." : "Não foi possível enviar o convite.");
    } else if (data) {
      setConviteEnviado(true);
      setTimeout(() => {
        setConviteEnviado(false);
        setMotoboyEncontrado(null);
        setEmailBusca("");
      }, 2500);
    }
    setEnviandoConvite(false);
  }

  async function abrirHistorico(m: Motoboy) {
    setLoadingHistorico(true);
    const { data } = await supabase
      .from("pedidos")
      .select("*")
      .eq("motoboy_id", m.id)
      .order("created_at", { ascending: false });
    setHistorico({ motoboy: m, pedidos: (data ?? []) as Pedido[] });
    setLoadingHistorico(false);
  }

  async function confirmarDelete() {
    if (!deleteTarget) return;
    setDeletingMb(true);
    // Se em_entrega, libera os pedidos ativos antes de excluir
    if (deleteTarget.status === "em_entrega") {
      await supabase.from("pedidos")
        .update({ motoboy_id: null, status: "finalizado", updated_at: new Date().toISOString() })
        .eq("motoboy_id", deleteTarget.id)
        .in("status", ["em_coleta", "em_rota_de_entrega"]);
    }
    const nome = deleteTarget.nome;
    await supabase.from("motoboys").delete().eq("id", deleteTarget.id);
    log(supabase, empresaId, "motoboy_removido",
      `Motoboy ${nome} removido`,
      { nome },
    );
    setDeletingMb(false);
    setDeleteTarget(null);
    router.refresh();
  }

  const disponiveis = motoboys.filter((m) => m.status === "disponivel").length;
  const emEntrega = motoboys.filter((m) => m.status === "em_entrega").length;
  const totalGanhosDia = Object.values(ganhosDia).reduce((s, g) => s + g.valor, 0);
  const totalEntregasDia = Object.values(ganhosDia).reduce((s, g) => s + g.entregas, 0);

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6" style={{ background: "var(--bg-base)", minHeight: "100%" }}>
      {chatMotoboy && (
        <ChatMotoboy
          empresaId={empresaId}
          motoboyId={chatMotoboy.id}
          motoboyNome={chatMotoboy.nome}
          onClose={() => setChatMotoboy(null)}
        />
      )}
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-1)" }}>Motoboys</h1>
          <p className="text-sm mt-1" style={{ color: "#64748b" }}>
            {disponiveis} disponíveis · {emEntrega} em entrega · {motoboys.length} total
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button
            onClick={openCreate}
            disabled={atingiuLimite}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all"
            style={{
              background: atingiuLimite ? "rgba(71,85,105,0.3)" : "linear-gradient(135deg, #A80021, #a84400)",
              color: atingiuLimite ? "#64748b" : "var(--text-1)",
              boxShadow: atingiuLimite ? "none" : "0 0 20px rgba(168,0,33,0.3)",
              cursor: atingiuLimite ? "not-allowed" : "pointer",
            }}
          >
            <Plus size={16} /> Novo motoboy
          </button>
          <span style={{ fontSize: 10, color: atingiuLimite ? "#E4002B" : "#64748b", fontWeight: 600 }}>
            {motoboys.length}/{limite === 999 ? "∞" : limite} · plano {NOME_PLANO[plano] ?? plano}
          </span>
        </div>
      </div>

      {atingiuLimite && !assinaturaAtiva && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
          style={{ background: "rgba(228,0,43,0.08)", border: "1px solid rgba(228,0,43,0.2)" }}>
          <AlertTriangle size={15} style={{ color: "#E4002B", flexShrink: 0 }} />
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: "#E4002B", margin: 0 }}>
              Limite do plano {NOME_PLANO[plano]} atingido ({limite} motoboys)
            </p>
            <p style={{ fontSize: 11, color: "#94a3b8", margin: "2px 0 0" }}>
              Faça upgrade para o plano Pro ou Enterprise para cadastrar mais motoboys.
            </p>
          </div>
        </div>
      )}

      {/* Ganhos do dia */}
      {totalEntregasDia > 0 && (
        <div className="grid grid-cols-3 gap-2 md:gap-3">
          <div className="rounded-2xl px-3 py-3 md:p-4" style={{ background: "var(--bg-2)", border: "1px solid var(--border-1)" }}>
            <p className="text-xs font-semibold uppercase tracking-wider mb-1 truncate" style={{ color: "var(--text-4)" }}>Faturado</p>
            <p className="text-base md:text-xl font-black" style={{ color: "#22c55e" }}>R${totalGanhosDia.toFixed(2)}</p>
          </div>
          <div className="rounded-2xl px-3 py-3 md:p-4" style={{ background: "var(--bg-2)", border: "1px solid var(--border-1)" }}>
            <p className="text-xs font-semibold uppercase tracking-wider mb-1 truncate" style={{ color: "var(--text-4)" }}>Entregas</p>
            <p className="text-base md:text-xl font-black" style={{ color: "#60a5fa" }}>{totalEntregasDia}</p>
          </div>
          <div className="rounded-2xl px-3 py-3 md:p-4" style={{ background: "var(--bg-2)", border: "1px solid var(--border-1)" }}>
            <p className="text-xs font-semibold uppercase tracking-wider mb-1 truncate" style={{ color: "var(--text-4)" }}>Média</p>
            <p className="text-base md:text-xl font-black" style={{ color: "#fbbf24" }}>
              R${(totalGanhosDia / totalEntregasDia).toFixed(2)}
            </p>
          </div>
        </div>
      )}

      {/* Fila visual */}
      {motoboys.some((m) => m.status === "disponivel") && (
        <div className="rounded-2xl p-4" style={{ background: "var(--bg-2)", border: "1px solid var(--border-1)" }}>
          <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "#fbbf24" }}>
            Fila de entrega
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            {motoboys
              .filter((m) => m.status === "disponivel")
              .sort((a, b) => (a.posicao_fila ?? 0) - (b.posicao_fila ?? 0))
              .map((m, i) => (
                <div key={m.id} className="flex items-center gap-2">
                  <div
                    className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium"
                    style={{ background: i === 0 ? "rgba(168,0,33,0.15)" : "var(--overlay-sm)", color: i === 0 ? "#E4002B" : "#94a3b8", border: i === 0 ? "1px solid rgba(168,0,33,0.3)" : "1px solid var(--border-1)" }}
                  >
                    <span className="font-bold">{i + 1}º</span>
                    {m.nome}
                    {i === 0 && <span style={{ color: "#fbbf24" }}>★</span>}
                  </div>
                  {i < motoboys.filter((x) => x.status === "disponivel").length - 1 && (
                    <span style={{ color: "#1f1f1f" }}>→</span>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Lista */}
      <div className="space-y-3">
        {motoboys.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <Users size={48} style={{ color: "#1f1f1f" }} />
            <p className="text-sm" style={{ color: "#374151" }}>Nenhum motoboy cadastrado</p>
            <button
              onClick={openCreate}
              className="text-sm font-medium px-5 py-2.5 rounded-xl transition-colors"
              style={{ background: "rgba(168,0,33,0.1)", color: "#E4002B" }}
            >
              Cadastrar primeiro motoboy
            </button>
          </div>
        )}

        {motoboys.map((m) => {
          const cfg = STATUS_CONFIG[m.status];
          return (
            <div
              key={m.id}
              className="p-4 rounded-2xl transition-all"
              style={{ background: "var(--bg-2)", border: "1px solid var(--border-1)" }}
            >
              {/* Linha 1: avatar + nome + status + ações */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                  style={{ background: cfg.bg, color: cfg.color }}>
                  {m.nome.charAt(0).toUpperCase()}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate" style={{ color: "var(--text-1)" }}>{m.nome}</p>
                  <p className="text-xs truncate" style={{ color: "var(--text-3)" }}>{m.telefone}</p>
                </div>

                {/* Status */}
                <span className="text-xs font-medium px-2.5 py-1 rounded-full shrink-0"
                  style={{ background: cfg.bg, color: cfg.color }}>
                  {cfg.label}
                </span>

                {/* Ações */}
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => setChatMotoboy(m)}
                    className="p-2 rounded-lg transition-colors" style={{ color: "var(--text-3)" }}
                    title="Chat"
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(34,197,94,0.1)"; (e.currentTarget as HTMLElement).style.color = "#22c55e"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "var(--text-3)"; }}>
                    <MessageCircle size={14} />
                  </button>
                  <button onClick={() => abrirHistorico(m)} disabled={loadingHistorico}
                    className="p-2 rounded-lg transition-colors" style={{ color: "var(--text-3)" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(96,165,250,0.1)"; (e.currentTarget as HTMLElement).style.color = "#60a5fa"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "var(--text-3)"; }}>
                    <History size={14} />
                  </button>
                  <button onClick={() => openEdit(m)}
                    className="p-2 rounded-lg transition-colors" style={{ color: "var(--text-3)" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-3)"; (e.currentTarget as HTMLElement).style.color = "var(--text-1)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "var(--text-3)"; }}>
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => setDeleteTarget(m)}
                    className="p-2 rounded-lg transition-colors" style={{ color: "var(--text-3)" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(228,0,43,0.1)"; (e.currentTarget as HTMLElement).style.color = "#E4002B"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "var(--text-3)"; }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {/* Linha 2: posição + ganhos + GPS (só se houver) */}
              {(m.status === "disponivel" && m.posicao_fila != null || ganhosDia[m.id]) && (
                <div className="flex items-center gap-2 mt-2.5 ml-[52px] flex-wrap">
                  {m.status === "disponivel" && m.posicao_fila != null && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-lg"
                      style={{ background: "rgba(251,191,36,0.1)", color: "#fbbf24" }}>
                      #{m.posicao_fila} na fila
                    </span>
                  )}
                  {ganhosDia[m.id] && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-lg"
                      style={{ background: "rgba(34,197,94,0.08)", color: "#22c55e" }}>
                      R$ {ganhosDia[m.id].valor.toFixed(2)} · {ganhosDia[m.id].entregas} entrega{ganhosDia[m.id].entregas !== 1 ? "s" : ""}
                    </span>
                  )}
                  {m.codigo && (
                    <span className="text-xs font-bold px-1.5 py-0.5 rounded"
                      style={{ background: "rgba(251,191,36,0.08)", color: "var(--text-3)", fontFamily: "monospace" }}>
                      {m.codigo}
                    </span>
                  )}
                  {m.latitude
                    ? <Wifi size={12} style={{ color: "#22c55e" }} />
                    : <WifiOff size={12} style={{ color: "var(--text-5)" }} />}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Contratar por email ou código ── */}
      <div className="rounded-2xl p-5" style={{ background: "var(--bg-2)", border: "1px solid var(--border-1)" }}>
        <div className="flex items-center gap-2 mb-4">
          <UserCheck size={16} style={{ color: "#60a5fa" }} />
          <h2 className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>Contratar motoboy</h2>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-xl mb-4" style={{ background: "var(--bg-1)" }}>
          {(["email", "codigo"] as const).map((modo) => (
            <button
              key={modo}
              onClick={() => { setModoBusca(modo); setMotoboyEncontrado(null); setErroBusca(""); }}
              className="flex-1 py-2 rounded-lg text-xs font-semibold transition-all"
              style={
                modoBusca === modo
                  ? { background: "rgba(59,130,246,0.2)", color: "#60a5fa", border: "1px solid rgba(59,130,246,0.25)" }
                  : { background: "transparent", color: "var(--text-3)" }
              }
            >
              {modo === "email" ? "Por e-mail" : "Por código"}
            </button>
          ))}
        </div>

        <p className="text-xs mb-4" style={{ color: "var(--text-3)" }}>
          {modoBusca === "email"
            ? "Se o motoboy já possui cadastro no Vellox, você pode adicioná-lo à sua equipe pelo email."
            : "Peça ao motoboy o código exibido no aplicativo dele e cole aqui."}
        </p>

        <form onSubmit={buscarMotoboy} className="flex gap-2">
          {modoBusca === "email" ? (
            <input
              type="email"
              value={emailBusca}
              onChange={(e) => { setEmailBusca(e.target.value); setMotoboyEncontrado(null); setErroBusca(""); }}
              placeholder="email do motoboy"
              required
              className="flex-1 px-4 py-2.5 rounded-xl text-sm placeholder-slate-600 outline-none transition-all"
              style={{ background: "var(--bg-1)", border: "1px solid var(--border-1)", color: "var(--text-1)" }}
              onFocus={(e) => (e.target.style.borderColor = "#3b82f6")}
              onBlur={(e) => (e.target.style.borderColor = "var(--border-1)")}
            />
          ) : (
            <input
              type="text"
              value={codigoBusca}
              onChange={(e) => { setCodigoBusca(e.target.value.toUpperCase()); setMotoboyEncontrado(null); setErroBusca(""); }}
              placeholder="ex: A1B2C3"
              maxLength={6}
              required
              className="flex-1 px-4 py-2.5 rounded-xl text-sm placeholder-slate-600 outline-none transition-all tracking-widest"
              style={{ background: "var(--bg-1)", border: "1px solid var(--border-1)", fontFamily: "monospace", fontWeight: 700, color: "var(--text-1)" }}
              onFocus={(e) => (e.target.style.borderColor = "#fbbf24")}
              onBlur={(e) => (e.target.style.borderColor = "var(--border-1)")}
            />
          )}
          <button
            type="submit"
            disabled={buscando}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
            style={{ background: "rgba(59,130,246,0.15)", color: "#60a5fa", border: "1px solid rgba(59,130,246,0.2)" }}
          >
            {buscando ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            Buscar
          </button>
        </form>

        {erroBusca && (
          <p className="text-xs mt-3 px-3 py-2 rounded-lg"
            style={{ background: "rgba(228,0,43,0.08)", color: "#FFC72C", border: "1px solid rgba(228,0,43,0.15)" }}>
            {erroBusca}
          </p>
        )}

        {motoboyEncontrado && (
          <div className="mt-3 p-4 rounded-xl flex items-center gap-3"
            style={{ background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.2)" }}>
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
              style={{ background: "rgba(96,165,250,0.15)", color: "#60a5fa" }}>
              {motoboyEncontrado.nome.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>{motoboyEncontrado.nome}</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>{motoboyEncontrado.telefone}</p>
              {motoboyEncontrado.empresa_id && motoboyEncontrado.empresa_id !== empresaId && (
                <p className="text-xs mt-0.5" style={{ color: "#fbbf24" }}>Vinculado a outra empresa</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {conviteEnviado ? (
                <span className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold"
                  style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e" }}>
                  <UserCheck size={12} /> Convite enviado!
                </span>
              ) : (
                <button
                  onClick={enviarConvite}
                  disabled={enviandoConvite}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all"
                  style={{ background: "rgba(59,130,246,0.2)", color: "#60a5fa" }}
                >
                  {enviandoConvite ? <Loader2 size={12} className="animate-spin" /> : <UserCheck size={12} />}
                  Enviar convite
                </button>
              )}
              <button onClick={() => { setMotoboyEncontrado(null); setEmailBusca(""); setConviteEnviado(false); }}
                className="p-1.5 rounded-lg" style={{ color: "#374151" }}>
                <X size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal: Excluir motoboy */}
      {deleteTarget && (
        <div className="fixed inset-0 flex items-center justify-center z-50 px-4"
          style={{ background: "rgba(0,0,0,0.88)", backdropFilter: "blur(4px)" }}
          onClick={(e) => e.target === e.currentTarget && setDeleteTarget(null)}>
          <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: "var(--bg-1)", border: "1px solid rgba(228,0,43,0.2)" }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "rgba(228,0,43,0.1)" }}>
                <AlertTriangle size={18} style={{ color: "#E4002B" }} />
              </div>
              <div>
                <h2 className="text-base font-bold" style={{ color: "var(--text-1)" }}>Excluir motoboy</h2>
                <p className="text-xs" style={{ color: "#64748b" }}>Esta ação não pode ser desfeita</p>
              </div>
            </div>

            <div className="rounded-xl p-3 mb-4" style={{ background: "var(--bg-2)", border: "1px solid var(--border-1)" }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                  style={{ background: STATUS_CONFIG[deleteTarget.status].bg, color: STATUS_CONFIG[deleteTarget.status].color }}>
                  {deleteTarget.nome.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>{deleteTarget.nome}</p>
                  <p className="text-xs" style={{ color: "var(--text-3)" }}>{deleteTarget.telefone}</p>
                </div>
                <span className="ml-auto text-xs font-medium px-2.5 py-1 rounded-full"
                  style={{ background: STATUS_CONFIG[deleteTarget.status].bg, color: STATUS_CONFIG[deleteTarget.status].color }}>
                  {STATUS_CONFIG[deleteTarget.status].label}
                </span>
              </div>
            </div>

            {deleteTarget.status === "em_entrega" && (
              <div className="rounded-xl p-3 mb-4 flex items-start gap-2"
                style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.2)" }}>
                <AlertTriangle size={13} className="shrink-0 mt-0.5" style={{ color: "#fbbf24" }} />
                <p className="text-xs" style={{ color: "#fbbf24" }}>
                  Este motoboy está em entrega. Os pedidos ativos serão devolvidos para a fila.
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium"
                style={{ border: "1px solid var(--border-1)", color: "#64748b" }}>
                Cancelar
              </button>
              <button onClick={confirmarDelete} disabled={deletingMb}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold"
                style={{ background: "linear-gradient(135deg,#A80021,#991b1b)", color: "var(--text-1)" }}>
                {deletingMb ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                {deletingMb ? "Excluindo..." : "Excluir"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Histórico */}
      {historico && (
        <div className="fixed inset-0 flex items-center justify-center z-50 px-4"
          style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(4px)" }}
          onClick={(e) => e.target === e.currentTarget && setHistorico(null)}>
          <div className="w-full max-w-lg rounded-2xl overflow-hidden" style={{ background: "var(--bg-1)", border: "1px solid var(--border-1)", maxHeight: "85vh", display: "flex", flexDirection: "column" }}>

            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4 shrink-0" style={{ borderBottom: "1px solid var(--border-1)" }}>
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                style={{ background: STATUS_CONFIG[historico.motoboy.status].bg, color: STATUS_CONFIG[historico.motoboy.status].color }}>
                {historico.motoboy.nome.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold" style={{ color: "var(--text-1)" }}>{historico.motoboy.nome}</p>
                <p className="text-xs" style={{ color: "var(--text-3)" }}>{historico.motoboy.telefone}</p>
              </div>
              <button onClick={() => setHistorico(null)} style={{ color: "#374151" }}><X size={18} /></button>
            </div>

            {/* Resumo */}
            {(() => {
              const entregues = historico.pedidos.filter((p) => p.status === "entregue");
              const ganhos    = entregues.reduce((s, p) => s + p.valor_motoboy, 0);
              const receita   = entregues.reduce((s, p) => s + p.valor_pedido, 0);
              return (
                <div className="grid grid-cols-3 gap-2 px-4 py-4 shrink-0" style={{ borderBottom: "1px solid var(--border-1)" }}>
                  {[
                    { label: "Entregas",   value: entregues.length.toString(),    color: "#22c55e", Icon: Package },
                    { label: "Ganhos",     value: `R$${ganhos.toFixed(2)}`,       color: "#fbbf24", Icon: TrendingUp },
                    { label: "Vol.",       value: `R$${receita.toFixed(2)}`,      color: "#60a5fa", Icon: TrendingUp },
                  ].map(({ label, value, color, Icon }) => (
                    <div key={label} className="rounded-xl px-2 py-2.5 md:p-3" style={{ background: color + "10" }}>
                      <p className="text-xs mb-1 truncate" style={{ color: color + "aa" }}>{label}</p>
                      <p className="text-sm md:text-base font-black" style={{ color }}>{value}</p>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Lista entregas */}
            <div className="flex-1 overflow-y-auto">
              {historico.pedidos.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2">
                  <Package size={32} style={{ color: "var(--text-5)" }} />
                  <p className="text-xs" style={{ color: "#374151" }}>Nenhuma entrega registrada</p>
                </div>
              ) : (
                historico.pedidos.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 px-5 py-3" style={{ borderBottom: "1px solid var(--border-1)" }}>
                    <div className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: p.status === "entregue" ? "#22c55e" : p.status === "cancelado" ? "#E4002B" : "#fbbf24" }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: "var(--text-1)" }}>{p.cliente_nome}</p>
                      <p className="text-xs truncate" style={{ color: "var(--text-3)" }}>{p.endereco_entrega}</p>
                      {p.descricao_itens && (
                        <p className="text-xs truncate" style={{ color: "#374151" }}>{p.descricao_itens}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-semibold" style={{ color: "#fbbf24" }}>R${p.valor_motoboy.toFixed(2)}</p>
                      <p className="text-xs" style={{ color: "#374151" }}>
                        {new Date(p.created_at).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 flex items-center justify-center z-50 px-4" style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(4px)" }}>
          <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: "var(--bg-1)", border: "1px solid var(--border-1)" }}>
            <h2 className="text-lg font-bold mb-5" style={{ color: "var(--text-1)" }}>
              {editing ? "Editar motoboy" : "Novo motoboy"}
            </h2>
            <form onSubmit={handleSave} className="space-y-4">
              {[
                { label: "Nome completo", value: nome, set: setNome, placeholder: "João Silva" },
                { label: "Telefone", value: telefone, set: setTelefone, placeholder: "(11) 99999-9999" },
              ].map(({ label, value, set, placeholder }) => (
                <div key={label}>
                  <label className="block text-sm font-medium mb-2" style={{ color: "#94a3b8" }}>{label}</label>
                  <input
                    value={value}
                    onChange={(e) => set(e.target.value)}
                    required
                    placeholder={placeholder}
                    className="w-full px-4 py-3 rounded-xl text-sm placeholder-slate-600 outline-none transition-all"
                    style={{ background: "var(--bg-base)", border: "1px solid var(--border-1)", color: "var(--text-1)" }}
                    onFocus={(e) => (e.target.style.borderColor = "#E4002B")}
                    onBlur={(e) => (e.target.style.borderColor = "var(--border-1)")}
                  />
                </div>
              ))}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 py-3 rounded-xl text-sm font-medium transition-colors"
                  style={{ border: "1px solid var(--border-1)", color: "#64748b" }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-3 rounded-xl text-sm font-bold transition-all"
                  style={{ background: "linear-gradient(135deg, #A80021, #a84400)", color: "var(--text-1)" }}
                >
                  {saving ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

