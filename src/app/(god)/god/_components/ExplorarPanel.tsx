"use client";

import { useEffect, useState } from "react";
import { Building2, Image as ImageIcon, Tag, Zap, Search, Star, Loader2, Plus, Save, X, Edit2, Trash2, RefreshCw, ExternalLink, Palette } from "lucide-react";
import { Seg, Carregando, Vazio, Secao, Avatar } from "./ui";

interface EmpresaExtra { id: string; nome: string; assinatura_ativa: boolean; destaque: boolean; categoria: string | null }
interface BannerRow { id: string; titulo: string; subtitulo: string | null; cor_fundo: string; imagem_url: string | null; link_url: string | null }
interface CatRow { id: string; nome: string; emoji: string }
interface FlashSaleGod {
  id: string; empresa_id: string; empresa_nome: string; nome: string; descricao: string | null;
  preco_original: number | null; preco_flash: number; imagem_url: string | null; ativo: boolean; termina_em: string; created_at: string;
}

const BANNER_VAZIO = { titulo: "", subtitulo: "", imagem_url: "", link_url: "", cor_fundo: "#E4002B" };
type Aba = "empresas" | "banners" | "categorias" | "flash_sales";

// Mesmas chamadas do painel antigo: /api/god/explorar (GET/POST/PATCH/DELETE) e /api/god/flash-sales
export default function ExplorarPanel() {
  const [banners, setBanners] = useState<BannerRow[]>([]);
  const [categorias, setCategorias] = useState<CatRow[]>([]);
  const [empExtras, setEmpExtras] = useState<EmpresaExtra[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingBanner, setSavingBanner] = useState(false);
  const [savingCat, setSavingCat] = useState(false);
  const [savingEmp, setSavingEmp] = useState<string | null>(null);
  const [bannerForm, setBannerForm] = useState(BANNER_VAZIO);
  const [catForm, setCatForm] = useState({ nome: "", emoji: "🍽️" });
  const [tab, setTab] = useState<Aba>("empresas");
  const [empSearch, setEmpSearch] = useState("");
  const [editingBanner, setEditingBanner] = useState<string | null>(null);
  const [editBannerForm, setEditBannerForm] = useState(BANNER_VAZIO);
  const [savingEditBanner, setSavingEditBanner] = useState(false);
  const [editingCat, setEditingCat] = useState<string | null>(null);
  const [editCatForm, setEditCatForm] = useState({ nome: "", emoji: "🍽️" });
  const [savingEditCat, setSavingEditCat] = useState(false);
  const [flashSales, setFlashSales] = useState<FlashSaleGod[]>([]);
  const [loadingFs, setLoadingFs] = useState(false);
  const [deletingFs, setDeletingFs] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/god/explorar");
      if (res.ok) {
        const d = await res.json();
        setBanners(d.banners ?? []);
        setCategorias(d.categorias ?? []);
        setEmpExtras(d.empresas ?? []);
      }
    } catch {}
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function loadFlash() {
    setLoadingFs(true);
    fetch("/api/god/flash-sales")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setFlashSales(d.flash_sales ?? []); })
      .finally(() => setLoadingFs(false));
  }
  useEffect(() => { if (tab === "flash_sales") loadFlash(); }, [tab]);

  const send = (method: string, body: unknown) =>
    fetch("/api/god/explorar", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  async function addBanner() {
    if (!bannerForm.titulo.trim()) return;
    setSavingBanner(true);
    try { await send("POST", { type: "banner", ...bannerForm }); setBannerForm(BANNER_VAZIO); await load(); }
    finally { setSavingBanner(false); }
  }
  async function deleteBanner(id: string) {
    if (!window.confirm("Excluir este banner?")) return;
    await send("DELETE", { type: "banner", id }); await load();
  }
  async function addCategoria() {
    if (!catForm.nome.trim()) return;
    setSavingCat(true);
    try { await send("POST", { type: "categoria", ...catForm }); setCatForm({ nome: "", emoji: "🍽️" }); await load(); }
    finally { setSavingCat(false); }
  }
  async function deleteCategoria(id: string) {
    if (!window.confirm("Excluir esta categoria?")) return;
    await send("DELETE", { type: "categoria", id }); await load();
  }
  async function saveEmpresa(emp: EmpresaExtra) {
    setSavingEmp(emp.id);
    try { await send("PATCH", { empresa_id: emp.id, destaque: emp.destaque, categoria: emp.categoria }); }
    finally { setSavingEmp(null); }
  }
  async function updateBanner(id: string) {
    setSavingEditBanner(true);
    try { await send("PATCH", { type: "banner", id, ...editBannerForm }); setEditingBanner(null); await load(); }
    finally { setSavingEditBanner(false); }
  }
  async function updateCategoria(id: string) {
    setSavingEditCat(true);
    try { await send("PATCH", { type: "categoria", id, ...editCatForm }); setEditingCat(null); await load(); }
    finally { setSavingEditCat(false); }
  }
  async function deleteFlashSale(id: string) {
    if (!window.confirm("Excluir esta oferta relâmpago?")) return;
    setDeletingFs(id);
    try {
      await fetch("/api/god/flash-sales", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      setFlashSales(prev => prev.filter(fs => fs.id !== id));
    } finally { setDeletingFs(null); }
  }
  const updateEmpExtra = (id: string, patch: Partial<EmpresaExtra>) =>
    setEmpExtras(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e));

  const empFilt = empExtras.filter(e => e.nome.toLowerCase().includes(empSearch.toLowerCase()));
  const nDestaque = empExtras.filter(e => e.destaque).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Seg<Aba> value={tab} onChange={setTab} options={[
          { v: "empresas", l: `Lojas${nDestaque ? ` · ${nDestaque}★` : ""}` },
          { v: "banners", l: "Banners" },
          { v: "categorias", l: "Categorias" },
          { v: "flash_sales", l: "Flash sales" },
        ]} />
        <div className="flex gap-2 ml-auto">
          <a href="/god/explorar-editor" className="gd-btn gd-btn-sm"><Palette size={13} /> Editor visual</a>
          <a href="/explorar" target="_blank" rel="noopener noreferrer" className="gd-btn gd-btn-sm"><ExternalLink size={13} /> Ver página</a>
        </div>
      </div>

      {loading ? <Carregando /> : tab === "empresas" ? (
        <Secao titulo={<span className="flex items-center gap-2"><Building2 size={15} /> Destaques e categorias</span>}
          acao={<span className="text-xs gd-muted">{nDestaque} em destaque · {empExtras.filter(e => e.categoria).length} com categoria</span>}>
          <div className="px-4 md:px-5 pb-3">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--faint)" }} />
              <input className="gd-input" style={{ paddingLeft: 34 }} placeholder="Buscar loja..." value={empSearch} onChange={e => setEmpSearch(e.target.value)} />
            </div>
          </div>
          {empFilt.length === 0 ? <Vazio texto="Nenhuma loja encontrada." /> : (
            <ul className="gd-divide" style={{ borderTop: "1px solid var(--line)" }}>
              {empFilt.map(emp => (
                <li key={emp.id} className="px-4 md:px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-2.5">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <Avatar nome={emp.nome} size={34} quadrado />
                    <div className="min-w-0">
                      <p className="text-sm font-bold truncate">{emp.nome}</p>
                      <p className="text-xs" style={{ color: emp.assinatura_ativa ? "var(--ok)" : "var(--red-ink)" }}>{emp.assinatura_ativa ? "Assinatura ativa" : "Assinatura inativa"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <select className="gd-input flex-1 sm:w-48" style={{ height: 34 }} value={emp.categoria ?? ""} aria-label="Categoria"
                      onChange={async e => {
                        const cat = e.target.value || null;
                        updateEmpExtra(emp.id, { categoria: cat });
                        await saveEmpresa({ ...emp, categoria: cat });
                      }}>
                      <option value="">Sem categoria</option>
                      {categorias.map(c => <option key={c.id} value={c.nome}>{c.emoji} {c.nome}</option>)}
                    </select>
                    <button className="gd-btn gd-btn-sm shrink-0"
                      style={emp.destaque ? { background: "color-mix(in srgb, var(--gold) 16%, transparent)", borderColor: "color-mix(in srgb, var(--gold) 45%, transparent)", color: "var(--gold)" } : undefined}
                      onClick={async () => {
                        const updated = { ...emp, destaque: !emp.destaque };
                        updateEmpExtra(emp.id, { destaque: updated.destaque });
                        await saveEmpresa(updated);
                      }}>
                      {savingEmp === emp.id ? <Loader2 size={12} className="animate-spin" /> : <Star size={12} fill={emp.destaque ? "currentColor" : "none"} />}
                      {emp.destaque ? "Destaque" : "Destacar"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Secao>
      ) : tab === "banners" ? (
        <div className="space-y-4">
          <Secao titulo={<span className="flex items-center gap-2"><ImageIcon size={15} /> Novo banner</span>}>
            <div className="px-4 md:px-5 pb-4 grid grid-cols-1 md:grid-cols-2 gap-2">
              <input className="gd-input" placeholder="Título *" value={bannerForm.titulo} onChange={e => setBannerForm(p => ({ ...p, titulo: e.target.value }))} />
              <input className="gd-input" placeholder="Subtítulo" value={bannerForm.subtitulo} onChange={e => setBannerForm(p => ({ ...p, subtitulo: e.target.value }))} />
              <input className="gd-input" placeholder="URL da imagem (opcional)" value={bannerForm.imagem_url} onChange={e => setBannerForm(p => ({ ...p, imagem_url: e.target.value }))} />
              <input className="gd-input" placeholder="Link ao clicar (opcional)" value={bannerForm.link_url} onChange={e => setBannerForm(p => ({ ...p, link_url: e.target.value }))} />
              <div className="flex items-center gap-3 md:col-span-2">
                <input type="color" value={bannerForm.cor_fundo} onChange={e => setBannerForm(p => ({ ...p, cor_fundo: e.target.value }))} className="w-10 h-10 rounded-lg cursor-pointer" style={{ border: "1px solid var(--line2)", background: "transparent" }} aria-label="Cor de fundo" />
                <span className="text-xs gd-muted flex-1">Cor de fundo</span>
                <button className="gd-btn gd-btn-red" onClick={addBanner} disabled={savingBanner || !bannerForm.titulo.trim()}>
                  {savingBanner ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Adicionar
                </button>
              </div>
            </div>
          </Secao>
          <div className="gd-card overflow-hidden">
            {banners.length === 0 ? <Vazio texto="Nenhum banner cadastrado. O carrossel exibe banners padrão." /> : (
              <ul className="gd-divide">
                {banners.map(b => (
                  <li key={b.id}>
                    {editingBanner === b.id ? (
                      <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-2">
                        <input className="gd-input" placeholder="Título" value={editBannerForm.titulo} onChange={e => setEditBannerForm(p => ({ ...p, titulo: e.target.value }))} />
                        <input className="gd-input" placeholder="Subtítulo" value={editBannerForm.subtitulo} onChange={e => setEditBannerForm(p => ({ ...p, subtitulo: e.target.value }))} />
                        <input className="gd-input" placeholder="URL da imagem" value={editBannerForm.imagem_url} onChange={e => setEditBannerForm(p => ({ ...p, imagem_url: e.target.value }))} />
                        <input className="gd-input" placeholder="Link ao clicar" value={editBannerForm.link_url} onChange={e => setEditBannerForm(p => ({ ...p, link_url: e.target.value }))} />
                        <div className="flex items-center gap-2 md:col-span-2">
                          <input type="color" value={editBannerForm.cor_fundo} onChange={e => setEditBannerForm(p => ({ ...p, cor_fundo: e.target.value }))} className="w-9 h-9 rounded cursor-pointer" style={{ border: "1px solid var(--line2)", background: "transparent" }} aria-label="Cor de fundo" />
                          <span className="flex-1" />
                          <button className="gd-btn gd-btn-sm gd-btn-primary" onClick={() => updateBanner(b.id)} disabled={savingEditBanner}>
                            {savingEditBanner ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Salvar
                          </button>
                          <button className="gd-btn gd-btn-sm" onClick={() => setEditingBanner(null)} aria-label="Cancelar"><X size={13} /></button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 px-4 py-3">
                        <span className="w-9 h-9 rounded-lg shrink-0" style={{ background: b.cor_fundo, border: "1px solid var(--line)" }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold truncate">{b.titulo}</p>
                          {b.subtitulo && <p className="text-xs gd-muted truncate">{b.subtitulo}</p>}
                        </div>
                        <button className="gd-btn gd-btn-ghost gd-btn-sm" style={{ width: 32, padding: 0 }} aria-label="Editar"
                          onClick={() => { setEditingBanner(b.id); setEditBannerForm({ titulo: b.titulo, subtitulo: b.subtitulo ?? "", imagem_url: b.imagem_url ?? "", link_url: b.link_url ?? "", cor_fundo: b.cor_fundo }); }}><Edit2 size={14} /></button>
                        <button className="gd-btn gd-btn-ghost gd-btn-sm" style={{ width: 32, padding: 0, color: "var(--red-ink)" }} aria-label="Excluir" onClick={() => deleteBanner(b.id)}><Trash2 size={14} /></button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : tab === "categorias" ? (
        <div className="space-y-4">
          <Secao titulo={<span className="flex items-center gap-2"><Tag size={15} /> Nova categoria</span>}>
            <div className="px-4 md:px-5 pb-4 flex gap-2">
              <input className="gd-input text-center" style={{ width: 60, fontSize: 20, flexShrink: 0 }} value={catForm.emoji} onChange={e => setCatForm(p => ({ ...p, emoji: e.target.value }))} aria-label="Emoji" />
              <input className="gd-input flex-1" placeholder="Nome da categoria *" value={catForm.nome} onChange={e => setCatForm(p => ({ ...p, nome: e.target.value }))} onKeyDown={e => e.key === "Enter" && addCategoria()} />
              <button className="gd-btn gd-btn-red shrink-0" onClick={addCategoria} disabled={savingCat || !catForm.nome.trim()} style={{ height: 40 }}>
                {savingCat ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}<span className="hidden sm:inline">Adicionar</span>
              </button>
            </div>
          </Secao>
          <div className="gd-card overflow-hidden">
            {categorias.length === 0 ? <Vazio texto="Nenhuma categoria cadastrada. O Explorar usa as categorias padrão." /> : (
              <ul className="gd-divide">
                {categorias.map(c => (
                  <li key={c.id}>
                    {editingCat === c.id ? (
                      <div className="flex items-center gap-2 p-3">
                        <input className="gd-input text-center" style={{ width: 54, fontSize: 20, flexShrink: 0, padding: 4 }} value={editCatForm.emoji} onChange={e => setEditCatForm(p => ({ ...p, emoji: e.target.value }))} aria-label="Emoji" />
                        <input className="gd-input flex-1" value={editCatForm.nome} onChange={e => setEditCatForm(p => ({ ...p, nome: e.target.value }))} />
                        <button className="gd-btn gd-btn-sm gd-btn-primary" onClick={() => updateCategoria(c.id)} disabled={savingEditCat} aria-label="Salvar">
                          {savingEditCat ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                        </button>
                        <button className="gd-btn gd-btn-sm" onClick={() => setEditingCat(null)} aria-label="Cancelar"><X size={13} /></button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 px-4 py-2.5">
                        <span style={{ fontSize: 20 }}>{c.emoji}</span>
                        <p className="text-sm font-bold flex-1 truncate">{c.nome}</p>
                        <button className="gd-btn gd-btn-ghost gd-btn-sm" style={{ width: 32, padding: 0 }} aria-label="Editar" onClick={() => { setEditingCat(c.id); setEditCatForm({ nome: c.nome, emoji: c.emoji }); }}><Edit2 size={14} /></button>
                        <button className="gd-btn gd-btn-ghost gd-btn-sm" style={{ width: 32, padding: 0, color: "var(--red-ink)" }} aria-label="Excluir" onClick={() => deleteCategoria(c.id)}><Trash2 size={14} /></button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : (
        <Secao titulo={<span className="flex items-center gap-2"><Zap size={15} /> Ofertas relâmpago</span>}
          acao={<button className="gd-btn gd-btn-sm" onClick={loadFlash}><RefreshCw size={12} className={loadingFs ? "animate-spin" : ""} /> Atualizar</button>}>
          {loadingFs ? <Carregando /> : flashSales.length === 0 ? <Vazio texto="Nenhuma oferta relâmpago cadastrada." /> : (
            <ul className="gd-divide" style={{ borderTop: "1px solid var(--line)" }}>
              {flashSales.map(fs => {
                const expired = new Date(fs.termina_em) < new Date();
                const pct = fs.preco_original && fs.preco_original > fs.preco_flash ? Math.round((1 - fs.preco_flash / fs.preco_original) * 100) : null;
                return (
                  <li key={fs.id} className="flex items-center gap-3 px-4 md:px-5 py-3" style={{ opacity: expired ? 0.6 : 1 }}>
                    {fs.imagem_url
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={fs.imagem_url} alt="" className="w-11 h-11 rounded-xl object-cover shrink-0" />
                      : <span className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: "var(--red-soft)", color: "var(--red)" }}><Zap size={18} /></span>}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <p className="text-sm font-bold truncate">{fs.nome}</p>
                        {pct && <span className="gd-badge" style={{ background: "var(--red-soft)", color: "var(--red-ink)" }}>-{pct}%</span>}
                      </div>
                      <p className="text-xs gd-muted truncate">{fs.empresa_nome}</p>
                      <p className="text-xs mt-0.5">
                        <b style={{ color: "var(--red)" }}>R$ {Number(fs.preco_flash).toFixed(2).replace(".", ",")}</b>{" "}
                        <span style={{ color: expired ? "var(--red-ink)" : "var(--ok)" }}>
                          {expired ? "Expirada" : `até ${new Date(fs.termina_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`}
                        </span>
                      </p>
                    </div>
                    <button className="gd-btn gd-btn-ghost gd-btn-sm" style={{ width: 32, padding: 0, color: "var(--red-ink)" }} aria-label="Excluir oferta"
                      onClick={() => deleteFlashSale(fs.id)} disabled={deletingFs === fs.id}>
                      {deletingFs === fs.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Secao>
      )}
    </div>
  );
}
