"use client";

import { useState, useEffect, useCallback } from "react";
import { AlertTriangle, X } from "lucide-react";
import Link from "next/link";

const AGENT_URL = "http://localhost:7532";

export default function PrintAgentBanner() {
  const [online,     setOnline]     = useState<boolean | null>(null);
  const [dismissed,  setDismissed]  = useState(false);

  const check = useCallback(async () => {
    try {
      const res = await fetch(`${AGENT_URL}/`, { signal: AbortSignal.timeout(2000) });
      setOnline(res.ok);
    } catch {
      setOnline(false);
    }
  }, []);

  useEffect(() => {
    check();
    const interval = setInterval(check, 20_000);
    return () => clearInterval(interval);
  }, [check]);

  // null = ainda não checou; true = agente ok; não mostra em nenhum dos dois casos
  if (online !== false || dismissed) return null;

  return (
    <div className="hidden md:flex" style={{
      alignItems: "center", gap: 10,
      padding: "9px 16px", width: "100%",
      background: "#fef3c7", borderBottom: "1px solid #fde68a",
    }}>
      <AlertTriangle size={15} style={{ color: "#92400e", flexShrink: 0 }} />
      <p style={{ flex: 1, fontSize: 12.5, fontWeight: 700, color: "#92400e", margin: 0, lineHeight: 1.4 }}>
        Você está usando pelo navegador — novos pedidos correm risco de não imprimir sozinhos. Use o app/servidor de impressão no computador da impressora.
        {" "}
        <Link href="/configuracoes/impressao" style={{ color: "#92400e", textDecoration: "underline" }}>
          Configurar impressão
        </Link>
      </p>
      <button
        onClick={() => setDismissed(true)}
        style={{ background: "none", border: "none", cursor: "pointer", color: "#92400e", padding: 2, flexShrink: 0 }}>
        <X size={15} />
      </button>
    </div>
  );
}
