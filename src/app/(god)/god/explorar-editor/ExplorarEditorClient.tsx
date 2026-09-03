"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft, Save, CheckCircle, Loader2, Eye, Plus, Trash2,
  Edit2, X, ExternalLink, Zap, Smartphone,
} from "lucide-react";

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface HeroConfig {
  badge_text:     string;
  hero_titulo:    string;
  hero_destaque:  string;
  hero_subtitulo: string;
  accent_color:   string;
}

interface Banner {
  id: string; titulo: string; subtitulo: string | null;
  imagem_url: string | null; link_url: string | null; cor_fundo: string; ativo: boolean; ordem: number;
}

interface Categoria {
  id: string; nome: string; emoji: string; ativo: boolean; ordem: number;
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const DEFAULTS: HeroConfig = {
  badge_text:     "DESCUBRA · PEÇA · RECEBA",
  hero_titulo:    "Peça comida no",
  hero_destaque:  "seu jeito",
  hero_subtitulo: "Descubra restaurantes incríveis e peça com entrega rápida",
  accent_color:   "#E4002B",
};

const ACCENT_PRESETS = [
  "#E4002B", "#ef4444", "#E4002B", "#eab308",
  "#22c55e", "#06b6d4", "#818cf8", "#ec4899",
  "#a78bfa", "#14b8a6", "#e11d48", "#7c3aed",
];

type Tab = "hero" | "banners" | "categorias";

// ─── LIVE HERO PREVIEW ────────────────────────────────────────────────────────

function HeroPreview({ cfg, banners, cats }: { cfg: HeroConfig; banners: Banner[]; cats: Categoria[] }) {
  const a = cfg.accent_color;
  const dispCats = cats.slice(0, 5);

  return (
    <div style={{ background: "#0B0B0B", minHeight: "100%", fontFamily: "system-ui,sans-serif" }}>
      {/* Sticky header simulado */}
      <div style={{ padding: "8px 16px 4px", background: "rgba(11,11,11,0.9)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <span style={{ fontSize: 12, color: "#9ca3af" }}>📍 <span style={{ color: "#e5e7eb", fontWeight: 600 }}>sua cidade</span></span>
      </div>

      {/* Hero */}
      <div style={{ position: "relative", padding: "36px 20px 32px", overflow: "hidden", background: `linear-gradient(180deg, ${a}07 0%, transparent 100%)` }}>
        <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: "100%", height: "100%", background: `radial-gradient(ellipse 90% 70% at 50% 0%, ${a}12 0%, transparent 70%)`, pointerEvents: "none" }} />
        <div style={{ position: "relative", maxWidth: 520, margin: "0 auto", textAlign: "center" }}>
          {/* Badge */}
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 999, background: `${a}12`, border: `1px solid ${a}28`, marginBottom: 20 }}>
            <Zap size={10} style={{ color: a }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: a, letterSpacing: "0.1em" }}>{cfg.badge_text}</span>
          </div>

          {/* Headline */}
          <h1 style={{ fontSize: "clamp(28px, 7vw, 44px)", fontWeight: 900, lineHeight: 1.1, letterSpacing: "-0.03em", marginBottom: 12, color: "#fff" }}>
            {cfg.hero_titulo}{" "}
            <span style={{ color: a, textShadow: `0 0 32px ${a}45` }}>{cfg.hero_destaque}</span>
          </h1>

          <p style={{ fontSize: 14, color: "#9ca3af", marginBottom: 24, lineHeight: 1.6 }}>{cfg.hero_subtitulo}</p>

          {/* Fake search */}
          <div style={{ position: "relative", marginBottom: 10 }}>
            <div style={{ background: "#111", border: `2px solid rgba(255,255,255,0.1)`, borderRadius: 16, padding: "13px 42px", fontSize: 13, color: "#4b5563", textAlign: "left" }}>
              O que você quer comer hoje?
            </div>
          </div>

          {/* Category pills */}
          {dispCats.length > 0 && (
            <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginTop: 8 }}>
              {dispCats.map(c => (
                <span key={c.id} style={{ padding: "5px 10px", borderRadius: 999, background: "rgba(255,255,255,0.05)", color: "#6b7280", fontSize: 11, border: "1px solid rgba(255,255,255,0.07)", display: "flex", alignItems: "center", gap: 4 }}>
                  <span>{c.emoji}</span> {c.nome}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Banner preview */}
        {banners.length > 0 && (
          <div style={{ maxWidth: 560, margin: "24px auto 0", borderRadius: 20, overflow: "hidden", height: 180, position: "relative", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div style={{ position: "absolute", inset: 0, background: banners[0].imagem_url ? `url(${banners[0].imagem_url}) center/cover` : `linear-gradient(135deg, ${banners[0].cor_fundo}cc, #111)` }} />
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 55%)" }} />
            <div style={{ position: "absolute", bottom: 18, left: 22 }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 999, background: `${banners[0].cor_fundo}22`, border: `1px solid ${banners[0].cor_fundo}44`, marginBottom: 8 }}>
                <Zap size={9} style={{ color: banners[0].cor_fundo }} />
                <span style={{ fontSize: 9, fontWeight: 700, color: banners[0].cor_fundo, letterSpacing: "0.08em" }}>DESTAQUE DO DIA</span>
              </div>
              <p style={{ color: "#fff", fontWeight: 900, fontSize: 18, lineHeight: 1.1, margin: 0 }}>{banners[0].titulo}</p>
              {banners[0].subtitulo && <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 11, margin: "3px 0 0" }}>{banners[0].subtitulo}</p>}
            </div>
            {/* Dots */}
            {banners.length > 1 && (
              <div style={{ position: "absolute", bottom: 14, right: 16, display: "flex", gap: 5 }}>
                {banners.map((_, i) => (
                  <div key={i} style={{ width: i === 0 ? 16 : 5, height: 5, borderRadius: 99, background: i === 0 ? "#E4002B" : "rgba(255,255,255,0.3)" }} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Stats bar */}
      <div style={{ margin: "0 16px", padding: "10px 20px", borderRadius: 14, background: "rgba(228,0,43,0.08)", border: "1px solid rgba(228,0,43,0.12)", display: "flex", alignItems: "center", gap: 16, justifyContent: "center" }}>
        <span style={{ fontSize: 12, color: "#9ca3af" }}><span style={{ color: "#22c55e", fontWeight: 900, fontSize: 14 }}>●</span> lojas abertas agora</span>
        <span style={{ width: 1, height: 16, background: "rgba(255,255,255,0.08)" }} />
        <span style={{ fontSize: 12, color: "#9ca3af" }}><span style={{ color: a, fontWeight: 900, fontSize: 14 }}>⚡</span> lojas no Vellox</span>
      </div>

      {/* Categorias */}
      <div style={{ marginTop: 20, padding: "0 16px" }}>
        <p style={{ color: "#fff", fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Categorias</p>
        <div style={{ display: "flex", gap: 12, overflowX: "auto", scrollbarWidth: "none" }}>
          {[{ id: "all", nome: "Todos", emoji: "🍽️" }, ...cats].map(c => (
            <div key={c.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flexShrink: 0, cursor: "pointer" }}>
              <div style={{ width: 56, height: 56, borderRadius: 14, background: "rgba(255,255,255,0.05)", border: "1.5px solid rgba(255,255,255,0.07)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>{c.emoji}</div>
              <span style={{ fontSize: 10, color: "#6b7280", whiteSpace: "nowrap" }}>{c.nome}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Fade out */}
      <div style={{ height: 60, background: "linear-gradient(to bottom, transparent, #0B0B0B)", marginTop: 24 }} />
    </div>
  );
}

// ─── BANNER FORM ─────────────────────────────────────────────────────────────

function BannerForm({ onAdd }: { onAdd: (b: Omit<Banner, "id" | "ativo" | "ordem">) => Promise<void> }) {
  const [f, setF] = useState({ titulo: "", subtitulo: "", imagem_url: "", link_url: "", cor_fundo: "#E4002B" });
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!f.titulo.trim()) return;
    setSaving(true);
    await onAdd(f);
    setF({ titulo: "", subtitulo: "", imagem_url: "", link_url: "", cor_fundo: "#E4002B" });
    setSaving(false);
  }

  const inp = (field: string, label: string, value: string, onChange: (v: string) => void, placeholder?: string) => (
    <div>
      <label style={{ fontSize: 11, color: "#6b7280", fontWeight: 600, display: "block", marginBottom: 4 }}>{label}</label>
      <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "8px 10px", fontSize: 12, color: "#e5e7eb", outline: "none" }} />
    </div>
  );

  return (
    <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 14, padding: 14, border: "1px solid rgba(255,255,255,0.07)", display: "flex", flexDirection: "column", gap: 10 }}>
      <p style={{ fontSize: 12, fontWeight: 700, color: "#9ca3af", marginBottom: 2 }}>+ Novo banner</p>
      {inp("titulo", "Título *", f.titulo, v => setF(p => ({ ...p, titulo: v })), "Ex: Pizza Artesanal")}
      {inp("sub", "Subtítulo", f.subtitulo, v => setF(p => ({ ...p, subtitulo: v })), "Ex: Massa crocante...")}
      {inp("img", "URL da imagem", f.imagem_url, v => setF(p => ({ ...p, imagem_url: v })), "https://...")}
      {inp("link", "Link ao clicar", f.link_url, v => setF(p => ({ ...p, link_url: v })), "/loja/slug")}
      <div>
        <label style={{ fontSize: 11, color: "#6b7280", fontWeight: 600, display: "block", marginBottom: 6 }}>Cor de fundo</label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {ACCENT_PRESETS.map(c => (
            <button key={c} onClick={() => setF(p => ({ ...p, cor_fundo: c }))}
              style={{ width: 24, height: 24, borderRadius: 6, background: c, border: f.cor_fundo === c ? "2.5px solid #fff" : "none", cursor: "pointer" }} />
          ))}
        </div>
      </div>
      <button onClick={submit} disabled={saving || !f.titulo.trim()}
        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px", borderRadius: 10, background: "rgba(228,0,43,0.12)", border: "1px solid rgba(228,0,43,0.3)", color: "#E4002B", fontSize: 12, fontWeight: 700, cursor: !f.titulo.trim() ? "not-allowed" : "pointer", opacity: !f.titulo.trim() ? 0.5 : 1 }}>
        {saving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Adicionar Banner
      </button>
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function ExplorarEditorClient() {
  const [tab,         setTab]         = useState<Tab>("hero");
  const [hero,        setHero]        = useState<HeroConfig>(DEFAULTS);
  const [saving,      setSaving]      = useState(false);
  const [saved,       setSaved]       = useState(false);
  const [banners,     setBanners]     = useState<Banner[]>([]);
  const [cats,        setCats]        = useState<Categoria[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("mobile");
  const [editBanner,  setEditBanner]  = useState<Banner | null>(null);
  const [editCat,     setEditCat]     = useState<Categoria | null>(null);
  const [catForm,     setCatForm]     = useState({ nome: "", emoji: "🍽️" });
  const [savingCat,   setSavingCat]   = useState(false);
  const [deletingId,  setDeletingId]  = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/god/explorar-config").then(r => r.json()),
      fetch("/api/god/explorar").then(r => r.json()),
    ]).then(([cfgRes, expRes]) => {
      if (cfgRes.config) setHero({ ...DEFAULTS, ...cfgRes.config });
      if (expRes.banners) setBanners(expRes.banners);
      if (expRes.categorias) setCats(expRes.categorias);
      setLoading(false);
    });
  }, []);

  async function saveHero() {
    setSaving(true);
    try {
      await fetch("/api/god/explorar-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(hero),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally { setSaving(false); }
  }

  async function addBanner(data: Omit<Banner, "id" | "ativo" | "ordem">) {
    const res = await fetch("/api/god/explorar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "banner", ...data }),
    });
    const newBanner = await res.json();
    if (newBanner.id) setBanners(p => [...p, { ...newBanner, ativo: true, ordem: p.length }]);
  }

  async function saveBanner(b: Banner) {
    await fetch("/api/god/explorar", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "banner", id: b.id, titulo: b.titulo, subtitulo: b.subtitulo, imagem_url: b.imagem_url, link_url: b.link_url, cor_fundo: b.cor_fundo }),
    });
    setBanners(p => p.map(x => x.id === b.id ? b : x));
    setEditBanner(null);
  }

  async function deleteBanner(id: string) {
    setDeletingId(id);
    await fetch("/api/god/explorar", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "banner", id }) });
    setBanners(p => p.filter(x => x.id !== id));
    setDeletingId(null);
  }

  async function addCategoria() {
    if (!catForm.nome.trim()) return;
    setSavingCat(true);
    const res = await fetch("/api/god/explorar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "categoria", ...catForm }),
    });
    const newCat = await res.json();
    if (newCat.id) setCats(p => [...p, { ...newCat, ativo: true, ordem: p.length }]);
    setCatForm({ nome: "", emoji: "🍽️" });
    setSavingCat(false);
  }

  async function deleteCategoria(id: string) {
    setDeletingId(id);
    await fetch("/api/god/explorar", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "categoria", id }) });
    setCats(p => p.filter(x => x.id !== id));
    setDeletingId(null);
  }

  const accent = hero.accent_color;

  const inputStyle: React.CSSProperties = {
    width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 10, padding: "9px 11px", fontSize: 13, color: "#e5e7eb", outline: "none",
  };

  function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
      <div>
        <label style={{ fontSize: 11, color: "#6b7280", fontWeight: 600, display: "block", marginBottom: 5, letterSpacing: "0.05em" }}>{label}</label>
        {children}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", height: "100vh", background: "#0B0B0B", color: "#fff", overflow: "hidden" }}>

      {/* ── PAINEL ESQUERDO: EDITOR ─────────────────────────────────── */}
      <div style={{ width: 400, flexShrink: 0, borderRight: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", overflowY: "auto" }}>

        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", position: "sticky", top: 0, background: "rgba(11,11,11,0.95)", backdropFilter: "blur(12px)", zIndex: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
            <Link href="/god" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: 10, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <ArrowLeft size={14} style={{ color: "#9ca3af" }} />
            </Link>
            <div>
              <p style={{ fontSize: 16, fontWeight: 900, color: "#fff", margin: 0 }}>Editor Explorar</p>
              <p style={{ fontSize: 11, color: "#4b5563", margin: 0 }}>Landing page ao vivo</p>
            </div>
            <a href="/explorar" target="_blank" rel="noopener noreferrer" style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#6b7280" }}>
              Ver site <ExternalLink size={10} />
            </a>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", background: "rgba(255,255,255,0.04)", borderRadius: 12, padding: 3, gap: 2 }}>
            {([
              { key: "hero"       as Tab, label: "🎨 Hero" },
              { key: "banners"    as Tab, label: "🖼 Banners" },
              { key: "categorias" as Tab, label: "🏷 Categorias" },
            ] as const).map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                style={{ flex: 1, padding: "7px 4px", borderRadius: 9, fontSize: 11, fontWeight: tab === t.key ? 700 : 500, background: tab === t.key ? `${accent}18` : "transparent", color: tab === t.key ? accent : "#6b7280", border: tab === t.key ? `1px solid ${accent}30` : "1px solid transparent", cursor: "pointer", transition: "all 0.15s" }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: 20, flex: 1 }}>
          {loading ? (
            <div style={{ display: "flex", justifyContent: "center", paddingTop: 60 }}>
              <Loader2 size={24} className="animate-spin" style={{ color: accent }} />
            </div>
          ) : tab === "hero" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

              <Field label="TEXTO DO BADGE">
                <input type="text" value={hero.badge_text} onChange={e => setHero(p => ({ ...p, badge_text: e.target.value }))} style={inputStyle} placeholder="Ex: DESCUBRA · PEÇA · RECEBA" />
              </Field>

              <Field label="TÍTULO PRINCIPAL">
                <input type="text" value={hero.hero_titulo} onChange={e => setHero(p => ({ ...p, hero_titulo: e.target.value }))} style={inputStyle} placeholder="Ex: Peça comida no" />
              </Field>

              <Field label="PALAVRA EM DESTAQUE (vermelho)">
                <input type="text" value={hero.hero_destaque} onChange={e => setHero(p => ({ ...p, hero_destaque: e.target.value }))} style={inputStyle} placeholder="Ex: seu jeito" />
                <p style={{ fontSize: 10, color: "#4b5563", marginTop: 4 }}>Aparece em destaque com brilho ao lado do título</p>
              </Field>

              <Field label="SUBTÍTULO">
                <textarea value={hero.hero_subtitulo} onChange={e => setHero(p => ({ ...p, hero_subtitulo: e.target.value }))} rows={2}
                  style={{ ...inputStyle, resize: "vertical" }} placeholder="Ex: Descubra restaurantes incríveis..." />
              </Field>

              <Field label="COR DE DESTAQUE">
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                  {ACCENT_PRESETS.map(c => (
                    <button key={c} onClick={() => setHero(p => ({ ...p, accent_color: c }))}
                      style={{ width: 32, height: 32, borderRadius: 8, background: c, border: hero.accent_color === c ? "3px solid #fff" : "2px solid rgba(255,255,255,0.1)", cursor: "pointer", transition: "transform 0.15s", transform: hero.accent_color === c ? "scale(1.15)" : "scale(1)" }} />
                  ))}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="color" value={hero.accent_color} onChange={e => setHero(p => ({ ...p, accent_color: e.target.value }))}
                    style={{ width: 36, height: 36, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", padding: 2, cursor: "pointer", background: "transparent" }} />
                  <input type="text" value={hero.accent_color} onChange={e => setHero(p => ({ ...p, accent_color: e.target.value }))}
                    style={{ ...inputStyle, width: 110 }} placeholder="#E4002B" />
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: hero.accent_color, border: "1px solid rgba(255,255,255,0.1)", flexShrink: 0 }} />
                </div>
              </Field>

              <button onClick={saveHero} disabled={saving}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px", borderRadius: 12, background: saved ? "rgba(34,197,94,0.12)" : `${accent}15`, border: `1px solid ${saved ? "rgba(34,197,94,0.3)" : `${accent}30`}`, color: saved ? "#4ade80" : accent, fontSize: 13, fontWeight: 700, cursor: "pointer", transition: "all 0.2s", marginTop: 4 }}>
                {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <CheckCircle size={14} /> : <Save size={14} />}
                {saving ? "Salvando..." : saved ? "Salvo com sucesso!" : "Salvar Hero"}
              </button>

              <div style={{ borderRadius: 12, padding: "10px 14px", background: "rgba(228,0,43,0.05)", border: "1px solid rgba(228,0,43,0.1)" }}>
                <p style={{ fontSize: 11, color: "#6b7280", lineHeight: 1.6 }}>
                  💡 O preview ao lado atualiza em tempo real. Clique em "Salvar Hero" para aplicar na landing page real.
                </p>
              </div>
            </div>

          ) : tab === "banners" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>
                {banners.length} banner{banners.length !== 1 ? "s" : ""} no carrossel
              </p>

              {banners.map(b => (
                <div key={b.id} style={{ borderRadius: 14, overflow: "hidden", border: "1px solid rgba(255,255,255,0.07)", background: "#111" }}>
                  {/* Mini thumbnail */}
                  <div style={{ height: 80, position: "relative", background: b.imagem_url ? `url(${b.imagem_url}) center/cover` : `linear-gradient(135deg, ${b.cor_fundo}cc, #111)` }}>
                    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 50%)" }} />
                    <p style={{ position: "absolute", bottom: 8, left: 10, color: "#fff", fontWeight: 700, fontSize: 12, margin: 0 }}>{b.titulo}</p>
                  </div>
                  {editBanner?.id === b.id ? (
                    <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                      {["titulo", "subtitulo", "imagem_url", "link_url"].map(k => (
                        <input key={k} type="text"
                          value={(editBanner as unknown as Record<string, string | null>)[k] ?? ""}
                          onChange={e => setEditBanner(p => p ? { ...p, [k]: e.target.value } : p)}
                          placeholder={k}
                          style={{ ...inputStyle, fontSize: 11 }} />
                      ))}
                      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                        {ACCENT_PRESETS.map(c => (
                          <button key={c} onClick={() => setEditBanner(p => p ? { ...p, cor_fundo: c } : p)}
                            style={{ width: 22, height: 22, borderRadius: 5, background: c, border: editBanner.cor_fundo === c ? "2.5px solid #fff" : "none", cursor: "pointer" }} />
                        ))}
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => saveBanner(editBanner)}
                          style={{ flex: 1, padding: "8px", borderRadius: 9, background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.25)", color: "#4ade80", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                          Salvar
                        </button>
                        <button onClick={() => setEditBanner(null)}
                          style={{ padding: "8px 12px", borderRadius: 9, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#6b7280", fontSize: 11, cursor: "pointer" }}>
                          <X size={12} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: "8px 12px", display: "flex", alignItems: "center", gap: 8 }}>
                      <p style={{ fontSize: 11, color: "#6b7280", flex: 1, margin: 0 }} className="truncate">{b.subtitulo || "Sem subtítulo"}</p>
                      <button onClick={() => setEditBanner(b)} style={{ padding: "5px 8px", borderRadius: 7, background: "rgba(255,255,255,0.05)", border: "none", color: "#9ca3af", cursor: "pointer" }}>
                        <Edit2 size={12} />
                      </button>
                      <button onClick={() => deleteBanner(b.id)} disabled={deletingId === b.id}
                        style={{ padding: "5px 8px", borderRadius: 7, background: "rgba(239,68,68,0.08)", border: "none", color: "#ef4444", cursor: "pointer" }}>
                        {deletingId === b.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                      </button>
                    </div>
                  )}
                </div>
              ))}

              <BannerForm onAdd={addBanner} />
            </div>

          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>
                {cats.length} categoria{cats.length !== 1 ? "s" : ""} ativas
              </p>

              {cats.map(c => (
                <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 12, background: "#111", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <span style={{ fontSize: 22 }}>{c.emoji}</span>
                  {editCat?.id === c.id ? (
                    <>
                      <input value={editCat.emoji} onChange={e => setEditCat(p => p ? { ...p, emoji: e.target.value } : p)}
                        style={{ ...inputStyle, width: 52, textAlign: "center", fontSize: 18 }} />
                      <input value={editCat.nome} onChange={e => setEditCat(p => p ? { ...p, nome: e.target.value } : p)}
                        style={{ ...inputStyle, flex: 1 }} />
                      <button onClick={async () => {
                        await fetch("/api/god/explorar", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "categoria", id: editCat.id, nome: editCat.nome, emoji: editCat.emoji }) });
                        setCats(p => p.map(x => x.id === editCat.id ? editCat : x));
                        setEditCat(null);
                      }} style={{ padding: "5px 10px", borderRadius: 8, background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.25)", color: "#4ade80", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                        OK
                      </button>
                    </>
                  ) : (
                    <>
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "#e5e7eb" }}>{c.nome}</span>
                      <button onClick={() => setEditCat(c)} style={{ padding: "5px 7px", borderRadius: 7, background: "rgba(255,255,255,0.04)", border: "none", color: "#9ca3af", cursor: "pointer" }}>
                        <Edit2 size={12} />
                      </button>
                      <button onClick={() => deleteCategoria(c.id)} disabled={deletingId === c.id}
                        style={{ padding: "5px 7px", borderRadius: 7, background: "rgba(239,68,68,0.06)", border: "none", color: "#ef4444", cursor: "pointer" }}>
                        {deletingId === c.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                      </button>
                    </>
                  )}
                </div>
              ))}

              {/* Add category */}
              <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 14, padding: 14, border: "1px solid rgba(255,255,255,0.07)", display: "flex", flexDirection: "column", gap: 10 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: "#9ca3af" }}>+ Nova categoria</p>
                <div style={{ display: "flex", gap: 8 }}>
                  <input value={catForm.emoji} onChange={e => setCatForm(p => ({ ...p, emoji: e.target.value }))}
                    style={{ ...inputStyle, width: 52, textAlign: "center", fontSize: 18 }} placeholder="🍽️" />
                  <input value={catForm.nome} onChange={e => setCatForm(p => ({ ...p, nome: e.target.value }))}
                    style={{ ...inputStyle, flex: 1 }} placeholder="Nome da categoria" />
                </div>
                <button onClick={addCategoria} disabled={savingCat || !catForm.nome.trim()}
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px", borderRadius: 10, background: "rgba(228,0,43,0.12)", border: "1px solid rgba(228,0,43,0.3)", color: "#E4002B", fontSize: 12, fontWeight: 700, cursor: !catForm.nome.trim() ? "not-allowed" : "pointer", opacity: !catForm.nome.trim() ? 0.5 : 1 }}>
                  {savingCat ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Adicionar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── PAINEL DIREITO: PREVIEW ─────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Preview header */}
        <div style={{ padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 12, background: "rgba(11,11,11,0.95)", backdropFilter: "blur(12px)", flexShrink: 0 }}>
          <Eye size={14} style={{ color: "#6b7280" }} />
          <p style={{ fontSize: 12, color: "#6b7280", margin: 0 }}>Preview ao vivo · atualiza enquanto você edita</p>
          <div style={{ marginLeft: "auto", display: "flex", gap: 4, background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: 3 }}>
            <button onClick={() => setPreviewMode("mobile")}
              style={{ padding: "5px 10px", borderRadius: 8, fontSize: 11, fontWeight: previewMode === "mobile" ? 700 : 500, background: previewMode === "mobile" ? `${accent}18` : "transparent", color: previewMode === "mobile" ? accent : "#6b7280", border: previewMode === "mobile" ? `1px solid ${accent}30` : "1px solid transparent", cursor: "pointer" }}>
              <Smartphone size={12} style={{ display: "inline", marginRight: 4 }} />Mobile
            </button>
            <button onClick={() => setPreviewMode("desktop")}
              style={{ padding: "5px 10px", borderRadius: 8, fontSize: 11, fontWeight: previewMode === "desktop" ? 700 : 500, background: previewMode === "desktop" ? `${accent}18` : "transparent", color: previewMode === "desktop" ? accent : "#6b7280", border: previewMode === "desktop" ? `1px solid ${accent}30` : "1px solid transparent", cursor: "pointer" }}>
              🖥 Desktop
            </button>
          </div>
          <a href="/explorar" target="_blank" rel="noopener noreferrer"
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 10, background: `${accent}15`, border: `1px solid ${accent}30`, color: accent, fontSize: 11, fontWeight: 700, textDecoration: "none" }}>
            <ExternalLink size={12} /> Abrir Explorar
          </a>
        </div>

        {/* Preview area */}
        <div style={{ flex: 1, overflow: "auto", display: "flex", alignItems: previewMode === "mobile" ? "flex-start" : "stretch", justifyContent: "center", padding: previewMode === "mobile" ? "32px 20px" : "0", background: previewMode === "mobile" ? "#060606" : "#0B0B0B" }}>
          {previewMode === "mobile" ? (
            /* Phone mockup */
            <div style={{ width: 375, flexShrink: 0, borderRadius: 40, overflow: "hidden", border: "8px solid #1a1a1a", boxShadow: `0 32px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.06), 0 0 60px ${accent}18`, maxHeight: "80vh", overflowY: "auto", scrollbarWidth: "none" }}>
              {/* Phone notch */}
              <div style={{ height: 30, background: "#0B0B0B", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ width: 80, height: 6, borderRadius: 99, background: "#1a1a1a" }} />
              </div>
              <HeroPreview cfg={hero} banners={banners} cats={cats} />
            </div>
          ) : (
            /* Desktop preview */
            <div style={{ width: "100%", height: "100%", overflowY: "auto", scrollbarWidth: "none" }}>
              <HeroPreview cfg={hero} banners={banners} cats={cats} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
