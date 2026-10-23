"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Loader2, Star, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { agruparPorCategoria } from "@/lib/ordemCatalogo";
import type { Produto } from "@/types";

// Escolher a ordem em que categorias e produtos aparecem na loja.
// Salva configuracao_loja.ordem_categorias, produtos.ordem e produtos.destaque
// (⭐ = aparece no carrossel "Mais vendidos" da loja) — schema_v71.

interface Props {
  empresaId: string;
  produtos: Produto[];
  ordemCategorias: string[] | null;
  cor: string;
  onClose: () => void;
  onSalvo: (ordemCategorias: string[], ordemProdutos: Map<string, number>, destaques: Set<string>) => void;
}

function mover<T>(lista: T[], i: number, delta: number): T[] {
  const j = i + delta;
  if (j < 0 || j >= lista.length) return lista;
  const nova = [...lista];
  [nova[i], nova[j]] = [nova[j], nova[i]];
  return nova;
}

export default function OrdenarCatalogoModal({ empresaId, produtos, ordemCategorias, cor, onClose, onSalvo }: Props) {
  const [grupos, setGrupos] = useState<[string, Produto[]][]>(() => agruparPorCategoria(produtos, ordemCategorias));
  const [aberta, setAberta] = useState<string | null>(null);
  const [destaques, setDestaques] = useState<Set<string>>(() => new Set(produtos.filter(p => p.destaque).map(p => p.id)));
  const alternarDestaque = (id: string) => setDestaques(d => { const n = new Set(d); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    setSalvando(true);
    setErro(null);
    const supabase = createClient();
    const cats = grupos.map(([c]) => c);
    const ordemProdutos = new Map<string, number>();
    grupos.forEach(([, itens]) => itens.forEach((p, i) => ordemProdutos.set(p.id, i)));

    const { error: errCfg } = await supabase.from("configuracao_loja")
      .update({ ordem_categorias: cats }).eq("empresa_id", empresaId);
    if (errCfg) {
      setSalvando(false);
      setErro(/ordem_categorias/.test(errCfg.message)
        ? "Para ativar a ordem das categorias, rode supabase/schema_v71.sql no Supabase (SQL Editor)."
        : "Não foi possível salvar: " + errCfg.message);
      return;
    }

    const mudaram = produtos.filter(p => (ordemProdutos.has(p.id) && ordemProdutos.get(p.id) !== p.ordem) || destaques.has(p.id) !== !!p.destaque);
    const resultados = await Promise.all(mudaram.map(p => {
      const patch: { ordem?: number; destaque?: boolean } = {};
      if (ordemProdutos.get(p.id) !== p.ordem) patch.ordem = ordemProdutos.get(p.id)!;
      if (destaques.has(p.id) !== !!p.destaque) patch.destaque = destaques.has(p.id);
      return supabase.from("produtos").update(patch).eq("id", p.id);
    }));
    const falhou = resultados.find(r => r.error);
    setSalvando(false);
    if (falhou?.error) {
      setErro(/destaque/.test(falhou.error.message)
        ? "Para escolher os mais vendidos, rode supabase/schema_v71.sql no Supabase (SQL Editor)."
        : "Algumas posições não salvaram: " + falhou.error.message);
      return;
    }
    onSalvo(cats, ordemProdutos, destaques);
  }

  const btn = (ativo: boolean): React.CSSProperties => ({
    width: 30, height: 30, borderRadius: 8, border: "1px solid var(--border-1)", background: "var(--bg-1)",
    color: ativo ? "var(--text-2)" : "var(--text-5)", cursor: ativo ? "pointer" : "default",
    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
  });

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(15,23,42,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} className="rounded-2xl"
        style={{ background: "var(--bg-1)", border: "1px solid var(--border-1)", width: "100%", maxWidth: 520, maxHeight: "88vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 50px rgba(0,0,0,0.3)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "18px 18px 12px" }}>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "var(--text-1)" }}>Ordem do cardápio</p>
            <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "var(--text-4)" }}>
              Use as setas. A primeira categoria aparece no topo da loja. Toque numa categoria para ordenar os produtos dela e marcar com ⭐ os que aparecem em “Mais vendidos”.
            </p>
          </div>
          <button onClick={onClose} aria-label="Fechar" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-4)", padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ overflowY: "auto", padding: "0 18px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
          {grupos.map(([cat, itens], i) => (
            <div key={cat} className="rounded-xl" style={{ border: "1px solid var(--border-1)", background: "var(--bg-2)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px" }}>
                <span style={{ width: 22, fontSize: 12, fontWeight: 800, color: "var(--text-4)" }}>{i + 1}º</span>
                <button onClick={() => setAberta(aberta === cat ? null : cat)}
                  style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0, minWidth: 0 }}>
                  {aberta === cat ? <ChevronDown size={14} style={{ color: "var(--text-4)" }} /> : <ChevronRight size={14} style={{ color: "var(--text-4)" }} />}
                  <span className="truncate" style={{ fontSize: 14, fontWeight: 800, color: "var(--text-1)" }}>{cat}</span>
                  <span style={{ fontSize: 12, color: "var(--text-4)" }}>({itens.length})</span>
                  {itens.some(p => destaques.has(p.id)) && <Star size={12} style={{ color: "#f59e0b" }} fill="#f59e0b" />}
                </button>
                <button style={btn(i > 0)} disabled={i === 0} aria-label="Subir categoria"
                  onClick={() => setGrupos(g => mover(g, i, -1))}><ArrowUp size={14} /></button>
                <button style={btn(i < grupos.length - 1)} disabled={i === grupos.length - 1} aria-label="Descer categoria"
                  onClick={() => setGrupos(g => mover(g, i, 1))}><ArrowDown size={14} /></button>
              </div>
              {aberta === cat && (
                <div style={{ borderTop: "1px solid var(--border-1)", padding: "6px 10px 10px 40px", display: "flex", flexDirection: "column", gap: 6 }}>
                  {itens.map((p, k) => (
                    <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 20, fontSize: 11, color: "var(--text-5)" }}>{k + 1}</span>
                      <span className="truncate" style={{ flex: 1, fontSize: 13, color: p.ativo ? "var(--text-2)" : "var(--text-5)" }}>
                        {p.nome}{!p.ativo && " (pausado)"}
                      </span>
                      <button onClick={() => alternarDestaque(p.id)} aria-label={destaques.has(p.id) ? "Tirar dos mais vendidos" : "Colocar nos mais vendidos"}
                        title={destaques.has(p.id) ? "Aparece em Mais vendidos" : "Mostrar em Mais vendidos"}
                        style={{ ...btn(true), borderColor: destaques.has(p.id) ? "#f59e0b" : "var(--border-1)", background: destaques.has(p.id) ? "rgba(245,158,11,0.12)" : "var(--bg-1)" }}>
                        <Star size={13} style={{ color: destaques.has(p.id) ? "#f59e0b" : "var(--text-5)" }} fill={destaques.has(p.id) ? "#f59e0b" : "none"} />
                      </button>
                      <button style={btn(k > 0)} disabled={k === 0} aria-label="Subir produto"
                        onClick={() => setGrupos(g => g.map(([c, l], gi) => gi === i ? [c, mover(l, k, -1)] : [c, l]))}><ArrowUp size={13} /></button>
                      <button style={btn(k < itens.length - 1)} disabled={k === itens.length - 1} aria-label="Descer produto"
                        onClick={() => setGrupos(g => g.map(([c, l], gi) => gi === i ? [c, mover(l, k, 1)] : [c, l]))}><ArrowDown size={13} /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {erro && <p style={{ margin: "0 18px 8px", fontSize: 12.5, color: "#ef4444" }}>{erro}</p>}
        <div style={{ display: "flex", gap: 8, padding: "12px 18px 18px", borderTop: "1px solid var(--border-1)" }}>
          <button onClick={onClose} disabled={salvando}
            style={{ flex: 1, padding: "11px", borderRadius: 12, background: "var(--bg-2)", border: "1px solid var(--border-1)", color: "var(--text-2)", fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>
            Cancelar
          </button>
          <button onClick={salvar} disabled={salvando}
            style={{ flex: 2, padding: "11px", borderRadius: 12, background: cor, border: "none", color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            {salvando && <Loader2 size={15} className="animate-spin" />}
            Salvar ordem
          </button>
        </div>
      </div>
    </div>
  );
}
