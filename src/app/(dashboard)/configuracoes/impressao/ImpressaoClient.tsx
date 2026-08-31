"use client";

import { useState, useEffect } from "react";
import {
  Printer, Download, Play, CheckCircle, AlertCircle,
  ChevronLeft, Loader2, Zap, X, Copy, Eye, EyeOff, RefreshCw, KeyRound,
} from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  savePaperSize, getSavedPaperSize,
  saveFontSize,  getSavedFontSize,
  saveLayout,
  saveLogo,      getSavedLogo,
  printOrder,
} from "@/lib/printService";
import type { FontSizeOpt, LayoutOpt } from "@/lib/printService";
import type { Pedido } from "@/types";

interface Props {
  empresa: { id: string; nome: string; cnpj: string | null };
  initialConfig: {
    ativo: boolean;
    impressora_nome: string | null;
    tamanho_papel: string;
    agent_last_seen: string | null;
    layout: string | null;
    agent_versao: string | null;
  } | null;
}

// Versão atual do servidor.ps1 (public/print-server/servidor.ps1, variável
// $Versao no topo do arquivo) — mantenha os dois em sincronia a cada mudança
// no script, pra esse aviso ficar confiável.
const VERSAO_AGENTE_ATUAL = "v6";

export default function ImpressaoClient({ empresa, initialConfig }: Props) {
  const supabase = createClient();
  const [paperSize,   setPaperSize]   = useState<"58mm" | "80mm">(
    (initialConfig?.tamanho_papel as "58mm" | "80mm") ?? "80mm"
  );
  const [fontSize,      setFontSize]      = useState<FontSizeOpt>("m");
  const [layout,        setLayout]        = useState<LayoutOpt>(
    (initialConfig?.layout as LayoutOpt) ?? "classico"
  );
  const [logoUrl,       setLogoUrl]       = useState("");
  const [autoAtivo,     setAutoAtivo]     = useState(true);
  const [savingPaper,   setSavingPaper]   = useState(false);
  const [paperSaved,    setPaperSaved]    = useState(false);
  const [savingFont,    setSavingFont]    = useState(false);
  const [fontSaved,     setFontSaved]     = useState(false);
  const [savingLayout,  setSavingLayout]  = useState(false);
  const [layoutSaved,   setLayoutSaved]   = useState(false);
  const [testing,       setTesting]       = useState(false);
  const [testResult,    setTestResult]    = useState<{ ok: boolean; msg: string } | null>(null);
  const [creds,         setCreds]         = useState<{ empresa_id: string; agent_token: string } | null>(null);
  const [loadingCreds,  setLoadingCreds]  = useState(false);
  const [credsError,    setCredsError]    = useState("");
  const [copiedField,   setCopiedField]   = useState<"id" | "token" | null>(null);
  const [showToken,     setShowToken]     = useState(false);
  const [baixandoInstalador, setBaixandoInstalador] = useState(false);
  const [baixandoAtualizador, setBaixandoAtualizador] = useState(false);

  // Baixa o instalador com o número da versão já no nome do arquivo (lido do
  // próprio conteúdo, ex: "INSTALADOR_VERSAO=v3"), pra dar pra saber qual
  // versão você tem só de olhar a pasta de Downloads, sem precisar abrir.
  async function baixarInstalador() {
    setBaixandoInstalador(true);
    try {
      const res = await fetch("/print-server/instalar.bat", { cache: "no-store" });
      const texto = await res.text();
      const m = texto.match(/INSTALADOR_VERSAO=([^\r\n]+)/);
      const versao = m ? m[1].trim() : "";
      const nomeArquivo = `vellox-instalador${versao ? `-${versao}` : ""}.bat`;

      const blob = new Blob([texto], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = nomeArquivo; a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBaixandoInstalador(false);
    }
  }

  // Atualizador: só baixa a versão mais nova do servidor.ps1 e reinicia, sem
  // mexer nas credenciais já salvas no PC — pra mandar pro cliente quando ele
  // não tem instalação nova pra fazer, só precisa atualizar o que já roda.
  async function baixarAtualizador() {
    setBaixandoAtualizador(true);
    try {
      const res = await fetch("/print-server/atualizar.bat", { cache: "no-store" });
      const texto = await res.text();
      const blob = new Blob([texto], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "vellox-atualizar.bat"; a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBaixandoAtualizador(false);
    }
  }

  async function carregarCredenciais() {
    setLoadingCreds(true);
    setCredsError("");
    try {
      const res = await fetch("/api/print-server/credentials");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao carregar credenciais");
      setCreds({ empresa_id: data.empresa_id, agent_token: data.agent_token });
    } catch (e) {
      setCredsError(e instanceof Error ? e.message : "Erro ao carregar credenciais");
    } finally {
      setLoadingCreds(false);
    }
  }

  function copiarCampo(texto: string, campo: "id" | "token") {
    navigator.clipboard.writeText(texto);
    setCopiedField(campo);
    setTimeout(() => setCopiedField(null), 2000);
  }

  function maskToken(token: string) {
    if (token.length <= 12) return "•".repeat(token.length);
    return `${token.slice(0, 6)}${"•".repeat(10)}${token.slice(-4)}`;
  }

  useEffect(() => {
    carregarCredenciais();
  }, []);

  useEffect(() => {
    setPaperSize(getSavedPaperSize());
    setFontSize(getSavedFontSize());
    // layout vem do banco (initialConfig) agora — é o que o agente de
    // impressão local também lê, então precisa ser a mesma fonte pros dois.
    setLogoUrl(getSavedLogo());
    setAutoAtivo(localStorage.getItem("vellox-autoprint-ativo") !== "0");
  }, []);

  function toggleAuto(ativo: boolean) {
    setAutoAtivo(ativo);
    localStorage.setItem("vellox-autoprint-ativo", ativo ? "1" : "0");
  }

  function handleDownloadInstaller() {
    const lines = [
      "@echo off",
      "set STARTUP=%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Startup",
      "set DEST=%STARTUP%\\vellox-painel.bat",
      "set C1=%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe",
      "set C2=%LocalAppData%\\Google\\Chrome\\Application\\chrome.exe",
      "",
      "> \"%DEST%\" echo @echo off",
      ">> \"%DEST%\" echo taskkill /F /IM chrome.exe >nul 2>&1",
      ">> \"%DEST%\" echo timeout /t 1 >nul",
      ">> \"%DEST%\" echo set C1=%%ProgramFiles%%\\Google\\Chrome\\Application\\chrome.exe",
      ">> \"%DEST%\" echo set C2=%%LocalAppData%%\\Google\\Chrome\\Application\\chrome.exe",
      ">> \"%DEST%\" echo if exist \"%%C1%%\" start \"\" \"%%C1%%\" --kiosk-printing --app=https://appvellox.online/dashboard --disable-popup-blocking",
      ">> \"%DEST%\" echo if exist \"%%C2%%\" start \"\" \"%%C2%%\" --kiosk-printing --app=https://appvellox.online/dashboard --disable-popup-blocking",
      "",
      "taskkill /F /IM chrome.exe >nul 2>&1",
      "timeout /t 1 >nul",
      "if exist \"%C1%\" start \"\" \"%C1%\" --kiosk-printing --app=https://appvellox.online/dashboard --disable-popup-blocking",
      "if exist \"%C2%\" start \"\" \"%C2%\" --kiosk-printing --app=https://appvellox.online/dashboard --disable-popup-blocking",
    ];
    const blob = new Blob([lines.join("\r\n")], { type: "text/plain" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = "vellox-instalar-startup.bat"; a.click();
    URL.revokeObjectURL(url);
  }

  async function handleSavePaper() {
    setSavingPaper(true);
    savePaperSize(paperSize);
    await new Promise(r => setTimeout(r, 400));
    setSavingPaper(false);
    setPaperSaved(true);
    setTimeout(() => setPaperSaved(false), 2500);
  }

  async function handleSaveFont() {
    setSavingFont(true);
    saveFontSize(fontSize);
    await new Promise(r => setTimeout(r, 400));
    setSavingFont(false);
    setFontSaved(true);
    setTimeout(() => setFontSaved(false), 2500);
  }

  async function handleSaveLayout() {
    setSavingLayout(true);
    saveLayout(layout);
    saveLogo(logoUrl.trim());
    // Também salva no banco: é de lá que o agente de impressão local
    // (servidor.ps1) lê o layout, pra imprimir automaticamente igual ao
    // que sai na reimpressão — sem precisar reinstalar nada no PC.
    await supabase.from("configuracoes_print_agent")
      .upsert({ empresa_id: empresa.id, layout }, { onConflict: "empresa_id" });
    await new Promise(r => setTimeout(r, 400));
    setSavingLayout(false);
    setLayoutSaved(true);
    setTimeout(() => setLayoutSaved(false), 2500);
  }

  function handleTest() {
    setTesting(true);
    setTestResult(null);

    const fakePedido: Pedido = {
      id:               "00000000-0000-0000-0000-000000000001",
      empresa_id:       empresa.id,
      loja_id:          null, motoboy_id: null, route_id: null, route_address: null,
      tipo_pedido:      "entrega",
      cliente_nome:     "João da Silva (TESTE)",
      cliente_telefone: "(11) 99999-9999",
      endereco_entrega: "Rua Exemplo, 123 — Centro",
      endereco_lat:     null, endereco_lng: null,
      descricao_itens:  "1x Pizza Margherita\n1x Coca-Cola 2L",
      valor_pedido:     44.90, valor_motoboy: 5.00,
      forma_pagamento:  "pix", troco_para: null,
      status:           "em_fila",
      observacoes:      "Cupom de teste — Vellox",
      bairro:           "Centro", distancia_km: null,
      origem:           "manual", tracking_token: null,
      created_at:       new Date().toISOString(),
      updated_at:       new Date().toISOString(),
      printed_at:       null, print_count: 0, auto_printed: false,
    };

    const ok = printOrder(fakePedido, empresa.nome);
    setTimeout(() => {
      setTesting(false);
      setTestResult({
        ok,
        msg: ok ? "Cupom enviado para impressão!" : "Erro ao gerar cupom. Verifique o console.",
      });
    }, 500);
  }

  return (
    <div className="p-4 md:p-6 max-w-lg space-y-4" style={{ background: "var(--bg-base)", minHeight: "100%" }}>

      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <Link href="/configuracoes" className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: "var(--overlay-sm)", color: "var(--text-2)" }}>
          <ChevronLeft size={16} />
        </Link>
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-1)" }}>Impressão</h1>
          <p className="text-xs" style={{ color: "#64748b" }}>Configurações da impressora térmica</p>
        </div>
      </div>

      {/* Status do agente de impressão local */}
      {initialConfig?.agent_last_seen && (() => {
        const ultimoMs = new Date(initialConfig.agent_last_seen!).getTime();
        const agentOnline = Date.now() - ultimoMs < 30_000;
        const versaoAtual = initialConfig.agent_versao;
        const desatualizado = versaoAtual != null && versaoAtual !== VERSAO_AGENTE_ATUAL;
        return (
          <div className="rounded-2xl p-4" style={{ background: "var(--bg-2)", border: "1px solid var(--border-1)" }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ background: agentOnline ? "#22c55e" : "#ef4444" }} />
                <p className="text-sm font-bold" style={{ color: "var(--text-1)" }}>
                  Agente de impressão {agentOnline ? "online" : "offline"}
                </p>
              </div>
              {versaoAtual && (
                <span className="text-xs font-mono px-2 py-1 rounded-lg" style={{ background: "var(--overlay-sm)", color: "var(--text-3)" }}>
                  {versaoAtual}
                </span>
              )}
            </div>
            {!agentOnline && (
              <p className="text-xs mt-1.5" style={{ color: "#64748b" }}>
                Última vez visto: {new Date(initialConfig.agent_last_seen!).toLocaleString("pt-BR")}
              </p>
            )}
            {desatualizado && (
              <div className="flex items-center gap-2 mt-2 px-3 py-2 rounded-xl" style={{ background: "rgba(255,106,0,0.08)", border: "1px solid rgba(255,106,0,0.2)" }}>
                <AlertCircle size={13} style={{ color: "#FF6A00", flexShrink: 0 }} />
                <span className="text-xs font-semibold" style={{ color: "#FF6A00" }}>
                  Versão desatualizada (atual é {VERSAO_AGENTE_ATUAL}) — baixa o &quot;atualizador&quot; abaixo.
                </span>
              </div>
            )}
          </div>
        );
      })()}

      {/* Credenciais do servidor de impressão (PowerShell, sem instalar programa) */}
      <div className="rounded-2xl p-4" style={{ background: "var(--bg-2)", border: "1px solid var(--border-1)" }}>
        <div className="flex items-center gap-2 mb-1">
          <KeyRound size={15} style={{ color: "#FF6A00" }} />
          <p className="text-sm font-bold" style={{ color: "var(--text-1)" }}>Credenciais do servidor de impressão</p>
        </div>
        <p className="text-xs mb-3" style={{ color: "#64748b" }}>
          Use estes valores no instalador (<span style={{ fontFamily: "monospace" }}>instalar.bat</span>) rodando no computador da impressora.
        </p>

        {/* ID da empresa */}
        <label className="text-xs font-semibold block mb-1.5" style={{ color: "#64748b" }}>ID da empresa</label>
        <div className="flex items-center gap-2 mb-3">
          <div className="flex-1 flex items-center px-3 py-2.5 rounded-xl overflow-hidden" style={{ background: "var(--bg-input)", border: "1px solid var(--border-1)" }}>
            <span className="text-xs truncate" style={{ fontFamily: "monospace", color: "var(--text-1)" }}>{empresa.id}</span>
          </div>
          <button
            onClick={() => copiarCampo(empresa.id, "id")}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold shrink-0"
            style={{ background: "rgba(255,106,0,0.1)", color: copiedField === "id" ? "#22c55e" : "#FF6A00", border: "1px solid rgba(255,106,0,0.2)" }}
          >
            {copiedField === "id" ? <CheckCircle size={13} /> : <Copy size={13} />}
            Copiar
          </button>
        </div>

        {/* Token do agente */}
        <label className="text-xs font-semibold block mb-1.5" style={{ color: "#64748b" }}>Token do agente</label>
        {loadingCreds && !creds ? (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{ background: "var(--bg-input)", border: "1px solid var(--border-1)" }}>
            <Loader2 size={13} className="animate-spin" style={{ color: "#64748b" }} />
            <span className="text-xs" style={{ color: "#64748b" }}>Carregando…</span>
          </div>
        ) : credsError ? (
          <div className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
            <span className="text-xs" style={{ color: "#f87171" }}>{credsError}</span>
            <button onClick={carregarCredenciais} className="flex items-center gap-1 text-xs font-bold shrink-0" style={{ color: "#f87171" }}>
              <RefreshCw size={12} /> Tentar de novo
            </button>
          </div>
        ) : creds ? (
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl overflow-hidden" style={{ background: "var(--bg-input)", border: "1px solid var(--border-1)" }}>
              <span className="text-xs truncate flex-1" style={{ fontFamily: "monospace", color: "var(--text-1)" }}>
                {showToken ? creds.agent_token : maskToken(creds.agent_token)}
              </span>
              <button onClick={() => setShowToken(v => !v)} className="shrink-0" style={{ color: "#64748b" }}>
                {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <button
              onClick={() => copiarCampo(creds.agent_token, "token")}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold shrink-0"
              style={{ background: "rgba(255,106,0,0.1)", color: copiedField === "token" ? "#22c55e" : "#FF6A00", border: "1px solid rgba(255,106,0,0.2)" }}
            >
              {copiedField === "token" ? <CheckCircle size={13} /> : <Copy size={13} />}
              Copiar
            </button>
          </div>
        ) : null}
        <p className="text-xs mt-1.5" style={{ color: "#374151" }}>
          Não compartilhe o token — quem tiver acesso a ele consegue ler os pedidos pendentes da sua loja.
        </p>

        <div className="flex gap-2 mt-3">
          <button
            onClick={baixarInstalador}
            disabled={baixandoInstalador}
            className="flex items-center justify-center gap-2 flex-1 py-2.5 rounded-xl text-xs font-bold"
            style={{ background: "var(--overlay-sm)", border: "1px solid var(--border-1)", color: "var(--text-1)", opacity: baixandoInstalador ? 0.6 : 1 }}
          >
            {baixandoInstalador ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
            {baixandoInstalador ? "Baixando…" : "Baixar instalador"}
          </button>
          <button
            onClick={baixarAtualizador}
            disabled={baixandoAtualizador}
            title="Já está instalado? Isso só atualiza o servidor.ps1 e reinicia, sem pedir credenciais de novo."
            className="flex items-center justify-center gap-2 flex-1 py-2.5 rounded-xl text-xs font-bold"
            style={{ background: "var(--overlay-sm)", border: "1px solid var(--border-1)", color: "var(--text-1)", opacity: baixandoAtualizador ? 0.6 : 1 }}
          >
            {baixandoAtualizador ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            {baixandoAtualizador ? "Baixando…" : "Baixar atualizador"}
          </button>
        </div>
        <p className="text-xs mt-1.5" style={{ color: "var(--text-4)" }}>
          Já instalado no PC do cliente? Manda o "atualizador" — ele só troca o servidor.ps1 e reinicia, sem precisar reconfigurar nada.
        </p>
      </div>

      {/* Toggle impressão automática */}
      <div className="rounded-2xl p-4 flex items-center justify-between" style={{ background: autoAtivo ? "rgba(34,197,94,0.06)" : "var(--bg-2)", border: `1px solid ${autoAtivo ? "rgba(34,197,94,0.3)" : "rgba(255,255,255,0.08)"}` }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: autoAtivo ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.1)" }}>
            <Printer size={17} style={{ color: autoAtivo ? "#22c55e" : "#ef4444" }} />
          </div>
          <div>
            <p className="text-sm font-bold" style={{ color: "var(--text-1)" }}>Impressão automática</p>
            <p className="text-xs" style={{ color: autoAtivo ? "#4ade80" : "#f87171" }}>
              {autoAtivo ? "Ativa — imprime a cada novo pedido" : "Desativada"}
            </p>
          </div>
        </div>
        <button
          onClick={() => toggleAuto(!autoAtivo)}
          style={{ width: 48, height: 26, borderRadius: 13, background: autoAtivo ? "#22c55e" : "#374151", border: "none", cursor: "pointer", transition: "background .2s", position: "relative", flexShrink: 0 }}
        >
          <span style={{ position: "absolute", top: 3, left: autoAtivo ? 25 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
        </button>
      </div>

      {/* Tamanho do papel */}
      <div className="rounded-2xl p-4" style={{ background: "var(--bg-2)", border: "1px solid var(--border-1)" }}>
        <p className="text-xs font-semibold mb-3" style={{ color: "#64748b" }}>TAMANHO DO PAPEL</p>
        <div className="grid grid-cols-2 gap-2 mb-3">
          {(["58mm", "80mm"] as const).map(size => (
            <button
              key={size}
              onClick={() => setPaperSize(size)}
              className="flex items-center gap-2 p-3 rounded-xl text-left"
              style={{ background: paperSize === size ? "rgba(255,106,0,0.08)" : "var(--overlay-sm)", border: `1px solid ${paperSize === size ? "rgba(255,106,0,0.4)" : "var(--border-1)"}` }}
            >
              <div style={{ width: 16, height: 16, borderRadius: "50%", flexShrink: 0, border: `2px solid ${paperSize === size ? "#FF6A00" : "#374151"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {paperSize === size && <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#FF6A00" }} />}
              </div>
              <div>
                <p className="text-sm font-bold" style={{ color: "var(--text-1)" }}>{size}</p>
                <p className="text-xs" style={{ color: "#64748b" }}>{size === "58mm" ? "Bobina estreita" : "Bobina larga"}</p>
              </div>
            </button>
          ))}
        </div>
        <button
          onClick={handleSavePaper}
          disabled={savingPaper}
          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-bold"
          style={{ background: paperSaved ? "rgba(34,197,94,0.15)" : "var(--overlay-sm)", border: `1px solid ${paperSaved ? "rgba(34,197,94,0.3)" : "var(--border-1)"}`, color: paperSaved ? "#4ade80" : "var(--text-1)" }}
        >
          {savingPaper ? <Loader2 size={14} className="animate-spin" /> : paperSaved ? <CheckCircle size={14} /> : null}
          {savingPaper ? "Salvando..." : paperSaved ? "Salvo!" : "Salvar"}
        </button>
      </div>

      {/* Tamanho da fonte */}
      <div className="rounded-2xl p-4" style={{ background: "var(--bg-2)", border: "1px solid var(--border-1)" }}>
        <p className="text-xs font-semibold mb-3" style={{ color: "#64748b" }}>TAMANHO DA FONTE</p>
        <div className="grid grid-cols-4 gap-2 mb-3">
          {([
            { id: "p"  as FontSizeOpt, label: "P",    sub: "Pequena" },
            { id: "m"  as FontSizeOpt, label: "M",    sub: "Normal" },
            { id: "g"  as FontSizeOpt, label: "G",    sub: "Grande" },
            { id: "xg" as FontSizeOpt, label: "XG",   sub: "Extra" },
          ]).map(opt => (
            <button
              key={opt.id}
              onClick={() => setFontSize(opt.id)}
              className="flex flex-col items-center gap-1 p-3 rounded-xl"
              style={{ background: fontSize === opt.id ? "rgba(255,106,0,0.08)" : "var(--overlay-sm)", border: `1px solid ${fontSize === opt.id ? "rgba(255,106,0,0.4)" : "var(--border-1)"}` }}
            >
              <span className="font-black" style={{ fontSize: opt.id === "p" ? 13 : opt.id === "m" ? 16 : opt.id === "g" ? 19 : 22, color: fontSize === opt.id ? "#FF6A00" : "var(--text-1)" }}>{opt.label}</span>
              <span style={{ fontSize: 10, color: "#64748b" }}>{opt.sub}</span>
            </button>
          ))}
        </div>
        <button
          onClick={handleSaveFont}
          disabled={savingFont}
          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-bold"
          style={{ background: fontSaved ? "rgba(34,197,94,0.15)" : "var(--overlay-sm)", border: `1px solid ${fontSaved ? "rgba(34,197,94,0.3)" : "var(--border-1)"}`, color: fontSaved ? "#4ade80" : "var(--text-1)" }}
        >
          {savingFont ? <Loader2 size={14} className="animate-spin" /> : fontSaved ? <CheckCircle size={14} /> : null}
          {savingFont ? "Salvando..." : fontSaved ? "Salvo!" : "Salvar fonte"}
        </button>
      </div>

      {/* Layout de impressão */}
      <div className="rounded-2xl p-4" style={{ background: "var(--bg-2)", border: "1px solid var(--border-1)" }}>
        <p className="text-xs font-semibold mb-3" style={{ color: "#64748b" }}>LAYOUT DO CUPOM</p>

        <div className="grid grid-cols-3 gap-2 mb-4">
          {([
            {
              id: "classico" as LayoutOpt,
              label: "Clássico",
              preview: (
                <div style={{ fontSize: 8, lineHeight: 1.4, color: "#000", fontFamily: "monospace", padding: "6px 4px" }}>
                  <div style={{ textAlign: "center", fontWeight: 900 }}>EMPRESA</div>
                  <div style={{ borderTop: "1px dashed #000", margin: "2px 0" }} />
                  <div style={{ fontSize: 7 }}>CLIENTE</div>
                  <div style={{ fontWeight: 700 }}>João Silva</div>
                  <div style={{ borderTop: "1px dashed #000", margin: "2px 0" }} />
                  <div style={{ fontSize: 7 }}>ITENS</div>
                  <div>1x Pizza</div>
                  <div style={{ borderTop: "1px dashed #000", margin: "2px 0" }} />
                  <div style={{ textAlign: "center", fontWeight: 900 }}>TOTAL R$44,90</div>
                </div>
              ),
            },
            {
              id: "moderno" as LayoutOpt,
              label: "Moderno",
              preview: (
                <div style={{ fontSize: 8, lineHeight: 1.4, color: "#000", fontFamily: "monospace", padding: "6px 4px" }}>
                  <div style={{ border: "1px solid #000", textAlign: "center", fontWeight: 900, padding: "2px" }}>EMPRESA</div>
                  <div style={{ borderTop: "2px solid #000", margin: "2px 0" }} />
                  <div style={{ fontWeight: 900 }}>[DELIVERY]</div>
                  <div style={{ borderTop: "1px dashed #000", margin: "2px 0" }} />
                  <div>{">"} João Silva</div>
                  <div style={{ borderTop: "2px solid #000", margin: "2px 0" }} />
                  <div>• 1x Pizza</div>
                  <div style={{ borderTop: "2px solid #000", margin: "2px 0" }} />
                  <div style={{ fontWeight: 900 }}>{">>"} R$44,90 {"<<"}</div>
                </div>
              ),
            },
            {
              id: "compacto" as LayoutOpt,
              label: "Compacto",
              preview: (
                <div style={{ fontSize: 7.5, lineHeight: 1.3, color: "#000", fontFamily: "monospace", padding: "6px 4px" }}>
                  <div style={{ textAlign: "center", fontWeight: 900, fontSize: 8 }}>EMPRESA</div>
                  <div style={{ fontSize: 6.5 }}>01/01/25 10:30 | #ABC123</div>
                  <div style={{ borderTop: "1px solid #000", margin: "2px 0" }} />
                  <div>[DELIVERY] João</div>
                  <div>Rua Exemplo, 123</div>
                  <div style={{ borderTop: "1px solid #000", margin: "2px 0" }} />
                  <div>1x Pizza</div>
                  <div style={{ borderTop: "1px solid #000", margin: "2px 0" }} />
                  <div style={{ fontWeight: 900, fontSize: 8 }}>TOTAL: R$44,90</div>
                  <div style={{ fontSize: 6.5 }}>Pgto: PIX</div>
                </div>
              ),
            },
          ]).map(opt => (
            <button
              key={opt.id}
              onClick={() => setLayout(opt.id)}
              className="rounded-xl overflow-hidden text-left transition-all"
              style={{ border: `2px solid ${layout === opt.id ? "#FF6A00" : "var(--border-1)"}`, background: layout === opt.id ? "rgba(255,106,0,0.06)" : "var(--overlay-sm)", padding: 0 }}
            >
              <div style={{ background: "#fff", minHeight: 90 }}>{opt.preview}</div>
              <div className="flex items-center justify-between px-2 py-1.5">
                <span style={{ fontSize: 11, fontWeight: 700, color: layout === opt.id ? "#FF6A00" : "var(--text-2)" }}>{opt.label}</span>
                {layout === opt.id && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#FF6A00" }} />}
              </div>
            </button>
          ))}
        </div>

        {/* Logo */}
        <div className="mb-3">
          <p className="text-xs font-semibold mb-2" style={{ color: "#64748b" }}>LOGO NO CUPOM (URL da imagem)</p>
          <div className="flex items-center gap-2">
            {logoUrl && (
              <img src={logoUrl} alt="logo" className="rounded-lg object-contain flex-shrink-0" style={{ width: 40, height: 40, border: "1px solid var(--border-1)", background: "#fff" }} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
            )}
            <input
              type="url"
              value={logoUrl}
              onChange={e => setLogoUrl(e.target.value)}
              placeholder="https://... (cole a URL da sua logo)"
              className="flex-1 rounded-xl outline-none"
              style={{ background: "var(--bg-input)", border: "1px solid var(--border-1)", color: "var(--text-1)", padding: "9px 12px", fontSize: 12 }}
            />
            {logoUrl && (
              <button onClick={() => setLogoUrl("")} className="flex-shrink-0" style={{ color: "#64748b" }}>
                <X size={14} />
              </button>
            )}
          </div>
          <p className="text-xs mt-1.5" style={{ color: "#374151" }}>Dica: use a URL da logo que já está nas configurações da sua loja</p>
        </div>

        <button
          onClick={handleSaveLayout}
          disabled={savingLayout}
          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-bold"
          style={{ background: layoutSaved ? "rgba(34,197,94,0.15)" : "var(--overlay-sm)", border: `1px solid ${layoutSaved ? "rgba(34,197,94,0.3)" : "var(--border-1)"}`, color: layoutSaved ? "#4ade80" : "var(--text-1)" }}
        >
          {savingLayout ? <Loader2 size={14} className="animate-spin" /> : layoutSaved ? <CheckCircle size={14} /> : null}
          {savingLayout ? "Salvando..." : layoutSaved ? "Salvo!" : "Salvar layout"}
        </button>
      </div>

      {/* Ações */}
      <div className="grid grid-cols-1 gap-3">
        {/* Instalador */}
        <button
          onClick={handleDownloadInstaller}
          className="flex items-center gap-3 p-4 rounded-2xl text-left"
          style={{ background: "linear-gradient(135deg,rgba(255,106,0,0.12),rgba(204,85,0,0.06))", border: "1px solid rgba(255,106,0,0.25)" }}
        >
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(255,106,0,0.15)" }}>
            <Zap size={18} style={{ color: "#FF6A00" }} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold" style={{ color: "var(--text-1)" }}>Instalador de início automático</p>
            <p className="text-xs" style={{ color: "#64748b" }}>Chrome abre o painel sozinho quando o PC ligar</p>
          </div>
          <Download size={15} style={{ color: "#FF6A00", flexShrink: 0 }} />
        </button>

        {/* Teste de impressão */}
        <div className="rounded-2xl p-4" style={{ background: "var(--bg-2)", border: "1px solid var(--border-1)" }}>
          {testResult && (
            <div className="flex items-start gap-2 p-3 rounded-xl mb-3" style={{ background: testResult.ok ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)", border: `1px solid ${testResult.ok ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}` }}>
              {testResult.ok
                ? <CheckCircle size={14} style={{ color: "#22c55e", flexShrink: 0, marginTop: 1 }} />
                : <AlertCircle size={14} style={{ color: "#ef4444", flexShrink: 0, marginTop: 1 }} />}
              <p className="text-xs" style={{ color: testResult.ok ? "#4ade80" : "#f87171" }}>{testResult.msg}</p>
            </div>
          )}
          <button
            onClick={handleTest}
            disabled={testing}
            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-bold"
            style={{ background: "linear-gradient(135deg,#22c55e,#16a34a)", color: "#fff" }}
          >
            {testing ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
            {testing ? "Imprimindo..." : "Imprimir cupom de teste"}
          </button>
        </div>
      </div>

      {/* Empresa ID — discreto */}
      <p className="text-xs px-1" style={{ color: "#374151" }}>
        ID: <span style={{ fontFamily: "monospace" }}>{empresa.id}</span>
      </p>
    </div>
  );
}
