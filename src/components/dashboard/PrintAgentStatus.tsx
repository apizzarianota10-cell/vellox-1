"use client";

import { useState, useEffect, useCallback } from "react";
import { Printer, WifiOff } from "lucide-react";
import Link from "next/link";

const AGENT_URL = "http://localhost:7532";

interface AgentInfo {
  online: boolean;
  selectedPrinter: string | null;
  realtimeStatus: string;
  lastError: string | null;
}

export default function PrintAgentStatus() {
  const [info,    setInfo]    = useState<AgentInfo | null>(null);
  const [visible, setVisible] = useState(false);

  const check = useCallback(async () => {
    try {
      const res = await fetch(`${AGENT_URL}/`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        const data = await res.json();
        setInfo({
          online:         true,
          selectedPrinter: data.selectedPrinter ?? null,
          realtimeStatus:  data.realtimeStatus  ?? "unknown",
          lastError:       data.lastError        ?? null,
        });
        return;
      }
    } catch {}
    setInfo((prev) => (prev ? { ...prev, online: false } : null));
  }, []);

  useEffect(() => {
    check();
    const interval = setInterval(check, 20_000);
    return () => clearInterval(interval);
  }, [check]);

  // Só mostra o chip se tiver info (depois do primeiro check)
  useEffect(() => { if (info !== null) setVisible(true); }, [info]);
  if (!visible) return null;

  const realtimeOk = info?.realtimeStatus === "SUBSCRIBED";
  const hasError   = !!info?.lastError;

  if (!info?.online) {
    return (
      <Link href="/configuracoes/impressao" title="Agente offline — clique para configurar">
        <div
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold"
          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#ef4444" }}
        >
          <WifiOff size={11} />
          <span className="hidden sm:inline">Agente offline</span>
        </div>
      </Link>
    );
  }

  return (
    <Link href="/configuracoes/impressao" title="Print Agent — clique para configurar">
      <div
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold"
        style={{
          background: hasError
            ? "rgba(239,68,68,0.08)"
            : realtimeOk
              ? "rgba(34,197,94,0.08)"
              : "rgba(251,191,36,0.08)",
          border: `1px solid ${hasError ? "rgba(239,68,68,0.2)" : realtimeOk ? "rgba(34,197,94,0.2)" : "rgba(251,191,36,0.2)"}`,
          color: hasError ? "#ef4444" : realtimeOk ? "#22c55e" : "#fbbf24",
        }}
      >
        <span
          className={realtimeOk && !hasError ? "animate-pulse" : ""}
          style={{
            display:      "inline-block",
            width:        7,
            height:       7,
            borderRadius: "50%",
            background:   hasError ? "#ef4444" : realtimeOk ? "#22c55e" : "#fbbf24",
            flexShrink:   0,
          }}
        />
        <Printer size={11} />
        <span className="hidden sm:inline">
          {hasError ? "Erro de impressão" : info.selectedPrinter ? info.selectedPrinter.slice(0, 18) : "Agente ativo"}
        </span>
      </div>
    </Link>
  );
}
