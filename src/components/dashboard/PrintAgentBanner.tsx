"use client";

import { useState, useEffect, useCallback } from "react";
import { AlertTriangle, X, Download, Loader2 } from "lucide-react";
import Link from "next/link";
import { checkAgentOnlineViaDb } from "@/lib/printAgentOnline";
import { createClient } from "@/lib/supabase/client";
import { getMobilePrintMode } from "@/lib/mobilePrint";

const AGENT_URL = "http://localhost:7532";
// A partir desta versão o agente se atualiza sozinho — abaixo dela, só
// rodando o atualizador no computador da impressora.
const VERSAO_AUTO_UPDATE = 12;
const ADIAR_KEY = "vellox_agente_desatualizado_adiado_ate";

function numVersao(v: string | null | undefined) {
  const m = v?.match(/v(\d+)/);
  return m ? Number(m[1]) : 0;
}

interface Props {
  empresaId: string;
}

// Agente antigo imprime o pedido do catálogo com o desenho antigo do cupom,
// diferente do que o dono vê no teste — e não tem como atualizar à distância.
// Este aviso insiste (volta a cada 1h) até a loja rodar o atualizador.
function AgenteDesatualizado({ empresaId }: Props) {
  const [versoes, setVersoes] = useState<{ atual: string; nova: string } | null>(null);
  const [baixando, setBaixando] = useState(false);
  const [fechado, setFechado] = useState(false);

  useEffect(() => {
    try {
      const ate = Number(localStorage.getItem(ADIAR_KEY) ?? 0);
      if (Date.now() < ate) return;
    } catch {}
    (async () => {
      const { data } = await createClient()
        .from("configuracoes_print_agent")
        .select("agent_versao, agent_last_seen")
        .eq("empresa_id", empresaId)
        .maybeSingle();
      if (!data?.agent_versao || !data.agent_last_seen) return;
      if (Date.now() - new Date(data.agent_last_seen).getTime() > 10 * 60_000) return;
      if (numVersao(data.agent_versao) >= VERSAO_AUTO_UPDATE) return;
      const txt = await fetch("/print-server/servidor.ps1", { cache: "no-store" }).then(r => r.text()).catch(() => "");
      const nova = txt.match(/^\$Versao = "(v\d+)"/m)?.[1];
      if (nova && numVersao(data.agent_versao) < numVersao(nova)) setVersoes({ atual: data.agent_versao, nova });
    })();
  }, [empresaId]);

  async function baixar() {
    setBaixando(true);
    try {
      const texto = (await (await fetch("/print-server/atualizar.bat", { cache: "no-store" })).text()).replace(/\r?\n/g, "\r\n");
      const url = URL.createObjectURL(new Blob([texto], { type: "text/plain" }));
      const a = document.createElement("a");
      a.href = url; a.download = "vellox-atualizar.bat"; a.style.display = "none";
      document.body.appendChild(a); a.click();
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
    } finally { setBaixando(false); }
  }

  function adiar() {
    try { localStorage.setItem(ADIAR_KEY, String(Date.now() + 60 * 60_000)); } catch {}
    setFechado(true);
  }

  if (!versoes || fechado) return null;

  return (
    <div className="fixed z-[9999]" style={{ inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)" }}>
      <div style={{ width: "100%", maxWidth: 440, background: "var(--bg-1)", borderRadius: 22, padding: "32px 26px 24px", textAlign: "center", boxShadow: "0 24px 64px rgba(0,0,0,0.35)" }}>
        <div style={{ width: 60, height: 60, margin: "0 auto 16px", borderRadius: "50%", background: "rgba(228,0,43,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <AlertTriangle size={28} style={{ color: "#E4002B" }} />
        </div>
        <p style={{ fontSize: 18, fontWeight: 900, color: "var(--text-1)", margin: "0 0 10px" }}>Atualize o agente de impressão</p>
        <p style={{ fontSize: 14, color: "var(--text-3)", margin: "0 0 8px", lineHeight: 1.5 }}>
          O computador da impressora está com a versão <strong>{versoes.atual}</strong> (a atual é <strong>{versoes.nova}</strong>). Por isso os pedidos do catálogo saem com o cupom antigo — diferente do que você vê nas configurações e no teste.
        </p>
        <p style={{ fontSize: 13, color: "var(--text-4)", margin: "0 0 22px", lineHeight: 1.5 }}>
          Baixe e abra o atualizador <strong>no computador da impressora</strong>. É a última vez: depois dele, as próximas atualizações chegam sozinhas.
        </p>
        <button onClick={baixar} disabled={baixando}
          style={{ width: "100%", padding: "13px", borderRadius: 12, background: "#E4002B", color: "#fff", fontSize: 14, fontWeight: 800, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 10, opacity: baixando ? 0.7 : 1 }}>
          {baixando ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
          Baixar atualizador
        </button>
        <button onClick={adiar}
          style={{ width: "100%", padding: "10px", borderRadius: 12, background: "transparent", border: "none", color: "var(--text-4)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
          Lembrar em 1 hora
        </button>
      </div>
    </div>
  );
}

export default function PrintAgentBanner({ empresaId }: Props) {
  return (
    <>
      <AgenteDesatualizado empresaId={empresaId} />
      <AvisoSemAgente empresaId={empresaId} />
    </>
  );
}

function AvisoSemAgente({ empresaId }: Props) {
  const [online,     setOnline]     = useState<boolean | null>(null);
  const [dismissed,  setDismissed]  = useState(false);

  const check = useCallback(async () => {
    // Este aparelho imprime pela impressora Bluetooth dele (celular/tablet) —
    // não precisa do agente do PC, então não assusta com "impressão em risco".
    if (getMobilePrintMode()) { setOnline(true); return; }
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
            href="/automacoes/impressao"
            style={{ flex: 1, padding: "12px", borderRadius: 12, background: "#92400e", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
            Configurar impressão
          </Link>
        </div>
      </div>
    </div>
  );
}
