"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[DashboardError]", error.message, error.digest, error.stack);
  }, [error]);

  return (
    <div
      className="flex flex-col items-center justify-center min-h-screen gap-6 px-6"
      style={{ background: "#0a0a0a" }}
    >
      <div
        className="w-14 h-14 rounded-2xl flex items-center justify-center"
        style={{ background: "rgba(228,0,43,0.1)" }}
      >
        <AlertTriangle size={24} style={{ color: "#E4002B" }} />
      </div>
      <div className="text-center max-w-sm">
        <h2 className="text-lg font-bold text-white mb-2">Erro ao carregar</h2>
        <p className="text-sm mb-1" style={{ color: "#64748b" }}>
          {error.message || "Ocorreu um erro inesperado."}
        </p>
        {error.digest && (
          <p className="text-xs font-mono mt-1" style={{ color: "#374151" }}>
            {error.digest}
          </p>
        )}
      </div>
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
          style={{ background: "rgba(228,0,43,0.15)", border: "1px solid rgba(228,0,43,0.3)" }}
        >
          Tentar novamente
        </button>
        <a
          href="/login"
          className="px-5 py-2.5 rounded-xl text-sm font-semibold"
          style={{ background: "#111", border: "1px solid #1a1a1a", color: "#64748b" }}
        >
          Ir para login
        </a>
      </div>
    </div>
  );
}
