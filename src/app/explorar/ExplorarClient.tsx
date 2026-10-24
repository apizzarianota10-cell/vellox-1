"use client";

// Vitrine pública /explorar — tema claro premium.
// Peças visuais em ./componentes.tsx, helpers puros em ./utils.ts.

import { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import "leaflet/dist/leaflet.css";
import {
  Search, MapPin, X, List, Map as MapIcon, ArrowLeft, Heart, ShoppingBag,
  ChevronRight, LocateFixed, ShieldCheck, BadgeCheck, Bike, Store, SearchX,
} from "lucide-react";
import type { Loja, Produto, Banner, Categoria, FlashSale, HeroConfig, Ordem, Tab } from "./tipos";
import {
  C, saudacao, dataEditorial, haversine, minutosEntrega, isGratis, isNew, statusLoja,
  lojaNaCategoria, lojaCasaBusca, fotoCategoria, FOTO_TODOS, CATEGORIAS_PADRAO, textoTaxa,
} from "./utils";
import {
  EstilosExplorar, Secao, Vazio, StoreCard, StoreCardSkeleton, CategoriasRail, Chip,
  DestaquesCarrossel, PratoCard, PratoCardSkeleton, PecaDeNovoCard, AbrindoEmBreveLista,
  OfertaCard, LinhaLoja, LinhaPrato, LinhaSkeleton, BottomNav, type Slide,
} from "./componentes";
import ContaCliente from "./ContaCliente";

const MapLeaflet = dynamic(() => import("./MapLeaflet"), {
  ssr: false,
  loading: () => (
    <div className="vx-skel flex items-center justify-center" style={{ height: "min(62vh, 520px)", borderRadius: 24 }}>
      <p style={{ fontSize: 13, color: C.ink3, fontWeight: 600 }}>Carregando mapa…</p>
    </div>
  ),
});

interface Props { lojas: Loja[]; banners: Banner[]; categorias: Categoria[]; heroConfig?: HeroConfig }

const FAV_KEY = "vellox-explorar-favs";
const ULTIMO_PREFIXO = "vellox-ultimo-pedido:";

const HERO_DEFAULTS: HeroConfig = {
  badge_text:     "DESCUBRA · PEÇA · RECEBA",
  hero_titulo:    "Peça comida no",
  hero_destaque:  "seu jeito",
  hero_subtitulo: "Descubra restaurantes incríveis e peça com entrega rápida",
  accent_color:   "#E4002B",
};

export default function ExplorarClient({ lojas, banners, categorias, heroConfig }: Props) {
  const hcfg = heroConfig ?? HERO_DEFAULTS;

  const [tab,            setTab]            = useState<Tab>("explorar");
  const [categoriaAtiva, setCategoriaAtiva] = useState("");
  const [fAberto,        setFAberto]        = useState(false);
  const [fGratis,        setFGratis]        = useState(false);
  const [ordem,          setOrdem]          = useState<Ordem>("relevancia");
  const [busca,          setBusca]          = useState("");
  const [favoritos,      setFavoritos]      = useState<Set<string>>(new Set());
  const [location,       setLocation]       = useState("sua cidade");
  const [locStatus,      setLocStatus]      = useState<"idle" | "asking" | "granted" | "denied">("idle");
  const [userLat,        setUserLat]        = useState<number | null>(null);
  const [userLng,        setUserLng]        = useState<number | null>(null);
  const [produtos,       setProdutos]       = useState<Produto[] | null>(null);
  const [flashSales,     setFlashSales]     = useState<FlashSale[]>([]);
  const [produtosBusca,  setProdutosBusca]  = useState<Produto[]>([]);
  const [buscandoPratos, setBuscandoPratos] = useState(false);
  const [viewMode,       setViewMode]       = useState<"lista" | "mapa">("lista");
  const [agora,          setAgora]          = useState<Date | null>(null);
  const [ultimos,        setUltimos]        = useState<{ empresaId: string; quando: string; itens: number }[]>([]);
  const [stuck,          setStuck]          = useState(false);

  const sentinelRef = useRef<HTMLDivElement>(null);
  const buscaRef    = useRef<HTMLInputElement>(null);

  // ── Localização (mesma lógica de antes: Nominatim para bairro/cidade) ──
  function requestLocation() {
    if (!("geolocation" in navigator)) { setLocStatus("denied"); return; }
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
      { timeout: 8000 },
    );
  }

  useEffect(() => {
    // Link direto para a conta: /explorar?aba=perfil | ?aba=pedidos
    const aba = new URLSearchParams(window.location.search).get("aba");
    if (aba === "perfil" || aba === "pedidos") setTab(aba);

    setAgora(new Date());
    const relogio = setInterval(() => setAgora(new Date()), 60_000);

    try {
      const fSaved = localStorage.getItem(FAV_KEY);
      if (fSaved) setFavoritos(new Set(JSON.parse(fSaved) as string[]));
      // "Peça de novo": a página da loja grava o último pedido deste aparelho
      const lista: { empresaId: string; quando: string; itens: number }[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k?.startsWith(ULTIMO_PREFIXO)) continue;
        try {
          const v = JSON.parse(localStorage.getItem(k) ?? "null");
          if (v && Array.isArray(v.itens) && v.itens.length) {
            const itens = v.itens.reduce((a: number, it: { q?: number }) => a + (Number(it?.q) || 1), 0);
            lista.push({ empresaId: k.slice(ULTIMO_PREFIXO.length), quando: String(v.quando ?? ""), itens });
          }
        } catch { /* item corrompido */ }
      }
      lista.sort((a, b) => (Date.parse(b.quando) || 0) - (Date.parse(a.quando) || 0));
      setUltimos(lista);
    } catch { /* sem storage */ }

    // Geolocalização — só pede de novo se a permissão já foi concedida
    if ("geolocation" in navigator) {
      if (navigator.permissions) {
        navigator.permissions.query({ name: "geolocation" }).then(result => {
          if (result.state === "granted") requestLocation();
          else if (result.state === "prompt") setLocStatus("idle");
          else setLocStatus("denied");
        }).catch(() => requestLocation());
      } else {
        requestLocation();
      }
    }

    fetch("/api/explorar/produtos").then(r => r.json()).then(d => setProdutos(d.produtos ?? [])).catch(() => setProdutos([]));
    fetch("/api/flash-sales").then(r => r.json()).then(d => setFlashSales(d.flash_sales ?? [])).catch(() => {});

    return () => clearInterval(relogio);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sombra na busca fixa quando ela "gruda" no topo
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting), { threshold: 0 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [tab]);

  // Busca de pratos no servidor (lojas filtram local, na hora)
  useEffect(() => {
    const q = busca.trim();
    if (q.length < 2) { setProdutosBusca([]); setBuscandoPratos(false); return; }
    setBuscandoPratos(true);
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/explorar?somente=produtos&q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then(r => r.json())
        .then(d => { setProdutosBusca(d.produtos_busca ?? []); setBuscandoPratos(false); })
        .catch(e => { if ((e as Error).name !== "AbortError") setBuscandoPratos(false); });
    }, 160);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [busca]);

  function toggleFav(id: string) {
    setFavoritos(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem(FAV_KEY, JSON.stringify([...next])); } catch {}
      return next;
    });
  }

  function trocarTab(t: Tab) {
    setTab(t);
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }

  function limparFiltros() {
    setCategoriaAtiva(""); setFAberto(false); setFGratis(false); setOrdem("relevancia");
  }

  // ── Derivados ─────────────────────────────────────────────────────────────
  const lojaPorId = useMemo(() => new Map(lojas.map(l => [l.id, l])), [lojas]);
  const ofertaIds = useMemo(() => new Set(flashSales.map(s => s.empresa_id)), [flashSales]);
  const buscando  = busca.trim().length > 0;
  const temFiltro = !!categoriaAtiva || fAberto || fGratis || ordem !== "relevancia";

  const aplicarFiltros = useMemo(() => (lista: Loja[]) => {
    let out = lista;
    if (categoriaAtiva) out = out.filter(l => lojaNaCategoria(l, categoriaAtiva));
    if (fAberto) out = out.filter(l => l.config?.aberto !== false);
    if (fGratis) out = out.filter(l => isGratis(l.config?.taxa_entrega));
    const aberta = (l: Loja) => (l.config?.aberto !== false ? 1 : 0);
    return [...out].sort((a, b) => {
      const ab = aberta(b) - aberta(a);
      if (ab !== 0) return ab;
      if (ordem === "rapidos") {
        const t = minutosEntrega(a.config?.tempo_entrega) - minutosEntrega(b.config?.tempo_entrega);
        if (t !== 0) return t;
      }
      if (ordem === "pedidos") {
        const p = b.avaliacaoTotal - a.avaliacaoTotal;
        if (p !== 0) return p;
        const m = (b.avaliacaoMedia ?? 0) - (a.avaliacaoMedia ?? 0);
        if (m !== 0) return m;
      }
      const d = (b.destaque ? 1 : 0) - (a.destaque ? 1 : 0);
      if (d !== 0) return d;
      return b.avaliacaoTotal - a.avaliacaoTotal;
    });
  }, [categoriaAtiva, fAberto, fGratis, ordem]);

  const filtradas   = useMemo(() => aplicarFiltros(lojas), [aplicarFiltros, lojas]);
  const lojasBusca  = useMemo(() => buscando ? aplicarFiltros(lojas.filter(l => lojaCasaBusca(l, busca))) : [], [buscando, aplicarFiltros, lojas, busca]);
  const abertas     = useMemo(() => filtradas.filter(l => l.config?.aberto !== false), [filtradas]);
  const fechadas    = useMemo(() => {
    return lojas
      .filter(l => l.config?.aberto === false)
      .map(l => ({ l, min: statusLoja(l, agora).abreEmMin }))
      .sort((a, b) => (a.min ?? 1e9) - (b.min ?? 1e9))
      .map(x => x.l);
  }, [lojas, agora]);
  const favs        = useMemo(() => lojas.filter(l => favoritos.has(l.id)), [lojas, favoritos]);
  const pecaDeNovo  = useMemo(() => ultimos.filter(u => lojaPorId.has(u.empresaId)).slice(0, 8), [ultimos, lojaPorId]);
  const ofertas     = useMemo(() => flashSales.filter(s => lojaPorId.has(s.empresa_id)), [flashSales, lojaPorId]);

  const proximas = useMemo(() => {
    if (userLat == null || userLng == null) return [];
    return lojas
      .filter(l => l.lat != null && l.lng != null)
      .map(l => ({ loja: l, dist: haversine(userLat, userLng, l.lat!, l.lng!) }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 8);
  }, [lojas, userLat, userLng]);
  const distPorId = useMemo(() => new Map(proximas.map(p => [p.loja.id, p.dist])), [proximas]);

  const catsUI = useMemo(() => {
    const base = (categorias.length ? categorias : CATEGORIAS_PADRAO).map(c => ({
      id: c.id, nome: c.nome, foto: fotoCategoria(c.nome), qtd: lojas.filter(l => lojaNaCategoria(l, c.nome)).length,
    }));
    const comLoja = base.filter(c => c.qtd > 0);
    const lista = comLoja.length >= 3 ? comLoja : base;
    return [{ id: "todos", nome: "Todos", foto: FOTO_TODOS, qtd: lojas.length }, ...lista];
  }, [categorias, lojas]);

  const slides: Slide[] = useMemo(() => {
    const out: Slide[] = [];
    for (const b of banners) {
      if (!b.imagem_url) continue;
      const externo = !!b.link_url && /^https?:\/\//.test(b.link_url);
      out.push({ id: `b-${b.id}`, titulo: b.titulo, sub: b.subtitulo ?? "", imagem: b.imagem_url, cor: b.cor_fundo, href: b.link_url || "#lojas", externo, selo: "Vellox indica" });
    }
    const ordenadas = [...lojas].sort((a, b) =>
      (b.destaque ? 1 : 0) - (a.destaque ? 1 : 0) ||
      (b.config?.aberto !== false ? 1 : 0) - (a.config?.aberto !== false ? 1 : 0) ||
      b.avaliacaoTotal - a.avaliacaoTotal);
    const comBanner = ordenadas.filter(l => l.config?.banner_url);
    const fonte = comBanner.length ? comBanner : ordenadas.slice(0, 4);
    for (const l of fonte.slice(0, 8)) {
      out.push({
        id: l.id, titulo: l.nome, imagem: l.config?.banner_url ?? null, cor: l.config?.cor_principal ?? null,
        sub: textoTaxa(l.config?.taxa_entrega ?? null), href: `/loja/${l.slug}`, loja: l,
        selo: l.destaque ? "Destaque" : isNew(l.created_at) ? "Novidade" : "Vellox indica",
      });
    }
    return out;
  }, [banners, lojas]);

  const totalAbertas = lojas.filter(l => l.config?.aberto !== false).length;

  // ── Blocos reutilizados ───────────────────────────────────────────────────
  const cardDe = (l: Loja) => (
    <StoreCard key={l.id} loja={l} agora={agora} fav={favoritos.has(l.id)} onFav={toggleFav}
      dist={distPorId.get(l.id) ?? null} oferta={ofertaIds.has(l.id)} />
  );

  const chips = (
    <div className="vx-rail" role="group" aria-label="Filtros rápidos" style={{ gap: 8, paddingTop: 6, paddingBottom: 10, scrollSnapType: "none" }}>
      <Chip ativo={fAberto} onClick={() => setFAberto(v => !v)}>Aberto agora</Chip>
      <Chip ativo={fGratis} onClick={() => setFGratis(v => !v)}>Entrega grátis</Chip>
      <Chip ativo={ordem === "rapidos"} onClick={() => setOrdem(o => o === "rapidos" ? "relevancia" : "rapidos")} label="Ordenar: mais rápidos">Mais rápidos</Chip>
      <Chip ativo={ordem === "pedidos"} onClick={() => setOrdem(o => o === "pedidos" ? "relevancia" : "pedidos")} label="Ordenar: mais pedidos">Mais pedidos</Chip>
      {temFiltro && (
        <button onClick={limparFiltros} className="vx-press flex items-center gap-1 flex-shrink-0"
          style={{ minHeight: 44, padding: "0 12px", fontSize: 13.5, fontWeight: 700, color: C.redDark, whiteSpace: "nowrap" }}>
          <X size={14} /> Limpar
        </button>
      )}
    </div>
  );

  // ── Abas Favoritos / Perfil ───────────────────────────────────────────────
  if (tab === "favoritos" || tab === "perfil" || tab === "pedidos") {
    return (
      <div className="vx-root" style={{ background: C.bg, minHeight: "100dvh", paddingBottom: 120, color: C.ink, overflowX: "clip" }}>
        <EstilosExplorar />
        <div className="vx-wrap" style={{ paddingTop: 24 }}>
          <div className="flex items-center gap-3" style={{ marginBottom: 22 }}>
            <button onClick={() => trocarTab("explorar")} aria-label="Voltar para Explorar" className="vx-press flex items-center justify-center"
              style={{ width: 44, height: 44, borderRadius: 999, background: C.surface, boxShadow: C.shadow1, border: `1px solid ${C.line}` }}>
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 style={{ fontSize: 26, fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1.1 }}>{tab === "favoritos" ? "Favoritos" : tab === "pedidos" ? "Meus pedidos" : "Perfil"}</h1>
              {tab === "favoritos" && <p style={{ fontSize: 13, color: C.ink3, marginTop: 2 }}>{favs.length} loja{favs.length !== 1 ? "s" : ""} salva{favs.length !== 1 ? "s" : ""} neste aparelho</p>}
            </div>
          </div>

          {tab === "pedidos" ? (
            <div style={{ maxWidth: 960 }}><ContaCliente vista="pedidos" /></div>
          ) : tab === "favoritos" ? (
            favs.length === 0 ? (
              <Vazio icone={<Heart size={28} />} titulo="Nenhum favorito ainda"
                texto="Toque no coração de uma loja para guardar aqui e achar rapidinho depois."
                acao={{ label: "Explorar lojas", onClick: () => trocarTab("explorar") }} />
            ) : (
              <div className="vx-grid">{favs.map(cardDe)}</div>
            )
          ) : (
            <div className="grid gap-3" style={{ maxWidth: 560 }}>
              <ContaCliente vista="perfil" onVerPedidos={() => trocarTab("pedidos")} fallback={
              <div className="flex items-center gap-4" style={{ background: C.surface, borderRadius: 24, padding: 18, boxShadow: C.shadow2 }}>
                <div className="flex items-center justify-center" style={{ width: 56, height: 56, borderRadius: 999, background: C.redSoft, color: C.red, fontWeight: 900, fontSize: 22 }}>V</div>
                <div className="min-w-0">
                  <p style={{ fontSize: 17, fontWeight: 800 }}>Olá!</p>
                  <p className="truncate" style={{ fontSize: 13, color: C.ink3 }}>
                    {locStatus === "granted" ? location : "Peça sem cadastro — seus dados ficam neste aparelho"}
                  </p>
                </div>
              </div>
              } />
              {[
                { label: "Meus pedidos", sub: "Acompanhe e encontre pedidos", icon: ShoppingBag, onClick: () => trocarTab("pedidos") },
                { label: "Favoritos", sub: `${favs.length} loja${favs.length !== 1 ? "s" : ""}`, icon: Heart, onClick: () => trocarTab("favoritos") },
                ...(locStatus !== "granted" ? [{ label: "Ativar localização", sub: "Ver lojas perto de você", icon: LocateFixed, onClick: requestLocation }] : []),
                { label: "Tem um restaurante?", sub: "Venda pelo Vellox", icon: Store, href: "/" },
              ].map(it => {
                const Icon = it.icon;
                const inner = (
                  <span className="vx-card flex items-center gap-3 w-full text-left" style={{ background: C.surface, borderRadius: 20, padding: "14px 16px", minHeight: 64, boxShadow: C.shadow1, border: `1px solid ${C.lineSoft}` }}>
                    <span className="flex items-center justify-center flex-shrink-0" style={{ width: 40, height: 40, borderRadius: 12, background: C.chip }}><Icon size={18} /></span>
                    <span className="flex-1 min-w-0">
                      <span className="block" style={{ fontSize: 15, fontWeight: 800 }}>{it.label}</span>
                      <span className="block truncate" style={{ fontSize: 12.5, color: C.ink3 }}>{it.sub}</span>
                    </span>
                    <ChevronRight size={18} style={{ color: C.ink3 }} />
                  </span>
                );
                return "href" in it && it.href
                  ? <Link key={it.label} href={it.href}>{inner}</Link>
                  : <button key={it.label} onClick={"onClick" in it ? it.onClick : undefined} className="w-full">{inner}</button>;
              })}
            </div>
          )}
        </div>
        <BottomNav active={tab} onChange={trocarTab} />
      </div>
    );
  }

  // ── Página principal ──────────────────────────────────────────────────────
  return (
    <div className="vx-root" style={{ background: C.bg, minHeight: "100dvh", paddingBottom: 120, color: C.ink, overflowX: "clip" }}>
      <EstilosExplorar />

      {/* ── Topo editorial ─────────────────────────────────────────── */}
      <header className="relative" style={{ background: `radial-gradient(90% 120% at 100% 0%, #fff3d6 0%, rgba(255,243,214,0) 55%), radial-gradient(70% 90% at 0% 0%, #fde8ec 0%, rgba(253,232,236,0) 60%)` }}>
        <div className="vx-wrap" style={{ paddingTop: 16 }}>
          <div className="flex items-center gap-2">
            <Link href="/explorar" className="flex items-center gap-2 flex-shrink-0" aria-label="Vellox — início" style={{ minHeight: 44 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icon-vellox.svg" alt="" width={34} height={34} style={{ borderRadius: 10, boxShadow: "0 4px 12px rgba(228,0,43,0.25)" }} />
              <span className="hidden min-[400px]:inline" style={{ fontSize: 19, fontWeight: 900, letterSpacing: "-0.04em", color: C.ink }}>Vellox</span>
            </Link>

            <button onClick={() => { if (locStatus !== "granted") requestLocation(); }}
              aria-label={locStatus === "granted" ? `Sua localização: ${location}` : "Ativar localização"}
              className="vx-press flex items-center gap-1.5 min-w-0 ml-auto"
              style={{ minHeight: 44, padding: "0 14px 0 10px", borderRadius: 999, background: "rgba(255,255,255,0.8)", border: `1px solid ${C.line}`, boxShadow: C.shadow1, maxWidth: "62%" }}>
              {locStatus === "asking"
                ? <span className="animate-spin flex-shrink-0" style={{ width: 14, height: 14, borderRadius: 99, border: `2px solid ${C.line}`, borderTopColor: C.red }} />
                : <MapPin size={16} style={{ color: C.red, flexShrink: 0 }} />}
              <span className="truncate" style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>
                {locStatus === "granted" ? location : locStatus === "asking" ? "Localizando…" : locStatus === "denied" ? "Sua região" : "Ativar localização"}
              </span>
            </button>

            <div className="flex flex-shrink-0" role="group" aria-label="Modo de visualização"
              style={{ padding: 3, borderRadius: 999, background: "rgba(255,255,255,0.8)", border: `1px solid ${C.line}`, boxShadow: C.shadow1 }}>
              {([["lista", List, "Ver em lista"], ["mapa", MapIcon, "Ver no mapa"]] as const).map(([m, Icon, label]) => (
                <button key={m} onClick={() => setViewMode(m)} aria-pressed={viewMode === m} aria-label={label}
                  className="vx-press flex items-center justify-center"
                  style={{ width: 40, height: 38, borderRadius: 999, background: viewMode === m ? C.ink : "transparent", color: viewMode === m ? "#fff" : C.ink2 }}>
                  <Icon size={17} />
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-end justify-between gap-6" style={{ padding: "26px 0 20px" }}>
            <div className="min-w-0 vx-in">
              <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: C.redDark }}>
                {agora ? dataEditorial(agora) : hcfg.badge_text}
              </p>
              <h1 style={{ marginTop: 10, fontSize: "clamp(34px, 9.4vw, 60px)", fontWeight: 900, lineHeight: 1.02, letterSpacing: "-0.045em", color: C.ink }}>
                {agora ? saudacao(agora) : "Olá"},<br />
                bateu a{" "}
                <span style={{ fontFamily: C.serif, fontStyle: "italic", fontWeight: 700, color: C.red, letterSpacing: "-0.02em", position: "relative", zIndex: 0, display: "inline-block", whiteSpace: "nowrap" }}>
                  fome?
                  <span aria-hidden style={{ position: "absolute", left: "-2%", right: "-4%", bottom: "0.04em", height: "0.2em", background: C.yellow, borderRadius: 99, zIndex: -1, opacity: 0.9 }} />
                </span>
              </h1>
              <p style={{ marginTop: 12, fontSize: 15, color: C.ink2, lineHeight: 1.5, maxWidth: 460 }}>{hcfg.hero_subtitulo}</p>
              <p className="flex items-center flex-wrap" style={{ marginTop: 12, gap: "4px 10px", fontSize: 13, color: C.ink2 }}>
                <span className="flex items-center gap-1.5" style={{ fontWeight: 700, color: C.green }}>
                  <span className="animate-pulse" style={{ width: 7, height: 7, borderRadius: 99, background: "#16a34a" }} />
                  {totalAbertas} aberta{totalAbertas !== 1 ? "s" : ""} agora
                </span>
                <span aria-hidden style={{ color: C.ink3 }}>·</span>
                <span>{lojas.length} loja{lojas.length !== 1 ? "s" : ""} no Vellox</span>
              </p>
            </div>
            {/* Colagem editorial (desktop) */}
            <div aria-hidden className="hidden md:block relative flex-shrink-0" style={{ width: 300, height: 220 }}>
              {[
                { src: fotoCategoria("Pizza"),      s: 150, x: 0,   y: 40, r: -6 },
                { src: fotoCategoria("Hambúrguer"), s: 130, x: 140, y: 0,  r: 5 },
                { src: fotoCategoria("Bebidas"),    s: 110, x: 170, y: 110, r: -3 },
              ].map((f, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={f.src.replace("w=240&h=240", "w=320&h=320")} alt="" style={{
                  position: "absolute", left: f.x, top: f.y, width: f.s, height: f.s, borderRadius: 999, objectFit: "cover",
                  border: "5px solid #fff", boxShadow: C.shadow3, transform: `rotate(${f.r}deg)`,
                }} />
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* ── Busca fixa ─────────────────────────────────────────────── */}
      <div ref={sentinelRef} aria-hidden style={{ height: 1 }} />
      <div className="sticky top-0 z-40" style={{
        background: stuck ? "rgba(247,247,245,0.88)" : "transparent",
        backdropFilter: stuck ? "saturate(1.6) blur(18px)" : undefined, WebkitBackdropFilter: stuck ? "saturate(1.6) blur(18px)" : undefined,
        borderBottom: `1px solid ${stuck ? C.line : "transparent"}`,
        transition: "background .25s, border-color .25s",
      }}>
        <div className="vx-wrap" style={{ paddingTop: 10, paddingBottom: 10 }}>
          <div role="search" className="relative flex items-center" style={{
            height: 58, borderRadius: 20, background: C.surface, border: `1px solid ${C.line}`,
            boxShadow: stuck ? "0 8px 24px rgba(16,12,8,0.10)" : C.shadow2, transition: "box-shadow .25s",
          }}>
            <Search size={20} aria-hidden style={{ position: "absolute", left: 18, color: C.ink2 }} />
            <input
              ref={buscaRef}
              type="search"
              inputMode="search"
              enterKeyHint="search"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar lojas ou pratos"
              aria-label="Buscar lojas ou pratos"
              autoComplete="off"
              className="w-full h-full bg-transparent outline-none"
              style={{ padding: "0 52px 0 50px", fontSize: 16, fontWeight: 600, color: C.ink, borderRadius: 20 }}
            />
            {busca && (
              <button onClick={() => { setBusca(""); buscaRef.current?.focus(); }} aria-label="Limpar busca"
                className="vx-press absolute flex items-center justify-center" style={{ right: 7, width: 44, height: 44, borderRadius: 999, background: C.chip }}>
                <X size={17} />
              </button>
            )}
          </div>
        </div>
      </div>

      <main className="vx-wrap">
        {buscando ? (
          // ── Resultados da busca ───────────────────────────────────
          <div aria-live="polite">
            {chips}
            <div style={{ marginTop: 10 }}>
              <p style={{ fontSize: 13, color: C.ink3 }}>
                Resultados para <strong style={{ color: C.ink }}>“{busca.trim()}”</strong>
                {categoriaAtiva && <> em <strong style={{ color: C.ink }}>{categoriaAtiva}</strong></>}
              </p>
            </div>

            {lojasBusca.length > 0 && (
              <Secao titulo={`Lojas · ${lojasBusca.length}`} className="vx-in">
                <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {lojasBusca.map(l => <LinhaLoja key={l.id} loja={l} agora={agora} />)}
                </div>
              </Secao>
            )}

            {(buscandoPratos || produtosBusca.length > 0) && (
              <Secao titulo={buscandoPratos && !produtosBusca.length ? "Pratos" : `Pratos · ${produtosBusca.length}`} sub="Toque para abrir a loja">
                <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {buscandoPratos && !produtosBusca.length
                    ? [0, 1, 2].map(i => <LinhaSkeleton key={i} />)
                    : produtosBusca.map(p => <LinhaPrato key={p.id} p={p} />)}
                </div>
              </Secao>
            )}

            {!buscandoPratos && lojasBusca.length === 0 && produtosBusca.length === 0 && (
              <div style={{ marginTop: 28 }}>
                <Vazio icone={<SearchX size={28} />} titulo={`Nada encontrado para “${busca.trim()}”`}
                  texto={temFiltro ? "Tente remover alguns filtros ou buscar por outro nome." : "Confira a grafia ou busque por outro prato ou loja."}
                  acao={temFiltro ? { label: "Limpar filtros", onClick: limparFiltros } : { label: "Limpar busca", onClick: () => setBusca("") }} />
              </div>
            )}
          </div>
        ) : (
          <>
            {/* ── Categorias + filtros ─────────────────────────────── */}
            <div style={{ marginTop: 8 }}>
              <CategoriasRail cats={catsUI} ativa={categoriaAtiva}
                onSelect={nome => setCategoriaAtiva(nome === "Todos" ? "" : (categoriaAtiva === nome ? "" : nome))} />
            </div>
            {chips}

            {viewMode === "mapa" ? (
              // ── Mapa ─────────────────────────────────────────────
              <Secao titulo="Lojas no mapa" sub={`${filtradas.length} loja${filtradas.length !== 1 ? "s" : ""}${categoriaAtiva ? ` em ${categoriaAtiva}` : ""}`}
                acao={{ label: "Ver lista", onClick: () => setViewMode("lista") }}>
                <MapLeaflet key={filtradas.map(l => l.id).join(",")} lojas={filtradas} userLat={userLat} userLng={userLng}
                  accent={hcfg.accent_color} height="min(62vh, 520px)" />
                {filtradas.length > 0 && <div className="vx-grid" style={{ marginTop: 22 }}>{filtradas.map(cardDe)}</div>}
              </Secao>
            ) : temFiltro ? (
              // ── Lista filtrada ───────────────────────────────────
              <Secao titulo={categoriaAtiva || "Lojas filtradas"}
                sub={`${filtradas.length} loja${filtradas.length !== 1 ? "s" : ""}${ordem === "rapidos" ? " · mais rápidas primeiro" : ordem === "pedidos" ? " · mais pedidas primeiro" : ""}`}>
                {filtradas.length === 0 ? (
                  <Vazio titulo={categoriaAtiva ? `Ainda não há lojas de ${categoriaAtiva}` : "Nenhuma loja com esses filtros"}
                    texto="Novas lojas entram no Vellox toda semana. Enquanto isso, veja as outras opções."
                    acao={{ label: "Limpar filtros", onClick: limparFiltros }} />
                ) : (
                  <div className="vx-grid">{filtradas.map(cardDe)}</div>
                )}
              </Secao>
            ) : (
              // ── Vitrine editorial ────────────────────────────────
              <>
                {pecaDeNovo.length > 0 && (
                  <Secao titulo="Peça de novo" sub="Seus últimos pedidos neste aparelho">
                    <div className="vx-rail">
                      {pecaDeNovo.map(u => (
                        <PecaDeNovoCard key={u.empresaId} loja={lojaPorId.get(u.empresaId)!} quando={u.quando} itens={u.itens} agora={agora} />
                      ))}
                    </div>
                  </Secao>
                )}

                {favs.length > 0 && (
                  <Secao titulo="Seus favoritos" acao={favs.length > 2 ? { label: "Ver todos", onClick: () => trocarTab("favoritos") } : undefined}>
                    <div className="vx-rail">
                      {favs.map(l => <div key={l.id} className="w-[84vw] max-w-[320px]">{cardDe(l)}</div>)}
                    </div>
                  </Secao>
                )}

                {slides.length > 0 && (
                  <Secao titulo="Em destaque" sub="Escolhidos a dedo no Vellox">
                    <DestaquesCarrossel slides={slides} agora={agora} />
                  </Secao>
                )}

                {ofertas.length > 0 && (
                  <Secao titulo="Ofertas relâmpago" sub="Por tempo limitado">
                    <div className="vx-rail">
                      {ofertas.map(s => <OfertaCard key={s.id} sale={s} loja={lojaPorId.get(s.empresa_id)!} />)}
                    </div>
                  </Secao>
                )}

                {proximas.length > 0 && (
                  <Secao titulo="Perto de você" sub={location !== "sua cidade" ? location : "Pela sua localização"}>
                    <div className="vx-rail">
                      {proximas.map(({ loja }) => <div key={loja.id} className="w-[84vw] max-w-[320px]">{cardDe(loja)}</div>)}
                    </div>
                  </Secao>
                )}

                {(produtos === null || produtos.length > 0) && (
                  <Secao titulo="Pratos em alta" sub="Toque para pedir na loja">
                    <div className="vx-rail">
                      {produtos === null
                        ? [0, 1, 2, 3].map(i => <PratoCardSkeleton key={i} />)
                        : produtos.map(p => <PratoCard key={p.id} p={p} />)}
                    </div>
                  </Secao>
                )}

                <div id="lojas">
                  <Secao titulo="Abertas agora" sub={`${abertas.length} loja${abertas.length !== 1 ? "s" : ""} recebendo pedidos`}>
                    {abertas.length === 0 ? (
                      <Vazio titulo="Todas as lojas estão fechadas agora"
                        texto={fechadas.length ? "Confira abaixo quem abre primeiro." : "Volte mais tarde — novas lojas chegam toda semana."} />
                    ) : (
                      <div className="vx-grid">{abertas.map(cardDe)}</div>
                    )}
                  </Secao>
                </div>

                {fechadas.length > 0 && (
                  <Secao titulo="Abrindo em breve" sub="Fechadas no momento">
                    <AbrindoEmBreveLista lojas={fechadas} agora={agora} />
                  </Secao>
                )}

                {lojas.length === 0 && (
                  <div style={{ marginTop: 28 }}>
                    <Vazio titulo="Nenhuma loja por aqui ainda" texto="Estamos chegando na sua região. Volte em breve!" />
                  </div>
                )}

                {/* ── Confiança ───────────────────────────────────── */}
                <section aria-label="Por que pedir pelo Vellox" className="grid gap-3 sm:grid-cols-3" style={{ marginTop: 44 }}>
                  {[
                    { icon: BadgeCheck,  t: "Lojas verificadas", s: "Estabelecimentos conferidos pelo Vellox" },
                    { icon: Bike,        t: "Acompanhe a entrega", s: "Status do pedido em tempo real" },
                    { icon: ShieldCheck, t: "Pedido seguro", s: "Direto com a loja, sem intermediários" },
                  ].map(({ icon: Icon, t, s }) => (
                    <div key={t} className="flex items-center gap-3" style={{ padding: "14px 16px", borderRadius: 20, background: C.surface, border: `1px solid ${C.lineSoft}`, boxShadow: C.shadow1 }}>
                      <span className="flex items-center justify-center flex-shrink-0" style={{ width: 42, height: 42, borderRadius: 14, background: C.redSoft, color: C.red }}><Icon size={19} /></span>
                      <span className="min-w-0">
                        <span className="block" style={{ fontSize: 14, fontWeight: 800 }}>{t}</span>
                        <span className="block" style={{ fontSize: 12.5, color: C.ink3 }}>{s}</span>
                      </span>
                    </div>
                  ))}
                </section>
              </>
            )}
          </>
        )}

        <footer style={{ padding: "36px 0 8px", textAlign: "center" }}>
          <p style={{ fontSize: 12, color: C.ink3 }}>Vellox · appvellox.online</p>
        </footer>
      </main>

      <BottomNav active={tab} onChange={trocarTab} />
    </div>
  );
}
