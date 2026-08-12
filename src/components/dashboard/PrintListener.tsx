"use client";

import { useEffect, useRef } from "react";
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
      if (agentOk) return;

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

  return null;
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
