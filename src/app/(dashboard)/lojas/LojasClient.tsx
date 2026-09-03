"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus, Pencil, Trash2, Store, Check, X,
  ToggleLeft, ToggleRight, ExternalLink,
  MoreVertical, ArrowRight, Package, DollarSign,
  Users, Zap, Settings, BarChart2, ShoppingBag,
  Crown, CheckCircle,
} from "lucide-react";
import { useLoja } from "@/contexts/LojaContext";
import type { Loja } from "@/types";
import type { LojaComStats, GlobalStats } from "./page";

const CORES_PRESET = ["#E4002B","#E4002B","#f59e0b","#22c55e","#3b82f6","#8b5cf6","#ec4899","#0ea5e9"];

interface Props {
  initialLojas: LojaComStats[];
  empresaId: string;
  globalStats: GlobalStats;
}

export default function LojasClient({ initialLojas, empresaId, globalStats }: Props) {
  const router = useRouter();
  const { lojaAtiva, setLojaAtiva, reload } = useLoja();
  const [lojasList, setLojasList] = useState<LojaComStats[]>(initialLojas);

  // Modal criar/editar
  const [modalOpen, setModalOpen]   = useState(false);
  const [editLoja, setEditLoja]     = useState<Loja | null>(null);
  const [nome, setNome]             = useState("");
  const [cor, setCor]               = useState("#E4002B");
  const [descricao, setDescricao]   = useState("");
  const [saving, setSaving]         = useState(false);
  const [deleting, setDeleting]     = useState<string | null>(null);

  // Menu ⋮
  const [menuAberto, setMenuAberto] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuAberto(null);
    }
    if (menuAberto) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuAberto]);

  function openAdd() {
    setEditLoja(null); setNome(""); setCor("#E4002B"); setDescricao(""); setModalOpen(true);
  }

  function openEdit(l: Loja) {
    setEditLoja(l); setNome(l.nome); setCor(l.cor); setDescricao(l.descricao ?? "");
    setModalOpen(true); setMenuAberto(null);
  }

  async function handleSave() {
    if (!nome.trim()) return;
    setSaving(true);
    try {
      const body = { nome: nome.trim(), cor, descricao };
      const res = editLoja
        ? await fetch("/api/lojas", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editLoja.id, ...body }) })
        : await fetch("/api/lojas", { method: "POST",  headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json() as Loja;
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Erro");
      if (editLoja) {
        setLojasList(prev => prev.map(l => l.id === editLoja.id ? { ...l, ...data } : l));
      } else {
        setLojasList(prev => [...prev, { ...data, pedidos_hoje: 0, faturamento_hoje: 0, entregues_hoje: 0 }]);
      }
      await reload();
      setModalOpen(false);
    } catch (e) { alert(e instanceof Error ? e.message : "Erro"); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir esta loja? Pedidos e produtos vinculados perderão o vínculo.")) return;
    setMenuAberto(null);
    setDeleting(id);
    const res = await fetch("/api/lojas", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    if (res.ok) {
      setLojasList(prev => prev.filter(l => l.id !== id));
      if (lojaAtiva?.id === id) setLojaAtiva(null);
      await reload();
    }
    setDeleting(null);
  }

  async function handleToggle(l: Loja) {
    setMenuAberto(null);
    const res = await fetch("/api/lojas", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: l.id, ativo: !l.ativo }) });
    if (res.ok) setLojasList(prev => prev.map(x => x.id === l.id ? { ...x, ativo: !x.ativo } : x));
  }

  function handleAcessarLoja(loja: LojaComStats) {
    setLojaAtiva(loja);
    router.push("/dashboard");
  }

  const statItems = [
    { label: "Total de lojas",  value: globalStats.total,                  color: "#E4002B", icon: <Store size={14} /> },
    { label: "Lojas ativas",    value: globalStats.ativas,                  color: "#22c55e", icon: <CheckCircle size={14} /> },
    { label: "Motoboys livres", value: `${globalStats.motoboys_disponiveis}/${globalStats.motoboys_total}`, color: "#3b82f6", icon: <Users size={14} /> },
    { label: "Pedidos hoje",    value: globalStats.pedidos_hoje,            color: "#E4002B", icon: <Package size={14} /> },
    { label: "Faturamento",     value: `R$${globalStats.faturamento_hoje.toFixed(2)}`, color: "#8b5cf6", icon: <DollarSign size={14} /> },
  ];

  const quickActions = [
    { label: "Nova franquia",    icon: <Plus size={18} />,      color: "#E4002B", bg: "rgba(228,0,43,0.1)",    onClick: openAdd },
    { label: "Motoboys",         icon: <Users size={18} />,     color: "#3b82f6", bg: "rgba(59,130,246,0.1)",   href: "/motoboys" },
    { label: "Relatório global", icon: <BarChart2 size={18} />, color: "#8b5cf6", bg: "rgba(139,92,246,0.1)",   href: "/financeiro" },
    { label: "Configurações",    icon: <Settings size={18} />,  color: "#64748b", bg: "rgba(100,116,139,0.1)", href: "/configuracoes" },
  ];

  return (
    <div style={{ background: "var(--bg-base)", minHeight: "100%" }}>
      <div className="px-4 py-5 md:px-6 md:py-7 flex flex-col" style={{ maxWidth: 1200, margin: "0 auto", gap: 24 }}>

        {/* ── Header ─────────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-4)", margin: 0 }}>
                Business · Multi-loja
              </p>
              <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 7px", borderRadius: 999, background: "rgba(217,119,6,0.12)", color: "#d97706", border: "1px solid rgba(217,119,6,0.25)" }}>
                <Crown size={9} style={{ display: "inline", marginRight: 3 }} />BUSINESS
              </span>
            </div>
            <h1 style={{ fontSize: "clamp(20px, 5vw, 26px)", fontWeight: 900, color: "var(--text-1)", letterSpacing: "-0.03em", margin: 0 }}>
              Minhas Franquias
            </h1>
          </div>
          <button onClick={openAdd}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 18px", borderRadius: 12, background: "#E4002B", color: "#fff", border: "none", fontSize: 13, fontWeight: 800, cursor: "pointer", boxShadow: "0 4px 14px rgba(228,0,43,.3)" }}>
            <Plus size={15} /> Nova loja
          </button>
        </div>

        {/* ── Global stats ───────────────────────────────────────── */}
        <div style={{
          background: "var(--bg-1)", borderRadius: 20, border: "1px solid var(--border-1)",
          padding: "16px 20px", display: "flex", gap: 0, overflowX: "auto",
          boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
        }}>
          {statItems.map((s, i) => (
            <div key={s.label} style={{
              flex: "0 0 auto", minWidth: 110, display: "flex", flexDirection: "column", gap: 6,
              padding: "0 20px",
              borderLeft: i > 0 ? "1px solid var(--border-1)" : "none",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ color: s.color }}>{s.icon}</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-4)", textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{s.label}</span>
              </div>
              <p style={{ fontSize: "clamp(16px, 4vw, 22px)", fontWeight: 900, color: s.color, margin: 0, letterSpacing: "-0.03em", whiteSpace: "nowrap" }}>
                {s.value}
              </p>
            </div>
          ))}
        </div>

        {/* ── Quick actions ──────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {quickActions.map(({ label, icon, color, bg, onClick, href }) => {
            const content = (
              <>
                <div style={{ width: 40, height: 40, borderRadius: 13, background: bg, display: "flex", alignItems: "center", justifyContent: "center", color, marginBottom: 8 }}>
                  {icon}
                </div>
                <span style={{ fontSize: "clamp(10px, 2.5vw, 12px)", fontWeight: 700, color: "var(--text-2)", textAlign: "center", lineHeight: 1.3 }}>{label}</span>
              </>
            );
            const sharedStyle = {
              display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center",
              padding: "16px 10px", borderRadius: 16, background: "var(--bg-1)",
              border: "1px solid var(--border-1)", cursor: "pointer",
              transition: "all .15s", textDecoration: "none",
            };
            return href ? (
              <Link key={label} href={href} style={sharedStyle}>{content}</Link>
            ) : (
              <button key={label} onClick={onClick} style={{ ...sharedStyle, border: "none" }}>{content}</button>
            );
          })}
        </div>

        {/* ── Store grid ─────────────────────────────────────────── */}
        {lojasList.length === 0 ? (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            padding: "80px 24px", gap: 16, background: "var(--bg-1)",
            borderRadius: 22, border: "1px solid var(--border-1)",
          }}>
            <div style={{ width: 64, height: 64, borderRadius: 20, background: "rgba(228,0,43,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Store size={30} style={{ color: "#E4002B" }} />
            </div>
            <p style={{ fontSize: 16, fontWeight: 800, color: "var(--text-2)", margin: 0 }}>Nenhuma franquia criada</p>
            <p style={{ fontSize: 13, color: "var(--text-4)", margin: 0, textAlign: "center", maxWidth: 340, lineHeight: 1.6 }}>
              Crie suas primeiras lojas para separar operações, catálogos e pedidos por unidade.
            </p>
            <button onClick={openAdd}
              style={{ padding: "10px 24px", borderRadius: 12, background: "#E4002B", color: "#fff", border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              Criar primeira loja
            </button>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 18 }}>
            {lojasList.map(l => (
              <div key={l.id} style={{
                background: "var(--bg-1)", borderRadius: 22,
                border: `1.5px solid ${lojaAtiva?.id === l.id ? l.cor + "50" : "var(--border-1)"}`,
                overflow: "hidden", opacity: l.ativo ? 1 : 0.65,
                boxShadow: lojaAtiva?.id === l.id ? `0 4px 24px ${l.cor}20` : "0 1px 4px rgba(0,0,0,0.05)",
                transition: "all .2s", position: "relative",
              }}>
                {/* Barra de cor */}
                <div style={{ height: 5, background: l.cor }} />

                <div style={{ padding: "16px 18px" }}>
                  {/* Topo: logo + nome + menu ⋮ */}
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
                      <div style={{
                        width: 46, height: 46, borderRadius: 14, background: l.cor, flexShrink: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        boxShadow: `0 4px 12px ${l.cor}40`,
                      }}>
                        <Store size={20} color="#fff" />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: 15, fontWeight: 900, color: "var(--text-1)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {l.nome}
                        </p>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                          {l.slug && <span style={{ fontSize: 11, color: "var(--text-4)", fontFamily: "monospace" }}>/{l.slug}</span>}
                          <span style={{
                            fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 999,
                            background: l.ativo ? "rgba(34,197,94,0.1)" : "rgba(148,163,184,0.12)",
                            color: l.ativo ? "#16a34a" : "var(--text-4)",
                          }}>
                            {l.ativo ? "Ativa" : "Inativa"}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Menu ⋮ */}
                    <div ref={menuAberto === l.id ? menuRef : undefined} style={{ position: "relative", flexShrink: 0 }}>
                      <button
                        onClick={() => setMenuAberto(menuAberto === l.id ? null : l.id)}
                        style={{ width: 32, height: 32, borderRadius: 9, border: "1px solid var(--border-1)", background: "var(--bg-2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-4)" }}>
                        <MoreVertical size={15} />
                      </button>
                      {menuAberto === l.id && (
                        <div style={{
                          position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 100,
                          background: "var(--bg-1)", borderRadius: 14, border: "1px solid var(--border-1)",
                          boxShadow: "0 8px 24px rgba(0,0,0,0.12)", overflow: "hidden", minWidth: 180,
                        }}>
                          <button onClick={() => openEdit(l)}
                            style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", background: "transparent", border: "none", cursor: "pointer", color: "var(--text-1)", fontSize: 13, fontWeight: 600 }}>
                            <Pencil size={14} style={{ color: "var(--text-4)" }} /> Editar loja
                          </button>
                          {l.slug && (
                            <a href={`/loja/${l.slug}`} target="_blank" rel="noopener noreferrer"
                              onClick={() => setMenuAberto(null)}
                              style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", color: "var(--text-1)", fontSize: 13, fontWeight: 600, textDecoration: "none", borderTop: "1px solid var(--border-1)" }}>
                              <ExternalLink size={14} style={{ color: "var(--text-4)" }} /> Ver vitrine
                            </a>
                          )}
                          <button onClick={() => handleToggle(l)}
                            style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", background: "transparent", border: "none", borderTop: "1px solid var(--border-1)", cursor: "pointer", color: "var(--text-1)", fontSize: 13, fontWeight: 600 }}>
                            {l.ativo ? <ToggleRight size={14} style={{ color: "#22c55e" }} /> : <ToggleLeft size={14} style={{ color: "var(--text-4)" }} />}
                            {l.ativo ? "Desativar" : "Ativar"}
                          </button>
                          <button onClick={() => handleDelete(l.id)} disabled={deleting === l.id}
                            style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", background: "transparent", border: "none", borderTop: "1px solid var(--border-1)", cursor: "pointer", color: "#E4002B", fontSize: 13, fontWeight: 600 }}>
                            <Trash2 size={14} /> {deleting === l.id ? "Excluindo…" : "Excluir loja"}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Descrição */}
                  {l.descricao && (
                    <p style={{ fontSize: 12, color: "var(--text-3)", margin: "0 0 14px", lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                      {l.descricao}
                    </p>
                  )}

                  {/* Stats row */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 14 }}>
                    {[
                      { label: "Pedidos hoje", value: l.pedidos_hoje,                                  icon: <Package size={12} />,    color: "#E4002B", bg: "rgba(228,0,43,0.08)" },
                      { label: "Faturamento",  value: `R$${l.faturamento_hoje.toFixed(0)}`,            icon: <DollarSign size={12} />, color: "#16a34a", bg: "rgba(34,197,94,0.08)" },
                      { label: "Entregues",    value: l.entregues_hoje,                                 icon: <CheckCircle size={12} />, color: "#3b82f6", bg: "rgba(59,130,246,0.08)" },
                    ].map(({ label, value, icon, color, bg }) => (
                      <div key={label} style={{ background: bg, borderRadius: 10, padding: "8px 10px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 3 }}>
                          <span style={{ color }}>{icon}</span>
                        </div>
                        <p style={{ fontSize: "clamp(13px, 3.5vw, 16px)", fontWeight: 900, color, margin: 0, lineHeight: 1, whiteSpace: "nowrap" }}>{value}</p>
                        <p style={{ fontSize: 9, fontWeight: 600, color, margin: "2px 0 0", opacity: 0.75, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Botão Acessar loja */}
                  <button
                    onClick={() => handleAcessarLoja(l)}
                    style={{
                      width: "100%", padding: "11px", borderRadius: 13,
                      background: lojaAtiva?.id === l.id ? `${l.cor}20` : l.cor,
                      color: lojaAtiva?.id === l.id ? l.cor : "#fff",
                      border: `1.5px solid ${l.cor}`,
                      fontSize: 13, fontWeight: 800, cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                      transition: "all .15s",
                    }}>
                    {lojaAtiva?.id === l.id ? (
                      <><Check size={14} /> Loja ativa</>
                    ) : (
                      <>Acessar loja <ArrowRight size={14} /></>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Modal criar/editar ──────────────────────────────────── */}
      {modalOpen && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,.5)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget) setModalOpen(false); }}>
          <div style={{ background: "var(--bg-1)", borderRadius: 24, width: "100%", maxWidth: 440, boxShadow: "0 24px 64px rgba(0,0,0,.18)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px", borderBottom: "1px solid var(--border-1)" }}>
              <p style={{ fontSize: 16, fontWeight: 900, color: "var(--text-1)", margin: 0 }}>{editLoja ? "Editar loja" : "Nova franquia"}</p>
              <button onClick={() => setModalOpen(false)} style={{ background: "var(--bg-2)", border: "none", borderRadius: 8, padding: 7, cursor: "pointer", color: "var(--text-4)", display: "flex" }}><X size={16} /></button>
            </div>

            <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 7 }}>Nome *</label>
                <input value={nome} onChange={e => setNome(e.target.value)}
                  placeholder="Ex: Pizzaria Norte, Loja Centro…"
                  style={{ width: "100%", padding: "10px 13px", borderRadius: 11, border: "1px solid var(--border-1)", fontSize: 14, color: "var(--text-1)", background: "var(--bg-input)" }} />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 7 }}>Descrição</label>
                <textarea value={descricao} onChange={e => setDescricao(e.target.value)} rows={2}
                  placeholder="Breve descrição da unidade"
                  style={{ width: "100%", padding: "10px 13px", borderRadius: 11, border: "1px solid var(--border-1)", fontSize: 13, color: "var(--text-1)", background: "var(--bg-input)", resize: "vertical", fontFamily: "inherit" }} />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 7 }}>Cor da loja</label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  {CORES_PRESET.map(c => (
                    <button key={c} onClick={() => setCor(c)}
                      style={{ width: 28, height: 28, borderRadius: 8, background: c, border: cor === c ? "3px solid var(--text-1)" : "2px solid transparent", cursor: "pointer" }} />
                  ))}
                  <input type="color" value={cor} onChange={e => setCor(e.target.value)}
                    style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid var(--border-1)", cursor: "pointer", padding: 2 }} />
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: cor, border: "1px solid var(--border-1)" }} />
                </div>
              </div>

              <button onClick={handleSave} disabled={saving || !nome.trim()}
                style={{ width: "100%", padding: 13, borderRadius: 14, background: saving || !nome.trim() ? "var(--text-5)" : cor, color: "#fff", border: "none", fontSize: 14, fontWeight: 900, cursor: saving ? "default" : "pointer", transition: "background .15s" }}>
                {saving ? "Salvando…" : editLoja ? "Salvar alterações" : "Criar franquia"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
