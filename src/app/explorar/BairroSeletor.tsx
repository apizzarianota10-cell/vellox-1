"use client";

// "Entrega no meu bairro?" — o cliente escolhe/digita o bairro (autocomplete
// com os bairros cadastrados pelas lojas) e a vitrine passa a mostrar só quem
// entrega ali, com a taxa daquele bairro.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { MapPin, X, ChevronRight, Search, Check } from "lucide-react";
import { C } from "./utils";
import { normalizarBairro } from "@/lib/bairroCliente";

interface Props {
  bairros: string[];
  atual: string | null;
  /** Quantas lojas entregam no bairro atual (para o resumo). */
  qtdLojas?: number;
  onChange: (bairro: string | null) => void;
}

export default function BairroSeletor({ bairros, atual, qtdLojas, onChange }: Props) {
  const [aberto, setAberto] = useState(false);
  const gatilhoRef = useRef<HTMLButtonElement>(null);

  function fechar() {
    setAberto(false);
    setTimeout(() => gatilhoRef.current?.focus(), 0);
  }

  return (
    <>
      <div className="flex items-center gap-2" style={{ marginTop: 10 }}>
        <button ref={gatilhoRef} type="button" onClick={() => setAberto(true)} aria-haspopup="dialog"
          className="vx-press vx-card flex items-center gap-3 flex-1 min-w-0 text-left"
          style={{
            minHeight: 56, padding: "8px 14px 8px 10px", borderRadius: 18, background: C.surface,
            border: `1px solid ${atual ? "rgba(15,122,67,0.25)" : C.line}`, boxShadow: C.shadow1,
          }}>
          <span className="flex items-center justify-center flex-shrink-0" style={{
            width: 38, height: 38, borderRadius: 12, background: atual ? C.greenSoft : C.redSoft, color: atual ? C.green : C.red,
          }}>
            <MapPin size={18} aria-hidden />
          </span>
          <span className="flex-1 min-w-0">
            {atual ? (
              <>
                <span className="block truncate" style={{ fontSize: 14.5, fontWeight: 800, color: C.ink }}>Entregando em {atual}</span>
                <span className="block truncate" style={{ fontSize: 12.5, color: C.ink3 }}>
                  {qtdLojas != null ? `${qtdLojas} loja${qtdLojas !== 1 ? "s" : ""} atende${qtdLojas !== 1 ? "m" : ""} seu bairro · ` : ""}Trocar
                </span>
              </>
            ) : (
              <>
                <span className="block truncate" style={{ fontSize: 14.5, fontWeight: 800, color: C.ink }}>Entrega no meu bairro?</span>
                <span className="block truncate" style={{ fontSize: 12.5, color: C.ink3 }}>Escolha o bairro e veja quem entrega e por quanto</span>
              </>
            )}
          </span>
          <ChevronRight size={18} aria-hidden style={{ color: C.ink3, flexShrink: 0 }} />
        </button>
        {atual && (
          <button type="button" onClick={() => onChange(null)} aria-label={`Parar de filtrar pelo bairro ${atual}`}
            className="vx-press flex items-center justify-center flex-shrink-0"
            style={{ width: 44, height: 44, borderRadius: 999, background: C.chip, color: C.ink }}>
            <X size={17} />
          </button>
        )}
      </div>

      {aberto && (
        <FolhaBairro bairros={bairros} atual={atual} onFechar={fechar}
          onEscolher={b => { onChange(b); fechar(); }} />
      )}
    </>
  );
}

function FolhaBairro({ bairros, atual, onFechar, onEscolher }: {
  bairros: string[]; atual: string | null; onFechar: () => void; onEscolher: (b: string | null) => void;
}) {
  const [texto, setTexto] = useState(atual ?? "");
  const [ativo, setAtivo] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listaId = useId();
  const tituloId = useId();

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const sugestoes = useMemo(() => {
    const q = normalizarBairro(texto);
    if (!q) return bairros.slice(0, 60);
    const comeca: string[] = [], contem: string[] = [];
    for (const b of bairros) {
      const n = normalizarBairro(b);
      if (n.startsWith(q) || n.split(" ").some(p => p.startsWith(q))) comeca.push(b);
      else if (n.includes(q)) contem.push(b);
    }
    return [...comeca, ...contem].slice(0, 30);
  }, [texto, bairros]);

  const digitado = texto.trim();
  const exato = sugestoes.some(b => normalizarBairro(b) === normalizarBairro(digitado));
  // Bairro fora da lista: ainda dá pra usar (aparecem as lojas de taxa fixa)
  const opcoes = digitado && !exato && digitado.length >= 3 ? [...sugestoes, `__livre__${digitado}`] : sugestoes;
  const idxAtivo = Math.min(ativo, Math.max(0, opcoes.length - 1));

  function escolher(op: string) {
    onEscolher(op.startsWith("__livre__") ? op.slice(9) : op);
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") { e.preventDefault(); setAtivo(i => Math.min(i + 1, opcoes.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setAtivo(i => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (opcoes[idxAtivo]) escolher(opcoes[idxAtivo]); }
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby={tituloId}
      onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); onFechar(); } }}
      onClick={e => { if (e.target === e.currentTarget) onFechar(); }}
      className="fixed inset-0 flex items-end sm:items-center justify-center"
      style={{ zIndex: 80, background: "rgba(22,19,15,0.45)", backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)" }}>
      <div className="vx-in w-full flex flex-col" style={{
        maxWidth: 520, maxHeight: "86dvh", background: C.bg, borderRadius: "28px 28px 0 0",
        boxShadow: C.shadow3, paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}>
        <div style={{ padding: "18px 16px 10px" }}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 id={tituloId} style={{ fontSize: 19, fontWeight: 900, color: C.ink, letterSpacing: "-0.02em" }}>Qual é o seu bairro?</h2>
              <p style={{ fontSize: 13, color: C.ink3, marginTop: 2 }}>Mostramos só as lojas que entregam aí — fica salvo neste aparelho.</p>
            </div>
            <button type="button" onClick={onFechar} aria-label="Fechar" className="vx-press flex items-center justify-center flex-shrink-0"
              style={{ width: 44, height: 44, borderRadius: 999, background: C.surface, border: `1px solid ${C.line}` }}>
              <X size={18} />
            </button>
          </div>
          <div className="relative flex items-center" style={{ marginTop: 14, height: 52, borderRadius: 16, background: C.surface, border: `1px solid ${C.line}`, boxShadow: C.shadow1 }}>
            <Search size={18} aria-hidden style={{ position: "absolute", left: 15, color: C.ink3 }} />
            <input
              ref={inputRef}
              role="combobox"
              aria-expanded={opcoes.length > 0}
              aria-controls={listaId}
              aria-autocomplete="list"
              aria-activedescendant={opcoes.length ? `${listaId}-${idxAtivo}` : undefined}
              aria-label="Digite o nome do bairro"
              value={texto}
              onChange={e => { setTexto(e.target.value); setAtivo(0); }}
              onKeyDown={onKey}
              placeholder="Ex.: Centro"
              autoComplete="off"
              enterKeyHint="done"
              className="w-full h-full bg-transparent outline-none"
              style={{ padding: "0 14px 0 44px", fontSize: 16, fontWeight: 600, color: C.ink, borderRadius: 16 }}
            />
          </div>
        </div>

        <ul id={listaId} role="listbox" aria-label="Bairros" className="overflow-y-auto" style={{ padding: "4px 16px 18px", overscrollBehavior: "contain" }}>
          {opcoes.length === 0 && (
            <li style={{ padding: "18px 4px", fontSize: 14, color: C.ink3 }}>Nenhum bairro com esse nome. Continue digitando…</li>
          )}
          {opcoes.map((op, i) => {
            const livre = op.startsWith("__livre__");
            const nome = livre ? op.slice(9) : op;
            const sel = !livre && atual != null && normalizarBairro(atual) === normalizarBairro(nome);
            return (
              <li key={op} id={`${listaId}-${i}`} role="option" aria-selected={i === idxAtivo}
                onMouseEnter={() => setAtivo(i)}
                onClick={() => escolher(op)}
                className="flex items-center gap-3 cursor-pointer"
                style={{
                  minHeight: 48, padding: "10px 12px", borderRadius: 14, marginTop: 2,
                  background: i === idxAtivo ? C.surface : "transparent",
                  boxShadow: i === idxAtivo ? C.shadow1 : "none",
                }}>
                <MapPin size={16} aria-hidden style={{ color: livre ? C.ink3 : C.red, flexShrink: 0 }} />
                <span className="flex-1 min-w-0" style={{ fontSize: 14.5, fontWeight: 700, color: C.ink, overflowWrap: "anywhere" }}>
                  {livre ? <>Usar “{nome}” <span style={{ fontWeight: 500, color: C.ink3 }}>(não está na lista das lojas)</span></> : nome}
                </span>
                {sel && <Check size={17} aria-hidden style={{ color: C.green, flexShrink: 0 }} />}
              </li>
            );
          })}
        </ul>

        {atual && (
          <div style={{ padding: "0 16px 16px" }}>
            <button type="button" onClick={() => onEscolher(null)} className="vx-press w-full"
              style={{ minHeight: 48, borderRadius: 999, background: C.surface, border: `1px solid ${C.line}`, fontSize: 14, fontWeight: 800, color: C.ink }}>
              Ver lojas de todos os bairros
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
