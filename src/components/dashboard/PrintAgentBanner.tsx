"use client";

import { useState, useEffect, useCallback } from "react";
import { AlertTriangle, X } from "lucide-react";
import Link from "next/link";
import { checkAgentOnlineViaDb } from "@/lib/printAgentOnline";

const AGENT_URL = "http://localhost:7532";

interface Props {
  empresaId: string;
}

export default function PrintAgentBanner({ empresaId }: Props) {
  const [online,     setOnline]     = useState<boolean | null>(null);
  const [dismissed,  setDismissed]  = useState(false);

  const check = useCallback(async () => {
    try {
      const res = await fetch(`${AGENT_URL}/`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) { setOnline(true); return; }
    } catch {}
    setOnline(await checkAgentOnlineViaDb(empresaId));
  }, [empresaId]);

  useEffect(() => {
    check();
    const interval = setInterval(check, 20_000);
    return () => clearInterval(interval);
  }, [check]);

  // null = ainda não checou; true = agente ok; não mostra em nenhum dos dois casos
  if (online !== false || dismissed) return null;

  return (
    <div
      className="hidden md:flex fixed z-[9999]"
      style={{
        inset: 0, alignItems: "center", justifyContent: "center", padding: 16,
        background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)",
      }}
      onClick={e => { if (e.target === e.currentTarget) setDismissed(true); }}
    >
      <div style={{
        position: "relative",
        width: "100%", maxWidth: 440,
        background: "var(--bg-1)", borderRadius: 22,
        padding: "36px 28px 28px",
        textAlign: "center",
        boxShadow: "0 24px 64px rgba(0,0,0,0.3)",
      }}>
        <button
          onClick={() => setDismissed(true)}
          style={{ position: "absolute", top: 14, right: 14, background: "var(--bg-input)", border: "none", borderRadius: 8, padding: 6, cursor: "pointer", color: "var(--text-3)" }}>
          <X size={16} />
        </button>

        <div style={{
          width: 64, height: 64, margin: "0 auto 18px", borderRadius: "50%",
          background: "#fef3c7", display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <AlertTriangle size={30} style={{ color: "#92400e" }} />
        </div>

        <p style={{ fontSize: 18, fontWeight: 900, color: "var(--text-1)", margin: "0 0 10px" }}>Atenção: impressão em risco</p>
        <p style={{ fontSize: 14, fontWeight: 500, color: "var(--text-3)", margin: "0 0 24px", lineHeight: 1.5 }}>
          Você está usando pelo navegador — novos pedidos correm risco de não imprimir sozinhos. Use o app/servidor de impressão no computador da impressora.
        </p>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={() => setDismissed(true)}
            style={{ flex: 1, padding: "12px", borderRadius: 12, background: "var(--bg-input)", border: "1px solid var(--border-1)", color: "var(--text-3)", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            Agora não
          </button>
          <Link
            href="/configuracoes/impressao"
            style={{ flex: 1, padding: "12px", borderRadius: 12, background: "#92400e", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
            Configurar impressão
          </Link>
        </div>
      </div>
    </div>
  );
}
