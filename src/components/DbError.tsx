"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  message?: string;
}

export default function DbError({ message }: Props) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-5 p-6 text-center">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{ background: "rgba(228,0,43,0.1)", border: "1px solid rgba(228,0,43,0.2)" }}>
        <AlertTriangle size={28} style={{ color: "#E4002B" }} />
      </div>
      <div>
        <p className="text-lg font-bold mb-1" style={{ color: "var(--text-1)" }}>
          Falha ao carregar dados
        </p>
        <p className="text-sm" style={{ color: "#64748b" }}>
          {message ?? "Não foi possível conectar ao banco de dados."}
        </p>
        <p className="text-xs mt-1" style={{ color: "#374151" }}>
          Isso costuma ser temporário — tente recarregar.
        </p>
      </div>
      <button
        onClick={() => window.location.reload()}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all"
        style={{ background: "rgba(228,0,43,0.1)", color: "#E4002B", border: "1px solid rgba(228,0,43,0.2)" }}
      >
        <RefreshCw size={15} />
        Tentar novamente
      </button>
    </div>
  );
}
