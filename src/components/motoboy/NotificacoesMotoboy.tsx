"use client";

/**
 * Avisos de pedido novo para o app do motoboy.
 *
 * - Pede permissão de notificação (banner discreto, só para motoboy logado).
 * - Escuta o realtime de `pedidos` das empresas do motoboy e mostra uma
 *   notificação do sistema (via service worker /motoboy-sw.js) quando:
 *     · um pedido é atribuído a ele;
 *     · um pedido fica disponível na fila (finalizado e sem motoboy);
 *     · um pedido dele é cancelado.
 *
 * Funciona com o app aberto ou em segundo plano (enquanto o navegador mantém a
 * aba/PWA viva). Com o app FECHADO só funciona com Web Push (VAPID) — ver
 * public/motoboy-sw.js, que já trata o evento "push".
 *
 * Independe de src/app/motoboy/page.tsx: tem sessão e canais próprios.
 */

import { useEffect, useRef, useState } from "react";
import { Bell, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { mostrarNotificacaoMotoboy, registrarSwMotoboy, swSuportado } from "@/lib/motoboySw";

type Permissao = NotificationPermission | "unsupported";

interface PedidoEvento {
  id?: string;
  motoboy_id?: string | null;
  status?: string | null;
  cliente_nome?: string | null;
  endereco_entrega?: string | null;
  bairro?: string | null;
  valor_motoboy?: number | null;
}

const STATUS_ATRIBUIDO = new Set(["finalizado", "em_coleta", "em_rota_de_entrega"]);
const DISPENSA_KEY = "vellox_mb_notif_dispensado_ate";
const DISPENSA_MS = 3 * 24 * 60 * 60 * 1000;

function lerDispensa(): boolean {
  try { return Number(localStorage.getItem(DISPENSA_KEY) ?? 0) > Date.now(); } catch { return false; }
}

function resumo(p: PedidoEvento): string {
  const partes = [p.cliente_nome, [p.endereco_entrega, p.bairro].filter(Boolean).join(" — ")].filter(Boolean);
  const valor = typeof p.valor_motoboy === "number" && p.valor_motoboy > 0
    ? ` · R$ ${p.valor_motoboy.toFixed(2).replace(".", ",")}` : "";
  return (partes.join(" · ") || "Abra o app para ver os detalhes.") + valor;
}

export default function NotificacoesMotoboy() {
  const [permissao, setPermissao] = useState<Permissao>("default");
  const [motoboyId, setMotoboyId] = useState<string | null>(null);
  const [dispensado, setDispensado] = useState(true);
  const avisadosRef = useRef<Set<string>>(new Set());

  // Permissão atual + registro do SW (só notificações, sem cache)
  useEffect(() => {
    setPermissao(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
    setDispensado(lerDispensa());
    if (swSuportado()) registrarSwMotoboy();
  }, []);

  // Descobre o motoboy logado (e acompanha login/logout feitos na página)
  useEffect(() => {
    const supabase = createClient();
    let ativo = true;

    async function carregar(userId: string | null) {
      if (!userId) { if (ativo) setMotoboyId(null); return; }
      const { data } = await supabase.from("motoboys").select("id").eq("auth_id", userId).maybeSingle();
      if (ativo) setMotoboyId((data as { id: string } | null)?.id ?? null);
    }

    supabase.auth.getUser().then(({ data }) => carregar(data.user?.id ?? null)).catch(() => {});
    const { data: sub } = supabase.auth.onAuthStateChange((evento, sessao) => {
      if (evento === "SIGNED_IN" || evento === "SIGNED_OUT") carregar(sessao?.user?.id ?? null);
    });
    return () => { ativo = false; sub.subscription.unsubscribe(); };
  }, []);

  // Realtime dos pedidos das empresas do motoboy
  useEffect(() => {
    if (!motoboyId) return;
    const supabase = createClient();
    const avisados = avisadosRef.current;
    avisados.clear();
    let cancelado = false;
    const canais: ReturnType<typeof supabase.channel>[] = [];

    function chave(p: PedidoEvento): string | null {
      if (!p.id) return null;
      if (p.motoboy_id === motoboyId && p.status && STATUS_ATRIBUIDO.has(p.status)) return `a:${p.id}`;
      if (p.status === "finalizado" && !p.motoboy_id) return `d:${p.id}`;
      return null;
    }

    function aoMudar(p: PedidoEvento) {
      if (!p.id) return;
      if (p.status === "cancelado" && p.motoboy_id === motoboyId) {
        if (avisados.has(`a:${p.id}`) && !avisados.has(`c:${p.id}`)) {
          avisados.add(`c:${p.id}`);
          mostrarNotificacaoMotoboy({ titulo: "Pedido cancelado", corpo: resumo(p), tag: `pedido-${p.id}` });
        }
        return;
      }
      const k = chave(p);
      if (!k || avisados.has(k)) return;
      avisados.add(k);
      if (k.startsWith("a:")) {
        // Ele mesmo acabou de aceitar um pedido da fila, com o app na tela:
        // não faz sentido avisar "atribuído a você".
        if (avisados.has(`d:${p.id}`) && document.visibilityState === "visible") return;
        mostrarNotificacaoMotoboy({ titulo: "🛵 Pedido atribuído a você", corpo: resumo(p), tag: `pedido-${p.id}` });
      } else {
        mostrarNotificacaoMotoboy({ titulo: "📦 Novo pedido disponível", corpo: resumo(p), tag: `pedido-${p.id}` });
      }
    }

    (async () => {
      // Empresas vinculadas (mesma RPC usada pela página do motoboy)
      const [{ data: emps }, { data: fila }] = await Promise.all([
        supabase.rpc("get_motoboy_empresas"),
        supabase.rpc("get_fila_pedidos_motoboy"),
      ]);
      if (cancelado) return;

      // Marca o que já existe para não notificar pedidos antigos ao abrir o app
      ((fila ?? []) as PedidoEvento[]).forEach((p) => {
        const k = chave(p);
        if (k) avisados.add(k);
      });

      const ids = Array.from(new Set(((emps ?? []) as { empresa_id: string }[]).map((r) => r.empresa_id).filter(Boolean)));
      const sufixo = Math.random().toString(36).slice(2, 8);
      ids.forEach((empId) => {
        const ch = supabase
          .channel(`mb-notif-${motoboyId}-${empId}-${sufixo}`)
          .on("postgres_changes", {
            event: "*", schema: "public", table: "pedidos", filter: `empresa_id=eq.${empId}`,
          }, (payload) => {
            if (payload.eventType === "DELETE") return;
            aoMudar(payload.new as PedidoEvento);
          })
          .subscribe();
        canais.push(ch);
      });
    })().catch(() => {});

    return () => {
      cancelado = true;
      canais.forEach((ch) => supabase.removeChannel(ch));
    };
  }, [motoboyId]);

  async function ativar() {
    if (typeof Notification === "undefined") return;
    try {
      const res = await Notification.requestPermission();
      setPermissao(res);
      if (res === "granted") {
        await registrarSwMotoboy();
        mostrarNotificacaoMotoboy({
          titulo: "Avisos ativados ✅",
          corpo: "Você será avisado quando chegar pedido novo.",
          tag: "vellox-motoboy-teste",
        });
      }
    } catch { /* navegador recusou */ }
  }

  function dispensar() {
    setDispensado(true);
    try { localStorage.setItem(DISPENSA_KEY, String(Date.now() + DISPENSA_MS)); } catch { /* ignora */ }
  }

  if (!motoboyId || dispensado || permissao === "granted" || permissao === "unsupported") return null;

  const bloqueado = permissao === "denied";

  return (
    <div style={{
      pointerEvents: "auto",
      display: "flex", alignItems: "center", gap: 10,
      background: "#111114", color: "#f8fafc",
      border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14,
      padding: "10px 12px", boxShadow: "0 10px 30px rgba(0,0,0,0.45)",
      fontFamily: "system-ui, sans-serif",
    }}>
      <div style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(228,0,43,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Bell size={17} color="#E4002B" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 800, margin: 0 }}>
          {bloqueado ? "Notificações bloqueadas" : "Avisar pedido novo?"}
        </p>
        <p style={{ fontSize: 11, color: "#94a3b8", margin: "1px 0 0", lineHeight: 1.35 }}>
          {bloqueado
            ? "Libere as notificações deste site nas configurações do navegador."
            : "Receba um alerta quando um pedido for atribuído ou ficar disponível."}
        </p>
      </div>
      {!bloqueado && (
        <button type="button" onClick={ativar}
          style={{ background: "#E4002B", color: "#fff", border: "none", borderRadius: 10, padding: "8px 12px", fontSize: 12, fontWeight: 800, cursor: "pointer", flexShrink: 0 }}>
          Ativar
        </button>
      )}
      <button type="button" onClick={dispensar} aria-label="Fechar"
        style={{ background: "none", border: "none", color: "#64748b", padding: 4, cursor: "pointer", flexShrink: 0 }}>
        <X size={15} />
      </button>
    </div>
  );
}
