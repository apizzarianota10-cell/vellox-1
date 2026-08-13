"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { autoPrint } from "@/lib/printService";
import { checkAgentOnlineViaDb } from "@/lib/printAgentOnline";
import type { Pedido } from "@/types";

const AGENT_URL = "http://localhost:7532";
const ATRASO_MS = 5 * 60 * 1000; // lembrete de impressão atrasada: 5 minutos

interface Props {
  empresaId: string;
  empresaNome: string;
  empresaCnpj?: string | null;
}

interface PedidoAtrasado {
  id: string;
  cliente_nome: string;
  created_at: string;
}

export default function PrintListener({ empresaId, empresaNome, empresaCnpj }: Props) {
  // Evita dupla impressão entre abas usando Set compartilhado via localStorage
  const printedSet = useRef<Set<string>>(new Set());
  // Evita repetir o aviso pra cada pedido novo enquanto o agente continuar offline
  const jaAvisou = useRef(false);
  const [avisoAgenteOffline, setAvisoAgenteOffline] = useState(false);
  const [pedidosAtrasados, setPedidosAtrasados] = useState<PedidoAtrasado[]>([]);
  const [avisoAtrasadosFechado, setAvisoAtrasadosFechado] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    async function handleNewOrder(pedido: Pedido) {
      if (pedido.status !== "em_fila") return;
      if (printedSet.current.has(pedido.id)) return;

      // Padrão: ativo. Só desativa se usuário explicitamente desligou ("0").
      try {
        if (localStorage.getItem("vellox-autoprint-ativo") === "0") return;
      } catch { return; }

      // Verifica se o pedido já foi impresso pelo agente (campo auto_printed)
      if (pedido.auto_printed) return;

      // Marca localmente para não reimprimir nesta sessão
      printedSet.current.add(pedido.id);

      // 1. Tenta impressão via Print Agent (silenciosa, sem popup)
      const agentOk = await tryPrintViaAgent(pedido);
      if (agentOk) {
        jaAvisou.current = false;
        setAvisoAgenteOffline(false);
        return;
      }

      // 2. Sem HTTP local — mas o servidor.ps1 (heartbeat via banco) pode estar
      // vivo e vai imprimir este pedido sozinho em poucos segundos. Se for o
      // caso, não faz nada aqui (evita imprimir duas vezes).
      if (await checkAgentOnlineViaDb(empresaId)) {
        jaAvisou.current = false;
        setAvisoAgenteOffline(false);
        return;
      }

      // Reconfere o estado mais recente do pedido no banco: o payload do
      // realtime reflete o momento do INSERT (auto_printed sempre false), mas
      // o servidor.ps1 pode ter processado e impresso este mesmo pedido no
      // instante entre o INSERT e agora (heartbeat com até ~5s de atraso não
      // é garantia de que ele não imprimiu "por baixo dos panos"). Se já foi
      // marcado como impresso, não imprime de novo pelo navegador.
      try {
        const { data: fresh } = await supabase
          .from("pedidos")
          .select("auto_printed")
          .eq("id", pedido.id)
          .maybeSingle();
        if (fresh?.auto_printed) {
          jaAvisou.current = false;
          setAvisoAgenteOffline(false);
          return;
        }
      } catch {
        // Se a checagem falhar, segue para o fallback — melhor arriscar uma
        // impressão duplicada rara do que não imprimir o pedido.
      }

      // Nenhum agente/servidor respondeu — avisa quem está no navegador
      if (!jaAvisou.current) {
        jaAvisou.current = true;
        setAvisoAgenteOffline(true);
      }

      // 3. WebUSB se configurado → silencioso; senão window.print()
      const resultado = await autoPrint(pedido, empresaNome);

      // Marca no banco que este pedido já foi impresso (pelo navegador), para
      // que o servidor.ps1 — cujo heartbeat pode ainda não refletir o ciclo
      // de polling em andamento — pule este pedido no próximo ciclo em vez de
      // imprimi-lo de novo "pouco depois".
      if (resultado.ok) {
        try {
          await supabase.rpc("mark_pedido_printed", {
            p_pedido_id:  pedido.id,
            p_empresa_id: empresaId,
            p_auto:       true,
          });
        } catch {
          // Best-effort: não bloqueia o fluxo de impressão se a marcação falhar.
        }
      }
    }

    const ch = supabase
      .channel(`print-listener-${empresaId}`)
      .on("postgres_changes", {
        event:  "INSERT",
        schema: "public",
        table:  "pedidos",
        filter: `empresa_id=eq.${empresaId}`,
      }, (payload) => {
        handleNewOrder(payload.new as Pedido);
      })
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [empresaId, empresaNome, empresaCnpj]);

  // Lembrete: pedido em fila há mais de 5 minutos sem ser marcado como
  // impresso (nem pelo agente, nem pelo fallback do navegador) — sinal de
  // que algo travou e ninguém percebeu ainda.
  useEffect(() => {
    const supabase = createClient();

    async function checarAtrasados() {
      const limite = new Date(Date.now() - ATRASO_MS).toISOString();
      const { data } = await supabase
        .from("pedidos")
        .select("id, cliente_nome, created_at")
        .eq("empresa_id", empresaId)
        .eq("status", "em_fila")
        .is("printed_at", null)
        .lt("created_at", limite)
        .order("created_at");

      const lista = (data ?? []) as PedidoAtrasado[];
      setPedidosAtrasados(lista);
      if (lista.length > 0) setAvisoAtrasadosFechado(false);
    }

    checarAtrasados();
    const interval = setInterval(checarAtrasados, 60_000);
    return () => clearInterval(interval);
  }, [empresaId]);

  const mostrarOffline    = avisoAgenteOffline;
  const mostrarAtrasados  = pedidosAtrasados.length > 0 && !avisoAtrasadosFechado;
  if (!mostrarOffline && !mostrarAtrasados) return null;

  return (
    <div style={{ position: "fixed", top: 16, right: 16, zIndex: 1000, maxWidth: 360, width: "calc(100% - 32px)", display: "flex", flexDirection: "column", gap: 10 }}>
      {mostrarAtrasados && (
        <div style={{
          display: "flex", gap: 12, alignItems: "flex-start",
          background: "#fff", border: "1.5px solid #fde68a", borderRadius: 16,
          padding: 16, boxShadow: "0 12px 32px rgba(0,0,0,0.15)",
        }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10, background: "#fffbeb",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <AlertTriangle size={17} style={{ color: "#d97706" }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 800, color: "#0f172a", margin: "0 0 4px" }}>
              {pedidosAtrasados.length === 1
                ? "1 pedido esperando impressão há mais de 5 min"
                : `${pedidosAtrasados.length} pedidos esperando impressão há mais de 5 min`}
            </p>
            <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 10px", lineHeight: 1.4 }}>
              {pedidosAtrasados[0]?.cliente_nome}
              {pedidosAtrasados.length > 1 ? ` e mais ${pedidosAtrasados.length - 1}` : ""} — confira se a impressora está ligada e com papel.
            </p>
            <Link href="/pedidos"
              style={{ fontSize: 12, fontWeight: 700, color: "#d97706", textDecoration: "none" }}>
              Ver pedidos →
            </Link>
          </div>
          <button
            onClick={() => setAvisoAtrasadosFechado(true)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: 2, flexShrink: 0 }}>
            <X size={15} />
          </button>
        </div>
      )}
      {mostrarOffline && (
        <div style={{
          display: "flex", gap: 12, alignItems: "flex-start",
          background: "#fff", border: "1.5px solid #fecaca", borderRadius: 16,
          padding: 16, boxShadow: "0 12px 32px rgba(0,0,0,0.15)",
        }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10, background: "#fef2f2",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <AlertTriangle size={17} style={{ color: "#ef4444" }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 800, color: "#0f172a", margin: "0 0 4px" }}>
              Chegou pedido novo, mas o app não está aberto
            </p>
            <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 10px", lineHeight: 1.4 }}>
              Você está no navegador e o Print Agent não respondeu — risco do pedido não imprimir sozinho. Abra o app no computador da impressora.
            </p>
            <Link href="/configuracoes/impressao"
              style={{ fontSize: 12, fontWeight: 700, color: "#ef4444", textDecoration: "none" }}>
              Ver configuração de impressão →
            </Link>
          </div>
          <button
            onClick={() => setAvisoAgenteOffline(false)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: 2, flexShrink: 0 }}>
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Tenta imprimir via Print Agent local (localhost:7532).
 * Retorna true se a impressão foi aceita com sucesso.
 */
async function tryPrintViaAgent(pedido: Pedido): Promise<boolean> {
  try {
    const res = await fetch(`${AGENT_URL}/print`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ pedido }),
      signal:  AbortSignal.timeout(10_000),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.ok === true;
  } catch {
    // Agente não está rodando → fallback para window.print()
    return false;
  }
}
