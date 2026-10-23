"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, X, Printer, Loader2 } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { autoPrint } from "@/lib/printService";
import { buildReceipt } from "@/lib/escpos";
import {
  getMobilePrintMode, imprimirNoCelular, EVENTO_MODO, EVENTO_TOQUE,
  type MobileMode, type PedidoToque,
} from "@/lib/mobilePrint";
import type { LayoutOpt, FonteOpt } from "@/lib/printService";
import { checkAgentOnlineViaDb } from "@/lib/printAgentOnline";
import type { Pedido } from "@/types";

const AGENT_URL = "http://localhost:7532";
const ATRASO_MS = 5 * 60 * 1000; // lembrete de impressão atrasada: 5 minutos

interface Props {
  empresaId: string;
  empresaNome: string;
  empresaCnpj?: string | null;
  layout?: LayoutOpt;
  fonte?: FonteOpt;
}

interface PedidoAtrasado {
  id: string;
  cliente_nome: string;
  created_at: string;
}

export default function PrintListener({ empresaId, empresaNome, empresaCnpj, layout, fonte }: Props) {
  // Evita dupla impressão entre abas usando Set compartilhado via localStorage
  const printedSet = useRef<Set<string>>(new Set());
  // Evita repetir o aviso pra cada pedido novo enquanto o agente continuar offline
  const jaAvisou = useRef(false);
  const [avisoAgenteOffline, setAvisoAgenteOffline] = useState(false);
  const [pedidosAtrasados, setPedidosAtrasados] = useState<PedidoAtrasado[]>([]);
  const [avisoAtrasadosFechado, setAvisoAtrasadosFechado] = useState(false);
  // IDs de pedidos atrasados já exibidos ao usuário — evita reabrir o aviso
  // (já fechado por ele) repetidamente pros mesmos pedidos a cada checagem.
  const atrasadosConhecidos = useRef<Set<string>>(new Set());

  // ── Impressão pelo celular ───────────────────────────────────────────────
  const [modoCelular, setModoCelular] = useState<MobileMode | null>(null);
  // Pedidos que o navegador não deixou imprimir sozinho — esperam um toque.
  const [paraTocar, setParaTocar] = useState<PedidoToque[]>([]);
  const [imprimindoToque, setImprimindoToque] = useState(false);
  const [erroToque, setErroToque] = useState("");

  function adicionarToque(item: PedidoToque) {
    setParaTocar(prev => prev.some(p => p.id === item.id)
      ? prev.map(p => p.id === item.id ? item : p)
      : [...prev, item]);
    if (item.erro) setErroToque(item.erro);
  }

  useEffect(() => {
    const ler = () => setModoCelular(getMobilePrintMode());
    ler();
    const onToque = (e: Event) => adicionarToque((e as CustomEvent<PedidoToque>).detail);
    window.addEventListener(EVENTO_MODO, ler);
    window.addEventListener("storage", ler);
    window.addEventListener(EVENTO_TOQUE, onToque);
    return () => {
      window.removeEventListener(EVENTO_MODO, ler);
      window.removeEventListener("storage", ler);
      window.removeEventListener(EVENTO_TOQUE, onToque);
    };
  }, []);

  // Mantém a tela acordada enquanto o painel está aberto no celular com
  // impressão pelo celular ligada (tela apagada = navegador para de receber
  // pedidos). Sem suporte a Wake Lock, segue em silêncio.
  useEffect(() => {
    if (!modoCelular) return;
    type Sentinel = { release(): Promise<void> };
    const wl = (navigator as unknown as { wakeLock?: { request(t: "screen"): Promise<Sentinel> } }).wakeLock;
    if (!wl) return;
    let sentinela: Sentinel | null = null;
    let ativo = true;
    const pedir = async () => {
      if (!ativo || document.visibilityState !== "visible") return;
      try {
        const s = await wl.request("screen");
        if (!ativo) { s.release().catch(() => {}); return; }
        sentinela = s;
      } catch { /* bateria fraca / sem permissão — ignora */ }
    };
    // O sistema solta o wake lock quando a aba sai da frente; pede de novo ao voltar.
    const onVis = () => { if (document.visibilityState === "visible") pedir(); };
    pedir();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      ativo = false;
      document.removeEventListener("visibilitychange", onVis);
      sentinela?.release().catch(() => {});
    };
  }, [modoCelular]);

  // Chamado direto do toque — nada de await antes de imprimir (RawBT exige).
  function imprimirComToque(item: PedidoToque) {
    setImprimindoToque(true);
    setErroToque("");
    imprimirNoCelular(item.bytes, { gesto: true }).then(async r => {
      setImprimindoToque(false);
      if (!r.ok) { setErroToque(r.mensagem); return; }
      setParaTocar(prev => prev.filter(p => p.id !== item.id));
      if (item.marcarImpresso) await marcarImpresso(createClient(), item.id, empresaId);
    });
  }

  useEffect(() => {
    const supabase = createClient();

    async function jaImpresso(id: string): Promise<boolean> {
      try {
        const { data: fresh } = await supabase
          .from("pedidos")
          .select("auto_printed")
          .eq("id", id)
          .maybeSingle();
        return !!fresh?.auto_printed;
      } catch {
        return false;
      }
    }

    async function imprimirPeloCelular(pedido: Pedido) {
      // Se o agente do PC já imprimiu (mark_pedido_printed), não duplica.
      if (await jaImpresso(pedido.id)) return;
      const resultado = await autoPrint(pedido, empresaNome, layout, fonte);
      if (resultado.ok) {
        await marcarImpresso(supabase, pedido.id, empresaId);
        return;
      }
      if (resultado.method === "skip") return;
      // Navegador bloqueou (sem toque) ou a impressora não respondeu:
      // aviso grande, um toque imprime.
      adicionarToque({
        id: pedido.id,
        titulo: `Pedido novo de ${pedido.cliente_nome}`,
        bytes: buildReceipt(pedido, empresaNome, layout, fonte),
        marcarImpresso: true,
      });
    }

    async function handleNewOrder(pedido: Pedido) {
      if (pedido.status !== "em_fila") return;
      if (printedSet.current.has(pedido.id)) return;

      // Padrão: ativo. Só desativa se usuário explicitamente desligou ("0").
      try {
        if (localStorage.getItem("vellox-autoprint-ativo") === "0") return;
      } catch { return; }

      // Verifica se o pedido já foi impresso pelo agente (campo auto_printed)
      if (pedido.auto_printed) return;

      // Marca localmente para não reimprimir nesta sessão
      printedSet.current.add(pedido.id);

      // 0. Este aparelho (celular) imprime pela impressora Bluetooth dele.
      // Não depende do agente do PC — por isso também não mostra o aviso
      // "app de impressão não respondeu".
      if (getMobilePrintMode()) {
        await imprimirPeloCelular(pedido);
        return;
      }

      // 1. Tenta impressão via Print Agent (silenciosa, sem popup)
      const agentOk = await tryPrintViaAgent(pedido);
      if (agentOk) {
        jaAvisou.current = false;
        setAvisoAgenteOffline(false);
        return;
      }

      // 2. Sem HTTP local — mas o servidor.ps1 (heartbeat via banco) pode estar
      // vivo e vai imprimir este pedido sozinho em poucos segundos. Se for o
      // caso, não faz nada aqui (evita imprimir duas vezes).
      if (await checkAgentOnlineViaDb(empresaId)) {
        jaAvisou.current = false;
        setAvisoAgenteOffline(false);
        return;
      }

      // Reconfere o estado mais recente do pedido no banco: o payload do
      // realtime reflete o momento do INSERT (auto_printed sempre false), mas
      // o servidor.ps1 pode ter processado e impresso este mesmo pedido no
      // instante entre o INSERT e agora (heartbeat com até ~5s de atraso não
      // é garantia de que ele não imprimiu "por baixo dos panos"). Se já foi
      // marcado como impresso, não imprime de novo pelo navegador.
      try {
        const { data: fresh } = await supabase
          .from("pedidos")
          .select("auto_printed")
          .eq("id", pedido.id)
          .maybeSingle();
        if (fresh?.auto_printed) {
          jaAvisou.current = false;
          setAvisoAgenteOffline(false);
          return;
        }
      } catch {
        // Se a checagem falhar, segue para o fallback — melhor arriscar uma
        // impressão duplicada rara do que não imprimir o pedido.
      }

      // Nenhum agente/servidor respondeu — avisa quem está no navegador
      if (!jaAvisou.current) {
        jaAvisou.current = true;
        setAvisoAgenteOffline(true);
      }

      // 3. WebUSB se configurado → silencioso; senão window.print()
      const resultado = await autoPrint(pedido, empresaNome, layout, fonte);

      // Marca no banco que este pedido já foi impresso (pelo navegador), para
      // que o servidor.ps1 — cujo heartbeat pode ainda não refletir o ciclo
      // de polling em andamento — pule este pedido no próximo ciclo em vez de
      // imprimi-lo de novo "pouco depois".
      if (resultado.ok) await marcarImpresso(supabase, pedido.id, empresaId);
    }

    const ch = supabase
      .channel(`print-listener-${empresaId}`)
      .on("postgres_changes", {
        event:  "INSERT",
        schema: "public",
        table:  "pedidos",
        filter: `empresa_id=eq.${empresaId}`,
      }, (payload) => {
        handleNewOrder(payload.new as Pedido);
      })
      .on("postgres_changes", {
        event:  "UPDATE",
        schema: "public",
        table:  "pedidos",
        filter: `empresa_id=eq.${empresaId}`,
      }, (payload) => {
        // Assim que um pedido é marcado como impresso (por qualquer via —
        // servidor.ps1, agente, ou o fallback do navegador), some do aviso
        // de "atrasado" na hora, sem esperar a próxima checagem (até 60s).
        const atualizado = payload.new as Pedido;
        if (atualizado.printed_at) {
          setPedidosAtrasados(prev => prev.filter(p => p.id !== atualizado.id));
          // Já saiu por outra via (ex.: agente do PC) — some o "Toque para imprimir".
          setParaTocar(prev => prev.filter(p => p.id !== atualizado.id));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [empresaId, empresaNome, empresaCnpj, layout, fonte]);

  // Lembrete: pedido em fila há mais de 5 minutos sem ser marcado como
  // impresso (nem pelo agente, nem pelo fallback do navegador) — sinal de
  // que algo travou e ninguém percebeu ainda.
  useEffect(() => {
    const supabase = createClient();

    async function checarAtrasados() {
      const limite = new Date(Date.now() - ATRASO_MS).toISOString();
      const { data } = await supabase
        .from("pedidos")
        .select("id, cliente_nome, created_at")
        .eq("empresa_id", empresaId)
        .eq("status", "em_fila")
        .is("printed_at", null)
        .lt("created_at", limite)
        .order("created_at");

      const lista = (data ?? []) as PedidoAtrasado[];
      setPedidosAtrasados(lista);
      // Só reabre o aviso (se o usuário já fechou) quando surge um pedido
      // atrasado novo — não para os mesmos pedidos de antes a cada checagem.
      const temNovo = lista.some(p => !atrasadosConhecidos.current.has(p.id));
      lista.forEach(p => atrasadosConhecidos.current.add(p.id));
      if (temNovo) setAvisoAtrasadosFechado(false);
    }

    checarAtrasados();
    const interval = setInterval(checarAtrasados, 60_000);
    return () => clearInterval(interval);
  }, [empresaId]);

  const mostrarOffline    = avisoAgenteOffline;
  const mostrarAtrasados  = pedidosAtrasados.length > 0 && !avisoAtrasadosFechado;
  const toqueAtual = paraTocar[0];
  if (!mostrarOffline && !mostrarAtrasados && !toqueAtual) return null;

  return (
    <>
    {toqueAtual && (
      // Aviso grande do celular: o navegador não deixou imprimir sozinho.
      // O cartão inteiro é o botão — um toque imprime.
      <div style={{ position: "fixed", inset: 0, zIndex: 10001, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
        <div style={{ width: "100%", maxWidth: 420, background: "var(--bg-1)", borderRadius: 24, padding: 20, boxShadow: "0 24px 64px rgba(0,0,0,0.4)", textAlign: "center" }}>
          <button
            onClick={() => imprimirComToque(toqueAtual)}
            disabled={imprimindoToque}
            style={{
              width: "100%", border: "none", borderRadius: 20, cursor: "pointer",
              background: "#E4002B", color: "#fff", padding: "28px 16px",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
              opacity: imprimindoToque ? 0.75 : 1,
            }}>
            {imprimindoToque ? <Loader2 size={48} className="animate-spin" /> : <Printer size={48} />}
            <span style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.25 }}>{toqueAtual.titulo}</span>
            <span style={{ fontSize: 24, fontWeight: 900 }}>
              {imprimindoToque ? "Imprimindo..." : erroToque ? "Toque para tentar de novo" : "Toque para imprimir"}
            </span>
          </button>
          {erroToque && (
            <p style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1)", margin: "14px 0 0", lineHeight: 1.4 }}>
              {erroToque}
            </p>
          )}
          {paraTocar.length > 1 && (
            <p style={{ fontSize: 15, color: "var(--text-3)", margin: "12px 0 0" }}>
              Depois deste, mais {paraTocar.length - 1} {paraTocar.length - 1 === 1 ? "pedido esperando" : "pedidos esperando"}.
            </p>
          )}
          <button
            onClick={() => { setErroToque(""); setParaTocar(prev => prev.slice(1)); }}
            style={{ marginTop: 14, width: "100%", padding: 14, borderRadius: 14, border: "1px solid var(--border-1)", background: "transparent", color: "var(--text-3)", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>
            Agora não
          </button>
        </div>
      </div>
    )}
    {(mostrarOffline || mostrarAtrasados) && (
    // Faixa fina embaixo, centralizada (acima da barra de abas no celular).
    <div className="fixed left-1/2 -translate-x-1/2 bottom-20 md:bottom-4"
      style={{ zIndex: 1000, width: "max-content", maxWidth: "calc(100% - 24px)", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      {mostrarAtrasados && (
        <div
          title={`${pedidosAtrasados[0]?.cliente_nome ?? ""}${pedidosAtrasados.length > 1 ? ` e mais ${pedidosAtrasados.length - 1}` : ""} — confira se a impressora está ligada e com papel.`}
          style={{
            display: "flex", gap: 8, alignItems: "center", maxWidth: "100%",
            background: "#fff", border: "1px solid #fde68a", borderRadius: 999,
            padding: "6px 6px 6px 12px", boxShadow: "0 6px 18px rgba(0,0,0,0.12)",
          }}>
          <AlertTriangle size={14} style={{ color: "#d97706", flexShrink: 0 }} />
          <span style={{ fontSize: 12.5, fontWeight: 700, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {pedidosAtrasados.length === 1 ? "1 pedido" : `${pedidosAtrasados.length} pedidos`} sem imprimir há +5 min
          </span>
          <Link href="/pedidos"
            style={{ fontSize: 12, fontWeight: 800, color: "#d97706", textDecoration: "none", whiteSpace: "nowrap" }}>
            Ver
          </Link>
          <button
            onClick={() => setAvisoAtrasadosFechado(true)}
            aria-label="Fechar aviso"
            style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: 4, display: "flex", flexShrink: 0 }}>
            <X size={13} />
          </button>
        </div>
      )}
      {mostrarOffline && (
        <div
          title="Você está no navegador e o agente de impressão não respondeu — risco do pedido não imprimir sozinho. Abra o app no computador da impressora."
          style={{
            display: "flex", gap: 8, alignItems: "center", maxWidth: "100%",
            background: "#fff", border: "1px solid #fecaca", borderRadius: 999,
            padding: "6px 6px 6px 12px", boxShadow: "0 6px 18px rgba(0,0,0,0.12)",
          }}>
          <AlertTriangle size={14} style={{ color: "#ef4444", flexShrink: 0 }} />
          <span style={{ fontSize: 12.5, fontWeight: 700, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            Pedido novo, mas o app de impressão não respondeu
          </span>
          <Link href="/automacoes/impressao"
            style={{ fontSize: 12, fontWeight: 800, color: "#ef4444", textDecoration: "none", whiteSpace: "nowrap" }}>
            Ver
          </Link>
          <button
            onClick={() => setAvisoAgenteOffline(false)}
            aria-label="Fechar aviso"
            style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: 4, display: "flex", flexShrink: 0 }}>
            <X size={13} />
          </button>
        </div>
      )}
    </div>
    )}
    </>
  );
}

/**
 * Marca no banco que o pedido já foi impresso — o servidor.ps1 (agente do PC)
 * pula pedidos com auto_printed=true, então não sai duas vezes.
 */
async function marcarImpresso(supabase: ReturnType<typeof createClient>, pedidoId: string, empresaId: string) {
  try {
    await supabase.rpc("mark_pedido_printed", {
      p_pedido_id:  pedidoId,
      p_empresa_id: empresaId,
      p_auto:       true,
    });
  } catch {
    // Best-effort: não bloqueia o fluxo de impressão se a marcação falhar.
  }
}

/**
 * Tenta imprimir via Print Agent local (localhost:7532).
 * Retorna true se a impressão foi aceita com sucesso.
 */
async function tryPrintViaAgent(pedido: Pedido): Promise<boolean> {
  try {
    const res = await fetch(`${AGENT_URL}/print`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ pedido }),
      signal:  AbortSignal.timeout(10_000),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.ok === true;
  } catch {
    // Agente não está rodando → fallback para window.print()
    return false;
  }
}
