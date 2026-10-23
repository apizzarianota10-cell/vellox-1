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
  saveFonte,     isFonteOpt,
  saveLayout,
  saveLogo,      getSavedLogo,
  printOrder,
  buildTestPedido,
} from "@/lib/printService";
import type { FonteOpt, LayoutOpt } from "@/lib/printService";
import { buildLayoutPreviews } from "@/lib/printLayoutPreviews";
import { buildReceipt } from "@/lib/escpos";
import { getMobilePrintMode, imprimirNoCelular } from "@/lib/mobilePrint";
import ImprimirPeloCelular from "./ImprimirPeloCelular";

interface Props {
  empresa: { id: string; nome: string; cnpj: string | null };
  initialConfig: {
    ativo: boolean;
    impressora_nome: string | null;
    tamanho_papel: string;
    agent_last_seen: string | null;
    layout: string | null;
    agent_versao: string | null;
    fonte: string | null;
  } | null;
}

const FONTE_OPTS: { id: FonteOpt; label: string; sub: string }[] = [
  { id: "normal",       label: "Normal",       sub: "Letra padrão" },
  { id: "grande",       label: "Grande",       sub: "Maior, proporcional" },
  { id: "extra_grande", label: "Extra grande", sub: "2x — menos colunas" },
];

// Versão atual do servidor.ps1 (public/print-server/servidor.ps1, variável
// $Versao no topo do arquivo) — lida do próprio arquivo publicado (mesma
// fonte que o agente usa pra se auto-atualizar), então não precisa manter
// número nenhum em sincronia à mão. A partir da v12 o agente se atualiza sozinho.
const VERSAO_AUTO_UPDATE = 12;
function numVersao(v: string | null | undefined) {
  const m = v?.match(/v(\d+)/);
  return m ? Number(m[1]) : 0;
}

export default function ImpressaoClient({ empresa, initialConfig }: Props) {
  const supabase = createClient();
  const [paperSize,   setPaperSize]   = useState<"58mm" | "80mm">(
    (initialConfig?.tamanho_papel as "58mm" | "80mm") ?? "80mm"
  );
  const [layout,        setLayout]        = useState<LayoutOpt>(
    (initialConfig?.layout as LayoutOpt) ?? "classico"
  );
  const [fonte,         setFonte]         = useState<FonteOpt>(
    isFonteOpt(initialConfig?.fonte) ? initialConfig?.fonte : "grande"
  );
  const [fontError,     setFontError]     = useState("");
  const [logoUrl,       setLogoUrl]       = useState("");
  const [autoAtivo,     setAutoAtivo]     = useState(true);
  const [savingPaper,   setSavingPaper]   = useState(false);
  const [paperSaved,    setPaperSaved]    = useState(false);
  const [savingFont,    setSavingFont]    = useState(false);
  const [fontSaved,     setFontSaved]     = useState(false);
  const [savingLayout,  setSavingLayout]  = useState(false);
  const [layoutSaved,   setLayoutSaved]   = useState(false);
  const [layoutError,   setLayoutError]   = useState("");
  const [testing,       setTesting]       = useState(false);
  const [testResult,    setTestResult]    = useState<{ ok: boolean; msg: string } | null>(null);
  const [creds,         setCreds]         = useState<{ empresa_id: string; agent_token: string } | null>(null);
  const [loadingCreds,  setLoadingCreds]  = useState(false);
  const [credsError,    setCredsError]    = useState("");
  const [copiedField,   setCopiedField]   = useState<"id" | "token" | null>(null);
  const [showToken,     setShowToken]     = useState(false);
  const [baixandoInstalador, setBaixandoInstalador] = useState(false);
  const [baixandoAtualizador, setBaixandoAtualizador] = useState(false);
  const [agentStatus, setAgentStatus] = useState<{ last_seen: string | null; versao: string | null }>({
    last_seen: initialConfig?.agent_last_seen ?? null,
    versao:    initialConfig?.agent_versao ?? null,
  });
  const [agora, setAgora] = useState(() => Date.now());
  const [versaoMaisNova, setVersaoMaisNova] = useState<string | null>(null);

  useEffect(() => {
    fetch("/print-server/servidor.ps1", { cache: "no-store" })
      .then(r => r.text())
      .then(t => { const m = t.match(/^\$Versao = "(v\d+)"/m); if (m) setVersaoMaisNova(m[1]); })
      .catch(() => {});
  }, []);

  // Sem isso, o status ficava congelado no que veio do servidor ao abrir a
  // página: o dono instalava o agente e continuava vendo "offline" até dar F5.
  useEffect(() => {
    const sb = createClient();
    let ativo = true;
    async function atualizarStatus() {
      const { data } = await sb
        .from("configuracoes_print_agent")
        .select("agent_last_seen, agent_versao")
        .eq("empresa_id", empresa.id)
        .maybeSingle();
      if (!ativo) return;
      if (data) setAgentStatus({ last_seen: data.agent_last_seen, versao: data.agent_versao });
      setAgora(Date.now());
    }
    const t = setInterval(atualizarStatus, 10_000);
    return () => { ativo = false; clearInterval(t); };
  }, [empresa.id]);

  // O link precisa estar no DOM antes do .click() (em alguns navegadores,
  // um <a download> solto na memória não dispara o download de jeito
  // nenhum) e a URL do blob só pode ser revogada DEPOIS que o navegador
  // realmente começou a salvar o arquivo — revogar na hora é uma corrida
  // que às vezes ganha do download, fazendo o clique parecer que "não fez
  // nada". Era esse o bug do botão "Baixar atualizador".
  function downloadBlob(conteudo: string, nomeArquivo: string) {
    const blob = new Blob([conteudo], { type: "text/plain" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = nomeArquivo; a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1000);
  }

  // Baixa o instalador com o número da versão já no nome do arquivo (lido do
  // próprio conteúdo, ex: "INSTALADOR_VERSAO=v3"), pra dar pra saber qual
  // versão você tem só de olhar a pasta de Downloads, sem precisar abrir.
  // O .bat sai com o ID e o token desta loja embutidos (variáveis de ambiente
  // que o configurar.ps1 lê), então o dono só dá dois cliques — sem copiar e
  // colar credencial, que era onde mais dava erro.
  async function baixarInstalador() {
    setBaixandoInstalador(true);
    try {
      let c = creds;
      if (!c) {
        // Sem credencial ainda baixa o instalador genérico (que pede colar na mão).
        try {
          const r = await fetch("/api/print-server/credentials");
          const d = await r.json();
          if (r.ok) { c = { empresa_id: d.empresa_id, agent_token: d.agent_token }; setCreds(c); }
        } catch { /* segue sem credencial */ }
      }
      const res = await fetch("/print-server/instalar.bat", { cache: "no-store" });
      let texto = await res.text();
      const m = texto.match(/INSTALADOR_VERSAO=([^\r\n]+)/);
      const versao = m ? m[1].trim() : "";
      // Token hex (atual) ou JWT (lojas antigas) — ambos só têm caracteres seguros num `set "..."` do .bat.
      if (c && /^[0-9a-f-]{36}$/i.test(c.empresa_id) && /^([0-9a-f]{32,64}|[\w-]+\.[\w-]+\.[\w-]+)$/i.test(c.agent_token)) {
        texto = texto.replace(
          /^@echo off/,
          `@echo off\nset "VELLOX_EMPRESA_ID=${c.empresa_id}"\nset "VELLOX_AGENT_TOKEN=${c.agent_token}"`,
        );
      }
      // cmd.exe é mais confiável com CRLF (continuação de linha com ^).
      texto = texto.replace(/\r?\n/g, "\r\n");
      downloadBlob(texto, `vellox-instalador${versao ? `-${versao}` : ""}.bat`);
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
      const texto = (await res.text()).replace(/\r?\n/g, "\r\n");
      downloadBlob(texto, "vellox-atualizar.bat");
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
    // Espelha o valor do banco no navegador: é o fallback de quem imprime sem
    // receber o override (ex: popup de novidades).
    if (isFonteOpt(initialConfig?.fonte)) saveFonte(initialConfig?.fonte);
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
    downloadBlob(lines.join("\r\n"), "vellox-instalar-startup.bat");
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
    setFontError("");
    saveFonte(fonte);
    // O agente de impressão (servidor.ps1) lê esse valor do banco a cada 60s.
    const { error } = await supabase.from("configuracoes_print_agent")
      .upsert({ empresa_id: empresa.id, fonte }, { onConflict: "empresa_id" });
    setSavingFont(false);
    if (error) {
      setFontError("Não salvou no banco (ficou só neste navegador): " + error.message);
      return;
    }
    setFontSaved(true);
    setTimeout(() => setFontSaved(false), 2500);
  }

  async function handleSaveLayout() {
    setSavingLayout(true);
    setLayoutError("");
    saveLayout(layout);
    saveLogo(logoUrl.trim());
    // Também salva no banco: é de lá que o agente de impressão local
    // (servidor.ps1) lê o layout, pra imprimir automaticamente igual ao
    // que sai na reimpressão — sem precisar reinstalar nada no PC.
    const { error } = await supabase.from("configuracoes_print_agent")
      .upsert({ empresa_id: empresa.id, layout }, { onConflict: "empresa_id" });
    setSavingLayout(false);
    if (error) {
      setLayoutError("Não salvou no banco (ficou só neste navegador): " + error.message);
      return;
    }
    setLayoutSaved(true);
    setTimeout(() => setLayoutSaved(false), 2500);
  }

  // Pedido real do catálogo sai pelo agente do computador da impressora — o
  // teste precisa ir pelo MESMO caminho, senão mostra um cupom (do navegador)
  // diferente do que sai na cozinha. Agente v13+ aceita cupom de teste em
  // localhost:7532 (com o token da loja); sem isso, cai pro navegador e avisa.
  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    const pedidoTeste = buildTestPedido(empresa.id);

    // Este aparelho imprime pelo celular (Bluetooth/RawBT): o teste vai pelo
    // mesmo caminho dos pedidos. Sem await antes — o RawBT precisa abrir
    // ainda dentro do toque.
    if (getMobilePrintMode()) {
      const r = await imprimirNoCelular(buildReceipt(pedidoTeste, empresa.nome, layout, fonte), { gesto: true });
      setTesting(false);
      setTestResult(r.ok
        ? { ok: true, msg: "Teste enviado para a impressora do celular. Confira se saiu o papel." }
        : { ok: false, msg: r.mensagem });
      return;
    }

    let aviso = "";
    if (creds?.agent_token) {
      try {
        const res = await fetch("http://localhost:7532/print", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ teste: true, token: creds.agent_token, layout, fonte, pedido: pedidoTeste }),
          signal: AbortSignal.timeout(3000),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.teste === true) {
          setTesting(false);
          setTestResult({ ok: true, msg: "Enviado pro agente de impressão — sai exatamente igual aos pedidos do catálogo (em até 5s)." });
          return;
        }
        aviso = res.status === 403
          ? "O agente deste computador está com outra credencial — reinstale com o instalador do painel."
          : "O agente deste computador é uma versão antiga e não imprime teste — os pedidos reais podem sair diferentes deste cupom. Baixe o atualizador.";
      } catch {
        aviso = "O agente não está neste computador — teste impresso pelo navegador. Os pedidos do catálogo saem pelo agente do computador da impressora.";
      }
    }

    const ok = printOrder(pedidoTeste, empresa.nome, undefined, layout, fonte);
    setTimeout(() => {
      setTesting(false);
      setTestResult({
        ok,
        msg: !ok ? "Erro ao gerar cupom. Verifique o console." : aviso ? `Impresso pelo navegador. ${aviso}` : "Cupom enviado para impressão!",
      });
    }, 500);
  }

  return (
    <div className="p-4 md:p-6 max-w-lg space-y-4" style={{ background: "var(--bg-base)", minHeight: "100%" }}>

      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <Link href="/automacoes" className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: "var(--overlay-sm)", color: "var(--text-2)" }}>
          <ChevronLeft size={16} />
        </Link>
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-1)" }}>Impressão</h1>
          <p className="text-xs" style={{ color: "#64748b" }}>Configurações da impressora térmica</p>
        </div>
      </div>

      {/* Imprimir pelo celular (Android + impressora Bluetooth). No PC é só uma linha. */}
      <ImprimirPeloCelular empresaId={empresa.id} empresaNome={empresa.nome} layout={layout} fonte={fonte} />

      {/* Status do agente de impressão local — atualiza sozinho a cada 10s */}
      {(() => {
        const lastSeen = agentStatus.last_seen;
        const agentOnline = !!lastSeen && agora - new Date(lastSeen).getTime() < 30_000;
        const versaoAtual = agentStatus.versao;
        const desatualizado = agentOnline && !!versaoAtual && !!versaoMaisNova && numVersao(versaoAtual) < numVersao(versaoMaisNova);
        const atualizaSozinho = numVersao(versaoAtual) >= VERSAO_AUTO_UPDATE;
        return (
          <div className="rounded-2xl p-4" style={{ background: "var(--bg-2)", border: "1px solid var(--border-1)" }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ background: agentOnline ? "#22c55e" : "#ef4444" }} />
                <p className="text-sm font-bold" style={{ color: "var(--text-1)" }}>
                  Agente de impressão {agentOnline ? "online" : lastSeen ? "offline" : "ainda não conectado"}
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
                {lastSeen
                  ? `Última vez visto: ${new Date(lastSeen).toLocaleString("pt-BR")} — no computador da impressora, rode o instalador de novo.`
                  : "Clique em \"Baixar instalador\" abaixo e abra o arquivo no computador ligado à impressora."}
              </p>
            )}
            {desatualizado && (
              <div className="flex items-center gap-2 mt-2 px-3 py-2 rounded-xl" style={{ background: "rgba(228,0,43,0.08)", border: "1px solid rgba(228,0,43,0.2)" }}>
                <AlertCircle size={13} style={{ color: "#E4002B", flexShrink: 0 }} />
                <span className="text-xs font-semibold" style={{ color: "#E4002B" }}>
                  {atualizaSozinho
                    ? <>Nova versão {versaoMaisNova} disponível — o agente se atualiza sozinho em até 30 min.</>
                    : <>Versão desatualizada (atual é {versaoMaisNova}) — baixa o &quot;atualizador&quot; abaixo. Depois dessa, as próximas chegam sozinhas.</>}
                </span>
              </div>
            )}
          </div>
        );
      })()}

      {/* Credenciais do servidor de impressão (PowerShell, sem instalar programa) */}
      <div className="rounded-2xl p-4" style={{ background: "var(--bg-2)", border: "1px solid var(--border-1)" }}>
        <div className="flex items-center gap-2 mb-1">
          <KeyRound size={15} style={{ color: "#E4002B" }} />
          <p className="text-sm font-bold" style={{ color: "var(--text-1)" }}>Credenciais do servidor de impressão</p>
        </div>
        <p className="text-xs mb-3" style={{ color: "#64748b" }}>
          O <strong>Baixar instalador</strong> abaixo já sai configurado pra sua loja — é só abrir o arquivo no computador da impressora, escolher a impressora na lista e conferir o cupom de teste. Estes valores só são necessários se o instalador pedir.
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
            style={{ background: "rgba(228,0,43,0.1)", color: copiedField === "id" ? "#22c55e" : "#E4002B", border: "1px solid rgba(228,0,43,0.2)" }}
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
              style={{ background: "rgba(228,0,43,0.1)", color: copiedField === "token" ? "#22c55e" : "#E4002B", border: "1px solid rgba(228,0,43,0.2)" }}
            >
              {copiedField === "token" ? <CheckCircle size={13} /> : <Copy size={13} />}
              Copiar
            </button>
          </div>
        ) : null}
        <p className="text-xs mt-1.5" style={{ color: "#374151" }}>
          Não compartilhe o token nem o instalador baixado (ele carrega o token) — quem tiver acesso consegue ler os pedidos pendentes da sua loja.
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
              style={{ background: paperSize === size ? "rgba(228,0,43,0.08)" : "var(--overlay-sm)", border: `1px solid ${paperSize === size ? "rgba(228,0,43,0.4)" : "var(--border-1)"}` }}
            >
              <div style={{ width: 16, height: 16, borderRadius: "50%", flexShrink: 0, border: `2px solid ${paperSize === size ? "#E4002B" : "#374151"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {paperSize === size && <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#E4002B" }} />}
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

      {/* Tamanho da letra — vale pro cupom inteiro, em todas as vias de impressão */}
      <div className="rounded-2xl p-4" style={{ background: "var(--bg-2)", border: "1px solid var(--border-1)" }}>
        <p className="text-xs font-semibold mb-1" style={{ color: "#64748b" }}>TAMANHO DA LETRA (CUPOM INTEIRO)</p>
        <p className="text-xs mb-3" style={{ color: "var(--text-4)" }}>
          Todas as linhas saem no mesmo tamanho — loja, cliente, endereço, itens, sabores, total e pagamento. Vale pra impressão automática, reimpressão e teste; o agente do computador da impressora pega a mudança em até 1 minuto.
        </p>
        <div className="grid grid-cols-3 gap-2 mb-3">
          {FONTE_OPTS.map(opt => (
            <button
              key={opt.id}
              onClick={() => setFonte(opt.id)}
              className="flex flex-col items-center justify-center gap-1 py-3 rounded-xl"
              style={{ background: fonte === opt.id ? "rgba(228,0,43,0.08)" : "var(--overlay-sm)", border: `1px solid ${fonte === opt.id ? "rgba(228,0,43,0.4)" : "var(--border-1)"}` }}
            >
              <span className="font-black" style={{ fontSize: opt.id === "normal" ? 13 : opt.id === "grande" ? 17 : 21, color: fonte === opt.id ? "#E4002B" : "var(--text-1)" }}>Aa</span>
              <span className="text-xs font-semibold" style={{ color: fonte === opt.id ? "#E4002B" : "var(--text-2)" }}>{opt.label}</span>
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
          {savingFont ? "Salvando..." : fontSaved ? "Salvo!" : "Salvar tamanho da letra"}
        </button>
        {fontError && (
          <p className="text-xs mt-1.5" style={{ color: "#ef4444" }}>{fontError}</p>
        )}
      </div>

      {/* Layout de impressão */}
      <div className="rounded-2xl p-4" style={{ background: "var(--bg-2)", border: "1px solid var(--border-1)" }}>
        <p className="text-xs font-semibold mb-3" style={{ color: "#64748b" }}>LAYOUT DO CUPOM</p>

        <div className="grid grid-cols-3 gap-2 mb-4">
          {buildLayoutPreviews(fonte).map(opt => (
            <button
              key={opt.id}
              onClick={() => setLayout(opt.id)}
              className="rounded-xl overflow-hidden text-left transition-all"
              style={{ border: `2px solid ${layout === opt.id ? "#E4002B" : "var(--border-1)"}`, background: layout === opt.id ? "rgba(228,0,43,0.06)" : "var(--overlay-sm)", padding: 0 }}
            >
              <div style={{ background: "#fff", minHeight: 90 }}>{opt.preview}</div>
              <div className="flex items-center justify-between px-2 py-1.5">
                <span style={{ fontSize: 11, fontWeight: 700, color: layout === opt.id ? "#E4002B" : "var(--text-2)" }}>{opt.label}</span>
                {layout === opt.id && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#E4002B" }} />}
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
        {layoutError && (
          <p className="text-xs mt-1.5" style={{ color: "#ef4444" }}>{layoutError}</p>
        )}
      </div>

      {/* Ações */}
      <div className="grid grid-cols-1 gap-3">
        {/* Instalador */}
        <button
          onClick={handleDownloadInstaller}
          className="flex items-center gap-3 p-4 rounded-2xl text-left"
          style={{ background: "linear-gradient(135deg,rgba(228,0,43,0.12),rgba(168,0,33,0.06))", border: "1px solid rgba(228,0,43,0.25)" }}
        >
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(228,0,43,0.15)" }}>
            <Zap size={18} style={{ color: "#E4002B" }} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold" style={{ color: "var(--text-1)" }}>Instalador de início automático</p>
            <p className="text-xs" style={{ color: "#64748b" }}>Chrome abre o painel sozinho quando o PC ligar</p>
          </div>
          <Download size={15} style={{ color: "#E4002B", flexShrink: 0 }} />
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
