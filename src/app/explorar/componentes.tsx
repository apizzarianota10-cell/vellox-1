"use client";

// Peças visuais da vitrine /explorar (tema claro premium).

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Heart, Clock, Bike, Star, BadgeCheck, ChevronRight, Compass, ShoppingBag,
  User, RotateCcw, Check, ArrowRight, Zap, UtensilsCrossed,
} from "lucide-react";
import type { Loja, Produto, FlashSale, Tab } from "./tipos";
import {
  C, brl, getInitial, isGratis, textoTaxa, isNew, statusLoja, gradienteLoja,
  textoDistancia, tempoRelativo,
} from "./utils";

// ─── Estilos globais da página ──────────────────────────────────────────────

export function EstilosExplorar() {
  return (
    <style>{`
      .vx-root { --vx-gutter: 16px; }
      @media (min-width: 768px) { .vx-root { --vx-gutter: 32px; } }
      .vx-wrap { width: 100%; max-width: 1240px; margin: 0 auto; padding-left: var(--vx-gutter); padding-right: var(--vx-gutter); }
      .vx-root a:focus-visible, .vx-root button:focus-visible, .vx-root input:focus-visible {
        outline: 2.5px solid ${C.red}; outline-offset: 2px;
      }
      .vx-rail {
        display: flex; gap: 14px; overflow-x: auto; overflow-y: visible;
        margin-left: calc(var(--vx-gutter) * -1); margin-right: calc(var(--vx-gutter) * -1);
        padding: 4px var(--vx-gutter) 18px; scroll-padding: 0 var(--vx-gutter);
        scroll-snap-type: x mandatory; overscroll-behavior-x: contain;
        scrollbar-width: none; -ms-overflow-style: none;
      }
      .vx-rail::-webkit-scrollbar { display: none; }
      @media (min-width: 768px) {
        .vx-rail {
          -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 var(--vx-gutter), #000 calc(100% - var(--vx-gutter)), transparent 100%);
          mask-image: linear-gradient(90deg, transparent 0, #000 var(--vx-gutter), #000 calc(100% - var(--vx-gutter)), transparent 100%);
        }
      }
      .vx-rail > * { scroll-snap-align: start; flex-shrink: 0; }
      .vx-card { transition: transform .28s cubic-bezier(.2,.7,.2,1), box-shadow .28s cubic-bezier(.2,.7,.2,1); }
      .vx-zoom { transition: transform .7s cubic-bezier(.2,.7,.2,1); }
      @media (hover: hover) {
        .vx-card:hover { transform: translateY(-4px); box-shadow: ${C.shadow3}; }
        .vx-card:hover .vx-zoom { transform: scale(1.045); }
        .vx-chip:hover { background: #e6e4df; }
      }
      .vx-press { transition: transform .16s ease, background-color .2s, color .2s, box-shadow .2s; }
      .vx-press:active { transform: scale(.96); }
      .vx-skel { background: linear-gradient(90deg, #ecebe7 0%, #f6f5f2 50%, #ecebe7 100%); background-size: 200% 100%; animation: vxShimmer 1.3s linear infinite; }
      @keyframes vxShimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
      @keyframes vxFadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
      .vx-in { animation: vxFadeUp .5s cubic-bezier(.2,.7,.2,1) both; }
      @keyframes vxPop { 0% { transform: scale(1); } 40% { transform: scale(1.28); } 100% { transform: scale(1); } }
      .vx-pop { animation: vxPop .35s ease; }
      .vx-grid { display: grid; gap: 18px; grid-template-columns: minmax(0, 1fr); }
      @media (min-width: 640px)  { .vx-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
      @media (min-width: 960px)  { .vx-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 22px; } }
      @media (min-width: 1280px) { .vx-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
      .vx-clamp2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
      @media (prefers-reduced-motion: reduce) {
        .vx-root *, .vx-root *::before, .vx-root *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }
      }
    `}</style>
  );
}

// ─── Básicos ────────────────────────────────────────────────────────────────

export function Secao({ titulo, sub, acao, children, id, className }: {
  titulo: React.ReactNode; sub?: React.ReactNode; acao?: { label: string; onClick: () => void };
  children: React.ReactNode; id?: string; className?: string;
}) {
  return (
    <section id={id} className={className} style={{ marginTop: 36 }} aria-label={typeof titulo === "string" ? titulo : undefined}>
      <div className="flex items-end justify-between gap-3" style={{ marginBottom: 14 }}>
        <div className="min-w-0">
          <h2 style={{ fontSize: 21, fontWeight: 800, color: C.ink, letterSpacing: "-0.025em", lineHeight: 1.15, margin: 0 }}>{titulo}</h2>
          {sub && <p style={{ fontSize: 13, color: C.ink3, marginTop: 4 }}>{sub}</p>}
        </div>
        {acao && (
          <button onClick={acao.onClick} className="vx-press flex items-center gap-1 flex-shrink-0"
            style={{ minHeight: 44, padding: "0 4px", fontSize: 13, fontWeight: 700, color: C.ink }}>
            {acao.label} <ChevronRight size={15} />
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

export function Vazio({ titulo, texto, acao, icone }: {
  titulo: string; texto?: string; acao?: { label: string; onClick: () => void }; icone?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center text-center" style={{
      padding: "40px 24px", borderRadius: 28, background: C.surface, border: `1px dashed ${C.line}`,
    }}>
      <div className="flex items-center justify-center" style={{
        width: 64, height: 64, borderRadius: 22, background: C.redSoft, color: C.red, marginBottom: 14,
      }}>
        {icone ?? <Compass size={28} />}
      </div>
      <p style={{ fontSize: 17, fontWeight: 800, color: C.ink, letterSpacing: "-0.01em" }}>{titulo}</p>
      {texto && <p style={{ fontSize: 14, color: C.ink3, marginTop: 6, maxWidth: 340, lineHeight: 1.5 }}>{texto}</p>}
      {acao && (
        <button onClick={acao.onClick} className="vx-press" style={{
          marginTop: 18, minHeight: 44, padding: "0 20px", borderRadius: 999, background: C.ink, color: "#fff",
          fontSize: 14, fontWeight: 700,
        }}>{acao.label}</button>
      )}
    </div>
  );
}

function BotaoFav({ ativo, onClick, nome, size = 44 }: { ativo: boolean; onClick: () => void; nome: string; size?: number }) {
  const [pop, setPop] = useState(false);
  return (
    <button
      type="button"
      aria-label={ativo ? `Remover ${nome} dos favoritos` : `Favoritar ${nome}`}
      aria-pressed={ativo}
      onClick={e => { e.preventDefault(); e.stopPropagation(); onClick(); setPop(true); setTimeout(() => setPop(false), 360); }}
      className="vx-press flex items-center justify-center"
      style={{
        width: size, height: size, borderRadius: 999,
        background: "rgba(255,255,255,0.94)", boxShadow: "0 2px 10px rgba(16,12,8,0.16)",
        backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
      }}
    >
      <Heart size={18} className={pop ? "vx-pop" : undefined} style={{ color: ativo ? C.red : C.ink }} fill={ativo ? C.red : "none"} strokeWidth={2.2} />
    </button>
  );
}

function Logo({ loja, size, radius, borda = 3 }: { loja: Loja; size: number; radius: number; borda?: number }) {
  const [erro, setErro] = useState(false);
  const logo = loja.config?.logo_url;
  const cor = loja.config?.cor_principal ?? C.red;
  return logo && !erro ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={logo} alt="" onError={() => setErro(true)} loading="lazy"
      style={{ width: size, height: size, borderRadius: radius, objectFit: "cover", background: "#fff", border: `${borda}px solid #fff`, boxShadow: "0 4px 14px rgba(16,12,8,0.14)" }} />
  ) : (
    <div aria-hidden className="flex items-center justify-center" style={{
      width: size, height: size, borderRadius: radius, background: cor, color: "#fff",
      fontWeight: 900, fontSize: size * 0.42, border: `${borda}px solid #fff`, boxShadow: "0 4px 14px rgba(16,12,8,0.14)",
    }}>{getInitial(loja.nome)}</div>
  );
}

function Banner({ loja, fechado }: { loja: Loja; fechado: boolean }) {
  const [erro, setErro] = useState(false);
  const banner = loja.config?.banner_url;
  return (
    <div className="absolute inset-0 overflow-hidden">
      {banner && !erro ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={banner} alt="" loading="lazy" onError={() => setErro(true)} className="vx-zoom"
          style={{ width: "100%", height: "100%", objectFit: "cover", filter: fechado ? "grayscale(0.55) brightness(0.96)" : undefined }} />
      ) : (
        <div className="vx-zoom" style={{ position: "absolute", inset: 0, background: gradienteLoja(loja.config?.cor_principal), filter: fechado ? "grayscale(0.45)" : undefined }}>
          <span aria-hidden style={{
            position: "absolute", right: -6, bottom: -38, fontSize: 150, fontWeight: 900, lineHeight: 1,
            color: "rgba(255,255,255,0.16)", fontFamily: C.serif, fontStyle: "italic",
          }}>{getInitial(loja.nome)}</span>
          <span aria-hidden style={{
            position: "absolute", inset: 0,
            backgroundImage: "radial-gradient(rgba(255,255,255,0.14) 1px, transparent 1px)", backgroundSize: "14px 14px",
            maskImage: "linear-gradient(120deg, transparent 30%, #000 100%)", WebkitMaskImage: "linear-gradient(120deg, transparent 30%, #000 100%)",
          }} />
        </div>
      )}
    </div>
  );
}

function Selo({ children, bg, color }: { children: React.ReactNode; bg: string; color: string }) {
  return (
    <span className="inline-flex items-center gap-1" style={{
      padding: "5px 10px", borderRadius: 999, background: bg, color, fontSize: 11, fontWeight: 800,
      letterSpacing: "0.02em", boxShadow: "0 2px 8px rgba(16,12,8,0.12)",
    }}>{children}</span>
  );
}

// ─── Card de loja premium ───────────────────────────────────────────────────

export function StoreCard({ loja, agora, fav, onFav, dist, oferta, onAbrir }: {
  loja: Loja; agora: Date | null; fav: boolean; onFav: (id: string) => void;
  dist?: number | null; oferta?: boolean; onAbrir?: (l: Loja) => void;
}) {
  const st = statusLoja(loja, agora);
  const taxa = loja.config?.taxa_entrega ?? null;
  const tempo = loja.config?.tempo_entrega ?? "30-45 min";
  const BANNER_H = 158;
  return (
    <article className="vx-card relative h-full" style={{
      background: C.surface, borderRadius: 24, boxShadow: C.shadow2, border: `1px solid ${C.lineSoft}`,
    }}>
      <Link href={`/loja/${loja.slug}`} onClick={() => onAbrir?.(loja)} aria-label={`${loja.nome} — ${st.texto}. Abrir cardápio`}
        className="flex flex-col h-full" style={{ color: "inherit", textDecoration: "none", borderRadius: 24 }}>
        <div className="relative" style={{ height: BANNER_H, borderRadius: "24px 24px 0 0", overflow: "hidden" }}>
          <Banner loja={loja} fechado={!st.aberto} />
          <div aria-hidden style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0) 38%, rgba(0,0,0,0) 70%, rgba(0,0,0,0.18) 100%)" }} />
          <div className="absolute flex flex-wrap gap-1.5" style={{ top: 12, left: 12, right: 64 }}>
            {loja.destaque && <Selo bg={C.yellow} color={C.ink}><Star size={10} fill={C.ink} /> Destaque</Selo>}
            {oferta && <Selo bg={C.red} color="#fff"><Zap size={10} fill="#fff" /> Oferta</Selo>}
            {isNew(loja.created_at) && !loja.destaque && <Selo bg="#fff" color={C.ink}>Novo</Selo>}
          </div>
          {dist != null && (
            <span className="absolute" style={{
              right: 12, bottom: 12, padding: "5px 10px", borderRadius: 999, background: "rgba(255,255,255,0.94)",
              fontSize: 11, fontWeight: 800, color: C.ink, boxShadow: "0 2px 8px rgba(16,12,8,0.12)",
            }}>{textoDistancia(dist)}</span>
          )}
        </div>
        <div className="absolute" style={{ top: BANNER_H - 30, left: 16 }}>
          <Logo loja={loja} size={60} radius={18} />
        </div>

        <div className="flex flex-col flex-1" style={{ padding: "38px 18px 18px" }}>
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <h3 className="truncate" style={{ fontSize: 17, fontWeight: 800, color: C.ink, letterSpacing: "-0.02em", margin: 0 }}>{loja.nome}</h3>
              {loja.verificado && <BadgeCheck size={17} aria-label="Loja verificada" style={{ color: "#fff", flexShrink: 0 }} fill={C.red} />}
            </div>
            {loja.avaliacaoTotal > 0 && loja.avaliacaoMedia != null && (
              <span className="flex items-center gap-1 flex-shrink-0" style={{ fontSize: 13, fontWeight: 800, color: C.ink }}
                aria-label={`Nota ${loja.avaliacaoMedia} de 5, ${loja.avaliacaoTotal} avaliações`}>
                <Star size={13} fill={C.yellow} style={{ color: "#e0a800" }} /> {Number(loja.avaliacaoMedia).toFixed(1).replace(".", ",")}
                <span style={{ fontWeight: 500, color: C.ink3 }}>({loja.avaliacaoTotal})</span>
              </span>
            )}
          </div>

          <p className="flex items-center gap-1.5" style={{ marginTop: 6, fontSize: 13, fontWeight: 700, color: st.aberto ? C.green : C.redDark }}>
            <span aria-hidden style={{ width: 7, height: 7, borderRadius: 99, background: st.aberto ? "#16a34a" : C.red, flexShrink: 0, boxShadow: st.aberto ? "0 0 0 3px rgba(22,163,74,0.15)" : "none" }} />
            <span className="truncate">{st.texto}</span>
          </p>

          <div className="flex items-center flex-wrap" style={{ gap: "4px 14px", marginTop: 10, fontSize: 13, color: C.ink2 }}>
            <span className="flex items-center gap-1.5"><Clock size={14} style={{ color: C.ink3 }} /> {tempo}</span>
            <span className="flex items-center gap-1.5" style={isGratis(taxa) ? { color: C.green, fontWeight: 700 } : undefined}>
              <Bike size={15} style={{ color: isGratis(taxa) ? C.green : C.ink3 }} /> {textoTaxa(taxa)}
            </span>
          </div>

          <div className="mt-auto" style={{ paddingTop: 14 }}>
            <div className="flex items-center justify-between gap-2" style={{ paddingTop: 12, borderTop: `1px dashed ${C.line}` }}>
              <span style={{ fontSize: 13, color: C.ink3 }}>
                {loja.precoMin != null
                  ? <>Pratos a partir de <strong style={{ color: C.ink, fontWeight: 800 }}>{brl(loja.precoMin)}</strong></>
                  : "Ver cardápio completo"}
              </span>
              <span aria-hidden className="flex items-center justify-center flex-shrink-0" style={{ width: 30, height: 30, borderRadius: 99, background: C.chip, color: C.ink }}>
                <ArrowRight size={15} />
              </span>
            </div>
          </div>
        </div>
      </Link>
      <div className="absolute" style={{ top: 8, right: 8 }}>
        <BotaoFav ativo={fav} onClick={() => onFav(loja.id)} nome={loja.nome} />
      </div>
    </article>
  );
}

export function StoreCardSkeleton() {
  return (
    <div aria-hidden style={{ background: C.surface, borderRadius: 24, boxShadow: C.shadow1, overflow: "hidden" }}>
      <div className="vx-skel" style={{ height: 158 }} />
      <div style={{ padding: "20px 18px 18px" }}>
        <div className="vx-skel" style={{ height: 16, width: "62%", borderRadius: 8 }} />
        <div className="vx-skel" style={{ height: 12, width: "44%", borderRadius: 8, marginTop: 12 }} />
        <div className="vx-skel" style={{ height: 12, width: "80%", borderRadius: 8, marginTop: 12 }} />
      </div>
    </div>
  );
}

// ─── Categorias com foto ────────────────────────────────────────────────────

export function CategoriasRail({ cats, ativa, onSelect }: {
  cats: { id: string; nome: string; foto: string; qtd: number }[]; ativa: string; onSelect: (nome: string) => void;
}) {
  return (
    <div className="vx-rail" role="list" aria-label="Categorias" style={{ gap: 6, paddingTop: 6, paddingBottom: 8 }}>
      {cats.map(cat => {
        const sel = cat.nome === "Todos" ? !ativa : ativa === cat.nome;
        return (
          <button key={cat.id} role="listitem" onClick={() => onSelect(cat.nome)} aria-pressed={sel}
            aria-label={cat.nome === "Todos" ? "Todas as categorias" : `Categoria ${cat.nome}${cat.qtd ? `, ${cat.qtd} loja${cat.qtd > 1 ? "s" : ""}` : ""}`}
            className="vx-press flex flex-col items-center" style={{ width: 82, gap: 8, padding: "2px 0" }}>
            <span className="relative block" style={{
              width: 72, height: 72, borderRadius: 999, padding: 3,
              background: sel ? `conic-gradient(from 200deg, ${C.yellow}, ${C.red}, ${C.yellow})` : "transparent",
              boxShadow: sel ? "0 6px 18px rgba(228,0,43,0.25)" : C.shadow1,
              transition: "box-shadow .25s",
            }}>
              <span className="block overflow-hidden" style={{ width: "100%", height: "100%", borderRadius: 999, border: sel ? "2.5px solid #fff" : "none", background: C.chip }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={cat.foto} alt="" loading="lazy" width={72} height={72}
                  style={{ width: "100%", height: "100%", objectFit: "cover", transform: sel ? "scale(1.08)" : "scale(1)", transition: "transform .35s" }} />
              </span>
            </span>
            <span style={{ fontSize: 12.5, fontWeight: sel ? 800 : 600, color: sel ? C.ink : C.ink2, whiteSpace: "nowrap" }}>{cat.nome}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Filtros rápidos ────────────────────────────────────────────────────────

export function Chip({ ativo, onClick, children, label }: { ativo: boolean; onClick: () => void; children: React.ReactNode; label?: string }) {
  return (
    <button onClick={onClick} aria-pressed={ativo} aria-label={label} className="vx-press vx-chip flex items-center gap-1.5 flex-shrink-0"
      style={{
        minHeight: 44, padding: "0 16px", borderRadius: 999, fontSize: 13.5, fontWeight: 700, whiteSpace: "nowrap",
        background: ativo ? C.ink : C.surface, color: ativo ? "#fff" : C.ink,
        border: `1px solid ${ativo ? C.ink : C.line}`, boxShadow: ativo ? "0 6px 16px rgba(22,19,15,0.18)" : C.shadow1,
      }}>
      {ativo && <Check size={14} strokeWidth={3} />}
      {children}
    </button>
  );
}

// ─── Carrossel de destaques (banners reais das lojas) ──────────────────────

export interface Slide {
  id: string; titulo: string; sub: string; imagem: string | null; cor: string | null;
  href: string; externo?: boolean; loja?: Loja; selo: string;
}

export function DestaquesCarrossel({ slides, agora }: { slides: Slide[]; agora: Date | null }) {
  const railRef = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(0);
  const pausado = useRef(false);
  const retomar = useRef<ReturnType<typeof setTimeout> | null>(null);

  function passo() {
    const el = railRef.current;
    const first = el?.children[0] as HTMLElement | undefined;
    return first ? first.offsetWidth + 14 : 1;
  }
  function irPara(i: number) {
    const el = railRef.current;
    if (!el) return;
    el.scrollTo({ left: i * passo(), behavior: "smooth" });
  }
  function pausar() {
    pausado.current = true;
    if (retomar.current) clearTimeout(retomar.current);
  }
  function soltar() {
    if (retomar.current) clearTimeout(retomar.current);
    retomar.current = setTimeout(() => { pausado.current = false; }, 6000);
  }

  useEffect(() => {
    if (slides.length < 2) return;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => {
      const el = railRef.current;
      if (!el || pausado.current || document.hidden) return;
      const fim = el.scrollLeft + el.clientWidth >= el.scrollWidth - 8;
      if (fim) el.scrollTo({ left: 0, behavior: "smooth" });
      else el.scrollTo({ left: Math.round(el.scrollLeft / passo() + 1) * passo(), behavior: "smooth" });
    }, 5200);
    return () => { clearInterval(t); if (retomar.current) clearTimeout(retomar.current); };
  }, [slides.length]);

  if (!slides.length) return null;

  return (
    <div onMouseEnter={pausar} onMouseLeave={soltar} onTouchStart={pausar} onTouchEnd={soltar} onFocusCapture={pausar} onBlurCapture={soltar}>
      <div ref={railRef} className="vx-rail" aria-roledescription="carrossel" aria-label="Lojas em destaque"
        onScroll={e => {
          const el = e.currentTarget;
          const fim = el.scrollLeft + el.clientWidth >= el.scrollWidth - 8;
          setIdx(fim ? slides.length - 1 : Math.round(el.scrollLeft / passo()));
        }}
        style={{ gap: 14, paddingBottom: 14 }}>
        {slides.map((s, i) => {
          const st = s.loja ? statusLoja(s.loja, agora) : null;
          const conteudo = (
            <div className="vx-card relative overflow-hidden" style={{ height: "100%", borderRadius: 28, boxShadow: C.shadow2, background: "#1a1512" }}>
              {s.imagem ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.imagem} alt="" className="vx-zoom" loading={i < 2 ? "eager" : "lazy"}
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <div className="vx-zoom" style={{ position: "absolute", inset: 0, background: gradienteLoja(s.cor) }} />
              )}
              <div aria-hidden style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(10,8,6,0) 30%, rgba(10,8,6,0.55) 62%, rgba(10,8,6,0.88) 100%)" }} />
              <span className="absolute" style={{
                top: 14, left: 14, padding: "6px 11px", borderRadius: 999, background: C.yellow, color: C.ink,
                fontSize: 11, fontWeight: 900, letterSpacing: "0.06em", textTransform: "uppercase",
              }}>{s.selo}</span>
              <div className="absolute flex items-end gap-3" style={{ left: 18, right: 18, bottom: 18 }}>
                {s.loja && <Logo loja={s.loja} size={52} radius={16} borda={2} />}
                <div className="min-w-0 flex-1">
                  <p className="truncate" style={{ fontSize: 22, fontWeight: 900, color: "#fff", letterSpacing: "-0.02em", lineHeight: 1.1 }}>{s.titulo}</p>
                  <p className="truncate" style={{ fontSize: 13, color: "rgba(255,255,255,0.86)", marginTop: 4, fontWeight: 600 }}>
                    {st ? <><span style={{ color: st.aberto ? "#6ee7a0" : "#ffb3c0" }}>{st.texto}</span>{s.sub ? ` · ${s.sub}` : ""}</> : s.sub}
                  </p>
                </div>
                <span aria-hidden className="hidden sm:flex items-center gap-1 flex-shrink-0" style={{
                  height: 40, padding: "0 16px", borderRadius: 999, background: "#fff", color: C.ink, fontSize: 13, fontWeight: 800,
                }}>Ver cardápio <ChevronRight size={14} /></span>
              </div>
            </div>
          );
          return (
            <div key={s.id} role="group" aria-roledescription="slide" aria-label={`${i + 1} de ${slides.length}: ${s.titulo}`}
              className="w-[90%] sm:w-[70%] lg:w-[calc(50%-7px)]" style={{ height: "clamp(200px, 52vw, 290px)" }}>
              {s.externo
                ? <a href={s.href} target="_blank" rel="noopener noreferrer" className="block h-full" style={{ borderRadius: 28 }}>{conteudo}</a>
                : <Link href={s.href} className="block h-full" style={{ borderRadius: 28 }} aria-label={`${s.titulo}: abrir cardápio`}>{conteudo}</Link>}
            </div>
          );
        })}
      </div>
      {slides.length > 1 && (
        <div className="flex items-center justify-center" role="tablist" aria-label="Escolher destaque" style={{ gap: 0, marginTop: -4 }}>
          {slides.map((s, i) => (
            <button key={s.id} role="tab" aria-selected={i === idx} aria-label={`Ir para o destaque ${i + 1}`}
              onClick={() => { pausar(); irPara(i); soltar(); }}
              className="flex items-center justify-center" style={{ width: 28, height: 28 }}>
              <span style={{
                display: "block", height: 6, borderRadius: 99, width: i === idx ? 22 : 6,
                background: i === idx ? C.ink : "rgba(22,19,15,0.18)", transition: "width .35s cubic-bezier(.2,.7,.2,1), background .35s",
              }} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Pratos em alta ─────────────────────────────────────────────────────────

export function PratoCard({ p }: { p: Produto }) {
  const [erro, setErro] = useState(false);
  return (
    <Link href={`/loja/${p.empresa.slug}`} className="vx-card block w-[200px] sm:w-[220px]" aria-label={`${p.nome}, ${brl(p.preco)}, em ${p.empresa.nome}`}
      style={{ background: C.surface, borderRadius: 22, boxShadow: C.shadow2, overflow: "hidden", border: `1px solid ${C.lineSoft}` }}>
      <div className="relative overflow-hidden" style={{ height: 170, background: C.chip }}>
        {p.imagem_url && !erro ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.imagem_url} alt="" loading="lazy" onError={() => setErro(true)} className="vx-zoom"
            style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div className="flex items-center justify-center" style={{ width: "100%", height: "100%", color: C.ink3 }}><UtensilsCrossed size={34} /></div>
        )}
        <span className="absolute" style={{
          left: 10, bottom: 10, padding: "6px 11px", borderRadius: 999, background: "#fff", color: C.ink,
          fontSize: 14, fontWeight: 900, boxShadow: "0 4px 12px rgba(16,12,8,0.18)", letterSpacing: "-0.01em",
        }}>{brl(p.preco)}</span>
      </div>
      <div style={{ padding: "12px 14px 14px" }}>
        <p className="vx-clamp2" style={{ fontSize: 14, fontWeight: 800, color: C.ink, lineHeight: 1.25, minHeight: 35, letterSpacing: "-0.01em" }}>{p.nome}</p>
        <p className="truncate" style={{ fontSize: 12.5, color: C.ink3, marginTop: 4 }}>{p.empresa.nome}</p>
      </div>
    </Link>
  );
}

export function PratoCardSkeleton() {
  return (
    <div aria-hidden className="w-[200px] sm:w-[220px]" style={{ background: C.surface, borderRadius: 22, boxShadow: C.shadow1, overflow: "hidden" }}>
      <div className="vx-skel" style={{ height: 170 }} />
      <div style={{ padding: "14px" }}>
        <div className="vx-skel" style={{ height: 13, width: "80%", borderRadius: 7 }} />
        <div className="vx-skel" style={{ height: 11, width: "50%", borderRadius: 7, marginTop: 10 }} />
      </div>
    </div>
  );
}

// ─── Peça de novo ───────────────────────────────────────────────────────────

export function PecaDeNovoCard({ loja, quando, itens, agora }: { loja: Loja; quando: string; itens: number; agora: Date | null }) {
  const st = statusLoja(loja, agora);
  return (
    <Link href={`/loja/${loja.slug}`} className="vx-card flex items-center gap-3 w-[86vw] max-w-[360px]"
      aria-label={`Pedir de novo em ${loja.nome}`}
      style={{ background: C.surface, borderRadius: 22, boxShadow: C.shadow2, padding: 14, border: `1px solid ${C.lineSoft}` }}>
      <Logo loja={loja} size={58} radius={18} borda={0} />
      <div className="min-w-0 flex-1">
        <p className="truncate" style={{ fontSize: 15, fontWeight: 800, color: C.ink, letterSpacing: "-0.01em" }}>{loja.nome}</p>
        <p className="truncate" style={{ fontSize: 12.5, color: C.ink3, marginTop: 2 }}>
          {itens > 0 ? `${itens} ${itens === 1 ? "item" : "itens"} · ` : ""}pedido {tempoRelativo(quando)}
        </p>
        <p className="truncate" style={{ fontSize: 12, fontWeight: 700, color: st.aberto ? C.green : C.redDark, marginTop: 2 }}>{st.texto}</p>
      </div>
      <span className="flex items-center justify-center flex-shrink-0" aria-hidden style={{ width: 44, height: 44, borderRadius: 999, background: C.red, color: "#fff", boxShadow: "0 6px 16px rgba(228,0,43,0.3)" }}>
        <RotateCcw size={18} strokeWidth={2.4} />
      </span>
    </Link>
  );
}

// ─── Abrindo em breve (compacto) ────────────────────────────────────────────

export function AbrindoEmBreveLista({ lojas, agora }: { lojas: Loja[]; agora: Date | null }) {
  return (
    <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
      {lojas.map(l => {
        const st = statusLoja(l, agora);
        return (
          <Link key={l.id} href={`/loja/${l.slug}`} className="vx-card flex items-center gap-3"
            aria-label={`${l.nome}: ${st.texto}`}
            style={{ background: C.surface, borderRadius: 18, padding: "10px 12px", minHeight: 64, border: `1px solid ${C.lineSoft}`, boxShadow: C.shadow1 }}>
            <div style={{ filter: "grayscale(0.4)" }}><Logo loja={l} size={44} radius={14} borda={0} /></div>
            <div className="min-w-0 flex-1">
              <p className="truncate" style={{ fontSize: 14, fontWeight: 800, color: C.ink }}>{l.nome}</p>
              <p className="truncate flex items-center gap-1" style={{ fontSize: 12.5, color: C.ink3, marginTop: 1 }}>
                <Clock size={12} /> {st.texto.replace(/^Fechado · /, "").replace(/^a/, "A")}
              </p>
            </div>
            <ChevronRight size={16} style={{ color: C.ink3, flexShrink: 0 }} />
          </Link>
        );
      })}
    </div>
  );
}

// ─── Ofertas relâmpago (flash sales) ────────────────────────────────────────

function Countdown({ termina_em }: { termina_em: string }) {
  const [txt, setTxt] = useState("");
  useEffect(() => {
    function calc() {
      const diff = new Date(termina_em).getTime() - Date.now();
      if (diff <= 0) { setTxt("Encerrada"); return; }
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1_000);
      setTxt(h > 0 ? `${h}h ${String(m).padStart(2, "0")}min` : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
    }
    calc();
    const t = setInterval(calc, 1000);
    return () => clearInterval(t);
  }, [termina_em]);
  return <span>{txt}</span>;
}

export function OfertaCard({ sale, loja }: { sale: FlashSale; loja: Loja }) {
  const pct = sale.preco_original && sale.preco_original > sale.preco_flash
    ? Math.round((1 - sale.preco_flash / sale.preco_original) * 100) : null;
  return (
    <Link href={`/loja/${loja.slug}`} className="vx-card block w-[220px]"
      style={{ background: C.surface, borderRadius: 22, boxShadow: C.shadow2, overflow: "hidden", border: `1px solid ${C.lineSoft}` }}>
      <div className="relative" style={{ height: 130, background: gradienteLoja(loja.config?.cor_principal) }}>
        {sale.imagem_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={sale.imagem_url} alt="" loading="lazy" className="vx-zoom" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        )}
        {pct && <span className="absolute" style={{ top: 10, left: 10, padding: "5px 10px", borderRadius: 999, background: C.red, color: "#fff", fontSize: 12, fontWeight: 900 }}>-{pct}%</span>}
      </div>
      <div style={{ padding: "12px 14px 14px" }}>
        <p className="truncate" style={{ fontSize: 14, fontWeight: 800, color: C.ink }}>{sale.nome}</p>
        <p className="truncate" style={{ fontSize: 12, color: C.ink3, marginTop: 2 }}>{loja.nome}</p>
        <div className="flex items-baseline gap-2" style={{ marginTop: 8 }}>
          <span style={{ fontSize: 16, fontWeight: 900, color: C.red }}>{brl(sale.preco_flash)}</span>
          {sale.preco_original && <span style={{ fontSize: 12, color: C.ink3, textDecoration: "line-through" }}>{brl(sale.preco_original)}</span>}
        </div>
        <p className="flex items-center gap-1" style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: C.redDark }}>
          <Clock size={12} /> Termina em <Countdown termina_em={sale.termina_em} />
        </p>
      </div>
    </Link>
  );
}

// ─── Linhas de resultado da busca ───────────────────────────────────────────

export function LinhaLoja({ loja, agora }: { loja: Loja; agora: Date | null }) {
  const st = statusLoja(loja, agora);
  return (
    <Link href={`/loja/${loja.slug}`} className="vx-card flex items-center gap-3"
      style={{ background: C.surface, borderRadius: 20, padding: 12, minHeight: 72, border: `1px solid ${C.lineSoft}`, boxShadow: C.shadow1 }}>
      <Logo loja={loja} size={52} radius={16} borda={0} />
      <div className="min-w-0 flex-1">
        <p className="truncate flex items-center gap-1" style={{ fontSize: 15, fontWeight: 800, color: C.ink }}>
          <span className="truncate">{loja.nome}</span>
          {loja.verificado && <BadgeCheck size={15} style={{ color: "#fff", flexShrink: 0 }} fill={C.red} aria-label="Loja verificada" />}
        </p>
        <p className="truncate" style={{ fontSize: 12.5, fontWeight: 700, color: st.aberto ? C.green : C.redDark, marginTop: 2 }}>{st.texto}</p>
        <p className="truncate" style={{ fontSize: 12.5, color: C.ink3, marginTop: 1 }}>
          {loja.config?.tempo_entrega ?? "30-45 min"} · {textoTaxa(loja.config?.taxa_entrega ?? null)}
        </p>
      </div>
      <ChevronRight size={18} style={{ color: C.ink3, flexShrink: 0 }} />
    </Link>
  );
}

export function LinhaPrato({ p }: { p: Produto }) {
  const [erro, setErro] = useState(false);
  return (
    <Link href={`/loja/${p.empresa.slug}`} className="vx-card flex items-center gap-3"
      aria-label={`${p.nome}, ${brl(p.preco)}, em ${p.empresa.nome}`}
      style={{ background: C.surface, borderRadius: 20, padding: 10, minHeight: 72, border: `1px solid ${C.lineSoft}`, boxShadow: C.shadow1 }}>
      <div className="overflow-hidden flex-shrink-0" style={{ width: 64, height: 64, borderRadius: 14, background: C.chip }}>
        {p.imagem_url && !erro
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={p.imagem_url} alt="" loading="lazy" onError={() => setErro(true)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : <div className="flex items-center justify-center" style={{ width: "100%", height: "100%", color: C.ink3 }}><UtensilsCrossed size={22} /></div>}
      </div>
      <div className="min-w-0 flex-1">
        <p className="vx-clamp2" style={{ fontSize: 14.5, fontWeight: 800, color: C.ink, lineHeight: 1.25 }}>{p.nome}</p>
        <p className="truncate" style={{ fontSize: 12.5, color: C.ink3, marginTop: 2 }}>em {p.empresa.nome}</p>
      </div>
      <span className="flex-shrink-0" style={{ fontSize: 14.5, fontWeight: 900, color: C.ink, paddingRight: 4 }}>{brl(p.preco)}</span>
    </Link>
  );
}

export function LinhaSkeleton() {
  return (
    <div aria-hidden className="flex items-center gap-3" style={{ background: C.surface, borderRadius: 20, padding: 10, minHeight: 72, boxShadow: C.shadow1 }}>
      <div className="vx-skel" style={{ width: 64, height: 64, borderRadius: 14 }} />
      <div className="flex-1">
        <div className="vx-skel" style={{ height: 13, width: "70%", borderRadius: 7 }} />
        <div className="vx-skel" style={{ height: 11, width: "40%", borderRadius: 7, marginTop: 10 }} />
      </div>
    </div>
  );
}

// ─── Barra inferior ─────────────────────────────────────────────────────────

export function BottomNav({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  const items = [
    { id: "explorar"  as Tab, label: "Explorar",  icon: Compass,     href: undefined as string | undefined },
    { id: "pedidos"   as Tab, label: "Pedidos",   icon: ShoppingBag, href: undefined },
    { id: "favoritos" as Tab, label: "Favoritos", icon: Heart,       href: undefined },
    { id: "perfil"    as Tab, label: "Perfil",    icon: User,        href: undefined },
  ];
  return (
    <nav aria-label="Navegação principal" className="fixed bottom-0 left-0 right-0 z-50" style={{
      paddingBottom: "max(env(safe-area-inset-bottom), 6px)",
      background: "rgba(255,255,255,0.9)", backdropFilter: "saturate(1.6) blur(20px)", WebkitBackdropFilter: "saturate(1.6) blur(20px)",
      borderTop: `1px solid ${C.line}`, boxShadow: "0 -8px 24px rgba(16,12,8,0.05)",
    }}>
      <div className="flex items-stretch justify-around mx-auto" style={{ maxWidth: 560, padding: "6px 8px 0" }}>
        {items.map(item => {
          const Icon = item.icon;
          const on = active === item.id;
          const inner = (
            <span className="vx-press flex flex-col items-center justify-center gap-1 w-full" style={{ minHeight: 52, color: on ? C.red : C.ink3 }}>
              <span className="flex items-center justify-center" style={{
                width: 52, height: 30, borderRadius: 999, background: on ? C.redSoft : "transparent", transition: "background .25s",
              }}>
                <Icon size={21} strokeWidth={on ? 2.5 : 2} fill={on && item.id === "favoritos" ? C.red : "none"} />
              </span>
              <span style={{ fontSize: 11, fontWeight: on ? 800 : 600, color: on ? C.ink : C.ink3 }}>{item.label}</span>
            </span>
          );
          return item.href ? (
            <Link key={item.id} href={item.href} className="flex-1 flex" aria-label={item.label}>{inner}</Link>
          ) : (
            <button key={item.id} onClick={() => onChange(item.id)} className="flex-1 flex" aria-current={on ? "page" : undefined} aria-label={item.label}>{inner}</button>
          );
        })}
      </div>
    </nav>
  );
}
