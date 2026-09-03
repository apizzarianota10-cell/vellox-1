"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Building2, Users, ShoppingBag, CheckCircle2,
  XCircle, LogOut, RefreshCw, Shield, Crown,
  TrendingUp, Search, Trash2, Clock, Check, ChevronDown,
  ChevronUp, Plus, Loader2, Bike, Phone,
  WifiOff, Wifi, Eye, EyeOff, Copy, KeyRound,
  Compass, Image, Tag, Star, Zap, Edit2, Save, X as XIcon,
} from "lucide-react";

type Plano = "basic" | "pro" | "enterprise" | "ktl";

const PLANO_CFG: Record<Plano, { label: string; color: string; bg: string; border: string }> = {
  basic:      { label: "Basic",      color: "#9ca3af", bg: "rgba(156,163,175,0.12)", border: "rgba(156,163,175,0.25)" },
  pro:        { label: "Pro",        color: "#818cf8", bg: "rgba(129,140,248,0.12)", border: "rgba(129,140,248,0.3)"  },
  enterprise: { label: "Enterprise", color: "#fbbf24", bg: "rgba(251,191,36,0.12)",  border: "rgba(251,191,36,0.35)" },
  ktl:        { label: "KTL",        color: "#22d3ee", bg: "rgba(34,211,238,0.12)",  border: "rgba(34,211,238,0.3)"  },
};

interface MotoboySummary {
  id: string;
  nome: string;
  telefone: string;
  status: string;
  posicao_fila: number | null;
  codigo: string | null;
}

interface MotoboyGod {
  id: string;
  nome: string;
  telefone: string;
  email: string | null;
  status: string;
  codigo: string | null;
  posicao_fila: number | null;
  empresa_id: string;
  empresa_nome: string;
  empresa_plano: Plano;
  total_entregas: number;
  entregas_hoje: number;
  ganho_total: number;
  ganho_hoje: number;
  created_at: string;
}

interface EmpresaRow {
  id: string;
  nome: string;
  email: string;
  cnpj: string | null;
  codigo: string;
  ativo: boolean;
  assinatura_ativa: boolean;
  assinatura_expira_em: string | null;
  kirvano_subscriber_id: string | null;
  created_at: string;
  total_pedidos: number;
  total_motoboys: number;
  plano: Plano;
}

interface Props {
  empresas: EmpresaRow[];
  error: string | null;
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function StatusBadge({ ativa }: { ativa: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
      style={{
        background: ativa ? "rgba(34,197,94,0.12)" : "rgba(228,0,43,0.12)",
        color: ativa ? "#4ade80" : "#FFC72C",
        border: `1px solid ${ativa ? "rgba(34,197,94,0.25)" : "rgba(228,0,43,0.25)"}`,
      }}>
      {ativa ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
      {ativa ? "Ativa" : "Inativa"}
    </span>
  );
}

function PlanoBadge({ plano, onClick }: { plano: Plano; onClick?: () => void }) {
  const cfg = PLANO_CFG[plano] ?? PLANO_CFG.basic;
  return (
    <button onClick={onClick}
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold"
      style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`, cursor: onClick ? "pointer" : "default" }}>
      {cfg.label}
      {onClick && <ChevronDown size={9} />}
    </button>
  );
}

// ─── EXPLORAR GOD PANEL ──────────────────────────────────────────────────────

interface EmpresaExtra {
  id: string; nome: string; assinatura_ativa: boolean;
  destaque: boolean; categoria: string | null;
}

interface BannerRow {
  id: string; titulo: string; subtitulo: string | null;
  cor_fundo: string; imagem_url: string | null; link_url: string | null;
}

interface CatRow { id: string; nome: string; emoji: string; }

interface FlashSaleGod {
  id: string; empresa_id: string; empresa_nome: string;
  nome: string; descricao: string | null;
  preco_original: number | null; preco_flash: number;
  imagem_url: string | null; ativo: boolean; termina_em: string; created_at: string;
}

function ExplorarGodPanel() {
  const [banners,    setBanners]    = useState<BannerRow[]>([]);
  const [categorias, setCategorias] = useState<CatRow[]>([]);
  const [empExtras,  setEmpExtras]  = useState<EmpresaExtra[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [savingBanner, setSavingBanner] = useState(false);
  const [savingCat,    setSavingCat]    = useState(false);
  const [savingEmp,    setSavingEmp]    = useState<string | null>(null);
  const [bannerForm, setBannerForm] = useState({ titulo: "", subtitulo: "", imagem_url: "", link_url: "", cor_fundo: "#E4002B" });
  const [catForm,    setCatForm]    = useState({ nome: "", emoji: "🍽️" });
  const [tab, setTab] = useState<"empresas" | "banners" | "categorias" | "flash_sales">("empresas");
  const [empSearch, setEmpSearch] = useState("");

  // Banner editing
  const [editingBanner,  setEditingBanner]  = useState<string | null>(null);
  const [editBannerForm, setEditBannerForm] = useState({ titulo: "", subtitulo: "", imagem_url: "", link_url: "", cor_fundo: "#E4002B" });
  const [savingEditBanner, setSavingEditBanner] = useState(false);

  // Category editing
  const [editingCat,  setEditingCat]  = useState<string | null>(null);
  const [editCatForm, setEditCatForm] = useState({ nome: "", emoji: "🍽️" });
  const [savingEditCat, setSavingEditCat] = useState(false);

  // Flash Sales
  const [flashSales, setFlashSales] = useState<FlashSaleGod[]>([]);
  const [loadingFs,  setLoadingFs]  = useState(false);
  const [deletingFs, setDeletingFs] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/god/explorar");
      if (res.ok) {
        const d = await res.json();
        setBanners(d.banners    ?? []);
        setCategorias(d.categorias ?? []);
        setEmpExtras(d.empresas   ?? []);
      }
    } catch {}
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (tab !== "flash_sales") return;
    setLoadingFs(true);
    fetch("/api/god/flash-sales")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setFlashSales(d.flash_sales ?? []); })
      .finally(() => setLoadingFs(false));
  }, [tab]);

  async function addBanner() {
    if (!bannerForm.titulo.trim()) return;
    setSavingBanner(true);
    try {
      await fetch("/api/god/explorar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "banner", ...bannerForm }) });
      setBannerForm({ titulo: "", subtitulo: "", imagem_url: "", link_url: "", cor_fundo: "#E4002B" });
      await load();
    } finally { setSavingBanner(false); }
  }

  async function deleteBanner(id: string) {
    await fetch("/api/god/explorar", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "banner", id }) });
    await load();
  }

  async function addCategoria() {
    if (!catForm.nome.trim()) return;
    setSavingCat(true);
    try {
      await fetch("/api/god/explorar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "categoria", ...catForm }) });
      setCatForm({ nome: "", emoji: "🍽️" });
      await load();
    } finally { setSavingCat(false); }
  }

  async function deleteCategoria(id: string) {
    await fetch("/api/god/explorar", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "categoria", id }) });
    await load();
  }

  async function saveEmpresa(emp: EmpresaExtra) {
    setSavingEmp(emp.id);
    try {
      await fetch("/api/god/explorar", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empresa_id: emp.id, destaque: emp.destaque, categoria: emp.categoria }),
      });
    } finally { setSavingEmp(null); }
  }

  async function updateBanner(id: string) {
    setSavingEditBanner(true);
    try {
      await fetch("/api/god/explorar", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "banner", id, ...editBannerForm }) });
      setEditingBanner(null);
      await load();
    } finally { setSavingEditBanner(false); }
  }

  async function updateCategoria(id: string) {
    setSavingEditCat(true);
    try {
      await fetch("/api/god/explorar", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "categoria", id, ...editCatForm }) });
      setEditingCat(null);
      await load();
    } finally { setSavingEditCat(false); }
  }

  async function deleteFlashSale(id: string) {
    setDeletingFs(id);
    try {
      await fetch("/api/god/flash-sales", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      setFlashSales(prev => prev.filter(fs => fs.id !== id));
    } finally { setDeletingFs(null); }
  }

  function updateEmpExtra(id: string, patch: Partial<EmpresaExtra>) {
    setEmpExtras(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e));
  }

  const IS = { background: "#0f0f0f", border: "1px solid #1f2937", color: "#fff", borderRadius: 10, padding: "8px 12px", fontSize: 13, width: "100%", outline: "none" };
  const empFilt = empExtras.filter(e => e.nome.toLowerCase().includes(empSearch.toLowerCase()));
  const destCats = ["", ...categorias.map(c => c.nome)];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(228,0,43,0.12)" }}>
          <Compass size={18} style={{ color: "#E4002B" }} />
        </div>
        <div>
          <h2 className="text-base font-bold text-white">Gerenciar Explorar</h2>
          <p className="text-xs" style={{ color: "#6b7280" }}>Empresas em destaque, banners e categorias</p>
        </div>
        <div className="ml-auto flex gap-2">
          <a href="/god/explorar-editor" className="px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5" style={{ background: "rgba(129,140,248,0.12)", color: "#818cf8", border: "1px solid rgba(129,140,248,0.25)" }}>
            <Edit2 size={11} /> Editor visual
          </a>
          <a href="/explorar" target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 rounded-xl text-xs font-semibold" style={{ background: "rgba(228,0,43,0.1)", color: "#E4002B", border: "1px solid rgba(228,0,43,0.25)" }}>
            Ver página →
          </a>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 p-1 rounded-xl flex-wrap" style={{ background: "#0f0f0f", border: "1px solid #1a1a1a" }}>
        {([
          { key: "empresas",    label: "Empresas",    icon: Building2 },
          { key: "banners",     label: "Banners",     icon: Image      },
          { key: "categorias",  label: "Categorias",  icon: Tag        },
          { key: "flash_sales", label: "Flash Sales", icon: Zap        },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
            style={tab === key
              ? { background: "rgba(228,0,43,0.15)", color: "#E4002B", border: "1px solid rgba(228,0,43,0.3)" }
              : { background: "transparent", color: "#4b5563", border: "1px solid transparent" }}>
            <Icon size={12} /> {label}
            {key === "empresas" && empExtras.filter(e => e.destaque).length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs font-black" style={{ background: "rgba(251,191,36,0.2)", color: "#fbbf24", fontSize: 10 }}>
                {empExtras.filter(e => e.destaque).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 size={24} className="animate-spin" style={{ color: "#E4002B" }} /></div>
      ) : tab === "empresas" ? (
        /* ── ABA EMPRESAS ── */
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs" style={{ color: "#6b7280" }}>
              {empExtras.filter(e => e.destaque).length} em destaque · {empExtras.filter(e => e.categoria).length} com categoria
            </p>
          </div>

          {/* Busca */}
          <div className="relative">
            <Search size={13} className="absolute" style={{ left: 10, top: "50%", transform: "translateY(-50%)", color: "#4b5563" }} />
            <input
              value={empSearch}
              onChange={e => setEmpSearch(e.target.value)}
              placeholder="Buscar empresa..."
              style={{ ...IS, paddingLeft: 30 }}
            />
          </div>

          {/* Lista de empresas */}
          <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1" style={{ scrollbarWidth: "thin" }}>
            {empFilt.length === 0 ? (
              <p className="text-sm text-center py-8" style={{ color: "#4b5563" }}>Nenhuma empresa encontrada</p>
            ) : empFilt.map(emp => (
              <div
                key={emp.id}
                className="rounded-2xl p-4"
                style={{
                  background: emp.destaque ? "rgba(251,191,36,0.04)" : "#0f0f0f",
                  border: `1px solid ${emp.destaque ? "rgba(251,191,36,0.2)" : "#1f2937"}`,
                }}
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center font-black text-white flex-shrink-0 text-sm" style={{ background: "#1f2937" }}>
                      {emp.nome.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{emp.nome}</p>
                      <p className="text-xs" style={{ color: emp.assinatura_ativa ? "#22c55e" : "#ef4444" }}>
                        {emp.assinatura_ativa ? "Assinatura ativa" : "Assinatura inativa"}
                      </p>
                    </div>
                  </div>

                  {/* Toggle Destaque */}
                  <button
                    onClick={async () => {
                      const updated = { ...emp, destaque: !emp.destaque };
                      updateEmpExtra(emp.id, { destaque: updated.destaque });
                      await saveEmpresa(updated);
                    }}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold flex-shrink-0 transition-all"
                    style={{
                      background: emp.destaque ? "rgba(251,191,36,0.15)" : "rgba(255,255,255,0.05)",
                      color:      emp.destaque ? "#fbbf24" : "#4b5563",
                      border:     `1px solid ${emp.destaque ? "rgba(251,191,36,0.35)" : "rgba(255,255,255,0.08)"}`,
                    }}
                  >
                    {savingEmp === emp.id
                      ? <Loader2 size={11} className="animate-spin" />
                      : <Star size={11} fill={emp.destaque ? "currentColor" : "none"} />}
                    {emp.destaque ? "Destaque" : "Destacar"}
                  </button>
                </div>

                {/* Selector de categoria */}
                <div className="flex items-center gap-2">
                  <Tag size={12} style={{ color: "#4b5563", flexShrink: 0 }} />
                  <select
                    value={emp.categoria ?? ""}
                    onChange={async e => {
                      const cat = e.target.value || null;
                      updateEmpExtra(emp.id, { categoria: cat });
                      await saveEmpresa({ ...emp, categoria: cat });
                    }}
                    className="flex-1 rounded-xl text-xs outline-none"
                    style={{ background: "#161616", border: "1px solid #1f2937", color: emp.categoria ? "#fff" : "#4b5563", padding: "6px 10px" }}
                  >
                    <option value="">— Sem categoria —</option>
                    {destCats.filter(Boolean).map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : tab === "banners" ? (
        /* ── ABA BANNERS ── */
        <div className="space-y-4">
          <div className="rounded-2xl p-5 space-y-3" style={{ background: "#0f0f0f", border: "1px solid #1f2937" }}>
            <p className="text-sm font-semibold text-white">Novo Banner</p>
            <input style={IS} placeholder="Título *" value={bannerForm.titulo} onChange={e => setBannerForm(p => ({ ...p, titulo: e.target.value }))} />
            <input style={IS} placeholder="Subtítulo" value={bannerForm.subtitulo} onChange={e => setBannerForm(p => ({ ...p, subtitulo: e.target.value }))} />
            <input style={IS} placeholder="URL da imagem (opcional)" value={bannerForm.imagem_url} onChange={e => setBannerForm(p => ({ ...p, imagem_url: e.target.value }))} />
            <input style={IS} placeholder="Link ao clicar (opcional)" value={bannerForm.link_url} onChange={e => setBannerForm(p => ({ ...p, link_url: e.target.value }))} />
            <div className="flex items-center gap-3">
              <input type="color" value={bannerForm.cor_fundo} onChange={e => setBannerForm(p => ({ ...p, cor_fundo: e.target.value }))} className="w-10 h-10 rounded-lg cursor-pointer border-0" style={{ background: "transparent" }} />
              <span className="text-xs" style={{ color: "#6b7280" }}>Cor de fundo do banner</span>
            </div>
            <button onClick={addBanner} disabled={savingBanner || !bannerForm.titulo.trim()} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold" style={{ background: "rgba(228,0,43,0.12)", color: "#E4002B", border: "1px solid rgba(228,0,43,0.3)", opacity: !bannerForm.titulo.trim() ? 0.4 : 1 }}>
              {savingBanner ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              Adicionar Banner
            </button>
          </div>
          {banners.length === 0 ? (
            <p className="text-sm text-center py-8" style={{ color: "#4b5563" }}>Nenhum banner cadastrado. O carrossel exibe banners padrão.</p>
          ) : (
            <div className="space-y-2">
              {banners.map(b => (
                <div key={b.id} className="rounded-xl overflow-hidden" style={{ background: "#0f0f0f", border: "1px solid #1f2937" }}>
                  {editingBanner === b.id ? (
                    <div className="p-4 space-y-2">
                      <input style={IS} placeholder="Título" value={editBannerForm.titulo} onChange={e => setEditBannerForm(p => ({ ...p, titulo: e.target.value }))} />
                      <input style={IS} placeholder="Subtítulo" value={editBannerForm.subtitulo} onChange={e => setEditBannerForm(p => ({ ...p, subtitulo: e.target.value }))} />
                      <input style={IS} placeholder="URL da imagem" value={editBannerForm.imagem_url} onChange={e => setEditBannerForm(p => ({ ...p, imagem_url: e.target.value }))} />
                      <input style={IS} placeholder="Link ao clicar" value={editBannerForm.link_url} onChange={e => setEditBannerForm(p => ({ ...p, link_url: e.target.value }))} />
                      <div className="flex items-center gap-3">
                        <input type="color" value={editBannerForm.cor_fundo} onChange={e => setEditBannerForm(p => ({ ...p, cor_fundo: e.target.value }))} className="w-8 h-8 rounded cursor-pointer border-0" style={{ background: "transparent" }} />
                        <span className="text-xs flex-1" style={{ color: "#6b7280" }}>Cor de fundo</span>
                        <button onClick={() => updateBanner(b.id)} disabled={savingEditBanner} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold" style={{ background: "rgba(34,197,94,0.12)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.3)" }}>
                          {savingEditBanner ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />} Salvar
                        </button>
                        <button onClick={() => setEditingBanner(null)} className="flex items-center justify-center w-7 h-7 rounded-lg" style={{ color: "#6b7280", background: "#151515", border: "1px solid #1f2937" }}>
                          <XIcon size={13} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 px-4 py-3">
                      <div className="w-8 h-8 rounded-lg flex-shrink-0" style={{ background: b.cor_fundo }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{b.titulo}</p>
                        {b.subtitulo && <p className="text-xs truncate" style={{ color: "#6b7280" }}>{b.subtitulo}</p>}
                      </div>
                      <button onClick={() => { setEditingBanner(b.id); setEditBannerForm({ titulo: b.titulo, subtitulo: b.subtitulo ?? "", imagem_url: b.imagem_url ?? "", link_url: b.link_url ?? "", cor_fundo: b.cor_fundo }); }} className="w-7 h-7 flex items-center justify-center rounded-lg" style={{ color: "#818cf8", background: "rgba(129,140,248,0.08)", border: "1px solid rgba(129,140,248,0.2)" }}><Edit2 size={12} /></button>
                      <button onClick={() => deleteBanner(b.id)} className="w-7 h-7 flex items-center justify-center rounded-lg" style={{ color: "#ef4444", background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)" }}><Trash2 size={12} /></button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : tab === "categorias" ? (
        /* ── ABA CATEGORIAS ── */
        <div className="space-y-4">
          <div className="rounded-2xl p-5 space-y-3" style={{ background: "#0f0f0f", border: "1px solid #1f2937" }}>
            <p className="text-sm font-semibold text-white">Nova Categoria</p>
            <div className="flex gap-3">
              <input style={{ ...IS, width: 64, flexShrink: 0, textAlign: "center", fontSize: 20 }} placeholder="🍽️" value={catForm.emoji} onChange={e => setCatForm(p => ({ ...p, emoji: e.target.value }))} />
              <input style={{ ...IS, flex: 1 }} placeholder="Nome da categoria *" value={catForm.nome} onChange={e => setCatForm(p => ({ ...p, nome: e.target.value }))} />
            </div>
            <button onClick={addCategoria} disabled={savingCat || !catForm.nome.trim()} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold" style={{ background: "rgba(228,0,43,0.12)", color: "#E4002B", border: "1px solid rgba(228,0,43,0.3)", opacity: !catForm.nome.trim() ? 0.4 : 1 }}>
              {savingCat ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              Adicionar Categoria
            </button>
          </div>
          {categorias.length === 0 ? (
            <p className="text-sm text-center py-8" style={{ color: "#4b5563" }}>Nenhuma categoria cadastrada. O Explorar usa as categorias padrão.</p>
          ) : (
            <div className="space-y-2">
              {categorias.map(c => (
                <div key={c.id} className="rounded-xl overflow-hidden" style={{ background: "#0f0f0f", border: "1px solid #1f2937" }}>
                  {editingCat === c.id ? (
                    <div className="flex items-center gap-2 p-3">
                      <input style={{ ...IS, width: 52, flexShrink: 0, textAlign: "center", fontSize: 20, padding: "6px" }} value={editCatForm.emoji} onChange={e => setEditCatForm(p => ({ ...p, emoji: e.target.value }))} />
                      <input style={{ ...IS, flex: 1 }} placeholder="Nome" value={editCatForm.nome} onChange={e => setEditCatForm(p => ({ ...p, nome: e.target.value }))} />
                      <button onClick={() => updateCategoria(c.id)} disabled={savingEditCat} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold flex-shrink-0" style={{ background: "rgba(34,197,94,0.12)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.3)" }}>
                        {savingEditCat ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
                      </button>
                      <button onClick={() => setEditingCat(null)} className="w-7 h-7 flex items-center justify-center rounded-lg flex-shrink-0" style={{ color: "#6b7280", background: "#151515", border: "1px solid #1f2937" }}><XIcon size={13} /></button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 px-3 py-2">
                      <span style={{ fontSize: 20 }}>{c.emoji}</span>
                      <p className="text-sm font-semibold text-white flex-1 truncate">{c.nome}</p>
                      <button onClick={() => { setEditingCat(c.id); setEditCatForm({ nome: c.nome, emoji: c.emoji }); }} className="w-6 h-6 flex items-center justify-center rounded-lg" style={{ color: "#818cf8", background: "rgba(129,140,248,0.08)", border: "1px solid rgba(129,140,248,0.15)" }}><Edit2 size={11} /></button>
                      <button onClick={() => deleteCategoria(c.id)} className="w-6 h-6 flex items-center justify-center" style={{ color: "#ef4444" }}><Trash2 size={12} /></button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* ── ABA FLASH SALES ── */
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs" style={{ color: "#6b7280" }}>Todas as ofertas relâmpago · pode excluir qualquer uma</p>
            <button onClick={() => { setLoadingFs(true); fetch("/api/god/flash-sales").then(r => r.json()).then(d => setFlashSales(d.flash_sales ?? [])).finally(() => setLoadingFs(false)); }} className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg" style={{ color: "#E4002B", background: "rgba(228,0,43,0.08)", border: "1px solid rgba(228,0,43,0.2)" }}>
              <RefreshCw size={11} className={loadingFs ? "animate-spin" : ""} /> Atualizar
            </button>
          </div>

          {loadingFs ? (
            <div className="flex items-center justify-center py-12"><Loader2 size={22} className="animate-spin" style={{ color: "#E4002B" }} /></div>
          ) : flashSales.length === 0 ? (
            <p className="text-sm text-center py-8" style={{ color: "#4b5563" }}>Nenhuma oferta relâmpago cadastrada.</p>
          ) : (
            <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1" style={{ scrollbarWidth: "thin" }}>
              {flashSales.map(fs => {
                const expired = new Date(fs.termina_em) < new Date();
                const pct = fs.preco_original && fs.preco_original > fs.preco_flash
                  ? Math.round((1 - fs.preco_flash / fs.preco_original) * 100) : null;
                return (
                  <div key={fs.id} className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: "#0f0f0f", border: `1px solid ${expired ? "#1a1a1a" : "rgba(228,0,43,0.2)"}`, opacity: expired ? 0.6 : 1 }}>
                    {fs.imagem_url
                      ? <img src={fs.imagem_url} alt={fs.nome} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                      : <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 text-xl" style={{ background: "rgba(228,0,43,0.1)" }}>⚡</div>}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-white truncate">{fs.nome}</p>
                        {pct && <span className="text-xs font-bold px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444" }}>-{pct}%</span>}
                      </div>
                      <p className="text-xs truncate" style={{ color: "#6b7280" }}>{fs.empresa_nome}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs font-black" style={{ color: "#E4002B" }}>R$ {Number(fs.preco_flash).toFixed(2).replace(".", ",")}</span>
                        <span className="text-xs" style={{ color: expired ? "#ef4444" : "#22c55e" }}>
                          {expired ? "Expirada" : `até ${new Date(fs.termina_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`}
                        </span>
                      </div>
                    </div>
                    <button onClick={() => deleteFlashSale(fs.id)} disabled={deletingFs === fs.id} className="w-7 h-7 flex items-center justify-center rounded-lg flex-shrink-0" style={{ color: "#ef4444", background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)" }}>
                      {deletingFs === fs.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function GodClient({ empresas, error }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [view, setView] = useState<"empresas" | "motoboys" | "explorar">("empresas");
  const [search, setSearch] = useState("");

  // Aba motoboys global
  const [allMotoboys,    setAllMotoboys]    = useState<MotoboyGod[]>([]);
  const [loadingAllMb,   setLoadingAllMb]   = useState(false);
  const [mbSearch,       setMbSearch]       = useState("");
  const [mbStatusFilter, setMbStatusFilter] = useState<"todos" | "disponivel" | "em_entrega" | "offline">("todos");

  useEffect(() => {
    if (view !== "motoboys") return;
    setLoadingAllMb(true);
    fetch("/api/god/all-motoboys")
      .then(r => r.json())
      .then(d => setAllMotoboys(Array.isArray(d) ? d : []))
      .finally(() => setLoadingAllMb(false));
  }, [view]);

  // Assinatura
  const [toggling,   setToggling]   = useState<string | null>(null);
  const [diasTarget, setDiasTarget] = useState<string | null>(null);
  const [diasInput,  setDiasInput]  = useState("30");
  const [savingDias, setSavingDias] = useState(false);

  // Plano
  const [planoTarget, setPlanoTarget] = useState<string | null>(null);
  const [savingPlano, setSavingPlano] = useState(false);

  // Delete empresa
  const [deleting, setDeleting] = useState<string | null>(null);

  // Criar empresa
  const [showCreate,    setShowCreate]    = useState(false);
  const [createForm,    setCreateForm]    = useState({ nome: "", email: "", senha: "", plano: "pro" as Plano, dias: 365 });
  const [creatingEmp,   setCreatingEmp]   = useState(false);
  const [createResult,  setCreateResult]  = useState<{ nome: string; email: string; codigo: string; plano: Plano } | null>(null);
  const [showSenha,     setShowSenha]     = useState(false);
  const [copiado,       setCopiado]       = useState(false);

  function fecharCreate() {
    setShowCreate(false);
    setCreateResult(null);
    setCreateForm({ nome: "", email: "", senha: "", plano: "pro", dias: 365 });
    setShowSenha(false);
  }

  async function handleCreateEmpresa(e: React.FormEvent) {
    e.preventDefault();
    setCreatingEmp(true);
    try {
      const res = await fetch("/api/god/create-empresa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao criar empresa");
      setCreateResult(data.empresa);
      startTransition(() => router.refresh());
    } catch (err) { alert("Erro: " + (err as Error).message); }
    finally { setCreatingEmp(false); }
  }

  function copiarCodigo(codigo: string) {
    navigator.clipboard.writeText(codigo);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  // Motoboys por empresa
  const [expandedMb,    setExpandedMb]    = useState<string | null>(null);
  const [mbData,        setMbData]        = useState<Record<string, MotoboySummary[]>>({});
  const [loadingMb,     setLoadingMb]     = useState(false);
  const [removingMb,    setRemovingMb]    = useState<string | null>(null);
  const [addMbTarget,   setAddMbTarget]   = useState<string | null>(null);
  const [addMbNome,     setAddMbNome]     = useState("");
  const [addMbTel,      setAddMbTel]      = useState("");
  const [savingMb,      setSavingMb]      = useState(false);

  const ativas = empresas.filter((e) => e.assinatura_ativa).length;
  const totalPedidos = empresas.reduce((s, e) => s + Number(e.total_pedidos), 0);
  const totalMotoboys = empresas.reduce((s, e) => s + Number(e.total_motoboys), 0);

  const filtered = empresas.filter(
    (e) =>
      e.nome.toLowerCase().includes(search.toLowerCase()) ||
      e.email.toLowerCase().includes(search.toLowerCase()) ||
      (e.cnpj ?? "").includes(search)
  );

  async function handleLogout() {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  async function toggleAssinatura(empresa: EmpresaRow) {
    setToggling(empresa.id);
    try {
      const res = await fetch("/api/god/toggle-assinatura", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empresaId: empresa.id, ativo: !empresa.assinatura_ativa }),
      });
      if (!res.ok) throw new Error(await res.text());
      startTransition(() => router.refresh());
    } catch (err) { alert("Erro: " + (err as Error).message); }
    finally { setToggling(null); }
  }

  async function handleSetDias(empresa: EmpresaRow) {
    const dias = parseInt(diasInput, 10);
    if (!dias || dias < 1) return;
    setSavingDias(true);
    try {
      const res = await fetch("/api/god/set-dias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empresaId: empresa.id, dias }),
      });
      if (!res.ok) throw new Error(await res.text());
      setDiasTarget(null);
      startTransition(() => router.refresh());
    } catch (err) { alert("Erro: " + (err as Error).message); }
    finally { setSavingDias(false); }
  }

  async function handleSetPlano(empresaId: string, plano: Plano) {
    setSavingPlano(true);
    try {
      const res = await fetch("/api/god/set-plano", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empresaId, plano }),
      });
      if (!res.ok) throw new Error(await res.text());
      setPlanoTarget(null);
      startTransition(() => router.refresh());
    } catch (err) { alert("Erro: " + (err as Error).message); }
    finally { setSavingPlano(false); }
  }

  async function deleteEmpresa(empresa: EmpresaRow) {
    if (!window.confirm(`Excluir "${empresa.nome}"?\n\nIsso remove a conta, todos os pedidos e motoboys. Ação irreversível.`)) return;
    setDeleting(empresa.id);
    try {
      const res = await fetch("/api/god/delete-empresa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empresaId: empresa.id }),
      });
      if (!res.ok) throw new Error(await res.text());
      startTransition(() => router.refresh());
    } catch (err) { alert("Erro: " + (err as Error).message); }
    finally { setDeleting(null); }
  }

  async function toggleMotoboys(empresaId: string) {
    if (expandedMb === empresaId) { setExpandedMb(null); return; }
    setLoadingMb(true);
    setExpandedMb(empresaId);
    try {
      const res = await fetch(`/api/god/motoboys?empresaId=${empresaId}`);
      const data = await res.json();
      setMbData(prev => ({ ...prev, [empresaId]: data }));
    } catch { /* silent */ }
    finally { setLoadingMb(false); }
  }

  async function removeMotoboy(empresaId: string, motoboyId: string) {
    if (!window.confirm("Remover este motoboy?")) return;
    setRemovingMb(motoboyId);
    try {
      const res = await fetch("/api/god/motoboys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motoboyId }),
      });
      if (!res.ok) throw new Error(await res.text());
      setMbData(prev => ({ ...prev, [empresaId]: prev[empresaId].filter(m => m.id !== motoboyId) }));
    } catch (err) { alert("Erro: " + (err as Error).message); }
    finally { setRemovingMb(null); }
  }

  async function addMotoboy(empresaId: string) {
    if (!addMbNome.trim() || !addMbTel.trim()) return;
    setSavingMb(true);
    try {
      const res = await fetch("/api/god/motoboys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empresaId, nome: addMbNome.trim(), telefone: addMbTel.trim() }),
      });
      if (!res.ok) throw new Error(await res.text());
      const novo = await res.json();
      setMbData(prev => ({ ...prev, [empresaId]: [...(prev[empresaId] ?? []), novo] }));
      setAddMbNome(""); setAddMbTel(""); setAddMbTarget(null);
    } catch (err) { alert("Erro: " + (err as Error).message); }
    finally { setSavingMb(false); }
  }

  const STATUS_MB_COLOR: Record<string, string> = {
    disponivel: "#22c55e", em_entrega: "#fbbf24", offline: "#64748b",
  };

  return (
    <div data-god className="min-h-screen" style={{ background: "#070707", color: "#e5e7eb" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 md:px-8 py-4 md:py-5"
        style={{ borderBottom: "1px solid #1a1a1a", background: "#0a0a0a" }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: "linear-gradient(135deg,rgba(251,191,36,0.25),rgba(251,191,36,0.06))", border: "1px solid rgba(251,191,36,0.3)", boxShadow: "0 0 20px rgba(251,191,36,0.15)" }}>
            <Crown size={18} style={{ color: "#fbbf24" }} />
          </div>
          <div>
            <h1 className="text-base font-bold text-white" style={{ letterSpacing: "-0.03em" }}>Painel God</h1>
            <p className="text-xs" style={{ color: "#4b5563" }}>Vellox — Controle Total</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => startTransition(() => router.refresh())} disabled={isPending}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium"
            style={{ border: "1px solid #1f2937", color: "#6b7280", background: "transparent" }}>
            <RefreshCw size={13} className={isPending ? "animate-spin" : ""} />
            <span className="hidden sm:inline">Atualizar</span>
          </button>
          <button onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium"
            style={{ border: "1px solid rgba(228,0,43,0.2)", color: "#FFC72C", background: "rgba(228,0,43,0.06)" }}>
            <LogOut size={13} />
            <span className="hidden sm:inline">Sair</span>
          </button>
        </div>
      </div>

      <div className="px-4 md:px-8 py-6 md:py-8 max-w-7xl mx-auto">

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-xl mb-6 w-fit"
          style={{ background: "#0f0f0f", border: "1px solid #1a1a1a" }}>
          {([
            { key: "empresas",  label: "Empresas",  icon: Building2 },
            { key: "motoboys",  label: "Motoboys",  icon: Bike },
            { key: "explorar",  label: "Explorar",  icon: Compass },
          ] as const).map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setView(key)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all"
              style={view === key
                ? { background: "rgba(251,191,36,0.15)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.3)" }
                : { background: "transparent", color: "#4b5563", border: "1px solid transparent" }}>
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>

        {/* ── ABA MOTOBOYS ────────────────────────────────────────── */}
        {view === "motoboys" && (() => {
          const mbFiltered = allMotoboys.filter(m => {
            if (mbStatusFilter !== "todos" && m.status !== mbStatusFilter) return false;
            const q = mbSearch.toLowerCase();
            return !q || m.nome.toLowerCase().includes(q) || m.empresa_nome.toLowerCase().includes(q) || (m.telefone ?? "").includes(q) || (m.codigo ?? "").toLowerCase().includes(q);
          });
          const totDisp  = allMotoboys.filter(m => m.status === "disponivel").length;
          const totRota  = allMotoboys.filter(m => m.status === "em_entrega").length;
          const totOff   = allMotoboys.filter(m => m.status === "offline").length;
          const ganhoHoje = allMotoboys.reduce((s, m) => s + Number(m.ganho_hoje), 0);

          return (
            <>
              {/* Mini stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                {[
                  { label: "Total",        value: allMotoboys.length, color: "#e5e7eb" },
                  { label: "Disponíveis",  value: totDisp,            color: "#22c55e" },
                  { label: "Em entrega",   value: totRota,            color: "#fbbf24" },
                  { label: "Ganho hoje",   value: `R$ ${ganhoHoje.toFixed(2)}`, color: "#818cf8" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="rounded-xl p-4"
                    style={{ background: "#0f0f0f", border: "1px solid #1a1a1a" }}>
                    <p className="text-xs mb-1" style={{ color: "#4b5563" }}>{label}</p>
                    <p className="text-xl font-black" style={{ color }}>{value}</p>
                  </div>
                ))}
              </div>

              {/* Busca + filtro status */}
              <div className="flex flex-wrap gap-2 mb-4">
                <div className="relative flex-1 min-w-48">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#4b5563" }} />
                  <input type="text" placeholder="Nome, empresa, telefone, código..."
                    value={mbSearch} onChange={e => setMbSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 rounded-xl text-sm text-white placeholder-gray-700 outline-none"
                    style={{ background: "#0f0f0f", border: "1px solid #1a1a1a" }} />
                </div>
                <div className="flex gap-1">
                  {(["todos", "disponivel", "em_entrega", "offline"] as const).map(s => (
                    <button key={s} onClick={() => setMbStatusFilter(s)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium"
                      style={mbStatusFilter === s
                        ? { background: "rgba(251,191,36,0.15)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.3)" }
                        : { background: "#0f0f0f", color: "#4b5563", border: "1px solid #1a1a1a" }}>
                      {s === "todos" ? "Todos" : s === "disponivel" ? "Disponível" : s === "em_entrega" ? "Em entrega" : "Offline"}
                    </button>
                  ))}
                </div>
              </div>

              {loadingAllMb ? (
                <div className="flex items-center gap-2 py-12 justify-center text-sm" style={{ color: "#4b5563" }}>
                  <Loader2 size={16} className="animate-spin" /> Carregando motoboys...
                </div>
              ) : mbFiltered.length === 0 ? (
                <div className="text-center py-12 text-sm" style={{ color: "#4b5563" }}>Nenhum motoboy encontrado.</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {mbFiltered.map(mb => {
                    const statusColor = mb.status === "disponivel" ? "#22c55e" : mb.status === "em_entrega" ? "#fbbf24" : "#64748b";
                    const statusLabel = mb.status === "disponivel" ? "Disponível" : mb.status === "em_entrega" ? "Em entrega" : "Offline";
                    const planoCfg = PLANO_CFG[mb.empresa_plano ?? "basic"];
                    return (
                      <div key={mb.id} className="rounded-2xl p-4 space-y-3"
                        style={{ background: "#0f0f0f", border: "1px solid #1a1a1a" }}>
                        {/* Header */}
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-black shrink-0"
                            style={{ background: `${statusColor}18`, color: statusColor }}>
                            {mb.nome.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-bold text-white truncate">{mb.nome}</p>
                              {mb.status === "disponivel"
                                ? <Wifi size={11} style={{ color: "#22c55e", flexShrink: 0 }} />
                                : mb.status === "em_entrega"
                                  ? <Bike size={11} style={{ color: "#fbbf24", flexShrink: 0 }} />
                                  : <WifiOff size={11} style={{ color: "#374151", flexShrink: 0 }} />}
                            </div>
                            <p className="text-xs truncate" style={{ color: "#6b7280" }}>{mb.empresa_nome}</p>
                          </div>
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full shrink-0"
                            style={{ background: `${statusColor}15`, color: statusColor, border: `1px solid ${statusColor}30` }}>
                            {statusLabel}
                          </span>
                        </div>

                        {/* Info */}
                        <div className="grid grid-cols-2 gap-2">
                          <div className="rounded-lg p-2.5" style={{ background: "#151515" }}>
                            <p className="text-xs mb-1" style={{ color: "#374151" }}>Hoje</p>
                            <p className="text-sm font-black" style={{ color: "#fbbf24" }}>
                              {mb.entregas_hoje} entregas
                            </p>
                            <p className="text-xs font-semibold" style={{ color: "#fbbf24" }}>
                              R$ {Number(mb.ganho_hoje).toFixed(2)}
                            </p>
                          </div>
                          <div className="rounded-lg p-2.5" style={{ background: "#151515" }}>
                            <p className="text-xs mb-1" style={{ color: "#374151" }}>Total</p>
                            <p className="text-sm font-black" style={{ color: "#818cf8" }}>
                              {mb.total_entregas} entregas
                            </p>
                            <p className="text-xs font-semibold" style={{ color: "#818cf8" }}>
                              R$ {Number(mb.ganho_total).toFixed(2)}
                            </p>
                          </div>
                        </div>

                        {/* Footer */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="flex items-center gap-1 text-xs" style={{ color: "#4b5563" }}>
                            <Phone size={10} /> {mb.telefone}
                          </div>
                          {mb.codigo && (
                            <span className="text-xs font-mono font-bold px-1.5 py-0.5 rounded"
                              style={{ background: "#1a1a1a", color: "#6b7280", border: "1px solid #222" }}>
                              {mb.codigo}
                            </span>
                          )}
                          <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full"
                            style={{ background: planoCfg.bg, color: planoCfg.color, border: `1px solid ${planoCfg.border}` }}>
                            {planoCfg.label}
                          </span>
                          {mb.posicao_fila != null && mb.status === "disponivel" && (
                            <span className="text-xs font-bold px-1.5 py-0.5 rounded"
                              style={{ background: "rgba(251,191,36,0.08)", color: "#fbbf24" }}>
                              #{mb.posicao_fila} fila
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          );
        })()}

        {/* ── ABA EMPRESAS ─────────────────────────────────────────── */}
        {view !== "motoboys" && <>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6 md:mb-8">
          {[
            { icon: Building2, label: "Empresas",           value: empresas.length, color: "#E4002B" },
            { icon: Shield,    label: "Assinaturas Ativas", value: ativas,          color: "#4ade80" },
            { icon: ShoppingBag, label: "Total de Pedidos", value: totalPedidos,    color: "#fbbf24" },
            { icon: Users,     label: "Total de Motoboys",  value: totalMotoboys,   color: "#818cf8" },
          ].map(({ icon: Icon, label, value, color }) => (
            <div key={label} className="rounded-2xl p-5"
              style={{ background: "#0f0f0f", border: "1px solid #1a1a1a", boxShadow: "0 4px 20px rgba(0,0,0,0.3)" }}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3"
                style={{ background: `${color}14`, border: `1px solid ${color}22` }}>
                <Icon size={16} style={{ color }} />
              </div>
              <p className="text-2xl font-black text-white" style={{ letterSpacing: "-0.05em" }}>{value}</p>
              <p className="text-xs mt-1" style={{ color: "#4b5563" }}>{label}</p>
            </div>
          ))}
        </div>

        {/* Search + Nova Empresa */}
        <div className="flex gap-2 mb-5">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: "#4b5563" }} />
            <input type="text" placeholder="Buscar por nome, e-mail ou CNPJ..."
              value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm text-white placeholder-gray-700 outline-none"
              style={{ background: "#0f0f0f", border: "1px solid #1a1a1a" }} />
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold shrink-0"
            style={{ background: "rgba(34,197,94,0.12)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.25)" }}>
            <Plus size={14} /> Nova empresa
          </button>
        </div>

        {error && (
          <div className="mb-5 px-4 py-3 rounded-xl text-sm"
            style={{ background: "rgba(228,0,43,0.08)", border: "1px solid rgba(228,0,43,0.2)", color: "#FFC72C" }}>
            Erro ao carregar empresas: {error}
          </div>
        )}

        {/* Lista de empresas */}
        <div className="space-y-3">
          {filtered.length === 0 && (
            <div className="text-center py-12 text-sm" style={{ color: "#4b5563" }}>Nenhuma empresa encontrada.</div>
          )}

          {filtered.map((empresa) => {
            const mbs = mbData[empresa.id] ?? [];
            const isExpanded = expandedMb === empresa.id;

            return (
              <div key={empresa.id} className="rounded-2xl overflow-hidden"
                style={{ background: "#0f0f0f", border: "1px solid #1a1a1a" }}>

                {/* ── Linha principal ── */}
                <div className="p-4 flex flex-wrap items-start gap-3">
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-white">{empresa.nome}</p>
                      {/* Plano */}
                      {planoTarget === empresa.id ? (
                        <div className="flex items-center gap-1">
                          {(["basic", "pro", "enterprise", "ktl"] as Plano[]).map(p => (
                            <button key={p} onClick={() => handleSetPlano(empresa.id, p)} disabled={savingPlano}
                              className="px-2 py-0.5 rounded-full text-xs font-bold"
                              style={{ background: PLANO_CFG[p].bg, color: PLANO_CFG[p].color, border: `1px solid ${PLANO_CFG[p].border}`, cursor: "pointer" }}>
                              {savingPlano ? <Loader2 size={9} className="animate-spin" /> : PLANO_CFG[p].label}
                            </button>
                          ))}
                          <button onClick={() => setPlanoTarget(null)}
                            style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", padding: 0 }}>
                            <XCircle size={12} />
                          </button>
                        </div>
                      ) : (
                        <PlanoBadge plano={empresa.plano ?? "basic"} onClick={() => setPlanoTarget(empresa.id)} />
                      )}
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: "#6b7280" }}>{empresa.email}</p>
                    <p className="text-xs mt-0.5" style={{ color: "#374151" }}>
                      {empresa.cnpj ?? "Sem CNPJ"} · criada {fmtDate(empresa.created_at)}
                    </p>
                  </div>

                  {/* Controles */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {/* Assinatura toggle */}
                    <button onClick={() => toggleAssinatura(empresa)} disabled={toggling === empresa.id}
                      style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}>
                      {toggling === empresa.id
                        ? <RefreshCw size={13} className="animate-spin" style={{ color: "#6b7280" }} />
                        : <StatusBadge ativa={empresa.assinatura_ativa} />}
                    </button>

                    {/* Dias */}
                    {diasTarget === empresa.id ? (
                      <div className="flex items-center gap-1">
                        <input type="number" min="1" max="3650" value={diasInput}
                          onChange={e => setDiasInput(e.target.value)}
                          onKeyDown={e => e.key === "Enter" && handleSetDias(empresa)}
                          autoFocus className="w-16 px-2 py-0.5 rounded text-xs text-white outline-none"
                          style={{ background: "#1a1a1a", border: "1px solid rgba(251,191,36,0.4)" }} />
                        <span className="text-xs" style={{ color: "#4b5563" }}>dias</span>
                        <button onClick={() => handleSetDias(empresa)} disabled={savingDias}
                          className="flex items-center justify-center w-5 h-5 rounded"
                          style={{ background: "rgba(251,191,36,0.2)", color: "#fbbf24", border: "none", cursor: "pointer" }}>
                          {savingDias ? <RefreshCw size={9} className="animate-spin" /> : <Check size={9} />}
                        </button>
                        <button onClick={() => setDiasTarget(null)}
                          className="flex items-center justify-center w-5 h-5 rounded"
                          style={{ background: "rgba(228,0,43,0.08)", color: "#FFC72C", border: "none", cursor: "pointer" }}>
                          <XCircle size={9} />
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => { setDiasTarget(empresa.id); setDiasInput("30"); }}
                        className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg"
                        style={{ color: "#6b7280", background: "#151515", border: "1px solid #222", cursor: "pointer" }}
                        onMouseEnter={e => (e.currentTarget.style.color = "#fbbf24")}
                        onMouseLeave={e => (e.currentTarget.style.color = "#6b7280")}>
                        <Clock size={11} />
                        {empresa.assinatura_expira_em ? `exp. ${fmtDate(empresa.assinatura_expira_em)}` : "definir dias"}
                      </button>
                    )}

                    {/* Motoboys expand */}
                    <button onClick={() => toggleMotoboys(empresa.id)}
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg"
                      style={{ color: "#818cf8", background: "rgba(129,140,248,0.08)", border: "1px solid rgba(129,140,248,0.2)", cursor: "pointer" }}>
                      <Bike size={11} />
                      {empresa.total_motoboys} motoboys
                      {isExpanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                    </button>

                    {/* Stats */}
                    <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg"
                      style={{ color: "#fbbf24", background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.12)" }}>
                      <TrendingUp size={11} /> {empresa.total_pedidos} pedidos
                    </span>

                    {/* Delete */}
                    <button onClick={() => deleteEmpresa(empresa)} disabled={deleting === empresa.id}
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg"
                      style={{ color: "#FFC72C", background: "rgba(228,0,43,0.06)", border: "1px solid rgba(228,0,43,0.15)", cursor: "pointer" }}>
                      {deleting === empresa.id ? <RefreshCw size={11} className="animate-spin" /> : <Trash2 size={11} />}
                      {deleting === empresa.id ? "..." : "Excluir"}
                    </button>
                  </div>
                </div>

                {/* ── Painel de motoboys ── */}
                {isExpanded && (
                  <div style={{ borderTop: "1px solid #1a1a1a", background: "#080808", padding: "16px" }}>
                    {loadingMb && expandedMb === empresa.id ? (
                      <div className="flex items-center gap-2 text-xs" style={{ color: "#4b5563" }}>
                        <Loader2 size={13} className="animate-spin" /> Carregando motoboys...
                      </div>
                    ) : (
                      <>
                        {/* Lista */}
                        {mbs.length === 0 ? (
                          <p className="text-xs mb-3" style={{ color: "#4b5563" }}>Nenhum motoboy cadastrado.</p>
                        ) : (
                          <div className="space-y-2 mb-3">
                            {mbs.map(mb => (
                              <div key={mb.id} className="flex items-center gap-3 px-3 py-2 rounded-xl"
                                style={{ background: "#0f0f0f", border: "1px solid #1a1a1a" }}>
                                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                                  style={{ background: `${STATUS_MB_COLOR[mb.status] ?? "#64748b"}18`, color: STATUS_MB_COLOR[mb.status] ?? "#64748b" }}>
                                  {mb.nome.charAt(0).toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-semibold text-white truncate">{mb.nome}</p>
                                  <p className="text-xs" style={{ color: "#4b5563" }}>{mb.telefone}</p>
                                </div>
                                {mb.codigo && (
                                  <span className="text-xs font-mono font-bold px-1.5 py-0.5 rounded"
                                    style={{ background: "#151515", color: "#6b7280", border: "1px solid #222" }}>
                                    {mb.codigo}
                                  </span>
                                )}
                                <span className="text-xs font-medium px-2 py-0.5 rounded-full"
                                  style={{ background: `${STATUS_MB_COLOR[mb.status] ?? "#64748b"}18`, color: STATUS_MB_COLOR[mb.status] ?? "#64748b" }}>
                                  {mb.status === "disponivel" ? "Disponível" : mb.status === "em_entrega" ? "Em entrega" : "Offline"}
                                </span>
                                <button onClick={() => removeMotoboy(empresa.id, mb.id)} disabled={removingMb === mb.id}
                                  className="p-1 rounded-lg shrink-0"
                                  style={{ color: "#374151", background: "none", border: "none", cursor: "pointer" }}
                                  onMouseEnter={e => (e.currentTarget.style.color = "#FFC72C")}
                                  onMouseLeave={e => (e.currentTarget.style.color = "#374151")}>
                                  {removingMb === mb.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Form add motoboy */}
                        {addMbTarget === empresa.id ? (
                          <div className="flex items-center gap-2 flex-wrap">
                            <input type="text" placeholder="Nome" value={addMbNome}
                              onChange={e => setAddMbNome(e.target.value)}
                              className="px-3 py-1.5 rounded-lg text-xs text-white outline-none"
                              style={{ background: "#151515", border: "1px solid rgba(34,197,94,0.3)", width: 140 }} />
                            <input type="text" placeholder="Telefone" value={addMbTel}
                              onChange={e => setAddMbTel(e.target.value)}
                              onKeyDown={e => e.key === "Enter" && addMotoboy(empresa.id)}
                              className="px-3 py-1.5 rounded-lg text-xs text-white outline-none"
                              style={{ background: "#151515", border: "1px solid rgba(34,197,94,0.3)", width: 130 }} />
                            <button onClick={() => addMotoboy(empresa.id)} disabled={savingMb}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold"
                              style={{ background: "rgba(34,197,94,0.15)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.3)", cursor: "pointer" }}>
                              {savingMb ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                              Salvar
                            </button>
                            <button onClick={() => { setAddMbTarget(null); setAddMbNome(""); setAddMbTel(""); }}
                              style={{ background: "none", border: "none", color: "#4b5563", cursor: "pointer", padding: 4 }}>
                              <XCircle size={13} />
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => setAddMbTarget(empresa.id)}
                            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg"
                            style={{ background: "rgba(34,197,94,0.08)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.2)", cursor: "pointer" }}>
                            <Plus size={12} /> Adicionar motoboy
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        </> /* fim aba empresas */}

        {/* ── ABA EXPLORAR ─────────────────────────────────────────── */}
        {view === "explorar" && <ExplorarGodPanel />}

        <p className="text-center text-xs mt-6" style={{ color: "#1f2937" }}>
          Vellox God Panel · {empresas.length} empresa{empresas.length !== 1 ? "s" : ""} · {allMotoboys.length > 0 ? `${allMotoboys.length} motoboys` : ""}
        </p>
      </div>

      {/* ── Modal: Criar Empresa ── */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(6px)" }}
          onClick={(e) => e.target === e.currentTarget && fecharCreate()}
        >
          <div className="w-full max-w-md rounded-2xl p-6" style={{ background: "#0f0f0f", border: "1px solid #1f2937" }}>

            {createResult ? (
              /* ── Sucesso ── */
              <div className="text-center py-2">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
                  style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.25)" }}>
                  <CheckCircle2 size={26} style={{ color: "#4ade80" }} />
                </div>
                <h2 className="text-lg font-bold text-white mb-1">Empresa criada!</h2>
                <p className="text-sm mb-5" style={{ color: "#6b7280" }}>
                  {createResult.email} · plano <span style={{ color: PLANO_CFG[createResult.plano].color }}>{PLANO_CFG[createResult.plano].label}</span>
                </p>

                {/* Código */}
                <div className="rounded-xl p-4 mb-4" style={{ background: "#151515", border: "1px solid rgba(251,191,36,0.2)" }}>
                  <p className="text-xs mb-2 font-semibold uppercase tracking-wide" style={{ color: "#4b5563" }}>Código da empresa</p>
                  <div className="flex items-center justify-center gap-3">
                    <span className="text-3xl font-black tracking-widest" style={{ color: "#fbbf24", fontFamily: "monospace" }}>
                      {createResult.codigo}
                    </span>
                    <button
                      onClick={() => copiarCodigo(createResult.codigo)}
                      className="w-9 h-9 rounded-xl flex items-center justify-center transition-all"
                      style={{ background: "rgba(251,191,36,0.1)", color: copiado ? "#4ade80" : "#fbbf24", border: "1px solid rgba(251,191,36,0.2)" }}>
                      {copiado ? <Check size={15} /> : <Copy size={15} />}
                    </button>
                  </div>
                </div>

                {/* Credenciais */}
                <div className="rounded-xl p-3 mb-5 text-left" style={{ background: "#151515", border: "1px solid #1f2937" }}>
                  <p className="text-xs mb-1.5 font-semibold uppercase tracking-wide" style={{ color: "#4b5563" }}>Credenciais de acesso</p>
                  <p className="text-xs" style={{ color: "#9ca3af" }}>Email: <span className="text-white font-mono">{createResult.email}</span></p>
                  <p className="text-xs mt-1" style={{ color: "#9ca3af" }}>Senha: <span className="text-white font-mono">{createForm.senha}</span></p>
                </div>

                <button
                  onClick={fecharCreate}
                  className="w-full py-2.5 rounded-xl text-sm font-bold"
                  style={{ background: "rgba(34,197,94,0.12)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.25)" }}>
                  Fechar
                </button>
              </div>
            ) : (
              /* ── Formulário ── */
              <>
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                      style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)" }}>
                      <Building2 size={16} style={{ color: "#4ade80" }} />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-white">Nova empresa</h2>
                      <p className="text-xs" style={{ color: "#4b5563" }}>Conta criada sem precisar de pagamento</p>
                    </div>
                  </div>
                  <button onClick={fecharCreate} style={{ color: "#4b5563", background: "none", border: "none", cursor: "pointer" }}>
                    <XCircle size={18} />
                  </button>
                </div>

                <form onSubmit={handleCreateEmpresa} className="space-y-4">
                  {/* Nome */}
                  <div>
                    <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: "#4b5563" }}>Nome da empresa</label>
                    <input
                      type="text" required
                      value={createForm.nome}
                      onChange={(e) => setCreateForm(f => ({ ...f, nome: e.target.value }))}
                      placeholder="Ex: Delivery Exemplo"
                      className="w-full px-4 py-2.5 rounded-xl text-sm placeholder-gray-500 outline-none"
                      style={{ background: "#151515", border: "1px solid #1f2937", color: "#e5e7eb" }}
                      onFocus={(e) => (e.target.style.borderColor = "rgba(34,197,94,0.4)")}
                      onBlur={(e) => (e.target.style.borderColor = "#1f2937")}
                    />
                  </div>

                  {/* Email */}
                  <div>
                    <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: "#4b5563" }}>Email</label>
                    <input
                      type="email" required
                      value={createForm.email}
                      onChange={(e) => setCreateForm(f => ({ ...f, email: e.target.value }))}
                      placeholder="empresa@exemplo.com"
                      className="w-full px-4 py-2.5 rounded-xl text-sm placeholder-gray-500 outline-none"
                      style={{ background: "#151515", border: "1px solid #1f2937", color: "#e5e7eb" }}
                      onFocus={(e) => (e.target.style.borderColor = "rgba(34,197,94,0.4)")}
                      onBlur={(e) => (e.target.style.borderColor = "#1f2937")}
                    />
                  </div>

                  {/* Senha */}
                  <div>
                    <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: "#4b5563" }}>Senha</label>
                    <div className="relative">
                      <KeyRound size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#374151" }} />
                      <input
                        type={showSenha ? "text" : "password"} required minLength={6}
                        value={createForm.senha}
                        onChange={(e) => setCreateForm(f => ({ ...f, senha: e.target.value }))}
                        placeholder="Mínimo 6 caracteres"
                        className="w-full pl-9 pr-10 py-2.5 rounded-xl text-sm placeholder-gray-500 outline-none"
                        style={{ background: "#151515", border: "1px solid #1f2937", color: "#e5e7eb" }}
                        onFocus={(e) => (e.target.style.borderColor = "rgba(34,197,94,0.4)")}
                        onBlur={(e) => (e.target.style.borderColor = "#1f2937")}
                      />
                      <button
                        type="button"
                        onClick={() => setShowSenha(s => !s)}
                        className="absolute right-3 top-1/2 -translate-y-1/2"
                        style={{ color: "#374151", background: "none", border: "none", cursor: "pointer" }}>
                        {showSenha ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>

                  {/* Plano */}
                  <div>
                    <label className="block text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: "#4b5563" }}>Plano</label>
                    <div className="flex gap-2">
                      {(["basic", "pro", "enterprise", "ktl"] as Plano[]).map(p => {
                        const cfg = PLANO_CFG[p];
                        const selected = createForm.plano === p;
                        return (
                          <button
                            key={p} type="button"
                            onClick={() => setCreateForm(f => ({ ...f, plano: p }))}
                            className="flex-1 py-2 rounded-xl text-xs font-bold transition-all"
                            style={{
                              background: selected ? cfg.bg : "#151515",
                              color: selected ? cfg.color : "#4b5563",
                              border: `1px solid ${selected ? cfg.border : "#1f2937"}`,
                            }}>
                            {cfg.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Dias de assinatura */}
                  <div>
                    <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: "#4b5563" }}>
                      Dias de assinatura
                    </label>
                    <div className="flex gap-2">
                      {[30, 90, 365].map(d => (
                        <button
                          key={d} type="button"
                          onClick={() => setCreateForm(f => ({ ...f, dias: d }))}
                          className="flex-1 py-2 rounded-xl text-xs font-bold"
                          style={{
                            background: createForm.dias === d ? "rgba(251,191,36,0.12)" : "#151515",
                            color: createForm.dias === d ? "#fbbf24" : "#4b5563",
                            border: `1px solid ${createForm.dias === d ? "rgba(251,191,36,0.3)" : "#1f2937"}`,
                          }}>
                          {d === 365 ? "1 ano" : `${d} dias`}
                        </button>
                      ))}
                      <input
                        type="number" min="1" max="3650"
                        value={createForm.dias}
                        onChange={(e) => setCreateForm(f => ({ ...f, dias: parseInt(e.target.value) || 365 }))}
                        className="w-20 px-3 py-2 rounded-xl text-xs text-white outline-none text-center"
                        style={{ background: "#151515", border: "1px solid #1f2937" }}
                        onFocus={(e) => (e.target.style.borderColor = "rgba(251,191,36,0.4)")}
                        onBlur={(e) => (e.target.style.borderColor = "#1f2937")}
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={creatingEmp}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold mt-2"
                    style={{ background: "rgba(34,197,94,0.15)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.3)" }}>
                    {creatingEmp
                      ? <><Loader2 size={15} className="animate-spin" /> Criando empresa...</>
                      : <><Plus size={15} /> Criar empresa</>}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
