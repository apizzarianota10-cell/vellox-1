"use client";

// "Não sei o que comer": sorteia um prato de uma loja aberta (respeitando a
// categoria/filtros/bairro da vitrine), com uma roleta curta. Sem libs; com
// prefers-reduced-motion o resultado aparece direto.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Dices, X, RotateCcw, ArrowRight, UtensilsCrossed } from "lucide-react";
import { C, brl, pratoNaCategoria } from "./utils";

interface PratoSorteio {
  id: string; nome: string; preco: number; aPartirDe: boolean;
  imagem_url: string | null; categoria: string | null;
  empresa: { id: string; nome: string; slug: string };
}

interface Props {
  /** Lojas que passam nos filtros atuais (categoria, bairro, etc.). */
  lojasPermitidas: string[];
  categoria: string;
}

const PASSOS_MS = [55, 55, 60, 65, 75, 85, 100, 120, 145, 175, 215, 265];

function aleatorio<T>(lista: T[]): T { return lista[Math.floor(Math.random() * lista.length)]; }

function preCarregar(url: string | null) {
  if (!url) return;
  const img = new Image();
  img.src = url;
}

export default function SorteioPrato({ lojasPermitidas, categoria }: Props) {
  const [aberto, setAberto] = useState(false);
  const gatilhoRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button ref={gatilhoRef} type="button" onClick={() => setAberto(true)} aria-haspopup="dialog"
        className="vx-press vx-card flex items-center gap-3 w-full text-left"
        style={{
          marginTop: 6, minHeight: 64, padding: "10px 14px 10px 10px", borderRadius: 20,
          background: `linear-gradient(100deg, ${C.ink} 0%, #3a2a20 100%)`, color: "#fff", boxShadow: C.shadow2,
        }}>
        <span aria-hidden className="flex items-center justify-center flex-shrink-0" style={{
          width: 44, height: 44, borderRadius: 14, background: C.yellow, color: C.ink, transform: "rotate(-8deg)",
        }}>
          <Dices size={22} />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block truncate" style={{ fontSize: 15.5, fontWeight: 900, letterSpacing: "-0.01em" }}>Não sei o que comer</span>
          <span className="block truncate" style={{ fontSize: 12.5, color: "rgba(255,255,255,0.72)" }}>
            {categoria ? `Sorteia um prato de ${categoria} pra você` : "Deixa a gente sortear um prato pra você"}
          </span>
        </span>
        <ArrowRight size={18} aria-hidden style={{ flexShrink: 0, color: C.yellow }} />
      </button>

      {aberto && (
        <RoletaModal lojasPermitidas={lojasPermitidas} categoria={categoria}
          onFechar={() => { setAberto(false); setTimeout(() => gatilhoRef.current?.focus(), 0); }} />
      )}
    </>
  );
}

// Cache do apanhado de pratos durante a visita (não refaz a cada sorteio)
let poolCache: { quando: number; pratos: PratoSorteio[] } | null = null;

function RoletaModal({ lojasPermitidas, categoria, onFechar }: Props & { onFechar: () => void }) {
  const [pool, setPool] = useState<PratoSorteio[] | null>(poolCache && Date.now() - poolCache.quando < 120_000 ? poolCache.pratos : null);
  const [falhou, setFalhou] = useState(false);
  const [girando, setGirando] = useState(false);
  const [mostrando, setMostrando] = useState<PratoSorteio | null>(null);
  const [vencedor, setVencedor] = useState<PratoSorteio | null>(null);
  const [aviso, setAviso] = useState("");
  const [tick, setTick] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const ultimoId = useRef<string | null>(null);
  const fecharRef = useRef<HTMLButtonElement>(null);
  const principalRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    fecharRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (!pool) {
      fetch("/api/explorar/sorteio")
        .then(r => r.json())
        .then(d => {
          const pratos = (d.pratos ?? []) as PratoSorteio[];
          poolCache = { quando: Date.now(), pratos };
          setPool(pratos);
        })
        .catch(() => setFalhou(true));
    }
    return () => {
      document.body.style.overflow = prev;
      timers.current.forEach(clearTimeout);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Primeiro sorteio assim que os pratos chegam
  useEffect(() => {
    if (pool && !vencedor && !girando) sortear();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool]);

  function candidatos(): { lista: PratoSorteio[]; aviso: string } {
    if (!pool?.length) return { lista: [], aviso: "" };
    const permitidas = new Set(lojasPermitidas);
    let base = pool.filter(p => permitidas.has(p.empresa.id));
    let msg = "";
    if (categoria) {
      const daCategoria = base.filter(p => pratoNaCategoria(p.nome, p.categoria, categoria));
      if (daCategoria.length) base = daCategoria;
    }
    if (!base.length) {
      base = pool;
      msg = categoria
        ? `Nada de ${categoria} aberto agora — sorteamos entre todas as lojas abertas.`
        : "Nenhuma loja aberta com esses filtros — sorteamos entre todas as abertas.";
    }
    const comFoto = base.filter(p => p.imagem_url);
    return { lista: comFoto.length ? comFoto : base, aviso: msg };
  }

  function sortear() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    const { lista, aviso: msg } = candidatos();
    setAviso(msg);
    if (!lista.length) { setVencedor(null); setMostrando(null); return; }

    // Sorteia a loja primeiro (cardápio grande não domina), depois o prato
    let opcoes = lista.length > 1 ? lista.filter(p => p.id !== ultimoId.current) : lista;
    if (!opcoes.length) opcoes = lista;
    const lojas = [...new Set(opcoes.map(p => p.empresa.id))];
    const loja = aleatorio(lojas);
    const ganhador = aleatorio(opcoes.filter(p => p.empresa.id === loja));
    ultimoId.current = ganhador.id;
    preCarregar(ganhador.imagem_url);

    const reduzir = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduzir || lista.length < 2) {
      setMostrando(ganhador); setVencedor(ganhador); setGirando(false);
      return;
    }

    // Roleta: troca rápido e vai desacelerando até parar no ganhador
    const giro = Array.from({ length: PASSOS_MS.length }, () => aleatorio(lista));
    giro.slice(0, 6).forEach(p => preCarregar(p.imagem_url));
    setVencedor(null);
    setGirando(true);
    let t = 0;
    PASSOS_MS.forEach((ms, i) => {
      t += ms;
      timers.current.push(setTimeout(() => { setMostrando(giro[i]); setTick(k => k + 1); }, t));
    });
    timers.current.push(setTimeout(() => {
      setMostrando(ganhador); setVencedor(ganhador); setGirando(false); setTick(k => k + 1);
      setTimeout(() => principalRef.current?.focus(), 30);
    }, t + 320));
  }

  const vazio = pool !== null && !girando && !vencedor;
  const p = mostrando;

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="sorteio-titulo"
      onKeyDown={e => { if (e.key === "Escape") onFechar(); }}
      onClick={e => { if (e.target === e.currentTarget) onFechar(); }}
      className="fixed inset-0 flex items-end sm:items-center justify-center"
      style={{ zIndex: 80, background: "rgba(22,19,15,0.55)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)", padding: 0 }}>
      <style>{`
        @keyframes vxSlot { from { transform: translateY(-14%); opacity: .35; } to { transform: none; opacity: 1; } }
        @keyframes vxGanhou { 0% { transform: scale(.92); } 55% { transform: scale(1.04); } 100% { transform: scale(1); } }
        @keyframes vxDado { from { transform: rotate(0); } to { transform: rotate(360deg); } }
        .vx-slot { animation: vxSlot .12s ease-out both; }
        .vx-ganhou { animation: vxGanhou .45s cubic-bezier(.2,.7,.2,1) both; }
        .vx-dado { animation: vxDado .6s linear infinite; }
      `}</style>
      <div className="vx-in w-full" style={{
        maxWidth: 440, background: C.bg, borderRadius: "28px 28px 0 0", boxShadow: C.shadow3,
        padding: "16px 16px calc(18px + env(safe-area-inset-bottom, 0px))",
      }}>
        <div className="flex items-center justify-between gap-3">
          <h2 id="sorteio-titulo" className="flex items-center gap-2" style={{ fontSize: 19, fontWeight: 900, color: C.ink, letterSpacing: "-0.02em" }}>
            <Dices size={20} aria-hidden className={girando ? "vx-dado" : undefined} style={{ color: C.red }} />
            {girando ? "Sorteando…" : vencedor ? "Que tal esse?" : "Não sei o que comer"}
          </h2>
          <button ref={fecharRef} type="button" onClick={onFechar} aria-label="Fechar sorteio" className="vx-press flex items-center justify-center flex-shrink-0"
            style={{ width: 44, height: 44, borderRadius: 999, background: C.surface, border: `1px solid ${C.line}` }}>
            <X size={18} />
          </button>
        </div>

        <p className="sr-only" aria-live="polite">
          {vencedor ? `Sorteado: ${vencedor.nome}, na ${vencedor.empresa.nome}${vencedor.preco > 0 ? `, ${vencedor.aPartirDe ? "a partir de " : ""}${brl(vencedor.preco)}` : ""}` : girando ? "Sorteando um prato" : ""}
        </p>

        {/* Cartão da roleta */}
        <div style={{ marginTop: 14, borderRadius: 24, overflow: "hidden", background: C.surface, boxShadow: C.shadow2, border: `1px solid ${C.lineSoft}` }}
          className={vencedor ? "vx-ganhou" : undefined}>
          <div className="relative" style={{ aspectRatio: "4 / 3", background: C.chip, overflow: "hidden" }}>
            {p?.imagem_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={`${p.id}-${tick}`} src={p.imagem_url} alt={vencedor ? p.nome : ""} className={girando ? "vx-slot" : undefined}
                style={{ width: "100%", height: "100%", objectFit: "cover", filter: girando ? "saturate(1.1) blur(1.5px)" : "none" }} />
            ) : (
              <div className="flex items-center justify-center h-full" style={{ color: C.ink3 }}>
                {pool === null && !falhou
                  ? <span className="flex flex-col items-center gap-2" style={{ fontSize: 13, fontWeight: 700 }}><Dices size={34} className="vx-dado" aria-hidden />Embaralhando o cardápio…</span>
                  : <UtensilsCrossed size={42} aria-hidden />}
              </div>
            )}
            {vencedor && (
              <span className="absolute vx-in" style={{ top: 12, left: 12, padding: "5px 11px", borderRadius: 999, background: C.yellow, color: C.ink, fontSize: 12, fontWeight: 900, boxShadow: "0 2px 10px rgba(0,0,0,0.18)" }}>
                🎉 Sorteado!
              </span>
            )}
          </div>
          <div style={{ padding: "14px 16px 16px", minHeight: 92 }}>
            {p ? (
              <div key={`t-${p.id}-${tick}`} className={girando ? "vx-slot" : undefined}>
                <p className="vx-clamp2" style={{ fontSize: 18, fontWeight: 900, color: C.ink, letterSpacing: "-0.02em", lineHeight: 1.2 }}>{p.nome}</p>
                <div className="flex items-center justify-between gap-3" style={{ marginTop: 8 }}>
                  <span className="truncate" style={{ fontSize: 13.5, color: C.ink2, fontWeight: 600 }}>{p.empresa.nome}</span>
                  {p.preco > 0 && (
                    <span className="flex-shrink-0" style={{ fontSize: 16, fontWeight: 900, color: C.red }}>
                      {p.aPartirDe && <span style={{ fontSize: 11, fontWeight: 700, color: C.ink3 }}>a partir de </span>}
                      {brl(p.preco)}
                    </span>
                  )}
                </div>
              </div>
            ) : falhou ? (
              <p style={{ fontSize: 14, color: C.ink2 }}>Não deu pra carregar os pratos agora. Tente de novo em instantes.</p>
            ) : vazio ? (
              <p style={{ fontSize: 14, color: C.ink2 }}>Nenhuma loja aberta no momento 😴 Volte mais tarde!</p>
            ) : (
              <div aria-hidden>
                <div className="vx-skel" style={{ height: 18, width: "70%", borderRadius: 8 }} />
                <div className="vx-skel" style={{ height: 13, width: "45%", borderRadius: 8, marginTop: 12 }} />
              </div>
            )}
          </div>
        </div>

        {aviso && vencedor && <p style={{ marginTop: 10, fontSize: 12.5, color: C.ink3 }}>{aviso}</p>}

        <div className="grid gap-2" style={{ marginTop: 14, gridTemplateColumns: "minmax(0,1fr) minmax(0,1.3fr)" }}>
          <button type="button" onClick={sortear} disabled={girando || !pool?.length}
            className="vx-press flex items-center justify-center gap-2"
            style={{ minHeight: 52, borderRadius: 999, background: C.surface, border: `1px solid ${C.line}`, fontSize: 14, fontWeight: 800, color: C.ink, opacity: girando || !pool?.length ? 0.55 : 1 }}>
            <RotateCcw size={16} aria-hidden /> Sortear de novo
          </button>
          {vencedor ? (
            <Link ref={principalRef} href={`/loja/${vencedor.empresa.slug}?produto=${vencedor.id}`}
              className="vx-press flex items-center justify-center gap-2"
              style={{ minHeight: 52, borderRadius: 999, background: C.red, color: "#fff", fontSize: 15, fontWeight: 900, boxShadow: "0 8px 22px rgba(228,0,43,0.32)", textDecoration: "none" }}>
              Quero esse! <ArrowRight size={17} aria-hidden />
            </Link>
          ) : (
            <span aria-hidden className="flex items-center justify-center" style={{ minHeight: 52, borderRadius: 999, background: C.chip, color: C.ink3, fontSize: 15, fontWeight: 900 }}>
              Quero esse!
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
