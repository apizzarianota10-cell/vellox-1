"use client";

import { useState, useEffect } from "react";
import CozinhaClient from "./CozinhaClient";
import EsperaClient from "./EsperaClient";
import type { PedidoMonitor } from "./types";

const VIEW_KEY = "vellox-monitor-view";

export default function MonitorShell({
  initialPedidos, empresaId, empresaNome,
}: {
  initialPedidos: PedidoMonitor[];
  empresaId: string;
  empresaNome: string;
}) {
  const [view, setView] = useState<"select" | "cozinha" | "espera">("select");

  useEffect(() => {
    const saved = localStorage.getItem(VIEW_KEY) as "cozinha" | "espera" | null;
    if (saved) setView(saved);
  }, []);

  function choose(v: "cozinha" | "espera") {
    localStorage.setItem(VIEW_KEY, v);
    setView(v);
  }

  function goBack() {
    localStorage.removeItem(VIEW_KEY);
    setView("select");
  }

  if (view === "cozinha") {
    return <CozinhaClient initialPedidos={initialPedidos} empresaId={empresaId} empresaNome={empresaNome} onBack={goBack} />;
  }
  if (view === "espera") {
    return <EsperaClient initialPedidos={initialPedidos} empresaId={empresaId} empresaNome={empresaNome} onBack={goBack} />;
  }

  // ── Tela de seleção ────────────────────────────────────────────────────────
  return (
    <div style={{
      height: "100%", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      background: "var(--bg-base)", padding: "24px 16px", gap: 32,
    }}>
      <div style={{ textAlign: "center" }}>
        <div style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 56, height: 56, borderRadius: 16,
          background: "var(--primary)", marginBottom: 16,
          fontSize: 28,
        }}>
          📺
        </div>
        <h1 style={{
          margin: 0, fontSize: 26, fontWeight: 900, color: "var(--text-1)",
          letterSpacing: "-0.03em",
        }}>
          Qual monitor deseja abrir?
        </h1>
        <p style={{ margin: "8px 0 0", fontSize: 14, color: "var(--text-3)" }}>
          Escolha o tipo de tela para este dispositivo
        </p>
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", justifyContent: "center", maxWidth: 680, width: "100%" }}>
        {/* Cozinha */}
        <button
          onClick={() => choose("cozinha")}
          style={{
            flex: "1 1 280px", maxWidth: 320,
            background: "var(--bg-1)",
            border: "2px solid var(--border-2)",
            borderRadius: 20, padding: "28px 24px",
            cursor: "pointer", textAlign: "left",
            transition: "border-color 0.2s, transform 0.15s",
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = "#E4002B";
            e.currentTarget.style.transform = "translateY(-3px)";
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = "var(--border-2)";
            e.currentTarget.style.transform = "translateY(0)";
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 14 }}>👨‍🍳</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: "var(--text-1)", marginBottom: 6 }}>
            Monitor de Cozinha
          </div>
          <div style={{ fontSize: 13, color: "var(--text-3)", lineHeight: 1.6 }}>
            Para a equipe de preparo. Exibe pedidos detalhados com itens, endereço,
            observações, pagamento e temporizadores. Avance os pedidos por raia.
          </div>
          <div style={{
            marginTop: 18, display: "inline-flex", alignItems: "center", gap: 6,
            fontSize: 13, fontWeight: 700, color: "#E4002B",
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: "50%", background: "#E4002B",
              display: "inline-block",
            }} />
            Fila → Em Preparo → Pronto
          </div>
        </button>

        {/* Sala de espera */}
        <button
          onClick={() => choose("espera")}
          style={{
            flex: "1 1 280px", maxWidth: 320,
            background: "var(--bg-1)",
            border: "2px solid var(--border-2)",
            borderRadius: 20, padding: "28px 24px",
            cursor: "pointer", textAlign: "left",
            transition: "border-color 0.2s, transform 0.15s",
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = "#34d399";
            e.currentTarget.style.transform = "translateY(-3px)";
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = "var(--border-2)";
            e.currentTarget.style.transform = "translateY(0)";
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 14 }}>🖥️</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: "var(--text-1)", marginBottom: 6 }}>
            Display Sala de Espera
          </div>
          <div style={{ fontSize: 13, color: "var(--text-3)", lineHeight: 1.6 }}>
            Para a TV da recepção ou sala de espera. Exibe o número do pedido e status
            de forma clara e visível para os clientes.
          </div>
          <div style={{
            marginTop: 18, display: "inline-flex", alignItems: "center", gap: 6,
            fontSize: 13, fontWeight: 700, color: "#34d399",
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: "50%", background: "#34d399",
              display: "inline-block",
            }} />
            Em Preparo · Pronto para Retirar
          </div>
        </button>
      </div>
    </div>
  );
}
