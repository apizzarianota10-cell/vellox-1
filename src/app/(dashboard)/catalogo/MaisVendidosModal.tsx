"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Trophy, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { parseItemLine } from "@/lib/escpos";

type Periodo = "hoje" | "7d" | "30d" | "tudo";

const PERIODOS: { key: Periodo; label: string }[] = [
  { key: "hoje", label: "Hoje" },
  { key: "7d",   label: "7 dias" },
  { key: "30d",  label: "30 dias" },
  { key: "tudo", label: "Tudo" },
];

// Teto de pedidos lidos por consulta — suficiente pra ranking, sem pesar a tela.
const MAX_PEDIDOS = 5000;
const PAGINA = 1000;

interface Linha { nome: string; qtd: number }

interface Props {
  produtoNome: string;
  empresaId: string;
  onClose: () => void;
}

function inicioPeriodo(p: Periodo): string | null {
  if (p === "tudo") return null;
  const d = new Date();
  if (p === "hoje") d.setHours(0, 0, 0, 0);
  else d.setDate(d.getDate() - (p === "7d" ? 7 : 30));
  return d.toISOString();
}

// "1/2 Calabresa" → "Calabresa" (meio a meio conta pro sabor inteiro)
function limpaSabor(s: string): string {
  return s.replace(/^\d+\s*\/\s*\d+\s+/, "").trim();
}

/**
 * Detalha um item do "Mais vendidos": quais sabores/opções desse produto mais
 * saíram. Lê `descricao_itens` dos pedidos (mesmo texto que o ranking usa) e
 * agrupa no navegador com o mesmo parser da impressão.
 */
export default function MaisVendidosModal({ produtoNome, empresaId, onClose }: Props) {
  const [periodo, setPeriodo] = useState<Periodo>("30d");
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [sabores, setSabores] = useState<Linha[]>([]);
  const [opcoes, setOpcoes] = useState<Linha[]>([]);
  const [total, setTotal] = useState(0);
  const [pedidos, setPedidos] = useState(0);

  useEffect(() => {
    let cancelado = false;
    const supabase = createClient();

    async function carregar() {
      setCarregando(true);
      setErro(null);
      const desde = inicioPeriodo(periodo);
      const rows: { descricao_itens: string | null }[] = [];
      for (let de = 0; de < MAX_PEDIDOS; de += PAGINA) {
        let q = supabase
          .from("pedidos")
          .select("descricao_itens")
          .eq("empresa_id", empresaId)
          .neq("status", "cancelado")
          .ilike("descricao_itens", `%${produtoNome.replace(/[%_]/g, "")}%`)
          .order("created_at", { ascending: false })
          .range(de, de + PAGINA - 1);
        if (desde) q = q.gte("created_at", desde);
        const { data, error } = await q;
        if (cancelado) return;
        if (error) { setErro("Não foi possível carregar os dados."); setCarregando(false); return; }
        rows.push(...(data ?? []));
        if (!data || data.length < PAGINA) break;
      }

      const contaSabor = new Map<string, number>();
      const contaOpcao = new Map<string, number>();
      let soma = 0;
      let nPedidos = 0;
      for (const r of rows) {
        let achou = false;
        for (const linha of (r.descricao_itens ?? "").split("\n")) {
          const item = parseItemLine(linha);
          // Mesmo agrupamento do ranking (get_produtos_mais_vendidos): nome antes do 1º " ("
          if (!item || item.nome.split(" (")[0] !== produtoNome) continue;
          achou = true;
          const qtd = parseInt(item.qtd, 10) || 1;
          soma += qtd;
          for (const s of item.sabores) {
            const k = limpaSabor(s);
            if (k) contaSabor.set(k, (contaSabor.get(k) ?? 0) + qtd);
          }
          const op = item.detalhes.join(" · ").trim();
          if (op) contaOpcao.set(op, (contaOpcao.get(op) ?? 0) + qtd);
        }
        if (achou) nPedidos++;
      }
      const ordena = (m: Map<string, number>) =>
        [...m.entries()].map(([nome, qtd]) => ({ nome, qtd })).sort((a, b) => b.qtd - a.qtd);
      setSabores(ordena(contaSabor));
      setOpcoes(ordena(contaOpcao));
      setTotal(soma);
      setPedidos(nPedidos);
      setCarregando(false);
    }

    carregar();
    return () => { cancelado = true; };
  }, [periodo, produtoNome, empresaId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const maxSabor = useMemo(() => sabores[0]?.qtd ?? 1, [sabores]);
  const maxOpcao = useMemo(() => opcoes[0]?.qtd ?? 1, [opcoes]);

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div
        onClick={e => e.stopPropagation()}
        className="rounded-2xl"
        style={{ background: "var(--bg-1)", border: "1px solid var(--border-1)", width: "100%", maxWidth: 520, maxHeight: "85vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 50px rgba(0,0,0,0.25)" }}>
        <div className="flex items-center gap-2.5" style={{ padding: "16px 16px 12px" }}>
          <div style={{ width: 30, height: 30, borderRadius: 9, background: "var(--bg-2)", border: "1px solid var(--border-1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Trophy size={14} style={{ color: "#E4002B" }} />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p className="truncate" style={{ fontSize: 15, fontWeight: 800, color: "var(--text-1)", margin: 0 }}>{produtoNome}</p>
            <p style={{ fontSize: 11.5, color: "var(--text-4)", margin: 0 }}>O que mais saiu desse produto</p>
          </div>
          <button onClick={onClose} aria-label="Fechar"
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-4)", padding: 6, display: "flex" }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ display: "flex", gap: 6, padding: "0 16px 12px", flexWrap: "wrap" }}>
          {PERIODOS.map(p => (
            <button key={p.key} onClick={() => setPeriodo(p.key)}
              style={{
                padding: "5px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer",
                background: periodo === p.key ? "#E4002B" : "var(--bg-2)",
                color: periodo === p.key ? "#fff" : "var(--text-3)",
                border: `1px solid ${periodo === p.key ? "#E4002B" : "var(--border-1)"}`,
              }}>
              {p.label}
            </button>
          ))}
        </div>

        <div style={{ overflowY: "auto", padding: "0 16px 16px" }}>
          {carregando ? (
            <div className="flex items-center justify-center gap-2" style={{ padding: 32, color: "var(--text-4)", fontSize: 13 }}>
              <Loader2 size={16} className="animate-spin" /> Carregando...
            </div>
          ) : erro ? (
            <p style={{ padding: 24, textAlign: "center", color: "#ef4444", fontSize: 13 }}>{erro}</p>
          ) : total === 0 ? (
            <p style={{ padding: 24, textAlign: "center", color: "var(--text-4)", fontSize: 13 }}>Nenhuma venda nesse período.</p>
          ) : (
            <>
              <div className="flex gap-2" style={{ marginBottom: 14 }}>
                <Resumo valor={total} label="unidades vendidas" />
                <Resumo valor={pedidos} label="pedidos" />
              </div>
              {sabores.length > 0 && <Ranking titulo="Sabores" linhas={sabores} max={maxSabor} />}
              {opcoes.length > 0 && <Ranking titulo={sabores.length > 0 ? "Tamanhos / opções" : "Opções"} linhas={opcoes} max={maxOpcao} />}
              {sabores.length === 0 && opcoes.length === 0 && (
                <p style={{ fontSize: 12.5, color: "var(--text-4)", textAlign: "center", padding: 8 }}>Esse produto não tem sabores ou opções registrados nos pedidos.</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Resumo({ valor, label }: { valor: number; label: string }) {
  return (
    <div className="rounded-xl" style={{ flex: 1, padding: "10px 12px", background: "var(--bg-2)", border: "1px solid var(--border-1)" }}>
      <p style={{ fontSize: 18, fontWeight: 900, color: "#E4002B", margin: 0 }}>{valor}</p>
      <p style={{ fontSize: 11, color: "var(--text-4)", margin: 0 }}>{label}</p>
    </div>
  );
}

function Ranking({ titulo, linhas, max }: { titulo: string; linhas: Linha[]; max: number }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--text-4)", margin: "0 0 8px" }}>{titulo}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {linhas.map((l, i) => (
          <div key={l.nome} style={{ position: "relative", borderRadius: 10, overflow: "hidden", background: "var(--bg-2)", border: "1px solid var(--border-1)" }}>
            <div style={{ position: "absolute", inset: 0, width: `${Math.max(4, (l.qtd / max) * 100)}%`, background: "rgba(228,0,43,0.08)" }} />
            <div className="flex items-center gap-2" style={{ position: "relative", padding: "8px 10px" }}>
              <span style={{ fontSize: 10.5, fontWeight: 800, color: "var(--text-4)", width: 22 }}>#{i + 1}</span>
              <span className="truncate" style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--text-1)" }} title={l.nome}>{l.nome}</span>
              <span style={{ fontSize: 13, fontWeight: 900, color: "#E4002B" }}>{l.qtd}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
