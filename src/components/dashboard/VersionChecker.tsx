"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";

const CHECK_INTERVAL_MS = 3 * 60 * 1000; // 3 minutos

export default function VersionChecker() {
  const [desatualizado, setDesatualizado] = useState(false);
  const versaoInicial = useRef<string | null>(null);

  useEffect(() => {
    let cancelado = false;

    async function checar() {
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        const { version } = await res.json();
        if (cancelado) return;
        if (versaoInicial.current === null) {
          versaoInicial.current = version;
        } else if (version !== versaoInicial.current) {
          setDesatualizado(true);
        }
      } catch {
        // Sem conexão momentânea — não é sinal de versão nova, ignora.
      }
    }

    checar();
    const interval = setInterval(checar, CHECK_INTERVAL_MS);
    return () => { cancelado = true; clearInterval(interval); };
  }, []);

  if (!desatualizado) return null;

  return (
    <div
      className="flex items-center"
      style={{
        gap: 10, padding: "9px 16px", width: "100%",
        background: "#FF6A00", borderBottom: "1px solid rgba(0,0,0,0.1)",
      }}
    >
      <RefreshCw size={15} style={{ color: "#fff", flexShrink: 0 }} />
      <p style={{ flex: 1, fontSize: 12.5, fontWeight: 700, color: "#fff", margin: 0, lineHeight: 1.4 }}>
        Painel desatualizado — tem uma versão nova disponível.
      </p>
      <button
        onClick={() => window.location.reload()}
        style={{
          flexShrink: 0, padding: "6px 14px", borderRadius: 8,
          background: "#fff", color: "#FF6A00", border: "none",
          fontSize: 12, fontWeight: 800, cursor: "pointer",
        }}>
        Atualizar agora
      </button>
    </div>
  );
}
