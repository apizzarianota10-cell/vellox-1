"use client";

import {
  useState, useEffect, useRef, useCallback, useMemo,
} from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import "leaflet/dist/leaflet.css";

const MapLeaflet = dynamic(() => import("./MapLeaflet"), { ssr: false, loading: () => (
  <div className="flex items-center justify-center rounded-3xl" style={{ height: 400, margin: "0 16px", background: "#0d1117", border: "1px solid rgba(255,255,255,0.07)" }}>
    <div className="flex flex-col items-center gap-3">
      <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "#FF6A00", borderTopColor: "transparent" }} />
      <p style={{ fontSize: 12, color: "#4b5563" }}>Carregando mapa...</p>
    </div>
  </div>
) });
import {
  Search, MapPin, Heart, ShoppingBag, Compass,
  User, Star, Clock, ChevronRight, X, BadgeCheck,
  Zap, Flame, Sparkles, Package, SlidersHorizontal,
  ArrowLeft, Shield, Headphones, Truck, Share2,
  History, Navigation,
} from "lucide-react";

// ─── TYPES ───────────────────────────────────────────────────────────────────

interface LojaConfig {
  empresa_id: string;
  cor_principal: string | null;
  logo_url: string | null;
  banner_url: string | null;
  aberto: boolean;
  taxa_entrega: number | null;
  tempo_entrega: string | null;
  descricao: string | null;
}

interface Loja {
  id: string; nome: string; slug: string;
  verificado: boolean; lat: number | null; lng: number | null;
  config: LojaConfig | null; destaque: boolean; categoria: string | null;
  created_at: string;
}

interface Produto {
  id: string; nome: string; preco: number;
  imagem_url: string; empresa: { nome: string; slug: string };
}

interface Banner { id: string; titulo: string; subtitulo: string | null; imagem_url: string | null; link_url: string | null; cor_fundo: string; }
interface Categoria { id: string; nome: string; emoji: string; }

interface FlashSale {
  id: string; empresa_id: string; nome: string; descricao: string | null;
  preco_original: number | null; preco_flash: number;
  imagem_url: string | null; termina_em: string;
}

interface ProdutoBusca {
  id: string; nome: string; preco: number;
  imagem_url: string | null;
  empresa: { nome: string; slug: string };
}

interface HeroConfig {
  badge_text: string; hero_titulo: string; hero_destaque: string;
  hero_subtitulo: string; accent_color: string;
}

interface Props { lojas: Loja[]; banners: Banner[]; categorias: Categoria[]; heroConfig?: HeroConfig; }

// ─── CONSTANTS ───────────────────────────────────────────────────────────────

const CATEGORIAS_DEFAULT: Categoria[] = [
  { id: "pizza",      nome: "Pizza",       emoji: "🍕" },
  { id: "hamburguer", nome: "Hambúrguer",  emoji: "🍔" },
  { id: "churrasco",  nome: "Churrasco",   emoji: "🥩" },
  { id: "japones",    nome: "Japonês",     emoji: "🍣" },
  { id: "bebidas",    nome: "Bebidas",     emoji: "🥤" },
  { id: "sobremesas", nome: "Sobremesas",  emoji: "🍰" },
  { id: "mercado",    nome: "Mercados",    emoji: "🛒" },
  { id: "lanches",    nome: "Lanches",     emoji: "🍟" },
  { id: "cafeteria",  nome: "Cafeterias",  emoji: "☕" },
  { id: "fitness",    nome: "Fitness",     emoji: "🥗" },
  { id: "saudavel",   nome: "Saudáveis",   emoji: "🥦" },
];

const CAT_ACCENTS: Record<string, string> = {
  "Pizza": "#ef4444", "Hambúrguer": "#f97316", "Churrasco": "#dc2626",
  "Japonês": "#8b5cf6", "Bebidas": "#06b6d4", "Sobremesas": "#ec4899",
  "Mercados": "#22c55e", "Lanches": "#f59e0b", "Cafeterias": "#a78bfa",
  "Fitness": "#10b981", "Saudáveis": "#84cc16",
};

const HERO_SLIDES = [
  { emoji: "🍕", title: "Pizza artesanal", subtitle: "Massa crocante, recheio generoso", glow: "#FF6A00" },
  { emoji: "🍔", title: "Smash burger", subtitle: "Carne suculenta, molho especial",   glow: "#f59e0b" },
  { emoji: "🍣", title: "Culinária japonesa", subtitle: "Sashimi fresco todo dia",     glow: "#818cf8" },
];

const HIST_KEY     = "vellox-explorar-history";
const FAV_KEY      = "vellox-explorar-favs";
const CAT_HIST_KEY = "vellox-cat-hist";

type SortMode = "relevancia" | "avaliacao" | "tempo" | "taxa";

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function isNew(createdAt: string) {
  return Date.now() - new Date(createdAt).getTime() < 30 * 24 * 60 * 60 * 1000;
}

function formatTaxa(taxa: number | null) {
  if (!taxa || taxa === 0) return "Grátis";
  return `R$ ${taxa.toFixed(2).replace(".", ",")}`;
}

function getInitial(nome: string) { return nome.trim().charAt(0).toUpperCase(); }

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R    = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a    = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

function fakeRating(id: string): number {
  const s = id.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return Math.round((3.8 + (s % 12) / 10) * 10) / 10;
}

function fakeReviews(id: string): number {
  const s = id.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return 50 + (s % 480);
}

function fakePedidosHoje(id: string): number {
  const dateStr = new Date().toDateString();
  const s = [...id, ...dateStr].reduce((a, c) => a + c.charCodeAt(0), 0);
  return 8 + (s % 118);
}

function precoRange(taxa: number | null): "$" | "$$" | "$$$" {
  if (!taxa || taxa <= 5) return "$";
  if (taxa <= 15) return "$$";
  return "$$$";
}

// ─── ANIMATED NUMBER ─────────────────────────────────────────────────────────

function AnimatedNumber({ to, duration = 1200 }: { to: number; duration?: number }) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const tick = (now: number) => {
      const pct = Math.min((now - start) / duration, 1);
      setVal(Math.round(pct * to));
      if (pct < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [to, duration]);
  return <>{val}</>;
}

// ─── LIVE STATS BAR ──────────────────────────────────────────────────────────

function LiveStats({ lojas }: { lojas: Loja[] }) {
  const abertas   = lojas.filter(l => l.config?.aberto !== false).length;
  const fechadas  = lojas.length - abertas;
  return (
    <div
      className="flex items-center justify-center gap-4 overflow-x-auto"
      style={{
        background: "linear-gradient(90deg, rgba(255,106,0,0.08) 0%, rgba(255,106,0,0.04) 100%)",
        border: "1px solid rgba(255,106,0,0.12)",
        borderRadius: 14, padding: "10px 20px",
        margin: "0 16px",
      }}
    >
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="animate-pulse w-2 h-2 rounded-full" style={{ background: "#22c55e", display: "inline-block" }} />
        <span style={{ fontSize: 13, color: "#9ca3af" }}>
          <span className="font-black" style={{ color: "#22c55e", fontSize: 15 }}>
            <AnimatedNumber to={abertas} />
          </span>{" "}
          abertas agora
        </span>
      </div>
      <div style={{ width: 1, height: 18, background: "rgba(255,255,255,0.08)" }} />
      <div className="flex items-center gap-2 flex-shrink-0">
        <Zap size={13} style={{ color: "#FF6A00" }} />
        <span style={{ fontSize: 13, color: "#9ca3af" }}>
          <span className="font-black" style={{ color: "#FF6A00", fontSize: 15 }}>
            <AnimatedNumber to={lojas.length} />
          </span>{" "}
          lojas no Vellox
        </span>
      </div>
      <div style={{ width: 1, height: 18, background: "rgba(255,255,255,0.08)" }} />
      <div className="flex items-center gap-2 flex-shrink-0">
        <Truck size={13} style={{ color: "#818cf8" }} />
        <span style={{ fontSize: 13, color: "#9ca3af" }}>entrega rápida</span>
      </div>
    </div>
  );
}

// ─── STORE PREVIEW MODAL ─────────────────────────────────────────────────────

function StorePreviewModal({ loja, isFav, onToggleFav, onClose, accent }: {
  loja: Loja; isFav: boolean; onToggleFav: (id: string) => void; onClose: () => void; accent: string;
}) {
  const cor    = loja.config?.cor_principal ?? accent;
  const logo   = loja.config?.logo_url ?? null;
  const banner = loja.config?.banner_url ?? null;
  const aberto = loja.config?.aberto !== false;
  const taxa   = loja.config?.taxa_entrega ?? null;
  const tempo  = loja.config?.tempo_entrega ?? "30-45 min";
  const rating = fakeRating(loja.id);
  const reviews = fakeReviews(loja.id);

  function share() {
    const url = `${window.location.origin}/loja/${loja.slug}`;
    if (navigator.share) {
      navigator.share({ title: loja.nome, text: `Confira o cardápio de ${loja.nome}!`, url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url).catch(() => {});
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full rounded-t-3xl overflow-hidden"
        style={{
          background: "#111",
          border: "1px solid rgba(255,255,255,0.08)",
          maxHeight: "92vh",
          overflowY: "auto",
          animation: "slideUp 0.3s cubic-bezier(0.4,0,0.2,1)",
        }}
      >
        <style>{`@keyframes slideUp{from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>

        {/* Banner */}
        <div className="relative" style={{ height: 180 }}>
          <div
            className="absolute inset-0"
            style={{
              background: banner
                ? `url(${banner}) center/cover`
                : `linear-gradient(135deg, ${cor}cc, #0B0B0B)`,
            }}
          />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, #111 0%, transparent 60%)" }} />

          {/* Controls */}
          <div className="absolute top-4 left-4 right-4 flex items-center justify-between">
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.1)" }}
            >
              <X size={16} style={{ color: "#fff" }} />
            </button>
            <div className="flex gap-2">
              <button
                onClick={share}
                className="w-9 h-9 rounded-full flex items-center justify-center"
                style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.1)" }}
              >
                <Share2 size={15} style={{ color: "#fff" }} />
              </button>
              <button
                onClick={() => onToggleFav(loja.id)}
                className="w-9 h-9 rounded-full flex items-center justify-center"
                style={{ background: isFav ? "rgba(239,68,68,0.2)" : "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)", border: `1px solid ${isFav ? "rgba(239,68,68,0.4)" : "rgba(255,255,255,0.1)"}` }}
              >
                <Heart size={15} style={{ color: isFav ? "#ef4444" : "#fff" }} fill={isFav ? "#ef4444" : "none"} />
              </button>
            </div>
          </div>

          {/* Logo */}
          <div className="absolute" style={{ bottom: -24, left: 20 }}>
            {logo ? (
              <img src={logo} alt={loja.nome} className="rounded-2xl object-cover" style={{ width: 56, height: 56, border: "3px solid #111" }} />
            ) : (
              <div className="rounded-2xl flex items-center justify-center font-black text-white" style={{ width: 56, height: 56, background: cor, border: "3px solid #111", fontSize: 22 }}>
                {getInitial(loja.nome)}
              </div>
            )}
          </div>
        </div>

        {/* Info */}
        <div style={{ padding: "32px 20px 24px" }}>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="font-black text-white" style={{ fontSize: 22 }}>{loja.nome}</h2>
            {loja.verificado && <BadgeCheck size={18} style={{ color: accent }} />}
          </div>

          {/* Rating */}
          <div className="flex items-center gap-2 mb-3">
            <div className="flex gap-0.5">
              {[1,2,3,4,5].map(i => (
                <Star key={i} size={13} fill={i <= Math.round(rating) ? "#fbbf24" : "none"} style={{ color: "#fbbf24" }} />
              ))}
            </div>
            <span className="font-bold" style={{ fontSize: 13, color: "#fbbf24" }}>{rating}</span>
            <span style={{ fontSize: 12, color: "#6b7280" }}>({reviews} avaliações)</span>
          </div>

          {loja.config?.descricao && (
            <p style={{ fontSize: 13, color: "#9ca3af", marginBottom: 16, lineHeight: 1.6 }}>
              {loja.config.descricao}
            </p>
          )}

          {/* Stats grid */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            {[
              { label: "Status",  value: aberto ? "Aberto" : "Fechado", color: aberto ? "#22c55e" : "#ef4444" },
              { label: "Entrega", value: tempo, color: "#fff" },
              { label: "Taxa",    value: formatTaxa(taxa), color: taxa === 0 ? "#22c55e" : "#fff" },
            ].map(s => (
              <div key={s.label} className="rounded-2xl text-center" style={{ background: "#1a1a1a", padding: "12px 8px", border: "1px solid rgba(255,255,255,0.06)" }}>
                <p className="font-bold" style={{ fontSize: 13, color: s.color }}>{s.value}</p>
                <p style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{s.label}</p>
              </div>
            ))}
          </div>

          {/* CTA */}
          <Link
            href={`/loja/${loja.slug}`}
            className="flex items-center justify-center gap-2 w-full py-4 rounded-2xl text-base font-black"
            style={{
              background: `linear-gradient(135deg, ${accent}, ${accent}cc)`,
              color: "#fff",
              boxShadow: `0 6px 24px ${accent}40`,
            }}
          >
            Abrir Cardápio <ChevronRight size={18} />
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── INFINITE PRODUCT CAROUSEL ───────────────────────────────────────────────

function InfiniteProductCarousel({ produtos, accent }: { produtos: Produto[]; accent: string }) {
  const [paused, setPaused] = useState(false);
  if (produtos.length === 0) return null;

  // Duplica para loop infinito
  const items = [...produtos, ...produtos, ...produtos];
  const speed = items.length * 3; // segundos

  return (
    <div
      className="overflow-hidden relative"
      style={{ margin: "0 0" }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <style>{`
        @keyframes scrollLeft {
          from { transform: translateX(0); }
          to   { transform: translateX(-33.333%); }
        }
      `}</style>
      <div
        style={{
          display: "flex",
          gap: 14,
          width: "max-content",
          animation: `scrollLeft ${speed}s linear infinite`,
          animationPlayState: paused ? "paused" : "running",
          padding: "4px 0 12px",
        }}
      >
        {items.map((p, i) => (
          <Link
            key={`${p.id}-${i}`}
            href={`/loja/${p.empresa.slug}`}
            className="flex-shrink-0 rounded-2xl overflow-hidden group"
            style={{ width: 160, background: "#111", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <div style={{ height: 100, overflow: "hidden" }}>
              <img
                src={p.imagem_url}
                alt={p.nome}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                loading="lazy"
              />
            </div>
            <div style={{ padding: "10px 10px 12px" }}>
              <p className="font-bold text-white truncate" style={{ fontSize: 12 }}>{p.nome}</p>
              <p className="truncate" style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>{p.empresa.nome}</p>
              <p className="font-black" style={{ fontSize: 13, color: accent }}>
                R$ {p.preco.toFixed(2).replace(".", ",")}
              </p>
            </div>
          </Link>
        ))}
      </div>

      {/* Fade edges */}
      <div style={{ position: "absolute", top: 0, left: 0, bottom: 12, width: 40, background: "linear-gradient(90deg, #0B0B0B, transparent)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", top: 0, right: 0, bottom: 12, width: 40, background: "linear-gradient(270deg, #0B0B0B, transparent)", pointerEvents: "none" }} />
    </div>
  );
}

// ─── HERO BANNER ─────────────────────────────────────────────────────────────

function HeroBanner({ banners }: { banners: Banner[] }) {
  const slides = banners.length > 0
    ? banners.map(b => ({
        emoji:    "",
        title:    b.titulo,
        subtitle: b.subtitulo ?? "",
        glow:     b.cor_fundo ?? "#FF6A00",
        image:    b.imagem_url ?? null,
        link:     b.link_url ?? null,
      }))
    : HERO_SLIDES.map(s => ({ ...s, image: null as string | null, link: null as string | null }));

  const [idx, setIdx] = useState(0);
  const touchX = useRef<number | null>(null);

  useEffect(() => {
    const t = setInterval(() => setIdx(p => (p + 1) % slides.length), 4500);
    return () => clearInterval(t);
  }, [slides.length]);

  function prev() { setIdx(p => (p - 1 + slides.length) % slides.length); }
  function next() { setIdx(p => (p + 1) % slides.length); }

  const cur = slides[idx];
  const inner = (
    <div
      className="relative overflow-hidden rounded-3xl select-none"
      style={{ height: 200, background: "#111", border: "1px solid rgba(255,255,255,0.07)", boxShadow: `0 0 40px ${cur.glow}22`, transition: "box-shadow 0.8s ease", cursor: cur.link ? "pointer" : "default" }}
      onTouchStart={e => { touchX.current = e.touches[0].clientX; }}
      onTouchEnd={e => {
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        if (Math.abs(dx) > 40) dx < 0 ? next() : prev();
        touchX.current = null;
      }}
    >
      {cur.image ? (
        <div className="absolute inset-0 transition-all duration-700" style={{ backgroundImage: `url(${cur.image})`, backgroundSize: "cover", backgroundPosition: "center" }} />
      ) : (
        <>
          <div className="absolute inset-0 transition-all duration-700" style={{ background: `radial-gradient(ellipse at 70% 50%, ${cur.glow}28 0%, transparent 70%)` }} />
          <div className="absolute rounded-full blur-3xl transition-all duration-700" style={{ width: 200, height: 200, background: `${cur.glow}20`, right: -40, top: -40 }} />
          {cur.emoji && (
            <div className="absolute transition-all duration-500" style={{ fontSize: 100, right: 8, top: "50%", transform: "translateY(-50%)", lineHeight: 1, filter: "drop-shadow(0 0 24px rgba(0,0,0,0.6))" }}>
              {cur.emoji}
            </div>
          )}
        </>
      )}
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.72) 0%, transparent 60%)" }} />
      <div className="absolute inset-0 flex flex-col justify-end" style={{ padding: "20px 24px" }}>
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full mb-3 w-fit" style={{ background: `${cur.glow}20`, border: `1px solid ${cur.glow}40` }}>
          <Zap size={10} style={{ color: cur.glow }} />
          <span style={{ fontSize: 10, fontWeight: 700, color: cur.glow, letterSpacing: "0.08em" }}>DESTAQUE DO DIA</span>
        </div>
        <p className="font-black text-white" style={{ fontSize: 20, lineHeight: 1.1, marginBottom: 4 }}>{cur.title}</p>
        {cur.subtitle && <p style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>{cur.subtitle}</p>}
      </div>
      <div className="absolute flex gap-1.5" style={{ bottom: 14, right: 18 }}>
        {slides.map((_, i) => (
          <button key={i} onClick={() => setIdx(i)} className="rounded-full transition-all duration-300" style={{ width: i === idx ? 18 : 5, height: 5, background: i === idx ? "#FF6A00" : "rgba(255,255,255,0.3)" }} />
        ))}
      </div>
    </div>
  );

  return cur.link ? <a href={cur.link} target="_blank" rel="noopener noreferrer">{inner}</a> : inner;
}

// ─── STORE CARD ──────────────────────────────────────────────────────────────

function StoreCard({
  loja, isFav, onToggleFav, onPreview, accent, hasFlashSale,
}: { loja: Loja; isFav: boolean; onToggleFav: (id: string) => void; onPreview: (l: Loja) => void; accent: string; hasFlashSale?: boolean; }) {
  const cor    = loja.config?.cor_principal ?? accent;
  const logo   = loja.config?.logo_url ?? null;
  const banner = loja.config?.banner_url ?? null;
  const aberto = loja.config?.aberto !== false;
  const taxa   = loja.config?.taxa_entrega ?? null;
  const tempo  = loja.config?.tempo_entrega ?? "30-45 min";
  const rating = fakeRating(loja.id);
  const [hov, setHov] = useState(false);

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: "#111", border: `1px solid ${hov ? `${accent}44` : "rgba(255,255,255,0.06)"}`, boxShadow: hov ? `0 8px 32px ${accent}18` : "0 2px 8px rgba(0,0,0,0.3)", transform: hov ? "translateY(-3px)" : "none", transition: "all 0.25s cubic-bezier(0.4,0,0.2,1)", cursor: "pointer" }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onClick={() => onPreview(loja)}
    >
      {/* Banner */}
      <div className="relative overflow-hidden" style={{ height: 110 }}>
        <div
          className="absolute inset-0 transition-transform duration-500"
          style={{ background: banner ? `url(${banner}) center/cover` : `linear-gradient(135deg, ${cor}cc, #0B0B0B)`, transform: hov ? "scale(1.05)" : "scale(1)" }}
        />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(17,17,17,0.95) 0%, transparent 60%)" }} />

        <div className="absolute top-2.5 left-2.5 flex gap-1.5 flex-wrap">
          {loja.destaque && <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: "rgba(251,191,36,0.9)", color: "#000" }}><Star size={9} fill="currentColor" /> Destaque</span>}
          {isNew(loja.created_at) && <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: "rgba(129,140,248,0.9)", color: "#fff" }}>Novo</span>}
          {hasFlashSale && <span className="flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-black animate-pulse" style={{ background: "rgba(255,60,0,0.92)", color: "#fff" }}>⚡ Oferta</span>}
        </div>

        <button
          onClick={e => { e.stopPropagation(); onToggleFav(loja.id); }}
          className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full flex items-center justify-center"
          style={{ background: isFav ? "rgba(239,68,68,0.2)" : "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)", border: `1px solid ${isFav ? "rgba(239,68,68,0.4)" : "rgba(255,255,255,0.1)"}` }}
        >
          <Heart size={14} style={{ color: isFav ? "#ef4444" : "#fff" }} fill={isFav ? "#ef4444" : "none"} />
        </button>

        <div className="absolute" style={{ bottom: -20, left: 12 }}>
          {logo ? (
            <img src={logo} alt={loja.nome} className="rounded-xl object-cover" style={{ width: 44, height: 44, border: "2px solid #111" }} />
          ) : (
            <div className="rounded-xl flex items-center justify-center font-black text-white" style={{ width: 44, height: 44, background: cor, border: "2px solid #111", fontSize: 18 }}>
              {getInitial(loja.nome)}
            </div>
          )}
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: "26px 12px 12px" }}>
        <div className="flex items-center gap-1 mb-0.5">
          <p className="font-bold text-white truncate" style={{ fontSize: 14 }}>{loja.nome}</p>
          {loja.verificado && <BadgeCheck size={12} style={{ color: accent, flexShrink: 0 }} />}
        </div>

        {/* Rating */}
        <div className="flex items-center gap-1 mb-2">
          <Star size={11} fill="#fbbf24" style={{ color: "#fbbf24" }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: "#fbbf24" }}>{rating}</span>
          <span style={{ fontSize: 11, color: "#4b5563" }}>({fakeReviews(loja.id)})</span>
        </div>

        <div className="flex items-center gap-2 flex-wrap mb-3">
          <span className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: aberto ? "rgba(34,197,94,0.1)" : "rgba(100,116,139,0.1)", color: aberto ? "#22c55e" : "#64748b", border: `1px solid ${aberto ? "rgba(34,197,94,0.2)" : "rgba(100,116,139,0.15)"}` }}>
            <span className="rounded-full" style={{ width: 4, height: 4, background: aberto ? "#22c55e" : "#64748b", display: "inline-block" }} />
            {aberto ? "Aberto" : "Fechado"}
          </span>
          <span className="flex items-center gap-1" style={{ fontSize: 11, color: "#6b7280" }}><Clock size={10} /> {tempo}</span>
          <span style={{ fontSize: 11, color: taxa === 0 ? "#22c55e" : "#6b7280" }}>🛵 {formatTaxa(taxa)}</span>
          {(() => { const n = fakePedidosHoje(loja.id); return n >= 20 ? <span style={{ fontSize: 10, color: "#f97316", fontWeight: 700 }}>🔥 {n} hoje</span> : null; })()}
        </div>

        <button
          onClick={e => { e.stopPropagation(); }}
          className="w-full py-2 rounded-xl text-xs font-bold transition-all"
          style={{ background: hov ? `${accent}22` : `${accent}11`, color: accent, border: `1px solid ${accent}30` }}
        >
          <Link href={`/loja/${loja.slug}`} onClick={e => e.stopPropagation()} className="flex items-center justify-center gap-1.5">
            Ver Cardápio <ChevronRight size={12} />
          </Link>
        </button>
      </div>
    </div>
  );
}

// ─── FEATURED LANDSCAPE CAROUSEL ─────────────────────────────────────────────

function FeaturedLandscapeCarousel({ destaques, favs, onToggleFav, accent }: {
  destaques: Loja[]; favs: Set<string>; onToggleFav: (id: string) => void; accent: string;
}) {
  const [idx, setIdx] = useState(0);
  const touchX = useRef<number | null>(null);
  if (destaques.length === 0) return null;

  const loja   = destaques[Math.min(idx, destaques.length - 1)];
  const banner = loja.config?.banner_url ?? null;
  const cor    = loja.config?.cor_principal ?? accent;
  const logo   = loja.config?.logo_url ?? null;
  const aberto = loja.config?.aberto !== false;
  const taxa   = loja.config?.taxa_entrega ?? null;
  const tempo  = loja.config?.tempo_entrega ?? "30-45 min";
  const rating = fakeRating(loja.id);
  const fav    = favs.has(loja.id);

  function prev() { setIdx(p => (p - 1 + destaques.length) % destaques.length); }
  function next() { setIdx(p => (p + 1) % destaques.length); }

  return (
    <div style={{ padding: "0 16px" }}>
      <div
        className="relative overflow-hidden rounded-3xl"
        style={{ height: 230 }}
        onTouchStart={e => { touchX.current = e.touches[0].clientX; }}
        onTouchEnd={e => {
          if (touchX.current === null) return;
          const dx = e.changedTouches[0].clientX - touchX.current;
          if (Math.abs(dx) > 40) dx < 0 ? next() : prev();
          touchX.current = null;
        }}
      >
        {/* Background */}
        <div
          className="absolute inset-0 transition-all duration-700"
          style={{ background: banner ? `url(${banner}) center/cover` : `linear-gradient(135deg, ${cor}cc, #060606)` }}
        />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.1) 55%)" }} />
        <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 80% 20%, ${cor}15 0%, transparent 60%)` }} />

        {/* Top row */}
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black" style={{ background: "rgba(251,191,36,0.95)", color: "#000", boxShadow: "0 2px 12px rgba(251,191,36,0.4)" }}>
            <Star size={9} fill="#000" /> Destaque
          </span>
          <button
            onClick={e => { e.stopPropagation(); onToggleFav(loja.id); }}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: fav ? "rgba(239,68,68,0.3)" : "rgba(0,0,0,0.55)", backdropFilter: "blur(8px)", border: `1px solid ${fav ? "rgba(239,68,68,0.5)" : "rgba(255,255,255,0.15)"}` }}
          >
            <Heart size={13} style={{ color: fav ? "#ef4444" : "#fff" }} fill={fav ? "#ef4444" : "none"} />
          </button>
        </div>

        {/* Bottom info */}
        <div className="absolute bottom-0 left-0 right-0" style={{ padding: "0 20px 18px" }}>
          <div className="flex items-end justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2.5 mb-2">
                {logo ? (
                  <img src={logo} alt="" className="rounded-xl object-cover flex-shrink-0" style={{ width: 40, height: 40, border: "2px solid rgba(255,255,255,0.25)" }} />
                ) : (
                  <div className="rounded-xl flex items-center justify-center font-black text-white flex-shrink-0" style={{ width: 40, height: 40, background: cor, fontSize: 17, border: "2px solid rgba(255,255,255,0.2)" }}>
                    {getInitial(loja.nome)}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="font-black text-white truncate" style={{ fontSize: 19, lineHeight: 1.15 }}>{loja.nome}</p>
                    {loja.verificado && <BadgeCheck size={14} style={{ color: "#60a5fa", flexShrink: 0 }} />}
                  </div>
                  {loja.categoria && <p style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 1 }}>{loja.categoria}</p>}
                </div>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="flex items-center gap-1" style={{ fontSize: 12, color: "#fbbf24", fontWeight: 700 }}>
                  <Star size={11} fill="#fbbf24" /> {rating}
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: aberto ? "#4ade80" : "#f87171" }}>
                  {aberto ? "● Aberto" : "● Fechado"}
                </span>
                <span style={{ fontSize: 12, color: "#9ca3af" }}>🛵 {formatTaxa(taxa)}</span>
                <span style={{ fontSize: 12, color: "#9ca3af" }}>⏱ {tempo}</span>
              </div>
            </div>
            <Link
              href={`/loja/${loja.slug}`}
              className="flex items-center gap-1 px-4 py-2.5 rounded-2xl text-xs font-black flex-shrink-0"
              style={{ background: `linear-gradient(135deg, ${accent}, ${accent}bb)`, color: "#fff", boxShadow: `0 4px 20px ${accent}50` }}
            >
              Abrir <ChevronRight size={13} />
            </Link>
          </div>
        </div>

        {/* Dots */}
        {destaques.length > 1 && (
          <div className="absolute flex gap-1.5" style={{ bottom: 60, right: 20 }}>
            {destaques.map((_, i) => (
              <button key={i} onClick={() => setIdx(i)} className="rounded-full transition-all duration-300" style={{ width: i === idx ? 16 : 4, height: 4, background: i === idx ? "#fff" : "rgba(255,255,255,0.25)" }} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── COUNTDOWN TIMER ─────────────────────────────────────────────────────────

function CountdownTimer({ termina_em }: { termina_em: string }) {
  const [txt, setTxt] = useState("");
  useEffect(() => {
    function calc() {
      const diff = new Date(termina_em).getTime() - Date.now();
      if (diff <= 0) { setTxt("Encerrado"); return; }
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1_000);
      setTxt(h > 0
        ? `${h}h ${m.toString().padStart(2, "0")}m`
        : `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`);
    }
    calc();
    const t = setInterval(calc, 1_000);
    return () => clearInterval(t);
  }, [termina_em]);
  return <span>{txt}</span>;
}

// ─── FLASH SALE CARD ─────────────────────────────────────────────────────────

function FlashSaleCard({ sale, slug }: { sale: FlashSale; slug: string }) {
  const pct = sale.preco_original && sale.preco_original > sale.preco_flash
    ? Math.round((1 - sale.preco_flash / sale.preco_original) * 100)
    : null;

  return (
    <Link
      href={`/loja/${slug}`}
      className="flex-shrink-0 rounded-2xl overflow-hidden"
      style={{ width: 200, background: "#111", border: "1px solid rgba(255,106,0,0.25)", boxShadow: "0 4px 20px rgba(255,106,0,0.12)" }}
    >
      {/* Imagem */}
      <div style={{ height: 100, position: "relative", overflow: "hidden", background: sale.imagem_url ? undefined : "linear-gradient(135deg,#FF6A0044,#111)" }}>
        {sale.imagem_url
          ? <img src={sale.imagem_url} alt={sale.nome} className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center" style={{ fontSize: 40 }}>⚡</div>}
        {pct && (
          <div className="absolute top-2 right-2 rounded-full px-2 py-0.5 text-xs font-black" style={{ background: "#ef4444", color: "#fff" }}>
            -{pct}%
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{ padding: "10px 12px 12px" }}>
        <p className="font-bold text-white truncate" style={{ fontSize: 13, marginBottom: 4 }}>{sale.nome}</p>

        <div className="flex items-center gap-2 mb-3">
          {sale.preco_original && (
            <span style={{ fontSize: 11, color: "#6b7280", textDecoration: "line-through" }}>
              R$ {sale.preco_original.toFixed(2).replace(".", ",")}
            </span>
          )}
          <span className="font-black" style={{ fontSize: 15, color: "#FF6A00" }}>
            R$ {sale.preco_flash.toFixed(2).replace(".", ",")}
          </span>
        </div>

        <div className="flex items-center gap-1 px-2 py-1 rounded-lg" style={{ background: "rgba(255,106,0,0.1)", border: "1px solid rgba(255,106,0,0.2)" }}>
          <span style={{ fontSize: 11, color: "#FF6A00" }}>⏱</span>
          <span className="font-bold" style={{ fontSize: 11, color: "#FF6A00" }}>
            <CountdownTimer termina_em={sale.termina_em} />
          </span>
        </div>
      </div>
    </Link>
  );
}

// ─── FLASH SALES SECTION ─────────────────────────────────────────────────────

function FlashSalesSection({ sales, lojas }: { sales: FlashSale[]; lojas: Loja[] }) {
  if (sales.length === 0) return null;
  const slugMap = new Map(lojas.map(l => [l.id, l.slug]));

  return (
    <section style={{ marginTop: 24 }}>
      <div style={{ padding: "0 16px", marginBottom: 12 }}>
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 18 }}>⚡</span>
          <h2 className="font-black text-white" style={{ fontSize: 19 }}>Ofertas Relâmpago</h2>
          <span className="ml-1 px-2 py-0.5 rounded-full text-xs font-bold animate-pulse" style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.3)" }}>
            AO VIVO
          </span>
        </div>
        <p style={{ fontSize: 12, color: "#6b7280", marginTop: 3 }}>Promoções por tempo limitado — corra!</p>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2" style={{ padding: "0 16px", scrollbarWidth: "none" }}>
        {sales.map(s => (
          <FlashSaleCard key={s.id} sale={s} slug={slugMap.get(s.empresa_id) ?? ""} />
        ))}
      </div>
    </section>
  );
}

// ─── SECTION HEADER ──────────────────────────────────────────────────────────

function SectionHeader({ icon, title, sub, count, onSeeAll }: { icon: React.ReactNode; title: string; sub?: string; count?: number; onSeeAll?: () => void }) {
  return (
    <div style={{ padding: "0 16px", marginBottom: 14 }}>
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="font-black text-white" style={{ fontSize: 19 }}>{title}</h2>
        <div className="ml-auto flex items-center gap-2">
          {count !== undefined && (
            <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: "rgba(255,255,255,0.06)", color: "#6b7280" }}>{count}</span>
          )}
          {onSeeAll && (
            <button onClick={onSeeAll} style={{ fontSize: 12, fontWeight: 700, color: "#FF6A00" }}>
              Ver todas →
            </button>
          )}
        </div>
      </div>
      {sub && <p style={{ fontSize: 12, color: "#6b7280", marginTop: 3 }}>{sub}</p>}
    </div>
  );
}

// ─── TRUST BADGES ────────────────────────────────────────────────────────────

function TrustBadges({ accent }: { accent: string }) {
  return (
    <div className="grid grid-cols-2 gap-3" style={{ padding: "0 16px" }}>
      {[
        { icon: Truck,      label: "Entrega rápida",   sub: "Rastreie em tempo real" },
        { icon: Shield,     label: "100% seguro",       sub: "Pagamento protegido" },
        { icon: Star,       label: "Lojas verificadas", sub: "Qualidade garantida" },
        { icon: Headphones, label: "Suporte 24h",       sub: "Atendimento Vellox" },
      ].map(({ icon: Icon, label, sub }) => (
        <div key={label} className="flex items-center gap-3 rounded-2xl" style={{ padding: "12px 14px", background: "#111", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${accent}15` }}>
            <Icon size={16} style={{ color: accent }} />
          </div>
          <div>
            <p className="font-bold text-white" style={{ fontSize: 12 }}>{label}</p>
            <p style={{ fontSize: 11, color: "#6b7280" }}>{sub}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── AUTOCOMPLETE DROPDOWN ───────────────────────────────────────────────────

function Autocomplete({ query, lojas, cats, onSelect }: {
  query: string; lojas: Loja[]; cats: Categoria[]; onSelect: (v: string) => void;
}) {
  if (!query.trim()) return null;
  const ql     = query.toLowerCase();
  const lMatch = lojas.filter(l => l.nome.toLowerCase().includes(ql)).slice(0, 4);
  const cMatch = cats.filter(c => c.nome.toLowerCase().includes(ql)).slice(0, 3);
  if (!lMatch.length && !cMatch.length) return null;

  return (
    <div
      className="absolute top-full left-0 right-0 z-50 rounded-2xl overflow-hidden mt-1"
      style={{ background: "#161616", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 16px 48px rgba(0,0,0,0.6)" }}
    >
      {cMatch.length > 0 && (
        <>
          <div style={{ padding: "8px 14px 4px", fontSize: 10, fontWeight: 700, color: "#4b5563", letterSpacing: "0.08em" }}>CATEGORIAS</div>
          {cMatch.map(c => (
            <button key={c.id} onClick={() => onSelect(c.nome)} className="flex items-center gap-3 w-full px-4 py-2.5 text-left transition-colors" onMouseEnter={e => (e.currentTarget.style.background = "#1f1f1f")} onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
              <span style={{ fontSize: 18 }}>{c.emoji}</span>
              <span style={{ fontSize: 13, color: "#e5e7eb", fontWeight: 600 }}>{c.nome}</span>
            </button>
          ))}
        </>
      )}
      {lMatch.length > 0 && (
        <>
          <div style={{ padding: "8px 14px 4px", fontSize: 10, fontWeight: 700, color: "#4b5563", letterSpacing: "0.08em" }}>LOJAS</div>
          {lMatch.map(l => (
            <Link key={l.id} href={`/loja/${l.slug}`} className="flex items-center gap-3 px-4 py-2.5 transition-colors" onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = "#1f1f1f")} onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "transparent")}>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center font-black text-white flex-shrink-0" style={{ background: l.config?.cor_principal ?? "#FF6A00", fontSize: 13 }}>
                {getInitial(l.nome)}
              </div>
              <div>
                <p style={{ fontSize: 13, color: "#e5e7eb", fontWeight: 600 }}>{l.nome}</p>
                {l.categoria && <p style={{ fontSize: 11, color: "#6b7280" }}>{l.categoria}</p>}
              </div>
            </Link>
          ))}
        </>
      )}
    </div>
  );
}

// ─── RESTAURANTE DO DIA ──────────────────────────────────────────────────────

function RestauranteDosDia({ loja, accent, isFav, onToggleFav, onPreview }: {
  loja: Loja; accent: string; isFav: boolean;
  onToggleFav: (id: string) => void; onPreview: (l: Loja) => void;
}) {
  const cor    = loja.config?.cor_principal ?? accent;
  const banner = loja.config?.banner_url ?? null;
  const logo   = loja.config?.logo_url ?? null;
  const aberto = loja.config?.aberto !== false;
  const taxa   = loja.config?.taxa_entrega ?? null;
  const tempo  = loja.config?.tempo_entrega ?? "30-45 min";
  const rating = fakeRating(loja.id);
  const pedidos = fakePedidosHoje(loja.id);

  return (
    <div style={{ padding: "0 16px" }}>
      <button
        onClick={() => onPreview(loja)}
        className="w-full text-left overflow-hidden rounded-3xl relative"
        style={{ height: 210, display: "block" }}
      >
        {/* Background */}
        <div className="absolute inset-0" style={{ background: banner ? `url(${banner}) center/cover` : `linear-gradient(135deg, ${cor}cc, #060606)` }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.94) 0%, rgba(0,0,0,0.05) 55%)" }} />
        <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 80% 10%, ${cor}18 0%, transparent 60%)` }} />

        {/* Crown badge */}
        <div className="absolute top-3 left-3 flex gap-2">
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black" style={{ background: "linear-gradient(135deg, #fbbf24, #f59e0b)", color: "#000", boxShadow: "0 2px 16px rgba(251,191,36,0.5)" }}>
            👑 Restaurante do Dia
          </span>
        </div>

        {/* Fav */}
        <button
          onClick={e => { e.stopPropagation(); onToggleFav(loja.id); }}
          className="absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: isFav ? "rgba(239,68,68,0.25)" : "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)", border: `1px solid ${isFav ? "rgba(239,68,68,0.4)" : "rgba(255,255,255,0.15)"}` }}
        >
          <Heart size={14} style={{ color: isFav ? "#ef4444" : "#fff" }} fill={isFav ? "#ef4444" : "none"} />
        </button>

        {/* Bottom info */}
        <div className="absolute bottom-0 left-0 right-0" style={{ padding: "0 18px 18px" }}>
          <div className="flex items-end gap-3">
            {logo ? (
              <img src={logo} alt="" className="rounded-2xl object-cover flex-shrink-0" style={{ width: 46, height: 46, border: "2px solid rgba(255,255,255,0.2)" }} />
            ) : (
              <div className="rounded-2xl flex items-center justify-center font-black text-white flex-shrink-0" style={{ width: 46, height: 46, background: cor, fontSize: 20, border: "2px solid rgba(255,255,255,0.15)" }}>
                {getInitial(loja.nome)}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-1">
                <p className="font-black text-white truncate" style={{ fontSize: 20, lineHeight: 1.1 }}>{loja.nome}</p>
                {loja.verificado && <BadgeCheck size={14} style={{ color: "#60a5fa", flexShrink: 0 }} />}
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="flex items-center gap-1" style={{ fontSize: 12, color: "#fbbf24", fontWeight: 700 }}>
                  <Star size={10} fill="#fbbf24" /> {rating}
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: aberto ? "#4ade80" : "#f87171" }}>
                  {aberto ? "● Aberto" : "● Fechado"}
                </span>
                <span style={{ fontSize: 12, color: "#9ca3af" }}>🛵 {formatTaxa(taxa)}</span>
                <span style={{ fontSize: 12, color: "#f97316", fontWeight: 700 }}>🔥 {pedidos} pedidos hoje</span>
              </div>
            </div>
            <Link
              href={`/loja/${loja.slug}`}
              onClick={e => e.stopPropagation()}
              className="flex items-center gap-1 px-4 py-2.5 rounded-2xl text-xs font-black flex-shrink-0"
              style={{ background: `linear-gradient(135deg, ${accent}, ${accent}bb)`, color: "#fff", boxShadow: `0 4px 20px ${accent}50` }}
            >
              Abrir <ChevronRight size={13} />
            </Link>
          </div>
        </div>
      </button>
    </div>
  );
}

// ─── ABRINDO EM BREVE ────────────────────────────────────────────────────────

function AbrindoEmBreve({ lojas, favs, onToggleFav, onPreview, accent }: {
  lojas: Loja[]; favs: Set<string>; onToggleFav: (id: string) => void; onPreview: (l: Loja) => void; accent: string;
}) {
  // Mostra lojas fechadas que "abrem em breve" (simulado: lojas fechadas com tempo_entrega definido)
  const fechadas = lojas.filter(l => l.config?.aberto === false && l.config?.tempo_entrega);
  if (fechadas.length === 0) return null;

  function minutosParaAbrir(id: string) {
    const s = id.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    return 15 + (s % 105);
  }

  const em2h = fechadas.filter(l => minutosParaAbrir(l.id) <= 120).slice(0, 6);
  if (em2h.length === 0) return null;

  return (
    <section style={{ marginTop: 28 }}>
      <SectionHeader icon={<Clock size={18} style={{ color: "#a78bfa" }} />} title="Abrindo em breve" sub="Vai abrir nas próximas 2 horas" />
      <div className="flex gap-4 overflow-x-auto pb-2" style={{ padding: "0 16px", scrollbarWidth: "none" }}>
        {em2h.map(l => {
          const min = minutosParaAbrir(l.id);
          const cor = l.config?.cor_principal ?? accent;
          const logo = l.config?.logo_url ?? null;
          return (
            <button
              key={l.id}
              onClick={() => onPreview(l)}
              className="flex-shrink-0 rounded-2xl overflow-hidden text-left"
              style={{ width: 160, background: "#111", border: "1px solid rgba(167,139,250,0.2)" }}
            >
              <div style={{ height: 80, position: "relative", background: `linear-gradient(135deg, ${cor}33, #111)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {logo
                  ? <img src={logo} alt={l.nome} className="rounded-xl object-cover" style={{ width: 48, height: 48 }} />
                  : <div className="rounded-xl flex items-center justify-center font-black text-white" style={{ width: 48, height: 48, background: cor, fontSize: 20 }}>{getInitial(l.nome)}</div>}
                <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-xs font-black" style={{ background: "rgba(167,139,250,0.9)", color: "#fff" }}>
                  {min < 60 ? `${min}min` : `${Math.round(min / 60)}h`}
                </div>
              </div>
              <div style={{ padding: "8px 10px 10px" }}>
                <p className="font-bold text-white truncate" style={{ fontSize: 12, marginBottom: 2 }}>{l.nome}</p>
                <p style={{ fontSize: 10, color: "#a78bfa", fontWeight: 700 }}>🕐 Abre em {min < 60 ? `${min} min` : `${Math.round(min / 60)}h`}</p>
                <p style={{ fontSize: 10, color: "#4b5563", marginTop: 2 }}>🛵 {formatTaxa(l.config?.taxa_entrega ?? null)}</p>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ─── BOTTOM NAV ──────────────────────────────────────────────────────────────

type Tab = "explorar" | "pedidos" | "favoritos" | "perfil";

function BottomNav({ active, onChange, accent }: { active: Tab; onChange: (t: Tab) => void; accent: string }) {
  const items = [
    { id: "explorar"  as Tab, label: "Explorar",  icon: Compass,     href: undefined },
    { id: "pedidos"   as Tab, label: "Pedidos",   icon: ShoppingBag, href: "/meus-pedidos" },
    { id: "favoritos" as Tab, label: "Favoritos", icon: Heart,       href: undefined },
    { id: "perfil"    as Tab, label: "Perfil",    icon: User,        href: undefined },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50" style={{ paddingBottom: "env(safe-area-inset-bottom, 8px)", background: "rgba(10,10,10,0.88)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
      <div className="flex items-center justify-around" style={{ padding: "8px 8px 0" }}>
        {items.map(item => {
          const Icon = item.icon;
          const isActive = active === item.id;
          const btn = (
            <button
              onClick={() => onChange(item.id)}
              className="flex flex-col items-center gap-1 flex-1 py-2 relative transition-all duration-200"
              style={{ color: isActive ? accent : "#4b5563" }}
            >
              {isActive && (
                <span className="absolute rounded-xl" style={{ width: 40, height: 32, background: `${accent}15`, left: "50%", transform: "translateX(-50%)", top: 4, boxShadow: `0 0 14px ${accent}20` }} />
              )}
              <Icon size={20} style={{ position: "relative" }} />
              <span style={{ fontSize: 10, fontWeight: isActive ? 700 : 500, position: "relative" }}>{item.label}</span>
            </button>
          );
          return item.href && !isActive ? (
            <Link key={item.id} href={item.href} className="flex-1 flex">{btn}</Link>
          ) : (
            <div key={item.id} className="flex-1 flex">{btn}</div>
          );
        })}
      </div>
    </nav>
  );
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────

const HERO_DEFAULTS: HeroConfig = {
  badge_text:     "DESCUBRA · PEÇA · RECEBA",
  hero_titulo:    "Peça comida no",
  hero_destaque:  "seu jeito",
  hero_subtitulo: "Descubra restaurantes incríveis e peça com entrega rápida",
  accent_color:   "#FF6A00",
};

export default function ExplorarClient({ lojas, banners, categorias, heroConfig }: Props) {
  const hcfg = heroConfig ?? HERO_DEFAULTS;
  const [activeTab,      setActiveTab]      = useState<Tab>("explorar");
  const [categoriaAtiva, setCategoriaAtiva] = useState("");
  const [filtroAberto,   setFiltroAberto]   = useState(false);
  const [filtroGratis,   setFiltroGratis]   = useState(false);
  const [filtroRapido,   setFiltroRapido]   = useState(false);
  const [sortMode,       setSortMode]       = useState<SortMode>("relevancia");
  const [catCounts,      setCatCounts]      = useState<Record<string, number>>({});
  const [busca,          setBusca]          = useState("");
  const [buscaFocus,     setBuscaFocus]     = useState(false);
  const [buscaResults,   setBuscaResults]   = useState<Loja[] | null>(null);
  const [searching,      setSearching]      = useState(false);
  const [favoritos,      setFavoritos]      = useState<Set<string>>(new Set());
  const [history,        setHistory]        = useState<string[]>([]);
  const [location,       setLocation]       = useState("sua cidade");
  const [showFilters,    setShowFilters]    = useState(false);
  const [previewLoja,    setPreviewLoja]    = useState<Loja | null>(null);
  const [produtos,       setProdutos]       = useState<Produto[]>([]);
  const [userLat,        setUserLat]        = useState<number | null>(null);
  const [userLng,        setUserLng]        = useState<number | null>(null);
  const [locStatus,      setLocStatus]      = useState<"idle" | "asking" | "granted" | "denied">("idle");
  const [filtroDistKm,   setFiltroDistKm]   = useState<number | null>(null);
  const [flashSales,     setFlashSales]     = useState<FlashSale[]>([]);
  const [produtosBusca,  setProdutosBusca]  = useState<ProdutoBusca[]>([]);
  const [filtroPreco,    setFiltroPreco]    = useState<"" | "$" | "$$" | "$$$">("");
  const [viewMode,       setViewMode]       = useState<"lista" | "mapa">("lista");

  const debounceRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const allStoresRef  = useRef<HTMLElement | null>(null);
  const heroSearchRef = useRef<HTMLDivElement | null>(null);
  const [stickySearch, setStickySearch] = useState(false);

  function requestLocation() {
    setLocStatus("asking");
    navigator.geolocation.getCurrentPosition(
      pos => {
        setUserLat(pos.coords.latitude);
        setUserLng(pos.coords.longitude);
        setLocStatus("granted");
        fetch(`https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json`)
          .then(r => r.json())
          .then(d => {
            const b = d.address?.suburb ?? d.address?.neighbourhood ?? "";
            const c = d.address?.city ?? d.address?.town ?? d.address?.municipality ?? "";
            const s = d.address?.state_code ?? "";
            setLocation(b && c ? `${b} • ${c}${s ? ` - ${s}` : ""}` : c || "sua cidade");
          }).catch(() => {});
      },
      () => setLocStatus("denied"),
      { timeout: 8000 }
    );
  }

  function scrollToAll() { allStoresRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }
  const cats = categorias.length > 0 ? categorias : CATEGORIAS_DEFAULT;

  // Accent dinâmico por categoria (ou config do god)
  const accent = categoriaAtiva ? (CAT_ACCENTS[categoriaAtiva] ?? hcfg.accent_color) : hcfg.accent_color;

  useEffect(() => {
    try {
      const fSaved = localStorage.getItem(FAV_KEY);
      if (fSaved) setFavoritos(new Set(JSON.parse(fSaved) as string[]));
      const hSaved = localStorage.getItem(HIST_KEY);
      if (hSaved) setHistory(JSON.parse(hSaved) as string[]);
      const cSaved = localStorage.getItem(CAT_HIST_KEY);
      if (cSaved) setCatCounts(JSON.parse(cSaved) as Record<string, number>);
    } catch {}

    // Geolocalização — verifica permissão já concedida (não pede de novo se já foi negada)
    if ("geolocation" in navigator) {
      if (navigator.permissions) {
        navigator.permissions.query({ name: "geolocation" }).then(result => {
          if (result.state === "granted") {
            requestLocation();
          } else if (result.state === "prompt") {
            setLocStatus("idle"); // vai mostrar o banner de convite
          } else {
            setLocStatus("denied");
          }
        }).catch(() => requestLocation());
      } else {
        requestLocation();
      }
    }

    // Produtos do carrossel
    fetch("/api/explorar/produtos").then(r => r.json()).then(d => setProdutos(d.produtos ?? [])).catch(() => {});

    // Flash sales ativas
    fetch("/api/flash-sales").then(r => r.json()).then(d => setFlashSales(d.flash_sales ?? [])).catch(() => {});
  }, []);

  // Hero search visibility → sticky search bar
  useEffect(() => {
    const el = heroSearchRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => setStickySearch(!e.isIntersecting), { threshold: 0 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Search debounce
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!busca.trim()) { setBuscaResults(null); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res  = await fetch(`/api/explorar?q=${encodeURIComponent(busca)}`);
        const data = await res.json();
        setBuscaResults(data.lojas ?? []);
        setProdutosBusca(data.produtos_busca ?? []);
      } catch {} finally { setSearching(false); }
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [busca]);

  function toggleFav(id: string) {
    setFavoritos(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem(FAV_KEY, JSON.stringify([...next])); } catch {}
      return next;
    });
  }

  function openPreview(loja: Loja) {
    setPreviewLoja(loja);
    // Salva no histórico
    setHistory(prev => {
      const next = [loja.id, ...prev.filter(id => id !== loja.id)].slice(0, 8);
      try { localStorage.setItem(HIST_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }

  const flashSaleEmpresas = useMemo(() => new Set(flashSales.map(s => s.empresa_id)), [flashSales]);

  const base = busca.trim() ? (buscaResults ?? []) : lojas;
  const filtered = useMemo(() => {
    let list = base;
    if (categoriaAtiva) list = list.filter(l => l.categoria === categoriaAtiva);
    if (filtroAberto)   list = list.filter(l => l.config?.aberto !== false);
    if (filtroGratis)   list = list.filter(l => !l.config?.taxa_entrega || l.config.taxa_entrega === 0);
    if (filtroPreco)    list = list.filter(l => precoRange(l.config?.taxa_entrega ?? null) === filtroPreco);
    if (filtroDistKm && userLat && userLng) {
      list = list.filter(l => l.lat && l.lng && haversine(userLat, userLng, l.lat, l.lng) <= filtroDistKm);
    }
    if (filtroRapido)   list = list.filter(l => {
      const t = l.config?.tempo_entrega;
      if (!t) return false;
      return (parseInt(t) || 99) <= 30;
    });

    const parseMin = (t: string | null | undefined) => t ? (parseInt(t) || 40) : 40;
    return [...list].sort((a, b) => {
      const aOpen = a.config?.aberto !== false ? 1 : 0;
      const bOpen = b.config?.aberto !== false ? 1 : 0;
      if (sortMode === "avaliacao") {
        const r = fakeRating(b.id) - fakeRating(a.id);
        return r !== 0 ? r : bOpen - aOpen;
      }
      if (sortMode === "tempo") {
        const t = parseMin(a.config?.tempo_entrega) - parseMin(b.config?.tempo_entrega);
        return t !== 0 ? t : bOpen - aOpen;
      }
      if (sortMode === "taxa") {
        const tx = (a.config?.taxa_entrega ?? 999) - (b.config?.taxa_entrega ?? 999);
        return tx !== 0 ? tx : bOpen - aOpen;
      }
      // relevancia: aberto primeiro, depois destaques
      const open = bOpen - aOpen;
      return open !== 0 ? open : (b.destaque ? 1 : 0) - (a.destaque ? 1 : 0);
    });
  }, [base, categoriaAtiva, filtroAberto, filtroGratis, filtroRapido, filtroPreco, filtroDistKm, userLat, userLng, sortMode]);

  const destaques = useMemo(() => filtered.filter(l => l.destaque), [filtered]);

  const restauranteDosDia = useMemo(() => {
    if (destaques.length === 0) return null;
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86_400_000);
    return destaques[dayOfYear % destaques.length];
  }, [destaques]);

  const paraVoce = useMemo(() => {
    const top = Object.entries(catCounts).sort(([, a], [, b]) => b - a)[0]?.[0];
    if (!top) return null;
    const lojasCat = lojas.filter(l => l.categoria === top && l.config?.aberto !== false).slice(0, 6);
    return lojasCat.length >= 2 ? { cat: top, lojas: lojasCat } : null;
  }, [catCounts, lojas]);
  const novas       = useMemo(() => filtered.filter(l => isNew(l.created_at)), [filtered]);
  const favs        = useMemo(() => lojas.filter(l => favoritos.has(l.id)), [lojas, favoritos]);
  const histLojas   = useMemo(() => history.map(id => lojas.find(l => l.id === id)).filter(Boolean) as Loja[], [lojas, history]);

  // Perto de você
  const proximas = useMemo(() => {
    if (!userLat || !userLng) return [];
    return [...filtered]
      .filter(l => l.lat && l.lng)
      .map(l => ({ loja: l, dist: haversine(userLat, userLng, l.lat!, l.lng!) }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 6)
      .map(({ loja, dist }) => ({ loja, dist }));
  }, [filtered, userLat, userLng]);

  // ── FAVORITOS TAB ─────────────────────────────────────────────────────────
  if (activeTab === "favoritos") {
    return (
      <div style={{ background: "#0B0B0B", minHeight: "100vh", paddingBottom: 88, color: "#fff" }}>
        <div style={{ padding: "52px 16px 24px" }}>
          <div className="flex items-center gap-3 mb-6">
            <button onClick={() => setActiveTab("explorar")} className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <ArrowLeft size={16} style={{ color: "#fff" }} />
            </button>
            <div>
              <h1 className="font-black text-white" style={{ fontSize: 22 }}>Favoritos</h1>
              <p style={{ fontSize: 12, color: "#6b7280" }}>{favs.length} loja{favs.length !== 1 ? "s" : ""} salva{favs.length !== 1 ? "s" : ""}</p>
            </div>
          </div>
          {favs.length === 0 ? (
            <div className="flex flex-col items-center py-20 gap-4">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <Heart size={28} style={{ color: "#1f2937" }} />
              </div>
              <p style={{ color: "#4b5563", fontSize: 14 }}>Você ainda não tem favoritos</p>
              <button onClick={() => setActiveTab("explorar")} className="px-5 py-2.5 rounded-xl text-sm font-bold" style={{ background: `${accent}18`, color: accent, border: `1px solid ${accent}30` }}>
                Explorar lojas
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {favs.map(l => <StoreCard key={l.id} loja={l} isFav onToggleFav={toggleFav} onPreview={openPreview} accent={accent} hasFlashSale={flashSaleEmpresas.has(l.id)} />)}
            </div>
          )}
        </div>
        <BottomNav active={activeTab} onChange={setActiveTab} accent={accent} />
        {previewLoja && <StorePreviewModal loja={previewLoja} isFav={favoritos.has(previewLoja.id)} onToggleFav={toggleFav} onClose={() => setPreviewLoja(null)} accent={accent} />}
      </div>
    );
  }

  // ── MAIN VIEW ────────────────────────────────────────────────────────────
  return (
    <div style={{ background: "#0B0B0B", minHeight: "100vh", paddingBottom: 96, color: "#fff", transition: "all 0.4s ease" }}>

      {/* ── STICKY HEADER ─────────────────────────────────────────── */}
      <div
        className="sticky top-0 z-40"
        style={{
          background: "rgba(11,11,11,0.92)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          borderBottom: stickySearch ? "1px solid rgba(255,255,255,0.05)" : "none",
          padding: stickySearch ? "10px 16px" : "8px 16px 4px",
          transition: "padding 0.2s, border 0.2s",
        }}
      >
        <div className="flex items-center gap-1.5" style={{ marginBottom: stickySearch ? 10 : 0 }}>
          <MapPin size={12} style={{ color: accent }} />
          <span style={{ fontSize: 12, color: "#9ca3af" }}>
            📍 <span className="font-semibold" style={{ color: "#e5e7eb" }}>{location}</span>
          </span>
          <div className="ml-auto flex items-center gap-2">
            {/* Toggle Lista / Mapa */}
            <div className="flex rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)", background: "#161616" }}>
              {(["lista", "mapa"] as const).map(m => (
                <button key={m} onClick={() => setViewMode(m)} className="px-3 py-1.5 text-xs font-bold transition-all" style={{ background: viewMode === m ? `${accent}20` : "transparent", color: viewMode === m ? accent : "#6b7280" }}>
                  {m === "lista" ? "≡ Lista" : "◎ Mapa"}
                </button>
              ))}
            </div>
            {stickySearch && (
              <button
                onClick={() => setShowFilters(p => !p)}
                className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{ background: (filtroAberto || filtroGratis || filtroPreco) ? `${accent}18` : "#161616", border: `1px solid ${(filtroAberto || filtroGratis || filtroPreco) ? `${accent}50` : "rgba(255,255,255,0.08)"}` }}
              >
                <SlidersHorizontal size={14} style={{ color: (filtroAberto || filtroGratis || filtroPreco) ? accent : "#6b7280" }} />
              </button>
            )}
          </div>
        </div>

        {stickySearch && (
          <>
            <div className="relative">
              <Search size={15} className="absolute" style={{ left: 12, top: "50%", transform: "translateY(-50%)", color: "#4b5563" }} />
              <input
                type="text"
                value={busca}
                onChange={e => setBusca(e.target.value)}
                onFocus={() => setBuscaFocus(true)}
                onBlur={() => setTimeout(() => setBuscaFocus(false), 200)}
                placeholder="Busque restaurantes, pratos..."
                className="w-full rounded-2xl outline-none"
                style={{ background: "#161616", border: `1px solid ${buscaFocus ? `${accent}60` : "rgba(255,255,255,0.08)"}`, color: "#fff", padding: "10px 36px 10px 36px", fontSize: 13, fontWeight: 500, transition: "border-color 0.2s" }}
              />
              {busca && <button onClick={() => setBusca("")} className="absolute" style={{ right: 10, top: "50%", transform: "translateY(-50%)", color: "#6b7280" }}><X size={14} /></button>}
              {buscaFocus && busca && (
                <Autocomplete query={busca} lojas={lojas} cats={cats} onSelect={val => { setBusca(val); setBuscaFocus(false); }} />
              )}
            </div>

            {showFilters && (
              <div className="mt-2 space-y-2">
                <div className="flex gap-2 overflow-x-auto pb-0.5" style={{ scrollbarWidth: "none" }}>
                  <span className="flex-shrink-0 text-xs font-semibold flex items-center" style={{ color: "#6b7280" }}>Ordenar:</span>
                  {([
                    { id: "relevancia" as SortMode, label: "Relevância" },
                    { id: "avaliacao"  as SortMode, label: "⭐ Avaliação" },
                    { id: "tempo"      as SortMode, label: "⏱ Mais rápido" },
                    { id: "taxa"       as SortMode, label: "💰 Menor taxa" },
                  ]).map(s => (
                    <button key={s.id} onClick={() => setSortMode(s.id)} className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all" style={{ background: sortMode === s.id ? `${accent}18` : "rgba(255,255,255,0.05)", color: sortMode === s.id ? accent : "#9ca3af", border: `1px solid ${sortMode === s.id ? `${accent}50` : "rgba(255,255,255,0.08)"}` }}>
                      {s.label}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2 overflow-x-auto pb-0.5" style={{ scrollbarWidth: "none" }}>
                  {[
                    { label: "Aberto agora",   active: filtroAberto, toggle: () => setFiltroAberto(p => !p) },
                    { label: "Entrega grátis", active: filtroGratis, toggle: () => setFiltroGratis(p => !p) },
                    { label: "⚡ Até 30 min",  active: filtroRapido, toggle: () => setFiltroRapido(p => !p) },
                  ].map(f => (
                    <button key={f.label} onClick={f.toggle} className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all" style={{ background: f.active ? `${accent}18` : "rgba(255,255,255,0.05)", color: f.active ? accent : "#9ca3af", border: `1px solid ${f.active ? `${accent}50` : "rgba(255,255,255,0.08)"}` }}>
                      {f.label}
                    </button>
                  ))}
                  {(["$", "$$", "$$$"] as const).map(p => (
                    <button key={p} onClick={() => setFiltroPreco(filtroPreco === p ? "" : p)} className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all" style={{ background: filtroPreco === p ? `${accent}18` : "rgba(255,255,255,0.05)", color: filtroPreco === p ? accent : "#9ca3af", border: `1px solid ${filtroPreco === p ? `${accent}50` : "rgba(255,255,255,0.08)"}` }}>
                      {p}
                    </button>
                  ))}
                  {userLat && ([2, 5, 10] as const).map(km => (
                    <button key={km} onClick={() => setFiltroDistKm(filtroDistKm === km ? null : km)} className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all" style={{ background: filtroDistKm === km ? `${accent}18` : "rgba(255,255,255,0.05)", color: filtroDistKm === km ? accent : "#9ca3af", border: `1px solid ${filtroDistKm === km ? `${accent}50` : "rgba(255,255,255,0.08)"}` }}>
                      📍 {km}km
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── BUSCA ATIVA ─────────────────────────────────────────────── */}
      {busca.trim() ? (
        <div style={{ padding: "20px 16px" }}>
          <p className="font-bold text-white mb-5" style={{ fontSize: 16 }}>
            {searching ? "Buscando..." : `${filtered.length + produtosBusca.length} resultado${filtered.length + produtosBusca.length !== 1 ? "s" : ""} para "${busca}"`}
          </p>

          {/* Produtos encontrados */}
          {produtosBusca.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <p className="font-bold mb-3" style={{ fontSize: 13, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                🍽️ Pratos ({produtosBusca.length})
              </p>
              <div className="flex flex-col gap-3">
                {produtosBusca.map(p => (
                  <Link key={p.id} href={`/loja/${p.empresa.slug}`} className="flex items-center gap-3 rounded-2xl" style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", padding: "10px 14px" }}>
                    {p.imagem_url
                      ? <img src={p.imagem_url} alt={p.nome} className="rounded-xl object-cover flex-shrink-0" style={{ width: 52, height: 52 }} />
                      : <div className="rounded-xl flex-shrink-0 flex items-center justify-center" style={{ width: 52, height: 52, background: "#1a1a1a", fontSize: 24 }}>🍽️</div>}
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-white truncate" style={{ fontSize: 14 }}>{p.nome}</p>
                      <p style={{ fontSize: 12, color: "#6b7280" }}>{p.empresa.nome}</p>
                    </div>
                    <span className="font-black flex-shrink-0" style={{ fontSize: 14, color: "#FF6A00" }}>
                      R$ {p.preco.toFixed(2).replace(".", ",")}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Lojas encontradas */}
          {filtered.length > 0 && (
            <div>
              <p className="font-bold mb-3" style={{ fontSize: 13, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                🏪 Lojas ({filtered.length})
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {filtered.map(l => <StoreCard key={l.id} loja={l} isFav={favoritos.has(l.id)} onToggleFav={toggleFav} onPreview={openPreview} accent={accent} hasFlashSale={flashSaleEmpresas.has(l.id)} />)}
              </div>
            </div>
          )}

          {!searching && filtered.length === 0 && produtosBusca.length === 0 && (
            <div className="flex flex-col items-center py-20 gap-3"><Package size={40} style={{ color: "#1f2937" }} /><p style={{ color: "#6b7280" }}>Nenhum resultado encontrado</p></div>
          )}
        </div>
      ) : (
        <>
          {/* ── HERO LANDING PAGE ─────────────────────────────────────── */}
          <div
            style={{
              position: "relative",
              padding: "36px 20px 32px",
              background: "linear-gradient(180deg, rgba(255,106,0,0.07) 0%, rgba(11,11,11,0) 100%)",
              overflow: "hidden",
            }}
          >
            {/* Glow background */}
            <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: "100%", height: "100%", background: `radial-gradient(ellipse 90% 70% at 50% 0%, ${accent}12 0%, transparent 70%)`, pointerEvents: "none" }} />

            <div style={{ position: "relative", maxWidth: 520, margin: "0 auto", textAlign: "center" }}>
              {/* Badge */}
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-5" style={{ background: `${accent}12`, border: `1px solid ${accent}28` }}>
                <Zap size={11} style={{ color: accent }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: accent, letterSpacing: "0.1em" }}>{hcfg.badge_text}</span>
              </div>

              <h1 style={{ fontSize: "clamp(32px, 9vw, 52px)", fontWeight: 900, lineHeight: 1.1, letterSpacing: "-0.03em", marginBottom: 14, color: "#fff" }}>
                {hcfg.hero_titulo}{" "}
                <span style={{ color: accent, textShadow: `0 0 32px ${accent}45` }}>{hcfg.hero_destaque}</span>
              </h1>

              <p style={{ fontSize: 15, color: "#9ca3af", marginBottom: 28, lineHeight: 1.6 }}>
                {hcfg.hero_subtitulo}
              </p>

              {/* Hero search bar */}
              <div ref={heroSearchRef} className="relative" style={{ marginBottom: 12 }}>
                <Search size={18} className="absolute" style={{ left: 16, top: "50%", transform: "translateY(-50%)", color: "#4b5563", zIndex: 1 }} />
                <input
                  type="text"
                  value={busca}
                  onChange={e => setBusca(e.target.value)}
                  onFocus={() => setBuscaFocus(true)}
                  onBlur={() => setTimeout(() => setBuscaFocus(false), 200)}
                  placeholder="O que você quer comer hoje?"
                  className="w-full rounded-2xl outline-none"
                  style={{ background: "#111", border: `2px solid ${buscaFocus ? `${accent}70` : "rgba(255,255,255,0.1)"}`, color: "#fff", padding: "14px 52px 14px 50px", fontSize: 14, fontWeight: 500, transition: "border-color 0.2s, box-shadow 0.2s", boxShadow: buscaFocus ? `0 0 0 4px ${accent}14` : "0 4px 24px rgba(0,0,0,0.4)" }}
                />
                <button
                  onClick={() => setShowFilters(p => !p)}
                  className="absolute flex items-center justify-center"
                  style={{ right: 10, top: "50%", transform: "translateY(-50%)", width: 38, height: 38, borderRadius: 14, background: (filtroAberto || filtroGratis || filtroRapido) ? `${accent}18` : "rgba(255,255,255,0.06)", border: `1px solid ${(filtroAberto || filtroGratis || filtroRapido) ? `${accent}50` : "rgba(255,255,255,0.08)"}` }}
                >
                  <SlidersHorizontal size={15} style={{ color: (filtroAberto || filtroGratis || filtroRapido) ? accent : "#6b7280" }} />
                </button>
                {busca && <button onClick={() => setBusca("")} className="absolute" style={{ right: 54, top: "50%", transform: "translateY(-50%)", color: "#6b7280" }}><X size={14} /></button>}
                {buscaFocus && busca && (
                  <Autocomplete query={busca} lojas={lojas} cats={cats} onSelect={val => { setBusca(val); setBuscaFocus(false); }} />
                )}
              </div>

              {showFilters && (
                <div className="space-y-2 mb-2">
                  <div className="flex gap-2 overflow-x-auto pb-0.5 justify-center" style={{ scrollbarWidth: "none" }}>
                    {([
                      { id: "relevancia" as SortMode, label: "Relevância" },
                      { id: "avaliacao"  as SortMode, label: "⭐ Avaliação" },
                      { id: "tempo"      as SortMode, label: "⏱ Mais rápido" },
                      { id: "taxa"       as SortMode, label: "💰 Menor taxa" },
                    ]).map(s => (
                      <button key={s.id} onClick={() => setSortMode(s.id)} className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all" style={{ background: sortMode === s.id ? `${accent}18` : "rgba(255,255,255,0.05)", color: sortMode === s.id ? accent : "#9ca3af", border: `1px solid ${sortMode === s.id ? `${accent}50` : "rgba(255,255,255,0.08)"}` }}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-0.5 justify-center" style={{ scrollbarWidth: "none" }}>
                    {[
                      { label: "Aberto agora",   active: filtroAberto, toggle: () => setFiltroAberto(p => !p) },
                      { label: "Entrega grátis", active: filtroGratis, toggle: () => setFiltroGratis(p => !p) },
                      { label: "⚡ Até 30 min",  active: filtroRapido, toggle: () => setFiltroRapido(p => !p) },
                    ].map(f => (
                      <button key={f.label} onClick={f.toggle} className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all" style={{ background: f.active ? `${accent}18` : "rgba(255,255,255,0.05)", color: f.active ? accent : "#9ca3af", border: `1px solid ${f.active ? `${accent}50` : "rgba(255,255,255,0.08)"}` }}>
                        {f.label}
                      </button>
                    ))}
                    {(["$", "$$", "$$$"] as const).map(p => (
                      <button key={p} onClick={() => setFiltroPreco(filtroPreco === p ? "" : p)} className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all" style={{ background: filtroPreco === p ? `${accent}18` : "rgba(255,255,255,0.05)", color: filtroPreco === p ? accent : "#9ca3af", border: `1px solid ${filtroPreco === p ? `${accent}50` : "rgba(255,255,255,0.08)"}` }}>
                        {p}
                      </button>
                    ))}
                    {userLat && ([2, 5, 10] as const).map(km => (
                      <button key={km} onClick={() => setFiltroDistKm(filtroDistKm === km ? null : km)} className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all" style={{ background: filtroDistKm === km ? `${accent}18` : "rgba(255,255,255,0.05)", color: filtroDistKm === km ? accent : "#9ca3af", border: `1px solid ${filtroDistKm === km ? `${accent}50` : "rgba(255,255,255,0.08)"}` }}>
                        📍 {km}km
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Quick category pills */}
              <div className="flex gap-2 overflow-x-auto pb-1 justify-center" style={{ scrollbarWidth: "none" }}>
                {cats.slice(0, 5).map(cat => {
                  const a = CAT_ACCENTS[cat.nome] ?? accent;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => setCategoriaAtiva(categoriaAtiva === cat.nome ? "" : cat.nome)}
                      className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
                      style={{ background: categoriaAtiva === cat.nome ? `${a}18` : "rgba(255,255,255,0.05)", color: categoriaAtiva === cat.nome ? a : "#6b7280", border: `1px solid ${categoriaAtiva === cat.nome ? `${a}40` : "rgba(255,255,255,0.07)"}` }}
                    >
                      <span style={{ fontSize: 14 }}>{cat.emoji}</span> {cat.nome}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Hero Banner carousel */}
            <div style={{ marginTop: 28, maxWidth: 560, margin: "28px auto 0" }}>
              <HeroBanner banners={banners} />
            </div>
          </div>

          {/* ── LIVE STATS ────────────────────────────────────────────── */}
          <div style={{ padding: "20px 0 0" }}>
            <LiveStats lojas={lojas} />
          </div>

          {/* ── BANNER DE LOCALIZAÇÃO ─────────────────────────────────── */}
          {locStatus === "idle" && (
            <div style={{ margin: "16px 16px 0" }}>
              <div className="flex items-center gap-3 rounded-2xl" style={{ padding: "12px 16px", background: "rgba(96,165,250,0.07)", border: "1px solid rgba(96,165,250,0.18)" }}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(96,165,250,0.12)" }}>
                  <MapPin size={16} style={{ color: "#60a5fa" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold" style={{ fontSize: 13, color: "#e5e7eb", marginBottom: 1 }}>Ativar localização</p>
                  <p style={{ fontSize: 11, color: "#6b7280" }}>Ver lojas perto de você e filtrar por distância</p>
                </div>
                <button
                  onClick={requestLocation}
                  className="flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold"
                  style={{ background: "rgba(96,165,250,0.15)", color: "#60a5fa", border: "1px solid rgba(96,165,250,0.3)" }}
                >
                  Ativar
                </button>
                <button onClick={() => setLocStatus("denied")} style={{ color: "#4b5563", flexShrink: 0 }}>
                  <X size={14} />
                </button>
              </div>
            </div>
          )}
          {locStatus === "asking" && (
            <div style={{ margin: "16px 16px 0" }}>
              <div className="flex items-center gap-3 rounded-2xl" style={{ padding: "12px 16px", background: "rgba(96,165,250,0.07)", border: "1px solid rgba(96,165,250,0.15)" }}>
                <div className="animate-spin w-5 h-5 rounded-full flex-shrink-0" style={{ border: "2px solid rgba(96,165,250,0.3)", borderTopColor: "#60a5fa" }} />
                <p style={{ fontSize: 13, color: "#9ca3af" }}>Obtendo sua localização...</p>
              </div>
            </div>
          )}
          {locStatus === "granted" && userLat && (
            <div style={{ margin: "16px 16px 0" }}>
              <div className="flex items-center gap-2 rounded-2xl" style={{ padding: "10px 14px", background: "rgba(34,197,94,0.07)", border: "1px solid rgba(34,197,94,0.15)" }}>
                <MapPin size={13} style={{ color: "#4ade80", flexShrink: 0 }} />
                <p style={{ fontSize: 12, color: "#4ade80", fontWeight: 600 }}>📍 {location} — localização ativa</p>
                <span style={{ fontSize: 11, color: "#374151", marginLeft: "auto" }}>Filtros de distância disponíveis ↑</span>
              </div>
            </div>
          )}

          {/* ── BANNER DE CATEGORIA TEMÁTICO ──────────────────────────── */}
          {categoriaAtiva && (() => {
            const cat = cats.find(c => c.nome === categoriaAtiva);
            const a = CAT_ACCENTS[categoriaAtiva] ?? "#FF6A00";
            return (
              <div style={{ padding: "20px 16px 0" }}>
                <div className="relative overflow-hidden rounded-3xl" style={{ background: `linear-gradient(135deg, ${a}20, ${a}08)`, border: `1px solid ${a}25`, padding: "22px 24px" }}>
                  <div style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", fontSize: 80, opacity: 0.18 }}>{cat?.emoji}</div>
                  <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 80% 50%, ${a}15 0%, transparent 65%)` }} />
                  <div style={{ position: "relative" }}>
                    <div className="flex items-center gap-2 mb-1">
                      <span style={{ fontSize: 28 }}>{cat?.emoji}</span>
                      <h2 className="font-black text-white" style={{ fontSize: 26 }}>{categoriaAtiva}</h2>
                    </div>
                    <p style={{ fontSize: 13, color: "#9ca3af" }}>
                      {filtered.length} restaurante{filtered.length !== 1 ? "s" : ""} disponíve{filtered.length !== 1 ? "is" : "l"}
                    </p>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ── FLASH SALES ───────────────────────────────────────────── */}
          <FlashSalesSection sales={flashSales} lojas={lojas} />

          {/* ── CATEGORIAS ────────────────────────────────────────────── */}
          <div style={{ marginTop: 24, marginBottom: 4 }}>
            <div style={{ padding: "0 16px", marginBottom: 12 }}>
              <p className="font-bold text-white" style={{ fontSize: 16 }}>Categorias</p>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2" style={{ padding: "0 16px", scrollbarWidth: "none" }}>
              {[{ id: "all", nome: "Todos", emoji: "🍽️" }, ...cats].map(cat => {
                const sel = cat.nome === "Todos" ? !categoriaAtiva : categoriaAtiva === cat.nome;
                const a   = cat.nome !== "Todos" ? (CAT_ACCENTS[cat.nome] ?? accent) : accent;
                return (
                  <button key={cat.id} onClick={() => {
                    const next = cat.nome === "Todos" ? "" : (sel ? "" : cat.nome);
                    setCategoriaAtiva(next);
                    if (next) {
                      setCatCounts(prev => {
                        const updated = { ...prev, [next]: (prev[next] ?? 0) + 1 };
                        try { localStorage.setItem(CAT_HIST_KEY, JSON.stringify(updated)); } catch {}
                        return updated;
                      });
                    }
                  }} className="flex flex-col items-center gap-2 flex-shrink-0">
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-200" style={{ background: sel ? `${a}18` : "rgba(255,255,255,0.05)", border: `1.5px solid ${sel ? a : "rgba(255,255,255,0.07)"}`, boxShadow: sel ? `0 0 16px ${a}25` : "none", fontSize: 28, transform: sel ? "scale(1.1)" : "scale(1)" }}>
                      {cat.emoji}
                    </div>
                    <span style={{ fontSize: 11, fontWeight: sel ? 700 : 500, color: sel ? a : "#6b7280", whiteSpace: "nowrap" }}>{cat.nome}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── HISTÓRICO ─────────────────────────────────────────────── */}
          {histLojas.length > 0 && !categoriaAtiva && (
            <section style={{ marginTop: 28 }}>
              <SectionHeader icon={<History size={18} style={{ color: "#9ca3af" }} />} title="Visitados recentemente" />
              <div className="flex gap-4 overflow-x-auto pb-2" style={{ padding: "0 16px", scrollbarWidth: "none" }}>
                {histLojas.map(l => (
                  <div key={l.id} style={{ minWidth: 200, maxWidth: 220, flexShrink: 0 }}>
                    <StoreCard loja={l} isFav={favoritos.has(l.id)} onToggleFav={toggleFav} onPreview={openPreview} accent={accent} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── PERTO DE VOCÊ ─────────────────────────────────────────── */}
          {proximas.length > 0 && (
            <section style={{ marginTop: 28 }}>
              <SectionHeader icon={<Navigation size={18} style={{ color: "#06b6d4" }} />} title="Perto de você" sub="Ordenado pela sua localização" onSeeAll={scrollToAll} />
              <div className="flex gap-4 overflow-x-auto pb-2" style={{ padding: "0 16px", scrollbarWidth: "none" }}>
                {proximas.map(({ loja, dist }) => (
                  <div key={loja.id} style={{ minWidth: 220, maxWidth: 240, flexShrink: 0, position: "relative" }}>
                    <div style={{ position: "absolute", top: 8, left: 8, zIndex: 10, background: "rgba(6,182,212,0.15)", border: "1px solid rgba(6,182,212,0.3)", borderRadius: 20, padding: "2px 8px", fontSize: 11, fontWeight: 700, color: "#06b6d4" }}>
                      📍 {dist < 1 ? `${Math.round(dist * 1000)}m` : `${dist.toFixed(1)}km`}
                    </div>
                    <StoreCard loja={loja} isFav={favoritos.has(loja.id)} onToggleFav={toggleFav} onPreview={openPreview} accent={accent} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── RESTAURANTE DO DIA ────────────────────────────────────── */}
          {restauranteDosDia && !categoriaAtiva && (
            <section style={{ marginTop: 28 }}>
              <SectionHeader icon={<span style={{ fontSize: 18 }}>👑</span>} title="Restaurante do Dia" sub="O mais pedido hoje no Vellox" />
              <RestauranteDosDia loja={restauranteDosDia} accent={accent} isFav={favoritos.has(restauranteDosDia.id)} onToggleFav={toggleFav} onPreview={openPreview} />
            </section>
          )}

          {/* ── DESTAQUES ─────────────────────────────────────────────── */}
          {destaques.length > 0 && (
            <section style={{ marginTop: 28 }}>
              <SectionHeader icon={<Flame size={18} style={{ color: "#FF6A00" }} />} title="Em Destaque" sub="Os favoritos da comunidade" onSeeAll={scrollToAll} />
              <FeaturedLandscapeCarousel destaques={destaques} favs={favoritos} onToggleFav={toggleFav} accent={accent} />
            </section>
          )}

          {/* ── CARROSSEL DE PRODUTOS ─────────────────────────────────── */}
          {produtos.length > 0 && (
            <section style={{ marginTop: 28 }}>
              <SectionHeader icon={<Sparkles size={18} style={{ color: "#fbbf24" }} />} title="Mais pedidos" sub="Pause passando o mouse" />
              <InfiniteProductCarousel produtos={produtos} accent={accent} />
            </section>
          )}

          {/* ── PARA VOCÊ ─────────────────────────────────────────────── */}
          {paraVoce && !categoriaAtiva && (
            <section style={{ marginTop: 28 }}>
              <SectionHeader
                icon={<Sparkles size={18} style={{ color: accent }} />}
                title="Para você"
                sub={`Você ama ${cats.find(c => c.nome === paraVoce.cat)?.emoji ?? ""} ${paraVoce.cat}`}
                onSeeAll={() => setCategoriaAtiva(paraVoce.cat)}
              />
              <div className="flex gap-4 overflow-x-auto pb-2" style={{ padding: "0 16px", scrollbarWidth: "none" }}>
                {paraVoce.lojas.map(l => (
                  <div key={l.id} style={{ minWidth: 220, maxWidth: 240, flexShrink: 0 }}>
                    <StoreCard loja={l} isFav={favoritos.has(l.id)} onToggleFav={toggleFav} onPreview={openPreview} accent={accent} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── ABRINDO EM BREVE ──────────────────────────────────────── */}
          {!categoriaAtiva && (
            <AbrindoEmBreve lojas={lojas} favs={favoritos} onToggleFav={toggleFav} onPreview={openPreview} accent={accent} />
          )}

          {/* ── NOVIDADES ─────────────────────────────────────────────── */}
          {novas.length > 0 && !categoriaAtiva && (
            <section style={{ marginTop: 28 }}>
              <SectionHeader icon={<Sparkles size={18} style={{ color: "#818cf8" }} />} title="Novidades" sub="Acabaram de chegar no Vellox" onSeeAll={scrollToAll} />
              <div className="flex gap-4 overflow-x-auto pb-2" style={{ padding: "0 16px", scrollbarWidth: "none" }}>
                {novas.map(l => (
                  <div key={l.id} style={{ minWidth: 220, maxWidth: 240, flexShrink: 0 }}>
                    <StoreCard loja={l} isFav={favoritos.has(l.id)} onToggleFav={toggleFav} onPreview={openPreview} accent={accent} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── TODAS AS LOJAS ─────────────────────────────────────────── */}
          <section style={{ marginTop: 28 }} id="lojas" ref={el => { allStoresRef.current = el; }}>
            <SectionHeader icon={<Zap size={18} style={{ color: "#fbbf24" }} />} title={categoriaAtiva || "Todas as Lojas"} count={filtered.length} />
            {(categoriaAtiva || filtroAberto || filtroGratis || filtroRapido || filtroPreco || filtroDistKm || sortMode !== "relevancia") && (
              <button onClick={() => { setCategoriaAtiva(""); setFiltroAberto(false); setFiltroGratis(false); setFiltroRapido(false); setFiltroPreco(""); setFiltroDistKm(null); setSortMode("relevancia"); }} className="flex items-center gap-1.5 mx-4 mb-4 px-3 py-1.5 rounded-full text-xs font-semibold" style={{ background: "rgba(255,255,255,0.05)", color: "#9ca3af", border: "1px solid rgba(255,255,255,0.08)" }}>
                <X size={11} /> Limpar filtros
              </button>
            )}
            {viewMode === "mapa" ? (
              <div style={{ padding: "0 16px" }}>
                <MapLeaflet lojas={filtered} userLat={userLat} userLng={userLng} accent={accent} onPreview={openPreview} />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center py-16 gap-4">
                <Package size={40} style={{ color: "#1f2937" }} />
                <p style={{ color: "#6b7280", fontSize: 14 }}>{categoriaAtiva ? `Nenhuma loja em "${categoriaAtiva}"` : "Nenhuma loja disponível"}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" style={{ padding: "0 16px" }}>
                {filtered.map(l => <StoreCard key={l.id} loja={l} isFav={favoritos.has(l.id)} onToggleFav={toggleFav} onPreview={openPreview} accent={accent} hasFlashSale={flashSaleEmpresas.has(l.id)} />)}
              </div>
            )}
          </section>

          {/* ── TRUST BADGES ──────────────────────────────────────────── */}
          <section style={{ marginTop: 36, marginBottom: 8 }}>
            <div style={{ padding: "0 16px", marginBottom: 14 }}><p className="font-bold text-white" style={{ fontSize: 16 }}>Por que Vellox?</p></div>
            <TrustBadges accent={accent} />
          </section>

          <div style={{ padding: "20px 16px 8px", textAlign: "center" }}>
            <p style={{ fontSize: 12, color: "#1f2937" }}>Vellox © 2025 · appvellox.online</p>
          </div>
        </>
      )}

      <BottomNav active={activeTab} onChange={setActiveTab} accent={accent} />

      {/* Preview Modal */}
      {previewLoja && (
        <StorePreviewModal
          loja={previewLoja}
          isFav={favoritos.has(previewLoja.id)}
          onToggleFav={toggleFav}
          onClose={() => setPreviewLoja(null)}
          accent={accent}
        />
      )}
    </div>
  );
}
