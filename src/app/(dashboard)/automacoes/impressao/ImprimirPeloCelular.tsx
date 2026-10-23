"use client";

// Assistente "Imprimir pelo celular" — um passo por vez, letra grande, sem
// termos técnicos. Pensado para donos de restaurante de qualquer idade.
//
// Caminho 1: Bluetooth direto do Chrome (procura a impressora e imprime teste).
// Caminho 2 (se o 1 não der): app gratuito RawBT, que funciona com qualquer
// impressora Bluetooth.

import { useEffect, useState } from "react";
import {
  Bluetooth, Smartphone, Printer, Download, CheckCircle, XCircle, Search,
  Power, RefreshCw, Loader2, BatteryCharging, ChevronLeft, Settings,
} from "lucide-react";
import { buildReceipt } from "@/lib/escpos";
import { buildTestPedido } from "@/lib/printService";
import type { FonteOpt, LayoutOpt } from "@/lib/printService";
import { pairPrinter, isBtSupported, getPairedPrinterName, setModoLento, unpairPrinter } from "@/lib/btPrinter";
import {
  getMobilePrintMode, setMobilePrintMode, clearMobilePrintMode, imprimirNoCelular,
  isCelular, isIphone, RAWBT_PLAY_URL, EVENTO_MODO, type MobileMode,
} from "@/lib/mobilePrint";

interface Props {
  empresaId: string;
  empresaNome: string;
  layout: LayoutOpt;
  fonte: FonteOpt;
}

type Aparelho = "carregando" | "pc" | "iphone" | "android";
type Etapa =
  | "inicio" | "resumo"
  | "passo1" | "passo2" | "conferirBt"
  | "rawbtIntro" | "rawbt1" | "rawbt2" | "rawbt3" | "conferirRawbt" | "rawbtAjuda"
  | "pronto";

const C = {
  titulo: { fontSize: 22, fontWeight: 900, color: "var(--text-1)", margin: 0, lineHeight: 1.25 } as React.CSSProperties,
  texto:  { fontSize: 17, color: "var(--text-2)", margin: 0, lineHeight: 1.5 } as React.CSSProperties,
  passo:  { fontSize: 14, fontWeight: 800, color: "#E4002B", margin: 0, letterSpacing: "0.02em" } as React.CSSProperties,
};

function BotaoGrande({ onClick, children, cor = "marca", disabled, href }: {
  onClick?: () => void; children: React.ReactNode; cor?: "marca" | "verde" | "neutro"; disabled?: boolean; href?: string;
}) {
  const estilo: React.CSSProperties = {
    width: "100%", minHeight: 60, borderRadius: 16, padding: "14px 18px",
    display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
    fontSize: 18, fontWeight: 800, cursor: disabled ? "default" : "pointer",
    textDecoration: "none", textAlign: "center", lineHeight: 1.25,
    opacity: disabled ? 0.65 : 1,
    ...(cor === "marca"  ? { background: "#E4002B", color: "#fff", border: "none" } :
        cor === "verde"  ? { background: "#16a34a", color: "#fff", border: "none" } :
                           { background: "var(--overlay-sm)", color: "var(--text-1)", border: "1px solid var(--border-1)" }),
  };
  if (href) return <a href={href} target="_blank" rel="noopener noreferrer" style={estilo}>{children}</a>;
  return <button type="button" onClick={onClick} disabled={disabled} style={estilo}>{children}</button>;
}

function Icone({ children, cor = "#E4002B" }: { children: React.ReactNode; cor?: string }) {
  return (
    <div style={{ width: 72, height: 72, borderRadius: "50%", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center", background: `${cor}1f`, color: cor }}>
      {children}
    </div>
  );
}

function Lista({ itens }: { itens: React.ReactNode[] }) {
  return (
    <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 12 }}>
      {itens.map((t, i) => (
        <li key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <span style={{ flex: "none", width: 32, height: 32, borderRadius: "50%", background: "#E4002B", color: "#fff", fontSize: 16, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</span>
          <span style={{ ...C.texto, color: "var(--text-1)", paddingTop: 3 }}>{t}</span>
        </li>
      ))}
    </ol>
  );
}

export default function ImprimirPeloCelular({ empresaId, empresaNome, layout, fonte }: Props) {
  const [aparelho, setAparelho] = useState<Aparelho>("carregando");
  const [modo, setModo]         = useState<MobileMode | null>(null);
  const [etapa, setEtapa]       = useState<Etapa>("inicio");
  const [ocupado, setOcupado]   = useState(false);
  const [aviso, setAviso]       = useState("");
  const [cancelou, setCancelou] = useState(false);
  const [tentouLento, setTentouLento] = useState(false);
  const [nomeImpressora, setNomeImpressora] = useState<string | null>(null);
  const [testeOk, setTesteOk]   = useState<string>("");

  // Detecta o aparelho só no navegador (evita diferença com o servidor).
  useEffect(() => {
    setAparelho(isIphone() ? "iphone" : isCelular() ? "android" : "pc");
    const ler = () => {
      const m = getMobilePrintMode();
      setModo(m);
      setNomeImpressora(getPairedPrinterName());
      return m;
    };
    if (ler()) setEtapa("resumo");
    window.addEventListener(EVENTO_MODO, ler);
    return () => window.removeEventListener(EVENTO_MODO, ler);
  }, []);

  // Cupom de teste igual ao dos pedidos (mesmo layout e tamanho de letra).
  const bytesTeste = () => buildReceipt(buildTestPedido(empresaId), empresaNome, layout, fonte);

  function ir(e: Etapa) {
    setAviso("");
    setCancelou(false);
    setEtapa(e);
    if (typeof window !== "undefined") {
      document.getElementById("imprimir-celular")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  // ── Bluetooth direto ──
  async function procurar() {
    setAviso("");
    setCancelou(false);
    if (!isBtSupported()) {
      setEtapa("rawbtIntro");
      setAviso("Este celular não consegue procurar a impressora sozinho. Sem problema!");
      return;
    }
    setOcupado(true);
    try {
      setModoLento(false);
      setTentouLento(false);
      const nome = await pairPrinter();
      setNomeImpressora(nome);
      const r = await imprimirNoCelular(bytesTeste(), { gesto: true, modo: "bluetooth" });
      if (!r.ok) throw new Error(r.mensagem);
      setEtapa("conferirBt");
    } catch (e) {
      const nomeErro = e instanceof DOMException ? e.name : "";
      const msg = e instanceof Error ? e.message.toLowerCase() : "";
      if (nomeErro === "NotFoundError" && msg.includes("cancel")) {
        // Fechou a lista (às vezes porque a impressora nem apareceu).
        setCancelou(true);
      } else {
        unpairPrinter();
        setEtapa("rawbtIntro");
        setAviso("Não deu para conectar direto. Vamos pelo outro jeito, que funciona com qualquer impressora.");
      }
    } finally {
      setOcupado(false);
    }
  }

  async function naoSaiuBt() {
    if (!tentouLento) {
      // Muita impressora só aceita receber bem devagar — tenta uma vez assim.
      setTentouLento(true);
      setModoLento(true);
      setOcupado(true);
      const r = await imprimirNoCelular(bytesTeste(), { gesto: true, modo: "bluetooth" });
      setOcupado(false);
      setAviso(r.ok ? "Mandamos de novo, mais devagar. E agora?" : "");
      if (r.ok) return;
    }
    setModoLento(false);
    unpairPrinter();
    ir("rawbtIntro");
  }

  function confirmar(m: MobileMode) {
    setMobilePrintMode(m);
    setModo(m);
    ir("pronto");
  }

  // ── RawBT ──
  function imprimirTesteRawbt() {
    // Sem await antes: o app precisa abrir "dentro" do toque.
    void imprimirNoCelular(bytesTeste(), { gesto: true, modo: "rawbt" });
    ir("conferirRawbt");
  }

  // ── Resumo (já configurado) ──
  async function testeResumo() {
    if (!modo) return;
    setTesteOk("");
    setOcupado(true);
    const r = await imprimirNoCelular(bytesTeste(), { gesto: true, modo });
    setOcupado(false);
    setTesteOk(r.ok ? "Teste enviado! Confira se saiu o papel." : r.mensagem);
  }

  function desligar() {
    clearMobilePrintMode();
    setModo(null);
    setTesteOk("");
    ir("inicio");
  }

  // ─────────────────────────────────────────────────────────────────────────

  if (aparelho === "carregando") return null;

  if (aparelho === "pc") {
    return (
      <div className="rounded-2xl p-4 flex items-center gap-3" style={{ background: "var(--bg-2)", border: "1px solid var(--border-1)" }}>
        <Smartphone size={18} style={{ color: "#E4002B", flexShrink: 0 }} />
        <p className="text-sm" style={{ color: "var(--text-2)" }}>
          <strong style={{ color: "var(--text-1)" }}>Vai imprimir pelo celular?</strong> Abra esta tela no celular.
        </p>
      </div>
    );
  }

  const caixa: React.CSSProperties = {
    background: "var(--bg-2)", border: "1px solid var(--border-1)", borderRadius: 22,
    padding: 20, display: "flex", flexDirection: "column", gap: 18,
  };

  if (aparelho === "iphone") {
    return (
      <div id="imprimir-celular" style={caixa}>
        <Icone><Smartphone size={34} /></Icone>
        <p style={{ ...C.titulo, textAlign: "center" }}>Imprimir pelo celular</p>
        <p style={{ ...C.texto, textAlign: "center" }}>
          Que pena! O iPhone não deixa o Vellox usar a impressora Bluetooth.
        </p>
        <p style={{ ...C.texto, textAlign: "center" }}>
          Para imprimir os pedidos, use um <strong>celular Android</strong> ou o <strong>computador</strong>.
        </p>
      </div>
    );
  }

  const voltar = (para: Etapa) => (
    <button type="button" onClick={() => ir(para)}
      style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", color: "var(--text-3)", fontSize: 16, fontWeight: 700, padding: "4px 0", cursor: "pointer" }}>
      <ChevronLeft size={18} /> Voltar
    </button>
  );

  const avisoBox = aviso && (
    <div style={{ background: "rgba(228,0,43,0.08)", border: "1px solid rgba(228,0,43,0.25)", borderRadius: 14, padding: "12px 14px" }}>
      <p style={{ ...C.texto, color: "var(--text-1)", fontWeight: 700 }}>{aviso}</p>
    </div>
  );

  let conteudo: React.ReactNode = null;

  switch (etapa) {
    case "inicio":
      conteudo = <>
        <Icone><Smartphone size={34} /></Icone>
        <p style={{ ...C.titulo, textAlign: "center" }}>Imprimir pelo celular</p>
        <p style={{ ...C.texto, textAlign: "center" }}>
          Os pedidos saem na sua impressora usando este celular. Leva só alguns minutos.
        </p>
        <BotaoGrande onClick={() => ir("passo1")}><Printer size={22} /> Começar</BotaoGrande>
      </>;
      break;

    case "passo1":
      conteudo = <>
        <p style={C.passo}>PASSO 1 DE 3</p>
        <Icone><Power size={34} /></Icone>
        <p style={{ ...C.titulo, textAlign: "center" }}>Ligue a impressora e o Bluetooth do celular</p>
        <Lista itens={[
          "Ligue a impressora e coloque papel.",
          <>Puxe a barra do topo da tela do celular e toque no ícone do <strong>Bluetooth</strong> para ligar.</>,
          "Deixe o celular perto da impressora.",
        ]} />
        <BotaoGrande onClick={() => ir("passo2")}><CheckCircle size={22} /> Pronto, liguei</BotaoGrande>
      </>;
      break;

    case "passo2":
      conteudo = <>
        {voltar("passo1")}
        <p style={C.passo}>PASSO 2 DE 3</p>
        <Icone><Bluetooth size={34} /></Icone>
        <p style={{ ...C.titulo, textAlign: "center" }}>Procure sua impressora</p>
        <p style={{ ...C.texto, textAlign: "center" }}>
          Toque no botão. Vai aparecer uma lista: toque no nome da sua impressora e depois em <strong>Parear</strong> ou <strong>Conectar</strong>.
        </p>
        {cancelou && (
          <div style={{ background: "var(--overlay-sm)", borderRadius: 14, padding: "12px 14px" }}>
            <p style={{ ...C.texto, color: "var(--text-1)", fontWeight: 700 }}>A lista fechou sem escolher. Quer procurar de novo?</p>
          </div>
        )}
        <BotaoGrande onClick={procurar} disabled={ocupado}>
          {ocupado ? <Loader2 size={22} className="animate-spin" /> : <Search size={22} />}
          {ocupado ? "Conectando e imprimindo teste..." : cancelou ? "Procurar de novo" : "Procurar minha impressora"}
        </BotaoGrande>
        <BotaoGrande cor="neutro" onClick={() => ir("rawbtIntro")}>Minha impressora não aparece</BotaoGrande>
      </>;
      break;

    case "conferirBt":
      conteudo = <>
        <p style={C.passo}>PASSO 3 DE 3</p>
        <Icone><Printer size={34} /></Icone>
        <p style={{ ...C.titulo, textAlign: "center" }}>Saiu o papel?</p>
        <p style={{ ...C.texto, textAlign: "center" }}>
          Mandamos um cupom de teste{nomeImpressora ? <> para <strong>{nomeImpressora}</strong></> : null}.
        </p>
        {avisoBox}
        <BotaoGrande cor="verde" onClick={() => confirmar("bluetooth")} disabled={ocupado}><CheckCircle size={22} /> Sim, saiu!</BotaoGrande>
        <BotaoGrande cor="neutro" onClick={naoSaiuBt} disabled={ocupado}>
          {ocupado ? <Loader2 size={22} className="animate-spin" /> : <XCircle size={22} />}
          {ocupado ? "Tentando de novo..." : "Não saiu (ou saiu errado)"}
        </BotaoGrande>
      </>;
      break;

    case "rawbtIntro":
      conteudo = <>
        {avisoBox}
        <Icone><Download size={34} /></Icone>
        <p style={{ ...C.titulo, textAlign: "center" }}>Vamos usar um app gratuito</p>
        <p style={{ ...C.texto, textAlign: "center" }}>
          O app <strong>RawBT</strong> funciona com qualquer impressora Bluetooth. São 3 passos.
        </p>
        <BotaoGrande onClick={() => ir("rawbt1")}>Continuar</BotaoGrande>
        <BotaoGrande cor="neutro" onClick={() => ir("passo2")}>Procurar a impressora de novo</BotaoGrande>
      </>;
      break;

    case "rawbt1":
      conteudo = <>
        {voltar("rawbtIntro")}
        <p style={C.passo}>APP RAWBT · PASSO 1 DE 3</p>
        <Icone><Download size={34} /></Icone>
        <p style={{ ...C.titulo, textAlign: "center" }}>Baixe o app RawBT</p>
        <p style={{ ...C.texto, textAlign: "center" }}>
          Toque no botão. Na loja, toque em <strong>Instalar</strong>. Depois volte para o Vellox.
        </p>
        <BotaoGrande href={RAWBT_PLAY_URL}><Download size={22} /> 1. Baixar o app RawBT</BotaoGrande>
        <BotaoGrande cor="neutro" onClick={() => ir("rawbt2")}><CheckCircle size={22} /> Já instalei</BotaoGrande>
      </>;
      break;

    case "rawbt2":
      conteudo = <>
        {voltar("rawbt1")}
        <p style={C.passo}>APP RAWBT · PASSO 2 DE 3</p>
        <Icone><Settings size={34} /></Icone>
        <p style={{ ...C.titulo, textAlign: "center" }}>2. Escolha sua impressora no app</p>
        <Lista itens={[
          <>Abra o app <strong>RawBT</strong> (o ícone fica junto com os outros apps).</>,
          <>Se ele pedir permissão, toque em <strong>Permitir</strong>.</>,
          <>Toque na <strong>engrenagem</strong> (Configurações).</>,
          <>Em <strong>Conexão</strong>, escolha <strong>Bluetooth</strong>.</>,
          <>Toque em <strong>Escolher dispositivo</strong> e toque no nome da sua impressora.</>,
          "Volte para o Vellox.",
        ]} />
        <div style={{ background: "var(--overlay-sm)", borderRadius: 14, padding: "12px 14px" }}>
          <p style={{ ...C.texto, fontSize: 16 }}>
            <strong style={{ color: "var(--text-1)" }}>A impressora não aparece na lista?</strong> Abra as
            configurações do celular, toque em <strong>Bluetooth</strong> e toque no nome da impressora.
            Se pedir senha, digite <strong>0000</strong> ou <strong>1234</strong>. Depois volte ao RawBT.
          </p>
        </div>
        <BotaoGrande onClick={() => ir("rawbt3")}><CheckCircle size={22} /> Já escolhi</BotaoGrande>
      </>;
      break;

    case "rawbt3":
      conteudo = <>
        {voltar("rawbt2")}
        <p style={C.passo}>APP RAWBT · PASSO 3 DE 3</p>
        <Icone><Printer size={34} /></Icone>
        <p style={{ ...C.titulo, textAlign: "center" }}>3. Imprima um teste</p>
        <p style={{ ...C.texto, textAlign: "center" }}>
          O app RawBT vai abrir e imprimir. Se o celular perguntar com qual app abrir, escolha <strong>RawBT</strong> e toque em <strong>Sempre</strong>. Depois volte para o Vellox.
        </p>
        <BotaoGrande onClick={imprimirTesteRawbt}><Printer size={22} /> 3. Imprimir teste</BotaoGrande>
      </>;
      break;

    case "conferirRawbt":
      conteudo = <>
        <Icone><Printer size={34} /></Icone>
        <p style={{ ...C.titulo, textAlign: "center" }}>Saiu o papel?</p>
        <BotaoGrande cor="verde" onClick={() => confirmar("rawbt")}><CheckCircle size={22} /> Sim, saiu!</BotaoGrande>
        <BotaoGrande cor="neutro" onClick={() => ir("rawbtAjuda")}><XCircle size={22} /> Não saiu</BotaoGrande>
        <BotaoGrande cor="neutro" onClick={imprimirTesteRawbt}><RefreshCw size={22} /> Mandar o teste de novo</BotaoGrande>
      </>;
      break;

    case "rawbtAjuda":
      conteudo = <>
        <Icone><XCircle size={34} /></Icone>
        <p style={{ ...C.titulo, textAlign: "center" }}>Vamos conferir</p>
        <Lista itens={[
          "A impressora está ligada e com papel?",
          "O app RawBT está instalado?",
          "No RawBT, a sua impressora está escolhida?",
          "O celular está perto da impressora?",
        ]} />
        <BotaoGrande onClick={() => ir("rawbt3")}><RefreshCw size={22} /> Tentar de novo</BotaoGrande>
        <BotaoGrande cor="neutro" onClick={() => ir("rawbt2")}>Ver como escolher a impressora</BotaoGrande>
        <BotaoGrande cor="neutro" onClick={() => ir("rawbt1")}>Baixar o app RawBT</BotaoGrande>
      </>;
      break;

    case "pronto":
      conteudo = <>
        <Icone cor="#16a34a"><CheckCircle size={38} /></Icone>
        <p style={{ ...C.titulo, textAlign: "center" }}>Pronto!</p>
        <p style={{ ...C.texto, textAlign: "center", color: "var(--text-1)" }}>
          Os pedidos vão sair nesta impressora.
        </p>
        <Lista itens={[
          <>Deixe esta tela do <strong>Vellox aberta</strong>. A tela do celular fica acesa sozinha enquanto o Vellox estiver aberto.</>,
          <>Deixe o celular <strong>carregando</strong>.</>,
          <>Se aparecer <strong>&quot;Toque para imprimir&quot;</strong>, é só tocar.</>,
        ]} />
        <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "center", color: "var(--text-3)" }}>
          <BatteryCharging size={20} /> <span style={{ fontSize: 15 }}>Celular na tomada = pedidos sem falhar</span>
        </div>
        <BotaoGrande cor="verde" onClick={() => ir("resumo")}>Entendi</BotaoGrande>
      </>;
      break;

    case "resumo":
      conteudo = <>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", flex: "none", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(22,163,74,0.12)", color: "#16a34a" }}>
            <CheckCircle size={30} />
          </div>
          <div>
            <p style={{ ...C.titulo, fontSize: 20 }}>Impressão pelo celular ligada</p>
            <p style={{ ...C.texto, fontSize: 16 }}>
              {modo === "rawbt" ? "Pelo app RawBT" : `Direto pelo Bluetooth${nomeImpressora ? ` — ${nomeImpressora}` : ""}`}
            </p>
          </div>
        </div>
        <p style={{ ...C.texto, fontSize: 16 }}>
          Deixe o Vellox aberto e o celular carregando. Se aparecer &quot;Toque para imprimir&quot;, é só tocar.
        </p>
        {testeOk && (
          <div style={{ background: "var(--overlay-sm)", borderRadius: 14, padding: "12px 14px" }}>
            <p style={{ ...C.texto, color: "var(--text-1)", fontWeight: 700 }}>{testeOk}</p>
          </div>
        )}
        <BotaoGrande onClick={testeResumo} disabled={ocupado}>
          {ocupado ? <Loader2 size={22} className="animate-spin" /> : <Printer size={22} />}
          {ocupado ? "Imprimindo..." : "Imprimir teste"}
        </BotaoGrande>
        <BotaoGrande cor="neutro" onClick={() => ir("passo1")}><RefreshCw size={22} /> Trocar impressora</BotaoGrande>
        <BotaoGrande cor="neutro" onClick={desligar}><Power size={22} /> Desligar impressão pelo celular</BotaoGrande>
      </>;
      break;
  }

  return (
    <div id="imprimir-celular" style={{ ...caixa, scrollMarginTop: 70 }}>
      {etapa !== "resumo" && etapa !== "inicio" && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-3)" }}>
          <Smartphone size={18} /> <span style={{ fontSize: 15, fontWeight: 700 }}>Imprimir pelo celular</span>
        </div>
      )}
      {conteudo}
    </div>
  );
}
