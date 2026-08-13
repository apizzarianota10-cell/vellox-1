"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { autoPrint } from "@/lib/printService";
import type { Pedido } from "@/types";

const AGENT_URL = "http://localhost:7532";

interface Props {
  empresaId: string;
  empresaNome: string;
  empresaCnpj?: string | null;
}

export default function PrintListener({ empresaId, empresaNome, empresaCnpj }: Props) {
  // Evita dupla impressão entre abas usando Set compartilhado via localStorage
  const printedSet = useRef<Set<string>>(new Set());
  // Evita repetir o aviso pra cada pedido novo enquanto o agente continuar offline
  const jaAvisou = useRef(false);
  const [avisoAgenteOffline, setAvisoAgenteOffline] = useState(false);

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

      // Agente não respondeu (app desktop fechado) — avisa quem está no navegador
      if (!jaAvisou.current) {
        jaAvisou.current = true;
        setAvisoAgenteOffline(true);
      }

      // 2. WebUSB se configurado → silencioso; senão window.print()
      autoPrint(pedido, empresaNome);
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

  if (!avisoAgenteOffline) return null;

  return (
    <div style={{ position: "fixed", top: 16, right: 16, zIndex: 1000, maxWidth: 360, width: "calc(100% - 32px)" }}>
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
