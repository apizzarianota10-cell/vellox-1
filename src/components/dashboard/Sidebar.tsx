"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Users, Package, Map, LogOut,
  Zap, DollarSign, Settings, Monitor,
  Bell, X, CheckCircle, Bike, ShoppingBag,
  Store, ChevronDown, Check, Crown, Lock, Menu, Shield,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useState, useEffect, useRef, useMemo } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useLoja } from "@/contexts/LojaContext";
import { PLANO_LABEL, PLANO_COLOR, KTL_ROUTES } from "@/contexts/PlanoContext";
import PrintAgentStatus from "@/components/dashboard/PrintAgentStatus";
import type { Plano, Loja } from "@/types";

const NAV_BASE = [
  { href: "/dashboard",     label: "Dashboard",    icon: LayoutDashboard, color: "#FF6A00" },
  { href: "/mapa",          label: "Mapa ao vivo", icon: Map,             color: "#34d399" },
  { href: "/motoboys",      label: "Motoboys",     icon: Users,           color: "#60a5fa" },
  { href: "/pedidos",       label: "Pedidos",      icon: Package,         color: "#FF8C1A" },
  { href: "/catalogo",      label: "Catálogo",     icon: ShoppingBag,     color: "#f59e0b" },
  { href: "/monitor",       label: "Monitor",      icon: Monitor,         color: "#a78bfa" },
  { href: "/financeiro",    label: "Financeiro",   icon: DollarSign,      color: "#34d399" },
  { href: "/auditoria",     label: "Auditoria",    icon: Shield,          color: "#a78bfa" },
  { href: "/automacoes",    label: "Automações",   icon: Zap,             color: "#FF6A00" },
  { href: "/configuracoes", label: "Config.",      icon: Settings,        color: "#666666" },
];

const NAV_ENTERPRISE = [
  { href: "/lojas", label: "Minhas Lojas", icon: Store, color: "#f97316" },
];

const NAV_KTL = [
  { href: "/pedidos",       label: "Pedidos",    icon: Package,    color: "#FF8C1A" },
  { href: "/motoboys",      label: "Motoboys",   icon: Users,      color: "#60a5fa" },
  { href: "/financeiro",    label: "Financeiro", icon: DollarSign, color: "#34d399" },
  { href: "/catalogo",      label: "Catálogo",   icon: ShoppingBag, color: "#f59e0b" },
  { href: "/automacoes",    label: "Automações", icon: Zap,        color: "#FF6A00" },
  { href: "/configuracoes", label: "Config.",    icon: Settings,   color: "#666666" },
];

interface Notif {
  id: string;
  icon: "pedido" | "entregue" | "motoboy";
  texto: string;
  at: Date;
  lida: boolean;
}

function timeAgo(d: Date): string {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60)    return "agora";
  if (s < 3600)  return `${Math.floor(s / 60)}min atrás`;
  if (s < 86400) return `${Math.floor(s / 3600)}h atrás`;
  return d.toLocaleDateString("pt-BR");
}

const ICON_MAP = {
  pedido:   { Icon: Package,     color: "#fbbf24" },
  entregue: { Icon: CheckCircle, color: "#22c55e" },
  motoboy:  { Icon: Bike,        color: "#60a5fa" },
};

interface Props {
  empresaNome:   string | null;
  empresaCodigo: string | null;
  empresaId:     string | null;
  plano:         Plano;
  lojas:         Loja[];
}

export default function Sidebar({ empresaNome, empresaCodigo, empresaId, plano, lojas }: Props) {
  const pathname = usePathname();
  const supabase = useMemo(() => createClient(), []);
  const { lojaAtiva, setLojaAtiva } = useLoja();

  const channelId   = useRef(`notifs-${empresaId}-${Math.random().toString(36).slice(2, 8)}`);
  const [notifs, setNotifs]           = useState<Notif[]>([]);
  const [notifOpen, setNotifOpen]     = useState(false);
  const [lojaDropOpen, setLojaDropOpen] = useState(false);
  const [menuOpen, setMenuOpen]       = useState(false);
  const panelRef   = useRef<HTMLDivElement>(null);
  const lojaRef    = useRef<HTMLDivElement>(null);

  const nav = plano === "ktl"
    ? NAV_KTL
    : plano === "enterprise"
    ? [...NAV_BASE.slice(0, 4), ...NAV_ENTERPRISE, ...NAV_BASE.slice(4)]
    : NAV_BASE;

  function push(n: Omit<Notif, "id" | "at" | "lida">) {
    setNotifs((prev) => {
      if (prev.some(p => p.texto === n.texto && Date.now() - p.at.getTime() < 60_000)) return prev;
      return [{ ...n, id: crypto.randomUUID(), at: new Date(), lida: false }, ...prev.slice(0, 19)];
    });
  }

  useEffect(() => {
    if (!empresaId) return;
    const ch = supabase
      .channel(channelId.current)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "pedidos", filter: `empresa_id=eq.${empresaId}` },
        (payload) => {
          const nome = (payload.new as { cliente_nome?: string }).cliente_nome ?? "cliente";
          push({ icon: "pedido", texto: `Novo pedido de ${nome}` });
        })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "pedidos", filter: `empresa_id=eq.${empresaId}` },
        (payload) => {
          const p = payload.new as { status?: string; cliente_nome?: string };
          if (p.status === "entregue")
            push({ icon: "entregue", texto: `Entrega de ${p.cliente_nome ?? "pedido"} confirmada` });
        })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "motoboys", filter: `empresa_id=eq.${empresaId}` },
        (payload) => {
          const prev = payload.old as { status?: string };
          const next = payload.new as { status?: string; nome?: string };
          if (next.status === prev.status) return;
          if (next.status === "disponivel")
            push({ icon: "motoboy", texto: `${next.nome ?? "Motoboy"} ficou disponível` });
          if (next.status === "offline")
            push({ icon: "motoboy", texto: `${next.nome ?? "Motoboy"} foi offline` });
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [empresaId, supabase]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setNotifOpen(false);
      if (lojaRef.current && !lojaRef.current.contains(e.target as Node)) setLojaDropOpen(false);
    }
    if (notifOpen || lojaDropOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [notifOpen, lojaDropOpen]);

  const naoLidas = notifs.filter((n) => !n.lida).length;
  const planoCfg = PLANO_COLOR[plano];

  function toggleNotif() {
    setNotifOpen((v) => !v);
    if (!notifOpen) setNotifs((prev) => prev.map((n) => ({ ...n, lida: true })));
  }

  async function handleLogout() {
    await createClient().auth.signOut({ scope: "global" });
    window.location.href = "/login";
  }

  const inicial = empresaNome?.charAt(0).toUpperCase() ?? "V";

  function PlanoBadge() {
    return (
      <span style={{
        fontSize: 10, fontWeight: 800, letterSpacing: "0.04em",
        padding: "2px 7px", borderRadius: 999,
        background: planoCfg.bg, color: planoCfg.text,
        border: `1px solid ${planoCfg.border}`,
        textTransform: "uppercase",
      }}>
        {PLANO_LABEL[plano]}
      </span>
    );
  }

  function BellBtn() {
    return (
      <button
        onClick={toggleNotif}
        className="relative flex items-center justify-center w-9 h-9 rounded-xl transition-all"
        style={{ color: notifOpen ? "#FF6A00" : "var(--text-4)", background: notifOpen ? "rgba(255,106,0,0.1)" : "transparent" }}
        onMouseEnter={(e) => { if (!notifOpen) (e.currentTarget as HTMLElement).style.color = "var(--text-3)"; }}
        onMouseLeave={(e) => { if (!notifOpen) (e.currentTarget as HTMLElement).style.color = "var(--text-4)"; }}
      >
        <Bell size={17} />
        {naoLidas > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center font-black"
            style={{ background: "#FF6A00", color: "white", fontSize: 9 }}>
            {naoLidas > 9 ? "9+" : naoLidas}
          </span>
        )}
      </button>
    );
  }

  // ── Seletor de loja (Business) ────────────────────────────────
  function LojaSwitcher() {
    if (plano !== "enterprise" || lojas.length === 0) return null;
    return (
      <div ref={lojaRef} style={{ position: "relative", margin: "0 8px 4px" }}>
        <button
          onClick={() => setLojaDropOpen((v) => !v)}
          style={{
            width: "100%", display: "flex", alignItems: "center", gap: 8,
            padding: "8px 10px", borderRadius: 10,
            background: lojaDropOpen ? "var(--overlay-sm)" : "transparent",
            border: "1px solid var(--border-1)",
            cursor: "pointer", transition: "background .15s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--overlay-sm)")}
          onMouseLeave={(e) => { if (!lojaDropOpen) e.currentTarget.style.background = "transparent"; }}
        >
          <div style={{ width: 26, height: 26, borderRadius: 8, background: lojaAtiva?.cor ?? "#FF6A00", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Store size={13} color="#fff" />
          </div>
          <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: "var(--text-1)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {lojaAtiva?.nome ?? "Todas as lojas"}
            </p>
            <p style={{ fontSize: 10, color: "var(--text-4)", margin: 0 }}>Loja ativa</p>
          </div>
          <ChevronDown size={13} style={{ color: "var(--text-4)", flexShrink: 0, transform: lojaDropOpen ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
        </button>

        {lojaDropOpen && (
          <div style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 200,
            background: "var(--bg-1)", borderRadius: 12, border: "1px solid var(--border-1)",
            boxShadow: "0 8px 24px rgba(0,0,0,.12)", overflow: "hidden",
          }}>
            <button
              onClick={() => { setLojaAtiva(null); setLojaDropOpen(false); }}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 8,
                padding: "10px 12px", background: !lojaAtiva ? "rgba(255,106,0,.06)" : "transparent",
                border: "none", cursor: "pointer", transition: "background .12s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--overlay-sm)")}
              onMouseLeave={(e) => { e.currentTarget.style.background = !lojaAtiva ? "rgba(255,106,0,.06)" : "transparent"; }}
            >
              <div style={{ width: 24, height: 24, borderRadius: 7, background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Store size={12} style={{ color: "#64748b" }} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-1)", flex: 1, textAlign: "left" }}>Todas as lojas</span>
              {!lojaAtiva && <Check size={12} style={{ color: "#FF6A00" }} />}
            </button>
            {lojas.map((l) => (
              <button
                key={l.id}
                onClick={() => { setLojaAtiva(l); setLojaDropOpen(false); }}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 8,
                  padding: "10px 12px",
                  background: lojaAtiva?.id === l.id ? "rgba(255,106,0,.06)" : "transparent",
                  border: "none", borderTop: "1px solid var(--border-1)", cursor: "pointer", transition: "background .12s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--overlay-sm)")}
                onMouseLeave={(e) => { e.currentTarget.style.background = lojaAtiva?.id === l.id ? "rgba(255,106,0,.06)" : "transparent"; }}
              >
                <div style={{ width: 24, height: 24, borderRadius: 7, background: l.cor, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Store size={12} color="#fff" />
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-1)", flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.nome}</span>
                {lojaAtiva?.id === l.id && <Check size={12} style={{ color: "#FF6A00" }} />}
              </button>
            ))}
            <div style={{ borderTop: "1px solid var(--border-1)", padding: "6px 8px" }}>
              <Link
                href="/lojas"
                onClick={() => setLojaDropOpen(false)}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", borderRadius: 8, fontSize: 11, fontWeight: 700, color: "#FF6A00", textDecoration: "none" }}
              >
                <Store size={11} /> Gerenciar lojas
              </Link>
            </div>
          </div>
        )}
      </div>
    );
  }

  function NavItem({ href, label, icon: Icon, color }: { href: string; label: string; icon: React.ElementType; color: string }) {
    const active = pathname === href;
    const isLocked = (href === "/monitor" && plano === "basic") ||
                     (href === "/lojas"   && plano !== "enterprise");
    return (
      <Link
        href={href}
        prefetch={false}
        className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all relative group"
        style={active ? { background: `${color}14`, color, boxShadow: `inset 0 0 0 1px ${color}20` } : { color: "var(--text-3)" }}
        onMouseEnter={(e) => { if (!active) { (e.currentTarget as HTMLElement).style.background = "var(--overlay-sm)"; (e.currentTarget as HTMLElement).style.color = "var(--text-1)"; } }}
        onMouseLeave={(e) => { if (!active) { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "var(--text-3)"; } }}
      >
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all"
          style={{ background: active ? `${color}22` : "transparent", color: active ? color : "inherit" }}>
          <Icon size={17} />
        </div>
        <span className="flex-1">{label}</span>
        {isLocked && <Lock size={11} style={{ color: "var(--text-5)", flexShrink: 0 }} />}
        {active && !isLocked && <div className="w-1.5 h-1.5 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />}
      </Link>
    );
  }

  return (
    <>
      {/* ── Painel de notificações ── */}
      {notifOpen && (
        <div ref={panelRef} className="fixed top-[60px] right-3 md:top-4 md:left-[256px] w-72 rounded-2xl shadow-2xl z-[200] overflow-hidden"
          style={{ background: "var(--bg-1)", border: "1px solid var(--border-1)" }}>
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--border-1)" }}>
            <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>Notificações</p>
            <button onClick={() => setNotifs([])} className="text-xs" style={{ color: "var(--text-4)" }}>Limpar</button>
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: 320 }}>
            {notifs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <Bell size={24} style={{ color: "var(--text-5)" }} />
                <p className="text-xs" style={{ color: "var(--text-5)" }}>Nenhuma notificação</p>
              </div>
            ) : notifs.map((n) => {
              const { Icon, color } = ICON_MAP[n.icon];
              return (
                <div key={n.id} className="flex items-start gap-3 px-4 py-3"
                  style={{ borderBottom: "1px solid var(--border-1)", background: n.lida ? "transparent" : "rgba(255,106,0,0.04)" }}>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5" style={{ background: color + "18" }}>
                    <Icon size={13} style={{ color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs leading-snug" style={{ color: "var(--text-1)" }}>{n.texto}</p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--text-4)" }}>{timeAgo(n.at)}</p>
                  </div>
                  <button onClick={() => setNotifs((p) => p.filter((x) => x.id !== n.id))} className="shrink-0 mt-0.5" style={{ color: "var(--text-5)" }}>
                    <X size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Mobile top bar ── */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4"
        style={{ height: 56, background: "var(--glass-surface)", borderBottom: "1px solid var(--glass-border)", backdropFilter: "blur(12px)" }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 font-bold text-sm"
            style={{ background: "linear-gradient(135deg,#FF6A00,#cc5500)", color: "white", boxShadow: "0 0 14px rgba(255,106,0,0.45)" }}>
            {empresaNome ? inicial : <Zap size={14} style={{ color: "white" }} />}
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold leading-tight truncate max-w-[150px]" style={{ color: "var(--text-1)", letterSpacing: "-0.02em" }}>
              {lojaAtiva?.nome ?? empresaNome ?? "Vellox"}
            </span>
            <PlanoBadge />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {empresaId && <BellBtn />}
        </div>
      </header>

      {/* ── Desktop sidebar ── */}
      <aside className="hidden md:flex w-60 flex-col shrink-0 sticky top-0 h-screen"
        style={{ background: "var(--sidebar-bg)", borderRight: "1px solid var(--border-1)" }}>
        {/* Brand header */}
        <div className="px-4 py-4 flex items-center gap-3" style={{ borderBottom: "1px solid var(--border-1)" }}>
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 font-bold text-base"
            style={{ background: "linear-gradient(135deg,#FF6A00,#cc5500)", color: "white", boxShadow: "0 0 20px rgba(255,106,0,0.35)" }}>
            {empresaNome ? inicial : <Zap size={18} style={{ color: "white" }} />}
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-sm font-bold truncate leading-tight" style={{ color: "var(--text-1)", letterSpacing: "-0.02em" }}>
              {empresaNome ?? "Vellox"}
            </span>
            <div style={{ marginTop: 3 }}><PlanoBadge /></div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <ThemeToggle />
            {empresaId && <BellBtn />}
          </div>
        </div>

        {/* Loja switcher (enterprise) */}
        <div style={{ paddingTop: 8 }}>
          <LojaSwitcher />
        </div>

        {/* Nav */}
        <nav className="flex-1 py-2 px-2 space-y-0.5 overflow-y-auto">
          <p className="text-xs font-semibold uppercase tracking-widest px-3 pb-2 pt-1" style={{ color: "var(--text-5)" }}>Menu</p>
          {nav.map(({ href, label, icon, color }) => (
            <NavItem key={href} href={href} label={label} icon={icon} color={color} />
          ))}

          {/* Upgrade hint */}
          {plano === "basic" && (
            <div style={{ margin: "12px 4px 0", padding: "10px 12px", borderRadius: 12, background: "rgba(124,58,237,.04)", border: "1px solid rgba(124,58,237,.12)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <Zap size={12} style={{ color: "#7c3aed" }} />
                <span style={{ fontSize: 11, fontWeight: 800, color: "#7c3aed" }}>Upgrade para Pro</span>
              </div>
              <p style={{ fontSize: 11, color: "var(--text-3)", margin: "0 0 8px", lineHeight: 1.4 }}>Monitor de pedidos (TV/balcão) e motoboys ilimitados.</p>
              <Link href="/#planos" target="_blank" style={{ fontSize: 11, fontWeight: 700, color: "#7c3aed", textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
                Ver planos <Crown size={11} />
              </Link>
            </div>
          )}
          {plano === "pro" && (
            <div style={{ margin: "12px 4px 0", padding: "10px 12px", borderRadius: 12, background: "rgba(217,119,6,.04)", border: "1px solid rgba(217,119,6,.12)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <Crown size={12} style={{ color: "#d97706" }} />
                <span style={{ fontSize: 11, fontWeight: 800, color: "#d97706" }}>Multi-loja no Business</span>
              </div>
              <p style={{ fontSize: 11, color: "var(--text-3)", margin: "0 0 6px", lineHeight: 1.4 }}>Gerencie várias lojas e franquias em um único painel.</p>
              <Link href="/#planos" target="_blank" style={{ fontSize: 11, fontWeight: 700, color: "#d97706", textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
                Fazer upgrade <Crown size={11} />
              </Link>
            </div>
          )}
        </nav>

        {/* Print Agent status chip */}
        <div className="px-3 pb-2">
          <PrintAgentStatus empresaId={empresaId} />
        </div>

        {/* Logout */}
        <div className="px-2 pb-5" style={{ borderTop: "1px solid var(--border-1)", paddingTop: "12px" }}>
          <button onClick={handleLogout}
            className="flex w-full items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all"
            style={{ color: "var(--text-4)" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,106,0,0.08)"; (e.currentTarget as HTMLElement).style.color = "#FF6A00"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "var(--text-4)"; }}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"><LogOut size={17} /></div>
            <span>Sair</span>
          </button>
        </div>
      </aside>

      {/* ── Mobile bottom nav (5 itens fixos) ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-end"
        style={{ background: "var(--glass-surface)", borderTop: "1px solid var(--glass-border)", backdropFilter: "blur(16px)", paddingBottom: "env(safe-area-inset-bottom)" }}>
        {(plano === "ktl"
          ? [
              { href: "/pedidos",    label: "Pedidos",    icon: Package,    color: "#FF8C1A" },
              { href: "/motoboys",   label: "Motoboys",   icon: Users,      color: "#60a5fa" },
              { href: "/financeiro", label: "Financeiro", icon: DollarSign, color: "#34d399" },
              { href: "/catalogo",   label: "Catálogo",   icon: ShoppingBag, color: "#f59e0b" },
            ]
          : [
              { href: "/dashboard", label: "Início",   icon: LayoutDashboard, color: "#FF6A00" },
              { href: "/pedidos",   label: "Pedidos",  icon: Package,         color: "#fb923c" },
              { href: "/motoboys",  label: "Motoboys", icon: Users,           color: "#60a5fa" },
              { href: "/monitor",   label: "Monitor",  icon: Monitor,         color: "#a78bfa" },
            ]
        ).map(({ href, label, icon: Icon, color }) => {
          const active   = pathname === href;
          const isLocked = href === "/monitor" && plano === "basic";
          const iconColor = isLocked ? "var(--text-5)" : (active ? color : "var(--text-4)");
          return (
            <Link key={href} href={href} prefetch={false}
              className="flex flex-col items-center justify-center gap-1 flex-1 py-2.5 relative"
              style={{ color: iconColor }}>
              {active && !isLocked && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-5 h-0.5 rounded-full" style={{ background: color }} />}
              <div className="flex items-center justify-center rounded-xl relative" style={{ width: 36, height: 30, background: active && !isLocked ? `${color}15` : "transparent" }}>
                <Icon size={20} strokeWidth={active ? 2.2 : 1.8} />
                {isLocked && <Lock size={8} style={{ color: "var(--text-5)", position: "absolute", bottom: 2, right: 2 }} />}
              </div>
              <span style={{ fontSize: 9.5, fontWeight: active ? 700 : 500 }}>{label}</span>
            </Link>
          );
        })}
        {/* Botão Menu (não mostrar para KTL) */}
        {plano !== "ktl" && (
          <button onClick={() => setMenuOpen(true)}
            className="flex flex-col items-center justify-center gap-1 flex-1 py-2.5 relative"
            style={{ background: "transparent", border: "none", cursor: "pointer", color: menuOpen ? "#FF6A00" : "var(--text-4)" }}>
            <div className="flex items-center justify-center rounded-xl relative" style={{ width: 36, height: 30, background: menuOpen ? "rgba(255,106,0,0.12)" : "transparent" }}>
              <Menu size={20} strokeWidth={1.8} />
              {naoLidas > 0 && (
                <span className="absolute -top-1 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center"
                  style={{ background: "#FF6A00", color: "white", fontSize: 8, fontWeight: 900, lineHeight: 1 }}>
                  {naoLidas > 9 ? "9+" : naoLidas}
                </span>
              )}
            </div>
            <span style={{ fontSize: 9.5, fontWeight: 500 }}>Menu</span>
          </button>
        )}
      </nav>

      {/* ── Mobile menu drawer ── */}
      {menuOpen && (
        <>
          {/* Backdrop */}
          <div className="md:hidden fixed inset-0 z-[60]"
            style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(2px)" }}
            onClick={() => setMenuOpen(false)} />

          {/* Drawer */}
          <div className="md:hidden fixed bottom-0 left-0 right-0 z-[70] rounded-t-3xl overflow-hidden"
            style={{ background: "var(--bg-1)", boxShadow: "0 -12px 48px rgba(0,0,0,0.18)", maxHeight: "85dvh", overflowY: "auto" }}>

            {/* Handle */}
            <div className="flex justify-center pt-3 pb-0">
              <div className="w-10 h-1 rounded-full" style={{ background: "var(--border-2)" }} />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-4 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm"
                  style={{ background: "linear-gradient(135deg,#FF6A00,#cc5500)", color: "white" }}>
                  {inicial}
                </div>
                <div>
                  <p className="text-sm font-bold leading-tight" style={{ color: "var(--text-1)" }}>{empresaNome ?? "Vellox"}</p>
                  <PlanoBadge />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <ThemeToggle />
                <button onClick={() => setMenuOpen(false)}
                  style={{ color: "var(--text-4)", background: "var(--bg-2)", border: "none", borderRadius: 10, padding: 7, cursor: "pointer", display: "flex", alignItems: "center" }}>
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Loja switcher enterprise */}
            {plano === "enterprise" && lojas.length > 0 && (
              <div className="px-4 pb-3">
                <LojaSwitcher />
              </div>
            )}

            <div style={{ height: 1, background: "var(--border-1)", margin: "0 20px" }} />

            {/* Grid de seções secundárias */}
            <div className="px-4 pt-4 pb-2">
              <p style={{ fontSize: 10, fontWeight: 700, color: "var(--text-5)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Mais seções</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                {(plano === "ktl"
                  ? [
                      { href: "/catalogo",   label: "Catálogo",   icon: ShoppingBag, color: "#f59e0b" },
                      { href: "/financeiro", label: "Financeiro", icon: DollarSign,  color: "#22c55e" },
                      { href: "/automacoes", label: "Automações", icon: Zap,         color: "#FF6A00" },
                    ]
                  : [
                      { href: "/mapa",          label: "Mapa",       icon: Map,         color: "#34d399" },
                      { href: "/catalogo",      label: "Catálogo",   icon: ShoppingBag, color: "#f59e0b" },
                      { href: "/financeiro",    label: "Financeiro", icon: DollarSign,  color: "#22c55e" },
                      { href: "/auditoria",     label: "Auditoria",  icon: Shield,      color: "#a78bfa" },
                      { href: "/automacoes",    label: "Automações", icon: Zap,         color: "#FF6A00" },
                      { href: "/configuracoes", label: "Config.",    icon: Settings,    color: "#94a3b8" },
                      ...(plano === "enterprise" ? [{ href: "/lojas", label: "Lojas", icon: Store, color: "#f97316" }] : []),
                    ]
                ).map(({ href, label, icon: Icon, color }) => {
                  const isLocked = (href === "/monitor"   && plano === "basic") ||
                                   (href === "/financeiro" && plano === "basic") ||
                                   (href === "/lojas"      && plano !== "enterprise");
                  return (
                    <Link key={href} href={href} prefetch={false}
                      onClick={() => setMenuOpen(false)}
                      style={{
                        display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                        padding: "14px 8px", borderRadius: 18, textDecoration: "none",
                        background: "var(--bg-2)", position: "relative",
                      }}>
                      <div style={{
                        width: 42, height: 42, borderRadius: 14,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        background: isLocked ? "var(--bg-3)" : `${color}18`,
                      }}>
                        <Icon size={20} style={{ color: isLocked ? "var(--text-5)" : color }} />
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 600, color: isLocked ? "var(--text-5)" : "var(--text-2)", textAlign: "center" }}>{label}</span>
                      {isLocked && (
                        <Lock size={9} style={{ color: "var(--text-5)", position: "absolute", top: 10, right: 10 }} />
                      )}
                    </Link>
                  );
                })}

                {/* Notificações */}
                <button
                  onClick={() => { setMenuOpen(false); toggleNotif(); }}
                  style={{
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                    padding: "14px 8px", borderRadius: 18,
                    background: "var(--bg-2)", border: "none", cursor: "pointer", position: "relative",
                  }}>
                  <div style={{ width: 42, height: 42, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,106,0,0.1)", position: "relative" }}>
                    <Bell size={20} style={{ color: "#FF6A00" }} />
                    {naoLidas > 0 && (
                      <span style={{ position: "absolute", top: -4, right: -4, minWidth: 16, height: 16, borderRadius: 999, background: "#FF6A00", color: "white", fontSize: 8, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px" }}>
                        {naoLidas > 9 ? "9+" : naoLidas}
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-2)" }}>Alertas</span>
                </button>
              </div>
            </div>

            {/* Upgrade hint (não mostrar para KTL) */}
            {plano === "basic" && (
              <div style={{ margin: "12px 16px 4px", padding: "12px 14px", borderRadius: 16, background: "rgba(255,106,0,0.06)", border: "1px solid rgba(255,106,0,0.18)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <Zap size={12} style={{ color: "#FF6A00" }} />
                  <span style={{ fontSize: 12, fontWeight: 800, color: "#FF6A00" }}>Faça upgrade para Pro</span>
                </div>
                <p style={{ fontSize: 11, color: "var(--text-3)", margin: "0 0 8px", lineHeight: 1.5 }}>Catálogo digital, despacho automático e relatórios financeiros.</p>
                <Link href="/#planos" target="_blank" onClick={() => setMenuOpen(false)}
                  style={{ fontSize: 11, fontWeight: 700, color: "#FF6A00", textDecoration: "none" }}>
                  Ver planos →
                </Link>
              </div>
            )}
            {plano === "pro" && (
              <div style={{ margin: "12px 16px 4px", padding: "12px 14px", borderRadius: 16, background: "rgba(217,119,6,0.06)", border: "1px solid rgba(217,119,6,0.15)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <Crown size={12} style={{ color: "#d97706" }} />
                  <span style={{ fontSize: 12, fontWeight: 800, color: "#d97706" }}>Multi-loja no Business</span>
                </div>
                <Link href="/#planos" target="_blank" onClick={() => setMenuOpen(false)}
                  style={{ fontSize: 11, fontWeight: 700, color: "#d97706", textDecoration: "none" }}>
                  Fazer upgrade →
                </Link>
              </div>
            )}

            {/* Sair */}
            <div style={{ padding: "12px 16px", paddingBottom: "calc(16px + env(safe-area-inset-bottom))" }}>
              <button onClick={handleLogout}
                style={{
                  width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  padding: "13px", borderRadius: 16, background: "rgba(255,106,0,0.08)",
                  border: "none", cursor: "pointer", color: "#FF6A00", fontSize: 13, fontWeight: 700,
                }}>
                <LogOut size={15} /> Sair da conta
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
