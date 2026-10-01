"use client";

import { useEffect, useRef, useState } from "react";
import { Lock, Loader2, Eye, EyeOff } from "lucide-react";
import FinanceiroClient from "./FinanceiroClient";
import type { Pedido, Motoboy } from "@/types";

// Lembra a senha só em memória (nunca em localStorage/sessionStorage) pra
// não pedir de novo a cada navegação dentro da mesma aba, sem persistir
// nada sensível entre recarregamentos de página.
let lastUnlockSenha: string | null = null;

export default function FinanceiroGate() {
  const [dados, setDados] = useState<{ pedidos: Pedido[]; motoboys: Motoboy[] } | null>(null);
  const [senha, setSenha] = useState("");
  const [showSenha, setShowSenha] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const triedAutoUnlock = useRef(false);

  async function desbloquear(senhaTentativa: string) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/financeiro/verificar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senha: senhaTentativa }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Senha incorreta");
      lastUnlockSenha = senhaTentativa;
      setDados({ pedidos: data.pedidos, motoboys: data.motoboys });
    } catch (e) {
      lastUnlockSenha = null;
      setError(e instanceof Error ? e.message : "Senha incorreta");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (triedAutoUnlock.current) return;
    triedAutoUnlock.current = true;
    if (lastUnlockSenha) desbloquear(lastUnlockSenha);
  }, []);

  if (dados) {
    return <FinanceiroClient pedidos={dados.pedidos} motoboys={dados.motoboys} />;
  }

  return (
    <div style={{ background: "var(--bg-base)", minHeight: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <form
        onSubmit={e => { e.preventDefault(); if (senha) desbloquear(senha); }}
        style={{
          width: "100%", maxWidth: 360,
          background: "var(--bg-1)", border: "1px solid var(--border-1)",
          borderRadius: 16, padding: 24,
        }}
      >
        <div style={{ width: 40, height: 40, borderRadius: 12, background: "var(--bg-2)", border: "1px solid var(--border-1)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
          <Lock size={18} style={{ color: "#E4002B" }} />
        </div>
        <p className="text-sm font-bold mb-1" style={{ color: "var(--text-1)" }}>Financeiro protegido</p>
        <p className="text-xs mb-4" style={{ color: "var(--text-4)" }}>Digite a senha pra ver os dados financeiros.</p>

        <div className="flex items-center gap-2 mb-3">
          <div className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{ background: "var(--bg-input)", border: "1px solid var(--border-1)" }}>
            <input
              type={showSenha ? "text" : "password"}
              value={senha}
              onChange={e => { setSenha(e.target.value); setError(""); }}
              placeholder="Senha"
              autoFocus
              className="flex-1 outline-none bg-transparent"
              style={{ color: "var(--text-1)", fontSize: 14 }}
            />
            <button type="button" onClick={() => setShowSenha(v => !v)} style={{ color: "var(--text-4)", flexShrink: 0 }}>
              {showSenha ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>

        {error && <p className="text-xs mb-3" style={{ color: "#ef4444" }}>{error}</p>}

        <button
          type="submit"
          disabled={loading || !senha}
          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-bold"
          style={{ background: "#E4002B", color: "#fff", border: "none", opacity: loading || !senha ? 0.7 : 1 }}
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : null}
          {loading ? "Verificando..." : "Desbloquear"}
        </button>

        <p className="text-xs mt-3" style={{ color: "var(--text-4)" }}>
          Esqueceu a senha? Troque em Configurações.
        </p>
      </form>
    </div>
  );
}
