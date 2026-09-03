"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Bell, Package, CheckCircle, Bike, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface Notif {
  id: string;
  icon: "pedido" | "entregue" | "motoboy";
  texto: string;
  at: Date;
  lida: boolean;
}

function timeAgo(d: Date): string {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60)   return "agora";
  if (s < 3600) return `${Math.floor(s / 60)}min atrás`;
  if (s < 86400) return `${Math.floor(s / 3600)}h atrás`;
  return d.toLocaleDateString("pt-BR");
}

const ICON_MAP = {
  pedido:   { Icon: Package,      color: "#fbbf24" },
  entregue: { Icon: CheckCircle,  color: "#22c55e" },
  motoboy:  { Icon: Bike,         color: "#60a5fa" },
};

interface Props { empresaId: string }

export default function NotificationsWidget({ empresaId }: Props) {
  const supabase    = useMemo(() => createClient(), []);
  const channelId   = useRef(`notifs-${empresaId}-${Math.random().toString(36).slice(2, 8)}`);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [open, setOpen]     = useState(false);
  const panelRef            = useRef<HTMLDivElement>(null);

  const push = (n: Omit<Notif, "id" | "at" | "lida">) =>
    setNotifs((prev) => {
      // Ignora se a mesma mensagem já apareceu nos últimos 60s
      if (prev.some(p => p.texto === n.texto && Date.now() - p.at.getTime() < 60_000)) return prev;
      return [{ ...n, id: crypto.randomUUID(), at: new Date(), lida: false }, ...prev.slice(0, 19)];
    });

  useEffect(() => {
    const ch = supabase
      .channel(channelId.current)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "pedidos", filter: `empresa_id=eq.${empresaId}` },
        (payload) => {
          const nome = (payload.new as { cliente_nome?: string }).cliente_nome ?? "cliente";
          push({ icon: "pedido", texto: `Novo pedido de ${nome}` });
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "pedidos", filter: `empresa_id=eq.${empresaId}` },
        (payload) => {
          const p = payload.new as { status?: string; cliente_nome?: string };
          if (p.status === "entregue")
            push({ icon: "entregue", texto: `Entrega de ${p.cliente_nome ?? "pedido"} confirmada` });
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "motoboys", filter: `empresa_id=eq.${empresaId}` },
        (payload) => {
          const prev = payload.old as { status?: string };
          const next = payload.new as { status?: string; nome?: string };
          if (next.status === prev.status) return;
          if (next.status === "disponivel")
            push({ icon: "motoboy", texto: `${next.nome ?? "Motoboy"} ficou disponível` });
          if (next.status === "offline")
            push({ icon: "motoboy", texto: `${next.nome ?? "Motoboy"} foi offline` });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [empresaId, supabase]);

  /* fecha ao clicar fora */
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const naoLidas = notifs.filter((n) => !n.lida).length;

  function abrir() {
    setOpen((v) => !v);
    if (!open) setNotifs((prev) => prev.map((n) => ({ ...n, lida: true })));
  }

  return (
    <div ref={panelRef} className="relative">
      {/* Bell button */}
      <button
        onClick={abrir}
        className="relative flex items-center justify-center w-9 h-9 rounded-xl transition-all"
        style={{ color: open ? "#E4002B" : "#374151", background: open ? "rgba(228,0,43,0.1)" : "transparent" }}
        onMouseEnter={(e) => { if (!open) (e.currentTarget as HTMLElement).style.color = "#9ca3af"; }}
        onMouseLeave={(e) => { if (!open) (e.currentTarget as HTMLElement).style.color = "#374151"; }}
      >
        <Bell size={17} />
        {naoLidas > 0 && (
          <span
            className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-white font-black"
            style={{ background: "#E4002B", fontSize: 9 }}
          >
            {naoLidas > 9 ? "9+" : naoLidas}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div
          className="absolute left-full top-0 ml-2 w-72 rounded-2xl shadow-2xl z-50 overflow-hidden"
          style={{ background: "#111", border: "1px solid #1f1f1f" }}
        >
          <div className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: "1px solid #1a1a1a" }}>
            <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "#475569" }}>
              Notificações
            </p>
            <button onClick={() => setNotifs([])} className="text-xs" style={{ color: "#374151" }}>
              Limpar
            </button>
          </div>

          <div className="overflow-y-auto" style={{ maxHeight: 320 }}>
            {notifs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <Bell size={24} style={{ color: "#1f2937" }} />
                <p className="text-xs" style={{ color: "#374151" }}>Nenhuma notificação</p>
              </div>
            ) : (
              notifs.map((n) => {
                const { Icon, color } = ICON_MAP[n.icon];
                return (
                  <div key={n.id} className="flex items-start gap-3 px-4 py-3"
                    style={{ borderBottom: "1px solid #141414", background: n.lida ? "transparent" : "rgba(228,0,43,0.03)" }}>
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                      style={{ background: color + "18" }}>
                      <Icon size={13} style={{ color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-white leading-snug">{n.texto}</p>
                      <p className="text-xs mt-0.5" style={{ color: "#374151" }}>{timeAgo(n.at)}</p>
                    </div>
                    <button onClick={() => setNotifs((p) => p.filter((x) => x.id !== n.id))}
                      className="shrink-0 mt-0.5" style={{ color: "#1f2937" }}>
                      <X size={12} />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
