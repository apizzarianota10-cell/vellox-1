"use client";

import { useState, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { uploadImage } from "@/lib/uploadImage";
import {
  Plus, Pencil, Trash2, ToggleLeft, ToggleRight,
  Upload, X, Link2, Check, ShoppingBag, Settings2,
  Image as ImageIcon, Tag, DollarSign, AlignLeft,
  ExternalLink, Clock, Truck, MapPin, BadgeCheck, User,
  ScanLine, Loader2, ChevronRight, ChevronDown,
} from "lucide-react";
import type { Produto, ConfiguracaoLoja, BairroTaxa, ProdutoVariacao, ProdutoSabor, ProdutoAdicional, CategoriaSabor, CategoriaPreco, CategoriaPrecoTamanho } from "@/types";

const CATEGORIAS_PADRAO = ["Lanches", "Bebidas", "Combos", "Sobremesas", "Entradas", "Outros"];

interface Props {
  initialProdutos: Produto[];
  initialConfig: ConfiguracaoLoja | null;
  initialBairros: BairroTaxa[];
  initialCategoriasPreco: CategoriaPreco[];
  initialVerificado: boolean;
  empresaId: string;
  empresaNome: string;
  empresaCodigo: string;
  empresaSlug: string;
}

const DEFAULT_CONFIG: Omit<ConfiguracaoLoja, "empresa_id" | "updated_at"> = {
  cor_principal: "#FF6A00",
  logo_url: null,
  banner_url: null,
  descricao: "",
  aberto: true,
  tempo_entrega: "30-45 min",
  taxa_entrega: 0,
  preco_padrao_sabor: 0,
  whatsapp_instance_id: null,
  whatsapp_token: null,
  telefone_contato: null,
  horario_funcionamento: null,
  modo_calculo_pizza: "maior_valor",
};

type Tab = "produtos" | "perfil" | "config";
type ProdutoForm = {
  nome: string; descricao: string; preco: string;
  categoria: string; categoriaCustom: string;
  imagem_url: string; ativo: boolean;
  tipo: "simples" | "pizza";
  variantes_label: string;
  categoria_preco_id: string;
};

type ModalTab = "basico" | "tamanhos" | "sabores" | "adicionais";

const EMPTY_FORM: ProdutoForm = {
  nome: "", descricao: "", preco: "",
  categoria: "Lanches", categoriaCustom: "",
  imagem_url: "", ativo: true, tipo: "simples",
  variantes_label: "",
  categoria_preco_id: "",
};

export default function CatalogoClient({
  initialProdutos, initialConfig, initialBairros, initialCategoriasPreco, initialVerificado,
  empresaId, empresaNome, empresaCodigo, empresaSlug,
}: Props) {
  const supabase = createClient();

  const [tab, setTab] = useState<Tab>("produtos");
  const [produtos, setProdutos] = useState<Produto[]>(initialProdutos);
  const [bairros, setBairros] = useState<BairroTaxa[]>(initialBairros);
  const [novoBairro, setNovoBairro] = useState("");
  const [novaTaxa, setNovaTaxa] = useState("");
  const [addingBairro, setAddingBairro] = useState(false);
  const [config, setConfig] = useState<Omit<ConfiguracaoLoja, "empresa_id" | "updated_at">>(
    initialConfig
      ? {
          cor_principal: initialConfig.cor_principal,
          logo_url: initialConfig.logo_url,
          banner_url: initialConfig.banner_url,
          descricao: initialConfig.descricao,
          aberto: initialConfig.aberto,
          tempo_entrega: initialConfig.tempo_entrega,
          taxa_entrega: initialConfig.taxa_entrega,
          preco_padrao_sabor: initialConfig.preco_padrao_sabor ?? 0,
          whatsapp_instance_id: initialConfig.whatsapp_instance_id ?? null,
          whatsapp_token: initialConfig.whatsapp_token ?? null,
          telefone_contato: initialConfig.telefone_contato ?? null,
          horario_funcionamento: initialConfig.horario_funcionamento ?? null,
          modo_calculo_pizza: initialConfig.modo_calculo_pizza ?? "maior_valor",
        }
      : DEFAULT_CONFIG
  );
  const [precoPadraoSaborEdit, setPrecoPadraoSaborEdit] = useState(String(initialConfig?.preco_padrao_sabor ?? 0));
  const [salvandoPrecoPadrao, setSalvandoPrecoPadrao] = useState(false);

  // Categorias de Preço
  const [categoriasPreco, setCategoriasPreco] = useState<CategoriaPreco[]>(initialCategoriasPreco);
  const [catPrecoSel, setCatPrecoSel] = useState<string | null>(null);
  const [novaCatPreco, setNovaCatPreco] = useState({ nome: "", cor: "#6366f1" });
  const [savingCatPreco, setSavingCatPreco] = useState(false);
  const [novoTamCatPreco, setNovoTamCatPreco] = useState({ nome: "", preco: "", max_sabores: "1" });
  const [savingTamCatPreco, setSavingTamCatPreco] = useState(false);
  const [editingTamPreco, setEditingTamPreco] = useState<{ id: string; preco: string } | null>(null);

  // Perfil
  const [nomeEdit, setNomeEdit] = useState(empresaNome);
  const [verificado, setVerificado] = useState(initialVerificado);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const logoRef = useRef<HTMLInputElement>(null);
  const bannerRef = useRef<HTMLInputElement>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [bannerCropSrc, setBannerCropSrc] = useState<string | null>(null);
  const [bannerPan, setBannerPan]     = useState({ x: 0, y: 0 });
  const [bannerZoom, setBannerZoom]   = useState(1);
  const [bannerDrag, setBannerDrag]   = useState<{ startX: number; startY: number; panX: number; panY: number } | null>(null);
  const bannerImgRef  = useRef<HTMLImageElement>(null);
  const bannerContRef = useRef<HTMLDivElement>(null);

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<ProdutoForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Modal tabs (only when editing)
  const [modalTab, setModalTab] = useState<ModalTab>("basico");
  const [loadingTabs, setLoadingTabs] = useState(false);
  const [variacoes, setVariacoes] = useState<ProdutoVariacao[]>([]);
  const [sabores, setSabores] = useState<ProdutoSabor[]>([]);
  const [adicionais, setAdicionais] = useState<ProdutoAdicional[]>([]);
  const [novaVariacao, setNovaVariacao] = useState({ nome: "", preco: "", max_sabores: "1" });
  const [editingVariacaoPreco, setEditingVariacaoPreco] = useState<{ id: string; preco: string } | null>(null);
  const [novoSabor, setNovoSabor] = useState({ nome: "", descricao: "", preco: "" });
  const [novoAdicional, setNovoAdicional] = useState({ nome: "", preco: "", obrigatorio: false });
  const [novoAdicionalOutrosProdutos, setNovoAdicionalOutrosProdutos] = useState<string[]>([]);
  const [savingTab, setSavingTab] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [editingSaborId, setEditingSaborId] = useState<string | null>(null);
  const [editingSaborForm, setEditingSaborForm] = useState({ nome: "", descricao: "", preco: "", categoria_sabor_id: "", uploadingSaborImg: false });
  const saborImgRef = useRef<HTMLInputElement>(null);

  // Categorias de sabor
  const [categoriasSabor, setCategoriasSabor] = useState<CategoriaSabor[]>([]);
  const [novaCategoria, setNovaCategoria] = useState({ nome: "", preco_adicional: "" });
  const [savingCategoria, setSavingCategoria] = useState(false);

  // Import adicionais from image
  const importAdicionaisRef = useRef<HTMLInputElement>(null);
  const [importAdicionaisLoading, setImportAdicionaisLoading] = useState(false);
  const [importAdicionaisList, setImportAdicionaisList] = useState<{ nome: string; preco: number; obrigatorio: boolean; sel: boolean }[]>([]);
  const [importAdicionaisOpen, setImportAdicionaisOpen] = useState(false);
  const [salvandoAdicionaisImport, setSalvandoAdicionaisImport] = useState(false);

  // Import sabores from image
  const importSaboresRef = useRef<HTMLInputElement>(null);
  const [importSaboresLoading, setImportSaboresLoading] = useState(false);
  const [importSaboresList, setImportSaboresList] = useState<{ nome: string; descricao: string; sel: boolean }[]>([]);
  const [importSaboresOpen, setImportSaboresOpen] = useState(false);
  const [salvandoSaboresImport, setSalvandoSaboresImport] = useState(false);

  // Choice popup (Produto / Sabor / Adicional)
  const [choiceOpen, setChoiceOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickType, setQuickType] = useState<"sabor" | "adicional">("sabor");
  const [quickProdutoId, setQuickProdutoId] = useState("");
  const [quickSabor, setQuickSabor] = useState({ nome: "", descricao: "", preco: "" });
  const [quickAdicional, setQuickAdicional] = useState({ nome: "", preco: "", obrigatorio: false });
  const [quickAdicionalOutrosProdutos, setQuickAdicionalOutrosProdutos] = useState<string[]>([]);
  const [savingQuick, setSavingQuick] = useState(false);

  // Quick import sabores from image (inside quick-add modal)
  const quickImportSaboresRef = useRef<HTMLInputElement>(null);
  const [quickImportLoading, setQuickImportLoading] = useState(false);
  const [quickImportList, setQuickImportList] = useState<{ nome: string; descricao: string; sel: boolean }[]>([]);
  const [quickImportOpen, setQuickImportOpen] = useState(false);
  const [salvandoQuickImport, setSalvandoQuickImport] = useState(false);

  // Product image upload
  const [uploading, setUploading] = useState(false);
  const [imgPreview, setImgPreview] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Config save
  const [savingConfig, setSavingConfig] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);
  const [togglingAberto, setTogglingAberto] = useState(false);

  // Link copy
  const [copied, setCopied] = useState(false);

  // Importar cardápio
  const importRef = useRef<HTMLInputElement>(null);
  type ProdutoImportado = { nome: string; preco: number; descricao: string; categoria: string; selecionado: boolean; };
  const [importando, setImportando] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<string>("");
  const [importStep, setImportStep] = useState<"upload" | "review">("upload");
  const [importProdutos, setImportProdutos] = useState<ProdutoImportado[]>([]);
  const [salvandoImport, setSalvandoImport] = useState(false);

  // Category filter
  const [catFilter, setCatFilter] = useState<string>("Todos");

  // Vínculo de sabores entre produtos (qual produto está com o seletor aberto)
  const [vinculoAbertoId, setVinculoAbertoId] = useState<string | null>(null);

  // Inline add-sabor in __sabores__ view
  const [addSaborProdutoId, setAddSaborProdutoId] = useState<string | null>(null);
  const [addSaborNome, setAddSaborNome] = useState("");

  // Grupos de sabores (por produto) abertos/fechados na view __sabores__
  const [saborGruposAbertos, setSaborGruposAbertos] = useState<Set<string>>(new Set());
  function toggleSaborGrupo(produtoId: string) {
    setSaborGruposAbertos(prev => {
      const next = new Set(prev);
      if (next.has(produtoId)) next.delete(produtoId); else next.add(produtoId);
      return next;
    });
  }
  const [addSaborSaving, setAddSaborSaving] = useState(false);

  // Link da loja (slug editável nas Configurações)
  const [slugAtual, setSlugAtual] = useState(empresaSlug);
  const [slugInput, setSlugInput] = useState(empresaSlug);
  const [savingSlug, setSavingSlug] = useState(false);
  const [slugError, setSlugError] = useState("");
  const [slugSalvo, setSlugSalvo] = useState(false);

  function slugify(texto: string): string {
    return texto
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  async function handleSaveSlug() {
    const novoSlug = slugify(slugInput);
    if (!novoSlug) { setSlugError("Digite um link válido."); return; }
    if (novoSlug === slugAtual) return;
    setSavingSlug(true);
    setSlugError("");
    setSlugSalvo(false);
    const { error } = await supabase.from("empresas").update({ slug: novoSlug }).eq("id", empresaId);
    setSavingSlug(false);
    if (error) {
      setSlugError(error.code === "23505" ? "Esse link já está em uso por outra loja." : "Erro ao atualizar: " + error.message);
      return;
    }
    setSlugAtual(novoSlug);
    setSlugInput(novoSlug);
    setSlugSalvo(true);
    setTimeout(() => setSlugSalvo(false), 3000);
  }

  const lojaPath = slugAtual || empresaCodigo;
  const lojaUrl = typeof window !== "undefined"
    ? `${window.location.origin}/loja/${lojaPath}`
    : `/loja/${lojaPath}`;

  async function copyLink() {
    await navigator.clipboard.writeText(lojaUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const saboresPorProduto = produtos
    .map(p => ({ produto: p, sabores: p.produto_sabores?.filter(s => s.ativo !== false) ?? [] }))
    .filter(g => g.sabores.length > 0);

  const categorias = [
    "Todos",
    ...Array.from(new Set(produtos.map(p => p.categoria))).sort(),
    ...(saboresPorProduto.length > 0 ? ["__sabores__"] : []),
  ];
  const produtosFiltrados = (catFilter === "Todos" || catFilter === "__sabores__")
    ? produtos
    : produtos.filter(p => p.categoria === catFilter);

  function openAdd() {
    setChoiceOpen(true);
  }

  function openWizard() {
    setChoiceOpen(false);
    setEditId(null);
    setForm(EMPTY_FORM);
    setImgPreview("");
    setModalTab("basico");
    setVariacoes([]); setSabores([]); setAdicionais([]);
    setNovoAdicionalOutrosProdutos([]);
    setWizardStep(1);
    setModalOpen(true);
  }

  function openQuickAdd(type: "sabor" | "adicional") {
    setChoiceOpen(false);
    setQuickType(type);
    setQuickProdutoId(produtos.length > 0 ? produtos[0].id : "");
    setQuickSabor({ nome: "", descricao: "", preco: "" });
    setQuickAdicional({ nome: "", preco: "", obrigatorio: false });
    setQuickAdicionalOutrosProdutos([]);
    setQuickOpen(true);
  }

  async function copiarAdicionalParaProdutos(nome: string, preco: number, obrigatorio: boolean, produtoIds: string[]) {
    if (produtoIds.length === 0) return;
    const inserts = produtoIds.map(pid => {
      const prod = produtos.find(p => p.id === pid);
      return { produto_id: pid, nome, preco, obrigatorio, ordem: prod?.produto_adicionais?.length ?? 0, ativo: true };
    });
    const { data } = await supabase.from("produto_adicionais").insert(inserts).select();
    if (data) {
      const novos = data as ProdutoAdicional[];
      setProdutos(prev => prev.map(p => {
        const doProduto = novos.filter(a => a.produto_id === p.id);
        return doProduto.length > 0 ? { ...p, produto_adicionais: [...(p.produto_adicionais ?? []), ...doProduto] } : p;
      }));
    }
  }

  async function handleSaveQuick() {
    if (!quickProdutoId) return;
    setSavingQuick(true);
    try {
      if (quickType === "sabor") {
        if (!quickSabor.nome.trim()) return;
        const { data: existingSabores } = await supabase
          .from("produto_sabores").select("ordem").eq("produto_id", quickProdutoId).order("ordem", { ascending: false }).limit(1);
        const nextOrdem = (existingSabores?.[0]?.ordem ?? -1) + 1;
        const { data: novoSaborData, error: errSabor } = await supabase.from("produto_sabores").insert({
          produto_id: quickProdutoId,
          nome: quickSabor.nome.trim(),
          descricao: quickSabor.descricao.trim(),
          preco_adicional: parseFloat(quickSabor.preco) || null,
          ordem: nextOrdem,
          ativo: true,
        }).select().single();
        if (errSabor) { alert("Erro ao criar sabor: " + errSabor.message); return; }
        if (novoSaborData) {
          setProdutos(prev => prev.map(prod => prod.id === quickProdutoId
            ? { ...prod, produto_sabores: [...(prod.produto_sabores ?? []), novoSaborData as ProdutoSabor] }
            : prod));
        }
      } else {
        if (!quickAdicional.nome.trim()) return;
        const { data: existingAdicionais } = await supabase
          .from("produto_adicionais").select("ordem").eq("produto_id", quickProdutoId).order("ordem", { ascending: false }).limit(1);
        const nextOrdem = (existingAdicionais?.[0]?.ordem ?? -1) + 1;
        const { data: novoAdicionalData } = await supabase.from("produto_adicionais").insert({
          produto_id: quickProdutoId, nome: quickAdicional.nome.trim(),
          preco: parseFloat(quickAdicional.preco) || 0,
          obrigatorio: quickAdicional.obrigatorio,
          ordem: nextOrdem, ativo: true,
        }).select().single();
        if (novoAdicionalData) {
          setProdutos(prev => prev.map(prod => prod.id === quickProdutoId
            ? { ...prod, produto_adicionais: [...(prod.produto_adicionais ?? []), novoAdicionalData as ProdutoAdicional] }
            : prod));
          await copiarAdicionalParaProdutos(
            quickAdicional.nome.trim(), parseFloat(quickAdicional.preco) || 0, quickAdicional.obrigatorio,
            quickAdicionalOutrosProdutos.filter(id => id !== quickProdutoId),
          );
        }
      }
      setQuickOpen(false);
    } finally {
      setSavingQuick(false);
    }
  }

  async function openEdit(p: Produto, tab: ModalTab = "basico") {
    setEditId(p.id);
    const isCustCat = !CATEGORIAS_PADRAO.includes(p.categoria);
    setForm({
      nome: p.nome, descricao: p.descricao, preco: String(p.preco),
      categoria: isCustCat ? "__custom__" : p.categoria,
      categoriaCustom: isCustCat ? p.categoria : "",
      imagem_url: p.imagem_url ?? "", ativo: p.ativo,
      tipo: (p.tipo ?? "simples") as "simples" | "pizza",
      variantes_label: p.variantes_label ?? "",
      categoria_preco_id: p.categoria_preco_id ?? "",
    });
    setImgPreview(p.imagem_url ?? "");
    setModalTab(tab);
    setVariacoes([]); setSabores([]); setAdicionais([]);
    setNovoAdicionalOutrosProdutos([]);
    setWizardStep(0);
    setModalOpen(true);
    setLoadingTabs(true);
    const [{ data: vars }, { data: sabs }, { data: adds }, { data: cats }] = await Promise.all([
      supabase.from("produto_variacoes").select("*").eq("produto_id", p.id).order("ordem"),
      supabase.from("produto_sabores").select("*").eq("produto_id", p.id).order("ordem"),
      supabase.from("produto_adicionais").select("*").eq("produto_id", p.id).order("ordem"),
      supabase.from("produto_categorias_sabor").select("*").eq("produto_id", p.id).order("ordem"),
    ]);
    setVariacoes((vars ?? []) as ProdutoVariacao[]);
    setSabores((sabs ?? []) as ProdutoSabor[]);
    setAdicionais((adds ?? []) as ProdutoAdicional[]);
    setCategoriasSabor((cats ?? []) as CategoriaSabor[]);
    setLoadingTabs(false);
  }

  // ── Product image upload ─────────────────────────────────────────
  async function handleImageUpload(file: File) {
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadImage(file, "vellox/produtos");
      setForm(f => ({ ...f, imagem_url: url }));
      setImgPreview(url);
    } catch (e) {
      console.error("Upload error", e);
    } finally {
      setUploading(false);
    }
  }

  // ── Logo upload ──────────────────────────────────────────────────
  async function handleLogoUpload(file: File) {
    setUploadingLogo(true);
    try {
      const url = await uploadImage(file, "vellox/logos");
      setConfig(c => ({ ...c, logo_url: url }));
    } catch (e) {
      console.error("Logo upload error", e);
      alert("Erro ao enviar logo. Tente novamente.");
    } finally {
      setUploadingLogo(false);
    }
  }

  // ── Banner: abre modal de crop (pan + zoom) ─────────────────────
  function handleBannerUpload(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      setBannerCropSrc(reader.result as string);
      setBannerPan({ x: 0, y: 0 });
      setBannerZoom(1);
    };
    reader.readAsDataURL(file);
  }

  const onBannerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setBannerDrag({ startX: e.clientX, startY: e.clientY, panX: bannerPan.x, panY: bannerPan.y });
  }, [bannerPan]);

  const onBannerMouseMove = useCallback((e: React.MouseEvent) => {
    if (!bannerDrag) return;
    setBannerPan({ x: bannerDrag.panX + (e.clientX - bannerDrag.startX), y: bannerDrag.panY + (e.clientY - bannerDrag.startY) });
  }, [bannerDrag]);

  const onBannerMouseUp = useCallback(() => setBannerDrag(null), []);

  async function confirmBannerCrop() {
    const img  = bannerImgRef.current;
    const cont = bannerContRef.current;
    if (!img || !cont) return;

    const cw = cont.clientWidth;
    const ch = cont.clientHeight;
    const displayW = img.clientWidth  * bannerZoom;
    const displayH = img.clientHeight * bannerZoom;

    // coordenadas da área visível no espaço da imagem renderizada
    const offsetX = (cw - displayW) / 2 + bannerPan.x;
    const offsetY = (ch - displayH) / 2 + bannerPan.y;

    const scaleX = img.naturalWidth  / (img.clientWidth  * bannerZoom);
    const scaleY = img.naturalHeight / (img.clientHeight * bannerZoom);
    const srcX = Math.max(0, -offsetX * scaleX);
    const srcY = Math.max(0, -offsetY * scaleY);
    const srcW = Math.min(img.naturalWidth  - srcX, cw * scaleX);
    const srcH = Math.min(img.naturalHeight - srcY, ch * scaleY);

    const OUT_W = 1200, OUT_H = 400;
    const canvas = document.createElement("canvas");
    canvas.width = OUT_W; canvas.height = OUT_H;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, OUT_W, OUT_H);

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      setBannerCropSrc(null);
      setUploadingBanner(true);
      try {
        const file = new File([blob], "banner.jpg", { type: "image/jpeg" });
        const url = await uploadImage(file, "vellox/banners");
        setConfig(c => ({ ...c, banner_url: url }));
      } catch (e) {
        console.error("Banner upload error", e);
        alert("Erro ao enviar banner. Tente novamente.");
      } finally {
        setUploadingBanner(false);
      }
    }, "image/jpeg", 0.92);
  }

  // Campos base que sempre existem na tabela
  function buildBasePayload() {
    return {
      empresa_id: empresaId,
      cor_principal: config.cor_principal,
      logo_url: config.logo_url,
      banner_url: config.banner_url,
      descricao: config.descricao,
      aberto: config.aberto,
      tempo_entrega: config.tempo_entrega,
      taxa_entrega: config.taxa_entrega,
      whatsapp_instance_id: config.whatsapp_instance_id,
      whatsapp_token: config.whatsapp_token,
      telefone_contato: config.telefone_contato,
      updated_at: new Date().toISOString(),
    };
  }

  // ── Save profile ─────────────────────────────────────────────────
  async function handleSaveProfile() {
    setSavingProfile(true);
    try {
      const r1 = await supabase.from("empresas")
        .update({ nome: nomeEdit.trim() || empresaNome, verificado })
        .eq("id", empresaId);
      if (r1.error) throw r1.error;

      const r2 = await supabase.from("configuracao_loja")
        .upsert(buildBasePayload(), { onConflict: "empresa_id" });
      if (r2.error) throw r2.error;

      // Colunas adicionadas depois — salva separado, ignora erro se ainda não existirem
      await supabase.from("configuracao_loja").upsert({
        empresa_id: empresaId,
        preco_padrao_sabor: config.preco_padrao_sabor ?? 0,
        horario_funcionamento: config.horario_funcionamento ?? null,
        modo_calculo_pizza: config.modo_calculo_pizza ?? "maior_valor",
        updated_at: new Date().toISOString(),
      }, { onConflict: "empresa_id" });

      setProfileError(null);
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2000);
    } catch (e: unknown) {
      const msg = (e as { message?: string }).message ?? JSON.stringify(e);
      setProfileError(msg);
    } finally {
      setSavingProfile(false);
    }
  }

  // ── Toggle aberto (salva imediatamente) ─────────────────────────
  async function handleToggleAberto() {
    const novo = !config.aberto;
    setConfig(c => ({ ...c, aberto: novo }));
    setTogglingAberto(true);
    await supabase.from("configuracao_loja").upsert(
      { empresa_id: empresaId, aberto: novo, updated_at: new Date().toISOString() },
      { onConflict: "empresa_id" },
    );
    setTogglingAberto(false);
  }

  // ── Save config ──────────────────────────────────────────────────
  async function handleSaveConfig() {
    setSavingConfig(true);
    const r1 = await supabase.from("configuracao_loja")
      .upsert(buildBasePayload(), { onConflict: "empresa_id" });

    // Colunas adicionadas depois — salva separado
    await supabase.from("configuracao_loja").upsert({
      empresa_id: empresaId,
      preco_padrao_sabor: config.preco_padrao_sabor ?? 0,
      horario_funcionamento: config.horario_funcionamento ?? null,
      modo_calculo_pizza: config.modo_calculo_pizza ?? "maior_valor",
      updated_at: new Date().toISOString(),
    }, { onConflict: "empresa_id" });

    setSavingConfig(false);
    if (r1.error) {
      setProfileError(r1.error.message);
    } else {
      setProfileError(null);
      setConfigSaved(true);
      setTimeout(() => setConfigSaved(false), 2000);
    }
  }

  // ── Save product ─────────────────────────────────────────────────
  async function handleSave() {
    const cat = form.categoria === "__custom__" ? form.categoriaCustom.trim() : form.categoria;
    if (!form.nome.trim() || !cat) return;
    setSaving(true);
    try {
      const payload = {
        empresa_id: empresaId,
        nome: form.nome.trim(),
        descricao: form.descricao.trim(),
        preco: parseFloat(form.preco) || 0,
        categoria: cat,
        imagem_url: form.imagem_url || null,
        ativo: form.ativo,
        tipo: form.tipo,
        variantes_label: form.tipo === "pizza" && form.variantes_label.trim() ? form.variantes_label.trim() : null,
        categoria_preco_id: form.categoria_preco_id || null,
      };
      if (editId) {
        const { data } = await supabase.from("produtos").update(payload).eq("id", editId).select().single();
        if (data) setProdutos(prev => prev.map(p => p.id === editId ? data as Produto : p));
      } else {
        const { data } = await supabase.from("produtos").insert({ ...payload, ordem: produtos.length }).select().single();
        if (data) {
          const produto = data as Produto;
          setProdutos(prev => [...prev, produto]);
          setEditId(produto.id);
        }
      }
      if (wizardStep > 0) {
        setWizardStep(2);
      } else {
        setModalOpen(false);
      }
    } finally {
      setSaving(false);
    }
  }

  // ── Delete product ───────────────────────────────────────────────
  async function handleDelete(id: string) {
    if (!confirm("Excluir este produto?")) return;
    setDeleting(id);
    await supabase.from("produtos").delete().eq("id", id);
    setProdutos(prev => prev.filter(p => p.id !== id));
    setDeleting(null);
  }

  async function toggleAtivo(p: Produto) {
    await supabase.from("produtos").update({ ativo: !p.ativo }).eq("id", p.id);
    setProdutos(prev => prev.map(x => x.id === p.id ? { ...x, ativo: !x.ativo } : x));
  }

  // ── Bairros ──────────────────────────────────────────────────────
  async function handleAddBairro() {
    if (!novoBairro.trim()) return;
    setAddingBairro(true);
    const taxa = parseFloat(novaTaxa) || 0;
    const { data } = await supabase
      .from("bairros_taxa")
      .insert({ empresa_id: empresaId, bairro: novoBairro.trim(), taxa, ativo: true, ordem: bairros.length })
      .select().single();
    if (data) { setBairros(prev => [...prev, data as BairroTaxa]); setNovoBairro(""); setNovaTaxa(""); }
    setAddingBairro(false);
  }

  async function handleDeleteBairro(id: string) {
    if (!confirm("Remover este bairro?")) return;
    await supabase.from("bairros_taxa").delete().eq("id", id);
    setBairros(prev => prev.filter(b => b.id !== id));
  }

  async function handleToggleBairro(b: BairroTaxa) {
    await supabase.from("bairros_taxa").update({ ativo: !b.ativo }).eq("id", b.id);
    setBairros(prev => prev.map(x => x.id === b.id ? { ...x, ativo: !x.ativo } : x));
  }

  async function handleUpdateTaxaBairro(id: string, taxa: number) {
    await supabase.from("bairros_taxa").update({ taxa }).eq("id", id);
    setBairros(prev => prev.map(b => b.id === id ? { ...b, taxa } : b));
  }

  // ── Variações ────────────────────────────────────────────────────
  async function handleAddVariacao() {
    if (!novaVariacao.nome.trim() || !editId) return;
    setSavingTab(true);
    const { data } = await supabase.from("produto_variacoes").insert({
      produto_id: editId, nome: novaVariacao.nome.trim(),
      preco: parseFloat(novaVariacao.preco) || 0,
      max_sabores: parseInt(novaVariacao.max_sabores) || 1,
      ordem: variacoes.length, ativo: true,
    }).select().single();
    if (data) setVariacoes(prev => [...prev, data as ProdutoVariacao]);
    setNovaVariacao({ nome: "", preco: "", max_sabores: "1" });
    setSavingTab(false);
  }
  async function handleDeleteVariacao(id: string) {
    await supabase.from("produto_variacoes").delete().eq("id", id);
    setVariacoes(prev => prev.filter(v => v.id !== id));
  }
  async function toggleVariacaoAtivo(v: ProdutoVariacao) {
    await supabase.from("produto_variacoes").update({ ativo: !v.ativo }).eq("id", v.id);
    setVariacoes(prev => prev.map(x => x.id === v.id ? { ...x, ativo: !x.ativo } : x));
  }
  async function handleSaveVariacaoPreco() {
    if (!editingVariacaoPreco) return;
    const preco = parseFloat(editingVariacaoPreco.preco) || 0;
    await supabase.from("produto_variacoes").update({ preco }).eq("id", editingVariacaoPreco.id);
    setVariacoes(prev => prev.map(v => v.id === editingVariacaoPreco.id ? { ...v, preco } : v));
    setProdutos(prev => prev.map(p => ({
      ...p,
      produto_variacoes: p.produto_variacoes?.map(v => v.id === editingVariacaoPreco.id ? { ...v, preco } : v),
    })));
    setEditingVariacaoPreco(null);
  }

  // ── Preço padrão global dos sabores ──────────────────────────────
  async function handleSalvarPrecoPadrao() {
    setSalvandoPrecoPadrao(true);
    const v = parseFloat(precoPadraoSaborEdit) || 0;
    await supabase.from("configuracao_loja").upsert({ empresa_id: empresaId, preco_padrao_sabor: v }, { onConflict: "empresa_id" });
    setConfig(c => ({ ...c, preco_padrao_sabor: v }));
    setSalvandoPrecoPadrao(false);
  }

  // ── Categorias de Preço ──────────────────────────────────────────
  async function handleAddCategoriaPreco() {
    if (!novaCatPreco.nome.trim()) return;
    setSavingCatPreco(true);
    const { data } = await supabase.from("categorias_preco").insert({
      empresa_id: empresaId, nome: novaCatPreco.nome.trim(), cor: novaCatPreco.cor, ordem: categoriasPreco.length,
    }).select("*, tamanhos:categorias_preco_tamanhos(*)").single();
    if (data) {
      const nova = data as CategoriaPreco;
      setCategoriasPreco(prev => [...prev, nova]);
      setCatPrecoSel(nova.id);
    }
    setNovaCatPreco({ nome: "", cor: "#6366f1" });
    setSavingCatPreco(false);
  }

  async function handleDeleteCategoriaPreco(id: string) {
    if (!confirm("Excluir esta categoria e todos os tamanhos?")) return;
    await supabase.from("categorias_preco").delete().eq("id", id);
    setCategoriasPreco(prev => prev.filter(c => c.id !== id));
    if (catPrecoSel === id) setCatPrecoSel(null);
    setProdutos(prev => prev.map(p => p.categoria_preco_id === id ? { ...p, categoria_preco_id: null } : p));
  }

  async function handleAddTamanhoCatPreco() {
    if (!novoTamCatPreco.nome.trim() || !catPrecoSel) return;
    setSavingTamCatPreco(true);
    const cat = categoriasPreco.find(c => c.id === catPrecoSel);
    const ordem = (cat?.tamanhos?.length ?? 0);
    const { data } = await supabase.from("categorias_preco_tamanhos").insert({
      categoria_preco_id: catPrecoSel,
      nome: novoTamCatPreco.nome.trim(),
      preco: parseFloat(novoTamCatPreco.preco) || 0,
      max_sabores: parseInt(novoTamCatPreco.max_sabores) || 1,
      ordem,
    }).select().single();
    if (data) {
      const tam = data as CategoriaPrecoTamanho;
      setCategoriasPreco(prev => prev.map(c => c.id === catPrecoSel
        ? { ...c, tamanhos: [...(c.tamanhos ?? []), tam] }
        : c
      ));
    }
    setNovoTamCatPreco({ nome: "", preco: "", max_sabores: "1" });
    setSavingTamCatPreco(false);
  }

  async function handleDeleteTamanhoCatPreco(tamId: string) {
    await supabase.from("categorias_preco_tamanhos").delete().eq("id", tamId);
    setCategoriasPreco(prev => prev.map(c =>
      c.id === catPrecoSel
        ? { ...c, tamanhos: (c.tamanhos ?? []).filter(t => t.id !== tamId) }
        : c
    ));
  }

  async function handleUpdateTamanhoCatPreco(tamId: string, preco: number) {
    await supabase.from("categorias_preco_tamanhos").update({ preco }).eq("id", tamId);
    setCategoriasPreco(prev => prev.map(c => ({
      ...c,
      tamanhos: (c.tamanhos ?? []).map(t => t.id === tamId ? { ...t, preco } : t),
    })));
    setEditingTamPreco(null);
  }

  // ── Tamanhos condicionais (produto com categoria_preco) ───────────
  async function toggleTamanhoVariacao(tamanho: CategoriaPrecoTamanho) {
    if (!editId) return;
    const existing = variacoes.find(v => v.nome === tamanho.nome);
    if (existing) {
      await supabase.from("produto_variacoes").delete().eq("id", existing.id);
      setVariacoes(prev => prev.filter(v => v.id !== existing.id));
    } else {
      const { data } = await supabase.from("produto_variacoes").insert({
        produto_id: editId,
        nome: tamanho.nome,
        preco: tamanho.preco,
        max_sabores: tamanho.max_sabores,
        ordem: variacoes.length,
        ativo: true,
      }).select().single();
      if (data) setVariacoes(prev => [...prev, data as ProdutoVariacao]);
    }
  }

  // ── Sabores ──────────────────────────────────────────────────────
  async function handleAddSabor() {
    if (!novoSabor.nome.trim() || !editId) return;
    setSavingTab(true);
    const { data, error } = await supabase.from("produto_sabores").insert({
      produto_id: editId,
      nome: novoSabor.nome.trim(),
      descricao: novoSabor.descricao.trim(),
      preco_adicional: parseFloat(novoSabor.preco) || null,
      ordem: sabores.length,
      ativo: true,
    }).select().single();
    if (error) {
      alert("Erro ao criar sabor: " + error.message);
    } else if (data) {
      const novo = data as ProdutoSabor;
      setSabores(prev => [...prev, novo]);
      setProdutos(prev => prev.map(prod => prod.id === editId
        ? { ...prod, produto_sabores: [...(prod.produto_sabores ?? []), novo] }
        : prod));
      setNovoSabor({ nome: "", descricao: "", preco: "" });
    }
    setSavingTab(false);
  }
  async function handleDeleteSabor(id: string) {
    await supabase.from("produto_sabores").delete().eq("id", id);
    setSabores(prev => prev.filter(s => s.id !== id));
    setProdutos(prev => prev.map(prod =>
      prod.produto_sabores?.some(s => s.id === id)
        ? { ...prod, produto_sabores: prod.produto_sabores?.filter(s => s.id !== id) }
        : prod
    ));
  }
  async function toggleSaborAtivo(s: ProdutoSabor) {
    await supabase.from("produto_sabores").update({ ativo: !s.ativo }).eq("id", s.id);
    setSabores(prev => prev.map(x => x.id === s.id ? { ...x, ativo: !x.ativo } : x));
    setProdutos(prev => prev.map(prod =>
      prod.produto_sabores?.some(x => x.id === s.id)
        ? { ...prod, produto_sabores: prod.produto_sabores?.map(x => x.id === s.id ? { ...x, ativo: !s.ativo } : x) }
        : prod
    ));
  }

  async function handleUpdateSabor(id: string) {
    const nome = editingSaborForm.nome.trim();
    if (!nome) return;
    setSavingTab(true);
    const categoria_sabor_id = editingSaborForm.categoria_sabor_id || null;
    const preco_adicional = parseFloat(editingSaborForm.preco) || null;
    await supabase.from("produto_sabores").update({
      nome, descricao: editingSaborForm.descricao.trim(), preco_adicional, categoria_sabor_id,
    }).eq("id", id);
    const updated = { nome, descricao: editingSaborForm.descricao.trim(), preco_adicional, categoria_sabor_id };
    setSabores(prev => prev.map(s => s.id === id ? { ...s, ...updated } : s));
    setProdutos(prev => prev.map(prod =>
      prod.produto_sabores?.some(s => s.id === id)
        ? { ...prod, produto_sabores: prod.produto_sabores?.map(s => s.id === id ? { ...s, ...updated } : s) }
        : prod
    ));
    setEditingSaborId(null);
    setSavingTab(false);
  }

  async function handleAddCategoria() {
    if (!novaCategoria.nome.trim() || !editId) return;
    setSavingCategoria(true);
    const { data } = await supabase.from("produto_categorias_sabor").insert({
      produto_id: editId,
      nome: novaCategoria.nome.trim(),
      preco_adicional: parseFloat(novaCategoria.preco_adicional) || 0,
      ordem: categoriasSabor.length,
    }).select().single();
    if (data) setCategoriasSabor(prev => [...prev, data as CategoriaSabor]);
    setNovaCategoria({ nome: "", preco_adicional: "" });
    setSavingCategoria(false);
  }

  async function handleDeleteCategoria(id: string) {
    await supabase.from("produto_categorias_sabor").delete().eq("id", id);
    setCategoriasSabor(prev => prev.filter(c => c.id !== id));
    setSabores(prev => prev.map(s => s.categoria_sabor_id === id ? { ...s, categoria_sabor_id: null } : s));
  }

  async function handleAddSaborInline(produtoId: string) {
    if (!addSaborNome.trim() || addSaborSaving) return;
    setAddSaborSaving(true);
    const { data: existing } = await supabase.from("produto_sabores").select("ordem").eq("produto_id", produtoId).order("ordem", { ascending: false }).limit(1);
    const nextOrdem = (existing?.[0]?.ordem ?? -1) + 1;
    const { data, error } = await supabase.from("produto_sabores").insert({
      produto_id: produtoId,
      nome: addSaborNome.trim(),
      descricao: "",
      ordem: nextOrdem,
      ativo: true,
    }).select().single();
    if (error) {
      alert("Erro ao criar sabor: " + error.message);
    } else if (data) {
      const novo = data as ProdutoSabor;
      setProdutos(prev => prev.map(prod => prod.id === produtoId
        ? { ...prod, produto_sabores: [...(prod.produto_sabores ?? []), novo] }
        : prod));
      setAddSaborNome("");
    }
    setAddSaborSaving(false);
  }

  // Vincula/desvincula dois produtos para compartilharem sabores. O vínculo é
  // sempre simétrico: se A passa a compartilhar com B, B também passa a
  // compartilhar com A — sem isso o produto B mostraria os sabores de A mas
  // não o contrário, o que não faz sentido pro cliente na hora de escolher.
  async function handleToggleVinculoSabor(produtoAId: string, produtoBId: string) {
    const a = produtos.find(p => p.id === produtoAId);
    const b = produtos.find(p => p.id === produtoBId);
    if (!a || !b) return;
    const ligado = (a.sabores_vinculo_ids ?? []).includes(produtoBId);
    const novoA = ligado
      ? (a.sabores_vinculo_ids ?? []).filter(id => id !== produtoBId)
      : [...(a.sabores_vinculo_ids ?? []), produtoBId];
    const novoB = ligado
      ? (b.sabores_vinculo_ids ?? []).filter(id => id !== produtoAId)
      : [...(b.sabores_vinculo_ids ?? []), produtoAId];
    setProdutos(prev => prev.map(p =>
      p.id === produtoAId ? { ...p, sabores_vinculo_ids: novoA } :
      p.id === produtoBId ? { ...p, sabores_vinculo_ids: novoB } : p));
    const [{ error: errA }, { error: errB }] = await Promise.all([
      supabase.from("produtos").update({ sabores_vinculo_ids: novoA }).eq("id", produtoAId),
      supabase.from("produtos").update({ sabores_vinculo_ids: novoB }).eq("id", produtoBId),
    ]);
    if (errA || errB) {
      alert("Erro ao atualizar vínculo: " + (errA?.message || errB?.message));
      setProdutos(prev => prev.map(p =>
        p.id === produtoAId ? { ...p, sabores_vinculo_ids: a.sabores_vinculo_ids } :
        p.id === produtoBId ? { ...p, sabores_vinculo_ids: b.sabores_vinculo_ids } : p));
    }
  }

  async function handleUploadSaborImg(file: File, saborId: string) {
    setEditingSaborForm(f => ({ ...f, uploadingSaborImg: true }));
    try {
      const url = await uploadImage(file, "vellox/sabores");
      await supabase.from("produto_sabores").update({ imagem_url: url }).eq("id", saborId);
      setSabores(prev => prev.map(s => s.id === saborId ? { ...s, imagem_url: url } : s));
      setProdutos(prev => prev.map(prod =>
        prod.produto_sabores?.some(s => s.id === saborId)
          ? { ...prod, produto_sabores: prod.produto_sabores?.map(s => s.id === saborId ? { ...s, imagem_url: url } : s) }
          : prod
      ));
    } catch (e) {
      console.error("Upload sabor img", e);
    } finally {
      setEditingSaborForm(f => ({ ...f, uploadingSaborImg: false }));
    }
  }

  async function handleImportSaboresImage(file: File) {
    setImportSaboresLoading(true);
    setImportSaboresOpen(true);
    setImportSaboresList([]);
    try {
      const fd = new FormData();
      fd.append("imagem", file);
      const res = await fetch("/api/catalogo/importar-sabores", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erro ao processar imagem");
      setImportSaboresList(json.sabores.map((s: { nome: string; descricao: string }) => ({ ...s, sel: true })));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao processar imagem");
      setImportSaboresOpen(false);
    } finally {
      setImportSaboresLoading(false);
    }
  }

  async function handleSalvarSaboresImport() {
    if (!editId) return;
    const selecionados = importSaboresList.filter(s => s.sel);
    if (selecionados.length === 0) return;
    setSalvandoSaboresImport(true);
    try {
      const inserts = selecionados.map((s, i) => ({
        produto_id: editId,
        nome: s.nome,
        descricao: s.descricao,
        ordem: sabores.length + i,
        ativo: true,
      }));
      const { data } = await supabase.from("produto_sabores").insert(inserts).select();
      if (data) {
        const novos = data as ProdutoSabor[];
        setSabores(prev => [...prev, ...novos]);
        setProdutos(prev => prev.map(prod => prod.id === editId
          ? { ...prod, produto_sabores: [...(prod.produto_sabores ?? []), ...novos] }
          : prod));
      }
      setImportSaboresOpen(false);
      setImportSaboresList([]);
    } finally {
      setSalvandoSaboresImport(false);
    }
  }

  async function handleQuickImportSaboresImage(file: File) {
    setQuickImportLoading(true);
    setQuickImportOpen(true);
    setQuickImportList([]);
    try {
      const fd = new FormData();
      fd.append("imagem", file);
      const res = await fetch("/api/catalogo/importar-sabores", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erro ao processar imagem");
      setQuickImportList(json.sabores.map((s: { nome: string; descricao: string }) => ({ ...s, sel: true })));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao processar imagem");
      setQuickImportOpen(false);
    } finally {
      setQuickImportLoading(false);
    }
  }

  async function handleSalvarQuickImport() {
    if (!quickProdutoId) return;
    const selecionados = quickImportList.filter(s => s.sel);
    if (selecionados.length === 0) return;
    setSalvandoQuickImport(true);
    try {
      const { data: existing } = await supabase
        .from("produto_sabores").select("id").eq("produto_id", quickProdutoId);
      const ordemBase = existing?.length ?? 0;
      const inserts = selecionados.map((s, i) => ({
        produto_id: quickProdutoId,
        nome: s.nome,
        descricao: s.descricao,
        ordem: ordemBase + i,
        ativo: true,
      }));
      await supabase.from("produto_sabores").insert(inserts);
      setQuickImportOpen(false);
      setQuickImportList([]);
      setQuickOpen(false);
    } finally {
      setSalvandoQuickImport(false);
    }
  }

  async function handleImportAdicionaisImage(file: File) {
    setImportAdicionaisLoading(true);
    setImportAdicionaisOpen(true);
    setImportAdicionaisList([]);
    try {
      const fd = new FormData();
      fd.append("imagem", file);
      const res = await fetch("/api/catalogo/importar-adicionais", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erro ao processar imagem");
      setImportAdicionaisList(json.adicionais.map((a: { nome: string; preco: number; obrigatorio: boolean }) => ({ ...a, sel: true })));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao processar imagem");
      setImportAdicionaisOpen(false);
    } finally {
      setImportAdicionaisLoading(false);
    }
  }

  async function handleSalvarAdicionaisImport() {
    if (!editId) return;
    const selecionados = importAdicionaisList.filter(a => a.sel);
    if (selecionados.length === 0) return;
    setSalvandoAdicionaisImport(true);
    try {
      const inserts = selecionados.map((a, i) => ({
        produto_id: editId,
        nome: a.nome,
        preco: a.preco,
        obrigatorio: a.obrigatorio,
        ordem: adicionais.length + i,
        ativo: true,
      }));
      const { data } = await supabase.from("produto_adicionais").insert(inserts).select();
      if (data) setAdicionais(prev => [...prev, ...(data as ProdutoAdicional[])]);
      setImportAdicionaisOpen(false);
      setImportAdicionaisList([]);
    } finally {
      setSalvandoAdicionaisImport(false);
    }
  }

  // ── Adicionais ───────────────────────────────────────────────────
  async function handleAddAdicional() {
    if (!novoAdicional.nome.trim() || !editId) return;
    setSavingTab(true);
    const { data } = await supabase.from("produto_adicionais").insert({
      produto_id: editId, nome: novoAdicional.nome.trim(),
      preco: parseFloat(novoAdicional.preco) || 0,
      obrigatorio: novoAdicional.obrigatorio,
      ordem: adicionais.length, ativo: true,
    }).select().single();
    if (data) {
      setAdicionais(prev => [...prev, data as ProdutoAdicional]);
      await copiarAdicionalParaProdutos(
        novoAdicional.nome.trim(), parseFloat(novoAdicional.preco) || 0, novoAdicional.obrigatorio,
        novoAdicionalOutrosProdutos.filter(id => id !== editId),
      );
    }
    setNovoAdicional({ nome: "", preco: "", obrigatorio: false });
    setNovoAdicionalOutrosProdutos([]);
    setSavingTab(false);
  }
  async function handleDeleteAdicional(id: string) {
    await supabase.from("produto_adicionais").delete().eq("id", id);
    setAdicionais(prev => prev.filter(a => a.id !== id));
  }
  async function toggleAdicionalAtivo(a: ProdutoAdicional) {
    await supabase.from("produto_adicionais").update({ ativo: !a.ativo }).eq("id", a.id);
    setAdicionais(prev => prev.map(x => x.id === a.id ? { ...x, ativo: !x.ativo } : x));
  }

  function precoDeSaborAdmin(s: ProdutoSabor, precoBase: number, categorias?: CategoriaSabor[]): number {
    if ((s.preco_adicional ?? 0) > 0) return s.preco_adicional!;
    if (s.categoria_sabor_id && categorias) {
      const cat = categorias.find(c => c.id === s.categoria_sabor_id);
      if (cat) return precoBase + cat.preco_adicional;
    }
    return precoBase;
  }
  function calcularPrecoAdmin(precos: number[], modo: "maior_valor" | "proporcional"): number {
    if (precos.length === 0) return 0;
    return modo === "proporcional"
      ? precos.reduce((a, b) => a + b, 0) / precos.length
      : Math.max(...precos);
  }

  const cor = config.cor_principal;

  // ── Importar cardápio ────────────────────────────────────────────
  async function handleImportarCardapio(file: File) {
    setImportando(true);
    setImportPreview(URL.createObjectURL(file));
    try {
      const fd = new FormData();
      fd.append("imagem", file);
      const res = await fetch("/api/catalogo/importar", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erro ao processar imagem");
      setImportProdutos(json.produtos.map((p: Omit<ProdutoImportado, "selecionado">) => ({ ...p, selecionado: true })));
      setImportStep("review");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao processar imagem");
    } finally {
      setImportando(false);
    }
  }

  async function handleSalvarImportados() {
    const selecionados = importProdutos.filter(p => p.selecionado);
    if (selecionados.length === 0) return;
    setSalvandoImport(true);
    try {
      const inserts = selecionados.map((p, i) => ({
        empresa_id: empresaId,
        nome: p.nome,
        descricao: p.descricao,
        preco: p.preco,
        categoria: p.categoria,
        imagem_url: null,
        ativo: true,
        ordem: produtos.length + i,
      }));
      const { data } = await supabase.from("produtos").insert(inserts).select();
      if (data) setProdutos(prev => [...prev, ...(data as Produto[])]);
      setImportModalOpen(false);
      setImportStep("upload");
      setImportPreview("");
      setImportProdutos([]);
    } finally {
      setSalvandoImport(false);
    }
  }

  return (
    <div style={{ background: "var(--bg-base)", minHeight: "100%" }}>
      <div className="px-4 md:px-5 py-5 md:py-7" style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 22 }}>

        {/* ── Header ──────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-4)", marginBottom: 6 }}>
              Painel · Catálogo
            </p>
            <h1 style={{ fontSize: 26, fontWeight: 900, color: "var(--text-1)", letterSpacing: "-0.03em", margin: 0 }}>
              Catálogo de Produtos
            </h1>
          </div>
          <button
            onClick={copyLink}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "10px 16px", borderRadius: 12,
              background: copied ? "rgba(34,197,94,0.10)" : "var(--bg-1)",
              border: `1px solid ${copied ? "rgba(34,197,94,0.35)" : "var(--border-1)"}`,
              color: copied ? "#16a34a" : "var(--text-1)",
              fontSize: 13, fontWeight: 700, cursor: "pointer",
              boxShadow: "0 1px 4px rgba(0,0,0,0.06)", transition: "all 0.2s",
            }}>
            {copied ? <Check size={14} /> : <Link2 size={14} />}
            {copied ? "Link copiado!" : "Copiar link"}
            <span className="hidden sm:inline" style={{ fontWeight: 500, color: "var(--text-4)", fontSize: 11 }}>/loja/{lojaPath}</span>
          </button>
        </div>

        {/* ── Tabs ────────────────────────────────────────────────── */}
        <div className="flex gap-1 p-1 rounded-xl w-full" style={{ background: "var(--bg-1)", border: "1px solid var(--border-1)", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
          {([
            { key: "produtos", label: "Produtos",      short: "Produtos",  icon: ShoppingBag },
            { key: "perfil",   label: "Perfil",        short: "Perfil",    icon: User        },
            { key: "config",   label: "Configurações", short: "Config",    icon: Settings2   },
          ] as { key: Tab; label: string; short: string; icon: React.ElementType }[]).map(({ key, label, short, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg font-bold transition-all"
              style={{
                background: tab === key ? cor : "transparent",
                color: tab === key ? "#fff" : "var(--text-3)",
                border: "none", fontSize: 12, cursor: "pointer",
              }}>
              <Icon size={13} />
              <span className="hidden sm:inline">{label}</span>
              <span className="sm:hidden">{short}</span>
            </button>
          ))}
        </div>

        {/* ══════════════════════════════════════════════════════════
            TAB: PRODUTOS
        ══════════════════════════════════════════════════════════ */}
        {tab === "produtos" && (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {categorias.map(c => (
                  <button key={c} onClick={() => setCatFilter(c)}
                    style={{
                      padding: "6px 14px", borderRadius: 999,
                      background: catFilter === c ? (c === "__sabores__" ? "#7c3aed" : cor) : "var(--bg-1)",
                      color: catFilter === c ? "#fff" : (c === "__sabores__" ? "#7c3aed" : "var(--text-3)"),
                      border: `1px solid ${catFilter === c ? (c === "__sabores__" ? "#7c3aed" : cor) : (c === "__sabores__" ? "#ddd6fe" : "var(--border-1)")}`,
                      fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "all 0.15s",
                    }}>
                    {c === "__sabores__" ? "🍕 Sabores" : c}
                    {c !== "Todos" && c !== "__sabores__" && (
                      <span style={{ marginLeft: 5, opacity: 0.6 }}>
                        ({produtos.filter(p => p.categoria === c).length})
                      </span>
                    )}
                    {c === "__sabores__" && (
                      <span style={{ marginLeft: 5, opacity: 0.7 }}>
                        ({saboresPorProduto.reduce((n, g) => n + g.sabores.length, 0)})
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <input ref={importRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic" style={{ display: "none" }}
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) { setImportModalOpen(true); setImportStep("upload"); handleImportarCardapio(f); }
                    e.target.value = "";
                  }} />
                <button
                  onClick={() => { setImportModalOpen(true); setImportStep("upload"); setImportPreview(""); setImportProdutos([]); importRef.current?.click(); }}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-1.5"
                  style={{
                    padding: "10px 14px", borderRadius: 12,
                    background: "var(--bg-1)", color: "var(--text-2)",
                    border: "1px solid var(--border-1)", fontSize: 13, fontWeight: 700,
                    cursor: "pointer", transition: "all 0.15s",
                  }}>
                  <ScanLine size={15} />
                  <span className="hidden sm:inline">Importar cardápio</span>
                  <span className="sm:hidden">Importar</span>
                </button>
                <button onClick={openAdd}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-1.5"
                  style={{
                    padding: "10px 16px", borderRadius: 12,
                    background: cor, color: "#fff",
                    border: "none", fontSize: 13, fontWeight: 800,
                    cursor: "pointer", boxShadow: `0 4px 14px ${cor}40`, transition: "all 0.15s",
                  }}>
                  <Plus size={15} /> Novo produto
                </button>
              </div>
            </div>

            {/* ── Seção de sabores ─────────────────────────────────── */}
            {catFilter === "__sabores__" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                <div>
                  <p style={{ fontSize: 15, fontWeight: 800, color: "var(--text-1)", margin: "0 0 4px" }}>Todos os sabores</p>
                  <p style={{ fontSize: 12, color: "var(--text-4)", margin: 0 }}>Sabores de todos os produtos agrupados por origem</p>
                </div>

                {/* Vínculo explícito de sabores entre produtos */}
                <div style={{ background: "#f5f3ff", border: "1.5px solid #ddd6fe", borderRadius: 16, padding: 16 }}>
                  <p style={{ fontSize: 13, fontWeight: 800, color: "#6d28d9", margin: "0 0 3px" }}>Vincular sabores entre produtos</p>
                  <p style={{ fontSize: 12, color: "#7c3aed", margin: "0 0 14px" }}>
                    Por padrão cada produto mostra só os próprios sabores. Escolha aqui, produto por produto, com quais outros produtos específicos ele deve compartilhar a lista de sabores (ex: a mesma pizza em tamanhos diferentes).
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {saboresPorProduto.map(({ produto: p, sabores }) => {
                      const vinculados = p.sabores_vinculo_ids ?? [];
                      const aberto = vinculoAbertoId === p.id;
                      return (
                        <div key={p.id} style={{ borderRadius: 10, background: vinculados.length > 0 || aberto ? "#fff" : "transparent" }}>
                          <button
                            onClick={() => setVinculoAbertoId(aberto ? null : p.id)}
                            style={{
                              display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
                              padding: "8px 10px", width: "100%", background: "none", border: "none", textAlign: "left",
                            }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: "#1f2937", flex: 1 }}>{p.nome}</span>
                            {vinculados.length > 0 && (
                              <span style={{ fontSize: 11, fontWeight: 700, color: "#7c3aed", background: "#ede9fe", borderRadius: 999, padding: "2px 8px" }}>
                                vinculado a {vinculados.length}
                              </span>
                            )}
                            <span style={{ fontSize: 11, color: "#6b7280" }}>{sabores.length} sabor{sabores.length !== 1 ? "es" : ""}</span>
                            <ChevronDown size={14} style={{ color: "#6b7280", transform: aberto ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
                          </button>
                          {aberto && (
                            <div style={{ padding: "0 10px 10px 10px", display: "flex", flexDirection: "column", gap: 2 }}>
                              {saboresPorProduto.filter(g => g.produto.id !== p.id).length === 0 && (
                                <p style={{ fontSize: 12, color: "#6b7280", margin: "4px 0" }}>Nenhum outro produto com sabores cadastrados ainda.</p>
                              )}
                              {saboresPorProduto.filter(g => g.produto.id !== p.id).map(({ produto: outro }) => (
                                <label key={outro.id} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "5px 6px", fontSize: 12.5, color: "#374151" }}>
                                  <input type="checkbox" checked={vinculados.includes(outro.id)}
                                    onChange={() => handleToggleVinculoSabor(p.id, outro.id)}
                                    style={{ width: 14, height: 14, accentColor: "#7c3aed" }} />
                                  {outro.nome}
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {saboresPorProduto.map(({ produto: p, sabores }) => {
                  const grupoAberto = saborGruposAbertos.has(p.id);
                  return (
                  <div key={p.id} style={{ background: "var(--bg-1)", borderRadius: 16, border: "1px solid var(--border-1)", overflow: "hidden" }}>
                    {/* Cabeçalho do grupo (clicável: abre/fecha a lista) */}
                    <div
                      onClick={() => toggleSaborGrupo(p.id)}
                      style={{ padding: "14px 16px", borderBottom: grupoAberto ? "1px solid var(--border-1)" : "none", display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                      {p.imagem_url
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={p.imagem_url} alt={p.nome} style={{ width: 36, height: 36, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
                        : <div style={{ width: 36, height: 36, borderRadius: 10, background: `${cor}12`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 18 }}>🍕</div>
                      }
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: 14, fontWeight: 800, color: "var(--text-1)", margin: 0 }}>{p.nome}</p>
                        <p style={{ fontSize: 11, color: "var(--text-4)", margin: 0 }}>{sabores.length} sabor{sabores.length !== 1 ? "es" : ""}</p>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); setAddSaborProdutoId(addSaborProdutoId === p.id ? null : p.id); setAddSaborNome(""); setSaborGruposAbertos(prev => new Set(prev).add(p.id)); }}
                        style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 8, background: addSaborProdutoId === p.id ? cor : "var(--bg-input)", border: `1px solid ${addSaborProdutoId === p.id ? cor : "var(--border-1)"}`, fontSize: 12, fontWeight: 700, color: addSaborProdutoId === p.id ? "#fff" : "var(--text-2)", cursor: "pointer" }}>
                        <Plus size={11} /> Novo sabor
                      </button>
                      <button onClick={e => { e.stopPropagation(); openEdit(p, "sabores"); }}
                        style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 8, background: "var(--bg-input)", border: "1px solid var(--border-1)", fontSize: 12, fontWeight: 700, color: "var(--text-2)", cursor: "pointer" }}>
                        <Pencil size={11} /> Editar sabores
                      </button>
                      <ChevronDown size={16} style={{ color: "var(--text-4)", flexShrink: 0, transform: grupoAberto ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
                    </div>
                    {/* Inline add form */}
                    {addSaborProdutoId === p.id && (
                      <div style={{ display: "flex", gap: 8, padding: "12px 16px", background: `${cor}08`, borderBottom: "1px solid var(--border-1)" }}>
                        <input
                          autoFocus
                          value={addSaborNome}
                          onChange={e => setAddSaborNome(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") handleAddSaborInline(p.id); if (e.key === "Escape") { setAddSaborProdutoId(null); setAddSaborNome(""); } }}
                          placeholder="Nome do sabor (ex: Mussarela)  ↵ Enter para adicionar"
                          style={{ flex: 1, padding: "8px 12px", borderRadius: 10, border: `1.5px solid ${cor}50`, fontSize: 13, color: "var(--text-1)", background: "#fff", outline: "none" }}
                        />
                        <button onClick={() => handleAddSaborInline(p.id)} disabled={addSaborSaving || !addSaborNome.trim()}
                          style={{ padding: "8px 14px", borderRadius: 10, background: cor, color: "#fff", border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: !addSaborNome.trim() ? 0.5 : 1 }}>
                          {addSaborSaving ? "…" : "Adicionar"}
                        </button>
                      </div>
                    )}
                    {/* Lista de sabores */}
                    {grupoAberto && (
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      {sabores.map((s, idx) => (
                        <div key={s.id} style={{
                          display: "flex", alignItems: "center", gap: 12,
                          padding: "11px 16px",
                          borderBottom: idx < sabores.length - 1 ? "1px solid var(--border-1)" : "none",
                          background: s.ativo ? "transparent" : "var(--bg-input)",
                          opacity: s.ativo ? 1 : 0.55,
                        }}>
                          {s.imagem_url
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={s.imagem_url} alt={s.nome} style={{ width: 40, height: 40, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
                            : <div style={{ width: 40, height: 40, borderRadius: 8, background: "#f5f3ff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 20 }}>🍕</div>
                          }
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)", margin: 0 }}>{s.nome}</p>
                            {s.descricao && <p style={{ fontSize: 11, color: "var(--text-4)", margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.descricao}</p>}
                          </div>
                          {(() => {
                            if ((s.preco_adicional ?? 0) > 0) {
                              return <span style={{ fontSize: 12, fontWeight: 800, color: cor, background: `${cor}12`, borderRadius: 999, padding: "2px 9px", flexShrink: 0 }}>R${s.preco_adicional!.toFixed(2)}</span>;
                            }
                            const cat = s.categoria_sabor_id ? p.produto_categorias_sabor?.find(c => c.id === s.categoria_sabor_id) : null;
                            if (cat && cat.preco_adicional > 0) {
                              return <span style={{ fontSize: 12, fontWeight: 800, color: "#7c3aed", background: "#f5f3ff", borderRadius: 999, padding: "2px 9px", flexShrink: 0 }}>+R${cat.preco_adicional.toFixed(2)} ({cat.nome})</span>;
                            }
                            return <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-4)", flexShrink: 0 }}>padrão</span>;
                          })()}
                          <span style={{ fontSize: 10, fontWeight: 700, color: "#7c3aed", background: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: 999, padding: "2px 8px", flexShrink: 0 }}>
                            {p.nome}
                          </span>
                          <button
                            onClick={async () => {
                              await supabase.from("produto_sabores").update({ ativo: !s.ativo }).eq("id", s.id);
                              setProdutos(prev => prev.map(prod => prod.id === p.id
                                ? { ...prod, produto_sabores: prod.produto_sabores?.map(x => x.id === s.id ? { ...x, ativo: !s.ativo } : x) }
                                : prod
                              ));
                            }}
                            style={{ padding: "4px 10px", borderRadius: 8, border: "1px solid var(--border-1)", background: s.ativo ? "#f0fdf4" : "var(--bg-input)", color: s.ativo ? "#16a34a" : "var(--text-4)", fontSize: 11, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
                            {s.ativo ? "Ativo" : "Inativo"}
                          </button>
                          <button
                            onClick={async () => {
                              if (!confirm(`Excluir sabor "${s.nome}"?`)) return;
                              await supabase.from("produto_sabores").delete().eq("id", s.id);
                              setProdutos(prev => prev.map(prod => prod.id === p.id
                                ? { ...prod, produto_sabores: prod.produto_sabores?.filter(x => x.id !== s.id) }
                                : prod
                              ));
                            }}
                            style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid #fee2e2", background: "#fef2f2", color: "#FF6A00", cursor: "pointer", flexShrink: 0 }}>
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                    )}
                  </div>
                  );
                })}

            </div>
            )}

            {/* ── Grade de produtos ─────────────────────────────────── */}
            {catFilter !== "__sabores__" && (produtosFiltrados.length === 0 ? (
              <div style={{
                display: "flex", flexDirection: "column", alignItems: "center",
                justifyContent: "center", padding: "64px 24px", gap: 14,
                background: "var(--bg-1)", borderRadius: 20, border: "1px solid var(--border-1)",
              }}>
                <div style={{ width: 56, height: 56, borderRadius: 18, background: `${cor}12`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <ShoppingBag size={24} style={{ color: cor }} />
                </div>
                <p style={{ fontSize: 15, fontWeight: 700, color: "var(--text-3)", margin: 0 }}>
                  {catFilter === "Todos" ? "Nenhum produto cadastrado" : `Nenhum produto em "${catFilter}"`}
                </p>
                <button onClick={openAdd}
                  style={{ padding: "9px 20px", borderRadius: 10, background: cor, color: "#fff", border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  Adicionar produto
                </button>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
                {produtosFiltrados.map(p => (
                  <div key={p.id}
                    style={{
                      background: "var(--bg-1)", borderRadius: 16,
                      border: "1px solid var(--border-1)",
                      boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
                      overflow: "hidden", opacity: p.ativo ? 1 : 0.55, transition: "opacity 0.2s",
                    }}>
                    <div style={{ height: 140, background: "var(--bg-input)", position: "relative", overflow: "hidden" }}>
                      {p.imagem_url
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={p.imagem_url} alt={p.nome} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        : <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}><ImageIcon size={32} style={{ color: "var(--text-5)" }} /></div>
                      }
                      <span style={{
                        position: "absolute", top: 8, left: 8,
                        background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)",
                        color: "#fff", fontSize: 10, fontWeight: 700,
                        padding: "3px 8px", borderRadius: 999,
                      }}>{p.categoria}</span>
                    </div>
                    <div style={{ padding: "12px 14px" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                        <p style={{ fontSize: 14, fontWeight: 800, color: "var(--text-1)", margin: "0 0 4px", flex: 1 }}>{p.nome}</p>
                        {(() => {
                          const cp = p.categoria_preco_id ? categoriasPreco.find(c => c.id === p.categoria_preco_id) : null;
                          if (cp) return (
                            <span style={{ fontSize: 10, fontWeight: 800, color: cp.cor, background: cp.cor + "15", border: `1px solid ${cp.cor}30`, borderRadius: 999, padding: "2px 8px", flexShrink: 0 }}>
                              {cp.nome}
                            </span>
                          );
                          return <span style={{ fontSize: 15, fontWeight: 900, color: cor, flexShrink: 0 }}>R${p.preco.toFixed(2)}</span>;
                        })()}
                      </div>
                      {p.descricao && (
                        <p style={{ fontSize: 11, color: "var(--text-4)", margin: "0 0 10px", lineHeight: 1.4,
                          overflow: "hidden", display: "-webkit-box",
                          WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                          {p.descricao}
                        </p>
                      )}
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
                        <button onClick={() => toggleAtivo(p)} title={p.ativo ? "Desativar" : "Ativar"}
                          style={{ padding: "5px 8px", borderRadius: 8, border: "1px solid var(--border-1)", background: "var(--bg-1)", cursor: "pointer", color: p.ativo ? "#22c55e" : "var(--text-4)" }}>
                          {p.ativo ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                        </button>
                        <button onClick={() => openEdit(p)}
                          style={{ padding: "5px 8px", borderRadius: 8, border: "1px solid var(--border-1)", background: "var(--bg-1)", cursor: "pointer", color: "var(--text-3)" }}>
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => handleDelete(p.id)} disabled={deleting === p.id}
                          style={{ padding: "5px 8px", borderRadius: 8, border: "1px solid #fee2e2", background: "#fef2f2", cursor: "pointer", color: "#FF6A00" }}>
                          <Trash2 size={14} />
                        </button>
                        <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 700,
                          color: p.ativo ? "#16a34a" : "var(--text-4)",
                          background: p.ativo ? "#f0fdf4" : "var(--bg-input)",
                          padding: "2px 8px", borderRadius: 999 }}>
                          {p.ativo ? "Ativo" : "Inativo"}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </>
        )}

        {/* ══════════════════════════════════════════════════════════
            TAB: PERFIL
        ══════════════════════════════════════════════════════════ */}
        {tab === "perfil" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 720 }}>

            {/* Banner */}
            <div style={{ background: "var(--bg-1)", borderRadius: 16, overflow: "hidden", border: "1px solid var(--border-1)" }}>
              <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid #f7f7f8" }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)", margin: 0 }}>Banner da loja</p>
                <p style={{ fontSize: 11, color: "var(--text-4)", margin: "4px 0 0" }}>Imagem exibida no topo da sua loja pública. Ideal: 1200×400px.</p>
              </div>
              <input ref={bannerRef} type="file" accept="image/*" style={{ display: "none" }}
                onChange={e => { if (e.target.files?.[0]) handleBannerUpload(e.target.files[0]); }} />
              <div
                onClick={() => bannerRef.current?.click()}
                style={{
                  position: "relative", cursor: "pointer",
                  background: config.banner_url ? "#000" : "var(--bg-input)",
                  minHeight: config.banner_url ? 0 : 180,
                  overflow: "hidden",
                }}>
                {config.banner_url
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={config.banner_url} alt="banner" style={{ width: "100%", height: "auto", display: "block" }} />
                  : (
                    <div style={{ height: 180, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }}>
                      <div style={{ width: 56, height: 56, borderRadius: 16, background: "var(--bg-3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <ImageIcon size={24} style={{ color: "var(--text-5)" }} />
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <p style={{ fontSize: 14, color: "var(--text-3)", margin: "0 0 4px", fontWeight: 600 }}>Clique para enviar o banner</p>
                        <p style={{ fontSize: 11, color: "var(--text-4)", margin: 0 }}>JPG, PNG, WebP, HEIC — qualquer formato de imagem</p>
                      </div>
                    </div>
                  )
                }
                {uploadingBanner && (
                  <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,0.85)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <p style={{ fontSize: 13, color: "var(--text-3)", fontWeight: 600 }}>Enviando…</p>
                  </div>
                )}
                <div style={{ position: "absolute", bottom: 10, right: 10, display: "flex", gap: 6 }}>
                  <button
                    onClick={e => { e.stopPropagation(); bannerRef.current?.click(); }}
                    style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 8, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", border: "none", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                    <Upload size={12} /> {config.banner_url ? "Alterar" : "Enviar"}
                  </button>
                  {config.banner_url && (
                    <button
                      onClick={e => { e.stopPropagation(); setConfig(c => ({ ...c, banner_url: null })); }}
                      style={{ padding: "6px 10px", borderRadius: 8, background: "rgba(255,106,0,0.8)", border: "none", color: "#fff", cursor: "pointer" }}>
                      <X size={12} />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Logo + Nome */}
            <div className="flex flex-col sm:flex-row sm:items-start gap-4" style={{ background: "var(--bg-1)", borderRadius: 16, padding: "20px", border: "1px solid var(--border-1)" }}>
              {/* Logo */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <input ref={logoRef} type="file" accept="image/*" style={{ display: "none" }}
                  onChange={e => { if (e.target.files?.[0]) handleLogoUpload(e.target.files[0]); }} />
                <div
                  onClick={() => logoRef.current?.click()}
                  style={{
                    width: 96, height: 96, borderRadius: 24, cursor: "pointer", overflow: "hidden",
                    border: "2px dashed var(--border-1)", background: config.logo_url ? "var(--border-1)" : "var(--bg-input)",
                    display: "flex", alignItems: "center", justifyContent: "center", position: "relative",
                    transition: "border-color 0.2s",
                  }}>
                  {uploadingLogo ? (
                    <p style={{ fontSize: 11, color: "var(--text-4)" }}>…</p>
                  ) : config.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={config.logo_url} alt="logo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                      <Upload size={18} style={{ color: "var(--text-5)" }} />
                      <p style={{ fontSize: 10, color: "var(--text-4)", margin: 0, textAlign: "center" }}>Logo</p>
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => logoRef.current?.click()}
                    style={{ padding: "5px 10px", borderRadius: 8, background: "var(--bg-input)", border: "1px solid var(--border-1)", fontSize: 11, fontWeight: 700, color: "var(--text-3)", cursor: "pointer" }}>
                    <Upload size={11} style={{ display: "inline", marginRight: 4 }} />
                    {config.logo_url ? "Alterar" : "Upload"}
                  </button>
                  {config.logo_url && (
                    <button onClick={() => setConfig(c => ({ ...c, logo_url: null }))}
                      style={{ padding: "5px 8px", borderRadius: 8, background: "#fef2f2", border: "1px solid #fee2e2", color: "#FF6A00", cursor: "pointer" }}>
                      <X size={11} />
                    </button>
                  )}
                </div>
              </div>

              {/* Nome + Descrição */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.06em", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 5, marginBottom: 7 }}>
                    <User size={11} /> Nome da empresa
                  </label>
                  <input
                    value={nomeEdit}
                    onChange={e => setNomeEdit(e.target.value)}
                    placeholder="Nome da sua empresa"
                    style={{ width: "100%", padding: "10px 13px", borderRadius: 11, border: "1px solid var(--border-1)", fontSize: 14, fontWeight: 600, color: "var(--text-1)", background: "var(--bg-input)" }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.06em", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 5, marginBottom: 7 }}>
                    <AlignLeft size={11} /> Descrição
                  </label>
                  <textarea
                    value={config.descricao}
                    onChange={e => setConfig(c => ({ ...c, descricao: e.target.value }))}
                    rows={3}
                    placeholder="Ex: Hambúrgueres artesanais feitos com amor. Delivery e retirada."
                    style={{ width: "100%", padding: "10px 12px", borderRadius: 11, border: "1px solid var(--border-1)", fontSize: 13, color: "var(--text-1)", background: "var(--bg-input)", resize: "vertical", fontFamily: "inherit" }}
                  />
                </div>
              </div>
            </div>

            {/* Horários de funcionamento */}
            <div style={{ background: "var(--bg-1)", borderRadius: 16, padding: "18px 20px", border: "1px solid var(--border-1)" }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)", margin: "0 0 4px" }}>Horários de funcionamento</p>
              <p style={{ fontSize: 11, color: "var(--text-4)", margin: "0 0 12px" }}>Exibido para o cliente quando a loja estiver fechada</p>
              <textarea
                value={config.horario_funcionamento ?? ""}
                onChange={e => setConfig(c => ({ ...c, horario_funcionamento: e.target.value || null }))}
                placeholder={"Seg a Sex: 11h às 22h\nSáb e Dom: 11h às 23h"}
                rows={3}
                style={{
                  width: "100%", padding: "10px 12px", borderRadius: 11,
                  border: "1px solid var(--border-1)", fontSize: 13,
                  color: "var(--text-1)", background: "var(--bg-input)",
                  resize: "vertical", fontFamily: "inherit", boxSizing: "border-box",
                }}
              />
            </div>

            {/* Verificado */}
            <div style={{ background: "var(--bg-1)", borderRadius: 16, padding: "18px 20px", border: "1px solid var(--border-1)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                    background: verificado ? "linear-gradient(135deg, #3b82f6, #1d4ed8)" : "var(--bg-input)",
                    border: verificado ? "none" : "1px solid var(--border-1)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "all 0.2s",
                  }}>
                    <BadgeCheck size={20} style={{ color: verificado ? "#fff" : "#cbd5e1" }} />
                  </div>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 800, color: "var(--text-1)", margin: "0 0 3px" }}>Empresa verificada</p>
                    <p style={{ fontSize: 12, color: "var(--text-3)", margin: 0 }}>
                      Exibe o badge{" "}
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 3, background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 999, padding: "1px 8px", fontSize: 11, fontWeight: 700, color: "#1d4ed8" }}>
                        <BadgeCheck size={10} /> Verificado
                      </span>{" "}
                      na sua loja pública
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setVerificado(v => !v)}
                  style={{
                    width: 52, height: 28, borderRadius: 14,
                    background: verificado ? "#3b82f6" : "var(--border-1)",
                    border: "none", cursor: "pointer", position: "relative",
                    transition: "background 0.2s", flexShrink: 0,
                  }}>
                  <span style={{
                    position: "absolute", top: 4,
                    left: verificado ? 27 : 4,
                    width: 20, height: 20, borderRadius: "50%",
                    background: "var(--bg-1)", transition: "left 0.2s",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
                  }} />
                </button>
              </div>
            </div>

            {/* Botões */}
            <div style={{ display: "flex", gap: 10 }}>
              <a href={`/loja/${lojaPath}`} target="_blank" rel="noopener noreferrer"
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  padding: "11px 16px", borderRadius: 12,
                  background: "var(--bg-1)", border: "1px solid var(--border-1)",
                  fontSize: 13, fontWeight: 700, color: "var(--text-3)", textDecoration: "none",
                }}>
                <ExternalLink size={13} /> Ver loja
              </a>
              <button onClick={handleSaveProfile} disabled={savingProfile}
                style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  padding: "11px 20px", borderRadius: 12,
                  background: profileSaved ? "#22c55e" : cor, color: "#fff",
                  border: "none", fontSize: 13, fontWeight: 800, cursor: "pointer",
                  boxShadow: `0 4px 14px ${cor}40`, transition: "all 0.2s",
                }}>
                {profileSaved ? <><Check size={14} /> Salvo!</> : savingProfile ? "Salvando…" : "Salvar perfil"}
              </button>
            </div>
            {profileError && (
              <div style={{ padding: "10px 14px", borderRadius: 10, background: "#fef2f2", border: "1px solid #fecaca" }}>
                <p style={{ fontSize: 12, color: "#cc5500", margin: 0, wordBreak: "break-all" }}>⚠ {profileError}</p>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════
            TAB: CONFIGURAÇÕES
        ══════════════════════════════════════════════════════════ */}
        {tab === "config" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

              {/* Left column */}
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

                {/* Link da loja */}
                <div style={{ background: "var(--bg-1)", borderRadius: 16, padding: "18px 20px", border: "1px solid var(--border-1)" }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)", margin: "0 0 6px" }}>Link da loja</p>
                  <p style={{ fontSize: 11, color: "var(--text-4)", margin: "0 0 14px" }}>
                    O endereço que seus clientes usam para acessar o cardápio online.
                  </p>
                  <div style={{ display: "flex", alignItems: "stretch", border: "1px solid var(--border-1)", borderRadius: 10, overflow: "hidden", background: "var(--bg-input)" }}>
                    <span style={{ display: "flex", alignItems: "center", padding: "0 0 0 12px", fontSize: 12, color: "var(--text-4)", whiteSpace: "nowrap" }}>
                      {typeof window !== "undefined" ? window.location.host : "seusite.com"}/loja/
                    </span>
                    <input
                      value={slugInput}
                      onChange={e => { setSlugInput(e.target.value); setSlugError(""); }}
                      placeholder="minha-loja"
                      style={{ flex: 1, minWidth: 60, padding: "9px 12px 9px 2px", border: "none", background: "transparent", fontSize: 13, fontWeight: 600, color: "var(--text-1)", outline: "none" }}
                    />
                  </div>
                  {slugError && <p style={{ fontSize: 11, color: "#dc2626", margin: "6px 0 0" }}>{slugError}</p>}
                  {!slugError && (
                    <p style={{ fontSize: 10, color: "var(--text-4)", margin: "6px 0 0" }}>
                      Ao mudar o link, endereços já compartilhados com clientes (QR code, redes sociais) param de funcionar.
                    </p>
                  )}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
                    <button onClick={handleSaveSlug} disabled={savingSlug || !slugInput.trim() || slugify(slugInput) === slugAtual}
                      style={{
                        padding: "8px 14px", borderRadius: 10, background: cor, color: "#fff", border: "none",
                        fontSize: 12, fontWeight: 700, cursor: "pointer",
                        opacity: (!slugInput.trim() || slugify(slugInput) === slugAtual) ? 0.5 : 1,
                      }}>
                      {savingSlug ? "Salvando…" : "Salvar link"}
                    </button>
                    {slugSalvo && (
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#16a34a", display: "flex", alignItems: "center", gap: 4 }}>
                        <Check size={13} /> Link atualizado!
                      </span>
                    )}
                  </div>
                </div>

                {/* WhatsApp */}
                <div style={{ background: "var(--bg-1)", borderRadius: 16, padding: "18px 20px", border: "1px solid var(--border-1)" }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)", margin: "0 0 14px" }}>WhatsApp</p>

                  <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", display: "block", marginBottom: 6 }}>
                    Telefone de contato
                  </label>
                  <input
                    value={config.telefone_contato ?? ""}
                    onChange={e => setConfig(c => ({ ...c, telefone_contato: e.target.value }))}
                    placeholder="(11) 99999-9999"
                    style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1px solid var(--border-1)", fontSize: 13, color: "var(--text-1)", background: "var(--bg-input)", boxSizing: "border-box" }}
                  />
                  <p style={{ fontSize: 10, color: "var(--text-4)", margin: "5px 0 0" }}>
                    Aparece como botão &quot;Falar no WhatsApp&quot; na página de acompanhamento do pedido do cliente.
                  </p>

                  <div style={{ height: 1, background: "var(--border-1)", margin: "14px 0" }} />

                  <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", display: "block", marginBottom: 6 }}>
                    Instance ID (Z-API)
                  </label>
                  <input
                    value={config.whatsapp_instance_id ?? ""}
                    onChange={e => setConfig(c => ({ ...c, whatsapp_instance_id: e.target.value || null }))}
                    placeholder="Opcional"
                    style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1px solid var(--border-1)", fontSize: 13, color: "var(--text-1)", background: "var(--bg-input)", boxSizing: "border-box", marginBottom: 10 }}
                  />
                  <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", display: "block", marginBottom: 6 }}>
                    Token (Z-API)
                  </label>
                  <input
                    value={config.whatsapp_token ?? ""}
                    onChange={e => setConfig(c => ({ ...c, whatsapp_token: e.target.value || null }))}
                    placeholder="Opcional"
                    style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1px solid var(--border-1)", fontSize: 13, color: "var(--text-1)", background: "var(--bg-input)", boxSizing: "border-box" }}
                  />
                  <p style={{ fontSize: 10, color: "var(--text-4)", margin: "5px 0 0" }}>
                    Preenchendo os dois campos acima (conta no z-api.io), o cliente recebe uma confirmação automática por WhatsApp assim que o pedido é feito, com o link de acompanhamento.
                  </p>
                </div>

                {/* Aberto / fechado */}
                <div style={{ background: "var(--bg-1)", borderRadius: 16, padding: "18px 20px", border: "1px solid var(--border-1)" }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)", margin: "0 0 14px" }}>Status da loja</p>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 700, color: config.aberto ? "#16a34a" : "var(--text-4)", margin: "0 0 2px" }}>
                        {config.aberto ? "Loja aberta" : "Loja fechada"}
                      </p>
                      <p style={{ fontSize: 11, color: "var(--text-4)", margin: 0 }}>Clientes podem fazer pedidos</p>
                    </div>
                    <button onClick={handleToggleAberto} disabled={togglingAberto}
                      style={{
                        width: 48, height: 26, borderRadius: 13,
                        background: config.aberto ? "#22c55e" : "var(--border-1)",
                        border: "none", cursor: togglingAberto ? "not-allowed" : "pointer",
                        position: "relative", transition: "background 0.2s", opacity: togglingAberto ? 0.6 : 1,
                      }}>
                      <span style={{
                        position: "absolute", top: 3,
                        left: config.aberto ? 25 : 3,
                        width: 20, height: 20, borderRadius: "50%",
                        background: "var(--bg-1)", transition: "left 0.2s",
                        boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
                      }} />
                    </button>
                  </div>
                  <div style={{ marginTop: 14 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", display: "block", marginBottom: 6 }}>
                      Horários de funcionamento
                    </label>
                    <textarea
                      value={config.horario_funcionamento ?? ""}
                      onChange={e => setConfig(c => ({ ...c, horario_funcionamento: e.target.value || null }))}
                      placeholder={"Seg a Sex: 11h às 22h\nSáb e Dom: 11h às 23h"}
                      rows={3}
                      style={{
                        width: "100%", padding: "9px 12px", borderRadius: 10,
                        border: "1px solid var(--border-1)", fontSize: 12,
                        color: "var(--text-1)", background: "var(--bg-input)",
                        resize: "vertical", lineHeight: 1.5, boxSizing: "border-box",
                      }}
                    />
                    <p style={{ fontSize: 10, color: "var(--text-4)", margin: "4px 0 0" }}>
                      Exibido para o cliente quando a loja estiver fechada
                    </p>
                  </div>
                </div>

                {/* Cor principal */}
                <div style={{ background: "var(--bg-1)", borderRadius: 16, padding: "18px 20px", border: "1px solid var(--border-1)" }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)", margin: "0 0 14px" }}>Cor principal</p>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <input type="color" value={config.cor_principal}
                      onChange={e => setConfig(c => ({ ...c, cor_principal: e.target.value }))}
                      style={{ width: 44, height: 44, borderRadius: 10, border: "none", cursor: "pointer", padding: 2 }} />
                    <input type="text" value={config.cor_principal}
                      onChange={e => setConfig(c => ({ ...c, cor_principal: e.target.value }))}
                      style={{ flex: 1, padding: "9px 12px", borderRadius: 10, border: "1px solid var(--border-1)", fontSize: 13, fontWeight: 600, color: "var(--text-1)", background: "var(--bg-input)" }} />
                    <span style={{ width: 32, height: 32, borderRadius: 8, background: config.cor_principal, flexShrink: 0 }} />
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    {["#FF6A00","#f97316","#f59e0b","#22c55e","#3b82f6","#8b5cf6","#ec4899"].map(c => (
                      <button key={c} onClick={() => setConfig(cfg => ({ ...cfg, cor_principal: c }))}
                        style={{ width: 24, height: 24, borderRadius: 6, background: c, border: config.cor_principal === c ? "2px solid #0f172a" : "2px solid transparent", cursor: "pointer" }} />
                    ))}
                  </div>
                </div>

                {/* Tempo de entrega + taxa */}
                <div style={{ background: "var(--bg-1)", borderRadius: 16, padding: "18px 20px", border: "1px solid var(--border-1)" }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)", margin: "0 0 14px" }}>Entrega</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", display: "flex", alignItems: "center", gap: 5, marginBottom: 6 }}>
                        <Clock size={12} /> Tempo estimado
                      </label>
                      <input type="text" value={config.tempo_entrega}
                        onChange={e => setConfig(c => ({ ...c, tempo_entrega: e.target.value }))}
                        placeholder="ex: 30-45 min"
                        style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1px solid var(--border-1)", fontSize: 13, color: "var(--text-1)", background: "var(--bg-input)" }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", display: "flex", alignItems: "center", gap: 5, marginBottom: 6 }}>
                        <Truck size={12} /> Taxa de entrega (R$)
                      </label>
                      <input type="number" min="0" step="0.50" value={config.taxa_entrega}
                        onChange={e => setConfig(c => ({ ...c, taxa_entrega: parseFloat(e.target.value) || 0 }))}
                        style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1px solid var(--border-1)", fontSize: 13, color: "var(--text-1)", background: "var(--bg-input)" }} />
                    </div>
                  </div>
                </div>
                {/* Modo de cálculo da pizza */}
                <div style={{ background: "var(--bg-1)", borderRadius: 16, padding: "18px 20px", border: "1px solid var(--border-1)" }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)", margin: "0 0 4px" }}>Cálculo de preço — Pizza</p>
                  <p style={{ fontSize: 11, color: "var(--text-4)", margin: "0 0 14px" }}>Como o preço é calculado quando o cliente escolhe mais de um sabor</p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {(["maior_valor", "proporcional"] as const).map(modo => (
                      <button key={modo}
                        onClick={async () => {
                          setConfig(c => ({ ...c, modo_calculo_pizza: modo }));
                          await supabase.from("configuracao_loja").upsert({
                            empresa_id: empresaId,
                            modo_calculo_pizza: modo,
                            updated_at: new Date().toISOString(),
                          }, { onConflict: "empresa_id" });
                        }}
                        style={{
                          padding: "12px", borderRadius: 12, textAlign: "left",
                          border: `2px solid ${(config.modo_calculo_pizza ?? "maior_valor") === modo ? cor : "var(--border-1)"}`,
                          background: (config.modo_calculo_pizza ?? "maior_valor") === modo ? `${cor}08` : "var(--bg-input)",
                          cursor: "pointer", transition: "all 0.15s",
                        }}>
                        <p style={{ fontSize: 13, fontWeight: 800, color: (config.modo_calculo_pizza ?? "maior_valor") === modo ? cor : "var(--text-1)", margin: "0 0 4px" }}>
                          {modo === "maior_valor" ? "🏆 Maior valor" : "⚖️ Proporcional"}
                        </p>
                        <p style={{ fontSize: 11, color: "var(--text-4)", margin: 0, lineHeight: 1.4 }}>
                          {modo === "maior_valor"
                            ? "Cobra o preço do sabor mais caro selecionado"
                            : "Divide o preço entre os sabores (ex: R$50+R$40 = R$45)"
                          }
                        </p>
                      </button>
                    ))}
                  </div>
                </div>

              </div>

              {/* Right column — save */}
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ background: "var(--bg-1)", borderRadius: 16, padding: "20px", border: "1px solid var(--border-1)", display: "flex", flexDirection: "column", gap: 12 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)", margin: 0 }}>Resumo</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-3)" }}>
                      <span>Status</span>
                      <span style={{ fontWeight: 700, color: config.aberto ? "#16a34a" : "var(--text-4)" }}>
                        {config.aberto ? "Aberta" : "Fechada"}
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-3)" }}>
                      <span>Entrega estimada</span>
                      <span style={{ fontWeight: 700, color: "var(--text-1)" }}>{config.tempo_entrega || "—"}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-3)" }}>
                      <span>Taxa fixa</span>
                      <span style={{ fontWeight: 700, color: "var(--text-1)" }}>R$ {config.taxa_entrega.toFixed(2)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-3)" }}>
                      <span>Bairros cadastrados</span>
                      <span style={{ fontWeight: 700, color: "var(--text-1)" }}>{bairros.length}</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10 }}>
                  <a href={`/loja/${lojaPath}`} target="_blank" rel="noopener noreferrer"
                    style={{
                      flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                      padding: "11px 16px", borderRadius: 12,
                      background: "var(--bg-1)", border: "1px solid var(--border-1)",
                      fontSize: 13, fontWeight: 700, color: "var(--text-3)", textDecoration: "none",
                    }}>
                    <ExternalLink size={13} /> Ver loja
                  </a>
                  <button onClick={handleSaveConfig} disabled={savingConfig}
                    style={{
                      flex: 2, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                      padding: "11px 20px", borderRadius: 12,
                      background: configSaved ? "#22c55e" : cor, color: "#fff",
                      border: "none", fontSize: 13, fontWeight: 800, cursor: "pointer",
                      boxShadow: `0 4px 14px ${cor}40`, transition: "all 0.2s",
                    }}>
                    {configSaved ? <><Check size={14} /> Salvo!</> : savingConfig ? "Salvando…" : "Salvar"}
                  </button>
                </div>
              </div>
            </div>

            {/* ── Categorias de Preço ───────────────────────────────── */}
            <div style={{ background: "var(--bg-1)", borderRadius: 16, padding: "20px 22px", border: "1px solid var(--border-1)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <div style={{ width: 32, height: 32, borderRadius: 10, background: "linear-gradient(135deg, #6366f1,#8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <DollarSign size={14} color="#fff" />
                </div>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 800, color: "var(--text-1)", margin: 0 }}>Categorias de preço</p>
                  <p style={{ fontSize: 11, color: "var(--text-4)", margin: 0 }}>Faixas de preço reutilizáveis entre produtos (ex: Clássico, Premium)</p>
                </div>
              </div>

              {/* Seletor de categoria */}
              {categoriasPreco.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
                  {categoriasPreco.map(c => (
                    <button key={c.id} onClick={() => setCatPrecoSel(catPrecoSel === c.id ? null : c.id)}
                      style={{
                        padding: "6px 14px", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "all 0.15s",
                        background: catPrecoSel === c.id ? c.cor : "var(--bg-input)",
                        color: catPrecoSel === c.id ? "#fff" : "var(--text-2)",
                        border: `1.5px solid ${catPrecoSel === c.id ? c.cor : "var(--border-1)"}`,
                      }}>
                      {c.nome}
                      <span style={{ marginLeft: 6, opacity: 0.7 }}>({c.tamanhos?.length ?? 0})</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Tamanhos da categoria selecionada */}
              {catPrecoSel && (() => {
                const cat = categoriasPreco.find(c => c.id === catPrecoSel);
                if (!cat) return null;
                return (
                  <div style={{ background: "var(--bg-input)", borderRadius: 12, padding: "14px 16px", marginBottom: 16, border: "1px solid var(--border-1)" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                      <p style={{ fontSize: 12, fontWeight: 800, color: "var(--text-1)", margin: 0 }}>
                        Tamanhos de <span style={{ color: cat.cor }}>{cat.nome}</span>
                      </p>
                      <button onClick={() => handleDeleteCategoriaPreco(cat.id)}
                        style={{ padding: "4px 10px", borderRadius: 8, border: "1px solid #fee2e2", background: "#fef2f2", color: "#FF6A00", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                        Excluir categoria
                      </button>
                    </div>
                    {(cat.tamanhos ?? []).length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
                        {(cat.tamanhos ?? []).map(t => (
                          <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 10, background: "var(--bg-1)", border: "1px solid var(--border-1)" }}>
                            <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: "var(--text-1)" }}>{t.nome}</span>
                            {editingTamPreco?.id === t.id ? (
                              <>
                                <input
                                  type="number" min="0" step="0.50"
                                  value={editingTamPreco.preco}
                                  onChange={e => setEditingTamPreco({ id: t.id, preco: e.target.value })}
                                  autoFocus
                                  style={{ width: 80, padding: "4px 8px", borderRadius: 8, border: `1.5px solid ${cat.cor}`, fontSize: 13, fontWeight: 700, color: "var(--text-1)", outline: "none", background: "var(--bg-input)" }}
                                />
                                <button onClick={() => handleUpdateTamanhoCatPreco(t.id, parseFloat(editingTamPreco.preco) || 0)}
                                  style={{ padding: "4px 10px", borderRadius: 8, background: cat.cor, color: "#fff", border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                                  <Check size={11} />
                                </button>
                                <button onClick={() => setEditingTamPreco(null)}
                                  style={{ padding: "4px 8px", borderRadius: 8, background: "var(--bg-input)", border: "1px solid var(--border-1)", cursor: "pointer", color: "var(--text-3)" }}>
                                  <X size={11} />
                                </button>
                              </>
                            ) : (
                              <>
                                <span style={{ fontSize: 13, fontWeight: 800, color: cat.cor }}>R${t.preco.toFixed(2)}</span>
                                <span style={{ fontSize: 11, color: "var(--text-4)", background: "var(--bg-3)", padding: "2px 7px", borderRadius: 6 }}>até {t.max_sabores} sab.</span>
                                <button onClick={() => setEditingTamPreco({ id: t.id, preco: String(t.preco) })}
                                  style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid var(--border-1)", background: "var(--bg-1)", cursor: "pointer", color: "var(--text-3)" }}>
                                  <Pencil size={11} />
                                </button>
                                <button onClick={() => handleDeleteTamanhoCatPreco(t.id)}
                                  style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid #fee2e2", background: "#fef2f2", color: "#FF6A00", cursor: "pointer" }}>
                                  <Trash2 size={11} />
                                </button>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 80px auto", gap: 6, alignItems: "end" }}>
                      <div>
                        <label style={{ fontSize: 10, fontWeight: 700, color: "var(--text-4)", display: "block", marginBottom: 4 }}>Nome</label>
                        <input value={novoTamCatPreco.nome} onChange={e => setNovoTamCatPreco(v => ({ ...v, nome: e.target.value }))}
                          placeholder="P, M, G…"
                          style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: "1px solid var(--border-1)", fontSize: 12, color: "var(--text-1)", background: "var(--bg-1)" }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 10, fontWeight: 700, color: "var(--text-4)", display: "block", marginBottom: 4 }}>Preço</label>
                        <input type="number" min="0" step="0.50" value={novoTamCatPreco.preco} onChange={e => setNovoTamCatPreco(v => ({ ...v, preco: e.target.value }))}
                          placeholder="0,00"
                          style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: "1px solid var(--border-1)", fontSize: 12, color: "var(--text-1)", background: "var(--bg-1)" }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 10, fontWeight: 700, color: "var(--text-4)", display: "block", marginBottom: 4 }}>Max sab.</label>
                        <input type="number" min="1" max="20" value={novoTamCatPreco.max_sabores} onChange={e => setNovoTamCatPreco(v => ({ ...v, max_sabores: e.target.value }))}
                          style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: "1px solid var(--border-1)", fontSize: 12, color: "var(--text-1)", background: "var(--bg-1)" }} />
                      </div>
                      <button onClick={handleAddTamanhoCatPreco} disabled={savingTamCatPreco || !novoTamCatPreco.nome.trim()}
                        style={{ padding: "7px 12px", borderRadius: 8, background: cat.cor, color: "#fff", border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: !novoTamCatPreco.nome.trim() ? 0.5 : 1, marginTop: 18 }}>
                        {savingTamCatPreco ? "…" : <Plus size={13} />}
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* Nova categoria */}
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  value={novaCatPreco.nome}
                  onChange={e => setNovaCatPreco(n => ({ ...n, nome: e.target.value }))}
                  onKeyDown={e => e.key === "Enter" && handleAddCategoriaPreco()}
                  placeholder="Nova categoria (ex: Clássico, Premium)"
                  style={{ flex: 1, padding: "9px 12px", borderRadius: 10, border: "1px solid var(--border-1)", fontSize: 13, color: "var(--text-1)", background: "var(--bg-input)" }}
                />
                <input type="color" value={novaCatPreco.cor} onChange={e => setNovaCatPreco(n => ({ ...n, cor: e.target.value }))}
                  style={{ width: 36, height: 36, borderRadius: 8, border: "none", cursor: "pointer", padding: 2 }} />
                <button onClick={handleAddCategoriaPreco} disabled={savingCatPreco || !novaCatPreco.nome.trim()}
                  style={{
                    display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 10,
                    background: novaCatPreco.cor, color: "#fff", border: "none", fontSize: 13, fontWeight: 700,
                    cursor: novaCatPreco.nome.trim() ? "pointer" : "not-allowed", opacity: novaCatPreco.nome.trim() ? 1 : 0.5,
                  }}>
                  <Plus size={13} /> {savingCatPreco ? "…" : "Criar"}
                </button>
              </div>
            </div>

            {/* ── Taxas por bairro ──────────────────────────────────── */}
            <div style={{ background: "var(--bg-1)", borderRadius: 16, padding: "20px 22px", border: "1px solid var(--border-1)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <div style={{ width: 32, height: 32, borderRadius: 10, background: "linear-gradient(135deg, #fb923c,#f97316)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <MapPin size={14} color="#fff" />
                </div>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 800, color: "var(--text-1)", margin: 0 }}>Taxas de entrega por bairro</p>
                  <p style={{ fontSize: 11, color: "var(--text-4)", margin: 0 }}>
                    {bairros.length > 0 ? "O cliente seleciona o bairro e vê a taxa automaticamente" : "Quando vazio, usa a taxa fixa configurada acima"}
                  </p>
                </div>
              </div>

              {bairros.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                  {bairros.map(b => (
                    <div key={b.id} style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "10px 14px", borderRadius: 12,
                      background: b.ativo ? "var(--bg-input)" : "var(--bg-2)",
                      border: `1px solid ${b.ativo ? "var(--border-1)" : "var(--border-1)"}`,
                      opacity: b.ativo ? 1 : 0.55,
                    }}>
                      <MapPin size={13} style={{ color: "var(--text-4)", flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>{b.bairro}</span>
                      <input
                        type="number" min="0" step="0.50"
                        defaultValue={b.taxa}
                        onBlur={e => handleUpdateTaxaBairro(b.id, parseFloat(e.target.value) || 0)}
                        style={{ width: 80, padding: "5px 8px", borderRadius: 8, border: "1px solid var(--border-1)", fontSize: 13, fontWeight: 700, color: "var(--text-1)", background: "var(--bg-1)", textAlign: "right" }}
                      />
                      <span style={{ fontSize: 12, color: "var(--text-3)", marginLeft: -4 }}>R$</span>
                      <button onClick={() => handleToggleBairro(b)}
                        style={{ padding: "4px 10px", borderRadius: 8, border: "1px solid var(--border-1)", background: b.ativo ? "#f0fdf4" : "var(--bg-input)", color: b.ativo ? "#16a34a" : "var(--text-4)", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                        {b.ativo ? "Ativo" : "Inativo"}
                      </button>
                      <button onClick={() => handleDeleteBairro(b.id)}
                        style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid #fee2e2", background: "#fef2f2", color: "#FF6A00", cursor: "pointer" }}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text" value={novoBairro}
                  onChange={e => setNovoBairro(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleAddBairro()}
                  placeholder="Nome do bairro"
                  style={{ flex: 1, padding: "9px 12px", borderRadius: 10, border: "1px solid var(--border-1)", fontSize: 13, color: "var(--text-1)", background: "var(--bg-input)", width: "100%" }}
                />
                <div className="flex gap-2">
                  <input
                    type="number" min="0" step="0.50" value={novaTaxa}
                    onChange={e => setNovaTaxa(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleAddBairro()}
                    placeholder="Taxa R$"
                    style={{ flex: 1, minWidth: 0, padding: "9px 12px", borderRadius: 10, border: "1px solid var(--border-1)", fontSize: 13, color: "var(--text-1)", background: "var(--bg-input)" }}
                  />
                  <button onClick={handleAddBairro} disabled={addingBairro || !novoBairro.trim()}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      padding: "9px 16px", borderRadius: 10,
                      background: cor, color: "#fff",
                      border: "none", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap",
                      cursor: novoBairro.trim() ? "pointer" : "not-allowed",
                      opacity: novoBairro.trim() ? 1 : 0.5,
                      boxShadow: `0 3px 10px ${cor}35`,
                    }}>
                    <Plus size={14} /> Adicionar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════
          MODAL IMPORTAR CARDÁPIO
      ══════════════════════════════════════════════════════════ */}
      {importModalOpen && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 300,
          background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
        }} onClick={e => { if (e.target === e.currentTarget && !importando && !salvandoImport) { setImportModalOpen(false); setImportStep("upload"); } }}>
          <div style={{
            background: "var(--bg-1)", borderRadius: 22,
            width: "100%", maxWidth: 560,
            maxHeight: "92vh", overflowY: "auto",
            boxShadow: "0 24px 64px rgba(0,0,0,0.2)",
          }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px", borderBottom: "1px solid var(--border-1)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: `${cor}15`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <ScanLine size={18} style={{ color: cor }} />
                </div>
                <div>
                  <p style={{ fontSize: 15, fontWeight: 900, color: "var(--text-1)", margin: 0 }}>Importar cardápio</p>
                  <p style={{ fontSize: 11, color: "var(--text-4)", margin: 0 }}>
                    {importStep === "upload" ? "Tire uma foto do seu cardápio físico ou digital" : `${importProdutos.filter(p => p.selecionado).length} de ${importProdutos.length} produtos selecionados`}
                  </p>
                </div>
              </div>
              {!importando && !salvandoImport && (
                <button onClick={() => { setImportModalOpen(false); setImportStep("upload"); }}
                  style={{ background: "var(--bg-input)", border: "none", borderRadius: 8, padding: 6, cursor: "pointer", color: "var(--text-3)" }}>
                  <X size={16} />
                </button>
              )}
            </div>

            {/* Steps indicator */}
            <div style={{ display: "flex", padding: "10px 22px 0", gap: 6 }}>
              {["upload", "review"].map((s, i) => (
                <div key={s} style={{ flex: 1, height: 3, borderRadius: 999, background: importStep === "review" && i === 0 ? cor : importStep === s ? cor : "var(--border-1)", transition: "background .2s" }} />
              ))}
            </div>

            <div style={{ padding: "20px 22px 22px" }}>
              {/* ── STEP 1: Upload + loading ── */}
              {importStep === "upload" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {importando ? (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, padding: "32px 0" }}>
                      {importPreview && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={importPreview} alt="cardápio" style={{ width: 200, height: 150, objectFit: "cover", borderRadius: 12, border: "1px solid var(--border-1)" }} />
                      )}
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                        <Loader2 size={32} style={{ color: cor, animation: "spin 1s linear infinite" }} />
                        <p style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)", margin: 0 }}>Analisando cardápio…</p>
                        <p style={{ fontSize: 13, color: "var(--text-4)", margin: 0, textAlign: "center" }}>A IA está lendo e separando todos os produtos. Isso leva alguns segundos.</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div
                        onClick={() => importRef.current?.click()}
                        style={{
                          height: 200, borderRadius: 16, border: "2px dashed var(--border-1)",
                          background: "var(--bg-input)", display: "flex", flexDirection: "column",
                          alignItems: "center", justifyContent: "center", gap: 12,
                          cursor: "pointer", transition: "border-color .2s",
                        }}
                        onMouseEnter={e => (e.currentTarget.style.borderColor = cor)}
                        onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border-1)")}
                      >
                        <div style={{ width: 56, height: 56, borderRadius: 16, background: `${cor}12`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <ScanLine size={26} style={{ color: cor }} />
                        </div>
                        <div style={{ textAlign: "center" }}>
                          <p style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)", margin: "0 0 4px" }}>Clique para enviar foto do cardápio</p>
                          <p style={{ fontSize: 12, color: "var(--text-4)", margin: 0 }}>JPG, PNG, WebP — foto tirada pelo celular funciona perfeitamente</p>
                        </div>
                      </div>
                      <div style={{ background: "var(--bg-input)", borderRadius: 12, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                        <p style={{ fontSize: 12, fontWeight: 700, color: "var(--text-1)", margin: 0 }}>Como funciona:</p>
                        {[
                          "Tire uma foto nítida do seu cardápio físico ou digital",
                          "A IA extrai automaticamente nome, preço, descrição e categoria",
                          "Você revisa e escolhe quais produtos quer importar",
                        ].map((t, i) => (
                          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                            <span style={{ width: 20, height: 20, borderRadius: 6, background: `${cor}15`, color: cor, fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</span>
                            <p style={{ fontSize: 12, color: "var(--text-3)", margin: 0, lineHeight: 1.5 }}>{t}</p>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ── STEP 2: Review ── */}
              {importStep === "review" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {/* Toggle all */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "var(--bg-input)", borderRadius: 12, border: "1px solid var(--border-1)" }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)" }}>
                      {importProdutos.filter(p => p.selecionado).length} produtos selecionados
                    </span>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => setImportProdutos(prev => prev.map(p => ({ ...p, selecionado: true })))}
                        style={{ fontSize: 11, fontWeight: 700, color: cor, background: `${cor}10`, border: `1px solid ${cor}30`, borderRadius: 8, padding: "4px 10px", cursor: "pointer" }}>
                        Todos
                      </button>
                      <button
                        onClick={() => setImportProdutos(prev => prev.map(p => ({ ...p, selecionado: false })))}
                        style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", background: "var(--bg-3)", border: "1px solid var(--border-1)", borderRadius: 8, padding: "4px 10px", cursor: "pointer" }}>
                        Nenhum
                      </button>
                    </div>
                  </div>

                  {/* Products list */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 400, overflowY: "auto", paddingRight: 2 }}>
                    {importProdutos.map((p, i) => (
                      <div key={i}
                        onClick={() => setImportProdutos(prev => prev.map((x, j) => j === i ? { ...x, selecionado: !x.selecionado } : x))}
                        style={{
                          display: "flex", alignItems: "flex-start", gap: 12,
                          padding: "12px 14px", borderRadius: 12, cursor: "pointer",
                          border: `1.5px solid ${p.selecionado ? cor + "40" : "var(--border-1)"}`,
                          background: p.selecionado ? `${cor}06` : "#fff",
                          transition: "all .15s", opacity: p.selecionado ? 1 : 0.5,
                        }}>
                        {/* Checkbox */}
                        <div style={{
                          width: 20, height: 20, borderRadius: 6, flexShrink: 0, marginTop: 1,
                          background: p.selecionado ? cor : "var(--bg-1)",
                          border: `2px solid ${p.selecionado ? cor : "var(--border-2)"}`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          transition: "all .15s",
                        }}>
                          {p.selecionado && <Check size={11} color="#fff" strokeWidth={3} />}
                        </div>
                        {/* Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 3 }}>
                            <input
                              value={p.nome}
                              onChange={e => { e.stopPropagation(); setImportProdutos(prev => prev.map((x, j) => j === i ? { ...x, nome: e.target.value } : x)); }}
                              onClick={e => e.stopPropagation()}
                              style={{ flex: 1, fontSize: 13, fontWeight: 700, color: "var(--text-1)", border: "none", background: "transparent", padding: 0, outline: "none", minWidth: 0 }}
                            />
                            <input
                              value={p.preco === 0 ? "" : String(p.preco)}
                              onChange={e => { e.stopPropagation(); setImportProdutos(prev => prev.map((x, j) => j === i ? { ...x, preco: parseFloat(e.target.value) || 0 } : x)); }}
                              onClick={e => e.stopPropagation()}
                              placeholder="0.00"
                              type="number" min="0" step="0.50"
                              style={{ width: 70, fontSize: 13, fontWeight: 800, color: cor, border: "none", background: "transparent", padding: 0, outline: "none", textAlign: "right" }}
                            />
                          </div>
                          {p.descricao && (
                            <p style={{ fontSize: 11, color: "var(--text-4)", margin: "0 0 4px", lineHeight: 1.4 }}>{p.descricao}</p>
                          )}
                          <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", background: "var(--bg-3)", borderRadius: 6, padding: "2px 8px" }}>
                            {p.categoria}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Actions */}
                  <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
                    <button
                      onClick={() => { setImportStep("upload"); setImportPreview(""); setImportProdutos([]); importRef.current?.click(); }}
                      style={{ padding: "11px 16px", borderRadius: 12, border: "1.5px solid var(--border-1)", background: "var(--bg-1)", fontSize: 13, fontWeight: 700, color: "var(--text-3)", cursor: "pointer" }}>
                      Nova foto
                    </button>
                    <button
                      onClick={handleSalvarImportados}
                      disabled={salvandoImport || importProdutos.filter(p => p.selecionado).length === 0}
                      style={{
                        flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                        padding: "11px 20px", borderRadius: 12,
                        background: cor, color: "#fff", border: "none",
                        fontSize: 13, fontWeight: 800, cursor: "pointer",
                        boxShadow: `0 4px 14px ${cor}40`,
                        opacity: importProdutos.filter(p => p.selecionado).length === 0 ? 0.5 : 1,
                        transition: "all .15s",
                      }}>
                      {salvandoImport ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Salvando…</> : <><ChevronRight size={14} /> Adicionar {importProdutos.filter(p => p.selecionado).length} produtos</>}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          POPUP ESCOLHA: PRODUTO / SABOR / ADICIONAL
      ══════════════════════════════════════════════════════════ */}
      {choiceOpen && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 400,
          background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        }} onClick={e => { if (e.target === e.currentTarget) setChoiceOpen(false); }}>
          <div style={{
            background: "var(--bg-1)", borderRadius: 24, padding: "28px 24px 24px",
            width: "100%", maxWidth: 420,
            boxShadow: "0 24px 64px rgba(0,0,0,0.18)",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <p style={{ fontSize: 18, fontWeight: 900, color: "var(--text-1)", margin: 0 }}>O que deseja cadastrar?</p>
              <button onClick={() => setChoiceOpen(false)}
                style={{ background: "var(--bg-input)", border: "none", borderRadius: 8, padding: 6, cursor: "pointer", color: "var(--text-3)" }}>
                <X size={16} />
              </button>
            </div>
            <p style={{ fontSize: 13, color: "var(--text-4)", margin: "0 0 22px" }}>Escolha o tipo de cadastro abaixo</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {/* Produto */}
              <button onClick={openWizard} style={{
                display: "flex", alignItems: "center", gap: 16,
                padding: "16px 18px", borderRadius: 16,
                background: `${cor}08`, border: `2px solid ${cor}22`,
                cursor: "pointer", textAlign: "left", width: "100%",
                transition: "all 0.15s",
              }}>
                <div style={{
                  width: 46, height: 46, borderRadius: 14, flexShrink: 0,
                  background: `${cor}18`, display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <span style={{ fontSize: 22 }}>🍔</span>
                </div>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 800, color: "var(--text-1)", margin: "0 0 2px" }}>Produto</p>
                  <p style={{ fontSize: 12, color: "var(--text-3)", margin: 0 }}>Cadastrar um produto completo com tamanhos, sabores e adicionais</p>
                </div>
                <ChevronRight size={16} style={{ color: "var(--text-5)", marginLeft: "auto", flexShrink: 0 }} />
              </button>
              {/* Sabor */}
              <button onClick={() => openQuickAdd("sabor")} disabled={produtos.length === 0} style={{
                display: "flex", alignItems: "center", gap: 16,
                padding: "16px 18px", borderRadius: 16,
                background: produtos.length === 0 ? "var(--bg-input)" : "rgba(251,146,60,0.08)",
                border: `2px solid ${produtos.length === 0 ? "var(--border-1)" : "rgba(251,146,60,0.25)"}`,
                cursor: produtos.length === 0 ? "not-allowed" : "pointer", textAlign: "left", width: "100%",
                opacity: produtos.length === 0 ? 0.5 : 1,
                transition: "all 0.15s",
              }}>
                <div style={{
                  width: 46, height: 46, borderRadius: 14, flexShrink: 0,
                  background: "rgba(251,146,60,0.15)", display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <span style={{ fontSize: 22 }}>🌶️</span>
                </div>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 800, color: "var(--text-1)", margin: "0 0 2px" }}>Sabor</p>
                  <p style={{ fontSize: 12, color: "var(--text-3)", margin: 0 }}>Adicionar um sabor a um produto já existente</p>
                </div>
                <ChevronRight size={16} style={{ color: "var(--text-5)", marginLeft: "auto", flexShrink: 0 }} />
              </button>
              {/* Adicional */}
              <button onClick={() => openQuickAdd("adicional")} disabled={produtos.length === 0} style={{
                display: "flex", alignItems: "center", gap: 16,
                padding: "16px 18px", borderRadius: 16,
                background: produtos.length === 0 ? "var(--bg-input)" : "rgba(34,197,94,0.08)",
                border: `2px solid ${produtos.length === 0 ? "var(--border-1)" : "rgba(34,197,94,0.25)"}`,
                cursor: produtos.length === 0 ? "not-allowed" : "pointer", textAlign: "left", width: "100%",
                opacity: produtos.length === 0 ? 0.5 : 1,
                transition: "all 0.15s",
              }}>
                <div style={{
                  width: 46, height: 46, borderRadius: 14, flexShrink: 0,
                  background: "rgba(34,197,94,0.15)", display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <span style={{ fontSize: 22 }}>➕</span>
                </div>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 800, color: "var(--text-1)", margin: "0 0 2px" }}>Adicional</p>
                  <p style={{ fontSize: 12, color: "var(--text-3)", margin: 0 }}>Adicionar um item extra a um produto já existente</p>
                </div>
                <ChevronRight size={16} style={{ color: "var(--text-5)", marginLeft: "auto", flexShrink: 0 }} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          MODAL QUICK-ADD SABOR / ADICIONAL
      ══════════════════════════════════════════════════════════ */}
      {quickOpen && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 400,
          background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        }} onClick={e => { if (e.target === e.currentTarget) setQuickOpen(false); }}>
          <div style={{
            background: "var(--bg-1)", borderRadius: 22, padding: "24px",
            width: "100%", maxWidth: 440,
            boxShadow: "0 24px 64px rgba(0,0,0,0.18)",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-4)", margin: "0 0 3px", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  {quickType === "sabor" ? "🌶️ Sabor" : "➕ Adicional"}
                </p>
                <p style={{ fontSize: 16, fontWeight: 900, color: "var(--text-1)", margin: 0 }}>
                  {quickType === "sabor" ? "Adicionar sabor" : "Adicionar item extra"}
                </p>
              </div>
              <button onClick={() => setQuickOpen(false)}
                style={{ background: "var(--bg-input)", border: "none", borderRadius: 8, padding: 6, cursor: "pointer", color: "var(--text-3)" }}>
                <X size={16} />
              </button>
            </div>

            {/* Produto selector */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-3)", display: "block", marginBottom: 6 }}>
                Produto vinculado
              </label>
              <select
                value={quickProdutoId}
                onChange={e => setQuickProdutoId(e.target.value)}
                style={{
                  width: "100%", padding: "10px 12px", borderRadius: 10,
                  border: "1.5px solid var(--border-1)", background: "var(--bg-input)",
                  fontSize: 13, fontWeight: 600, color: "var(--text-1)",
                  outline: "none", cursor: "pointer",
                }}>
                {produtos.map(p => (
                  <option key={p.id} value={p.id}>{p.nome}</option>
                ))}
              </select>
            </div>

            {quickType === "sabor" ? (
              <>
                {/* Import from image */}
                <input ref={quickImportSaboresRef} type="file" accept="image/*" style={{ display: "none" }}
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) handleQuickImportSaboresImage(f);
                    e.target.value = "";
                  }} />

                {quickImportOpen ? (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: "var(--text-3)", margin: 0 }}>
                        {quickImportLoading ? "Analisando cardápio..." : `${quickImportList.filter(s => s.sel).length} sabores selecionados`}
                      </p>
                      <button onClick={() => { setQuickImportOpen(false); setQuickImportList([]); }}
                        style={{ background: "none", border: "none", color: "var(--text-4)", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>
                        Cancelar import
                      </button>
                    </div>
                    {quickImportLoading ? (
                      <div style={{ display: "flex", justifyContent: "center", padding: 20 }}>
                        <Loader2 size={22} style={{ animation: "spin 1s linear infinite", color: cor }} />
                      </div>
                    ) : (
                      <div style={{ maxHeight: 200, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
                        {quickImportList.map((s, i) => (
                          <label key={i} style={{
                            display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
                            background: s.sel ? "var(--bg-2)" : "var(--bg-input)",
                            borderRadius: 8, cursor: "pointer", border: `1.5px solid ${s.sel ? cor : "var(--border-1)"}`,
                          }}>
                            <input type="checkbox" checked={s.sel}
                              onChange={e => setQuickImportList(list => list.map((x, j) => j === i ? { ...x, sel: e.target.checked } : x))}
                              style={{ accentColor: cor, width: 15, height: 15, flexShrink: 0 }} />
                            <div>
                              <p style={{ fontSize: 12, fontWeight: 700, color: "var(--text-1)", margin: 0 }}>{s.nome}</p>
                              {s.descricao && <p style={{ fontSize: 11, color: "var(--text-4)", margin: 0 }}>{s.descricao}</p>}
                            </div>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <button onClick={() => quickImportSaboresRef.current?.click()}
                      style={{
                        width: "100%", padding: "9px 12px", borderRadius: 10, marginBottom: 14,
                        border: `1.5px dashed ${cor}`, background: "transparent",
                        color: cor, fontSize: 12, fontWeight: 700, cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                      }}>
                      <ImageIcon size={14} /> Importar cardápio (foto)
                    </button>
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-3)", display: "block", marginBottom: 6 }}>Nome do sabor *</label>
                      <input
                        value={quickSabor.nome}
                        onChange={e => setQuickSabor(s => ({ ...s, nome: e.target.value }))}
                        placeholder="Ex: Frango com Catupiry"
                        style={{
                          width: "100%", padding: "10px 12px", borderRadius: 10,
                          border: "1.5px solid var(--border-1)", fontSize: 13, color: "var(--text-1)",
                          outline: "none", boxSizing: "border-box",
                        }}
                      />
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-3)", display: "block", marginBottom: 6 }}>Descrição</label>
                      <input
                        value={quickSabor.descricao}
                        onChange={e => setQuickSabor(s => ({ ...s, descricao: e.target.value }))}
                        placeholder="Opcional"
                        style={{
                          width: "100%", padding: "10px 12px", borderRadius: 10,
                          border: "1.5px solid var(--border-1)", fontSize: 13, color: "var(--text-1)",
                          outline: "none", boxSizing: "border-box",
                        }}
                      />
                    </div>
                    <div style={{ marginBottom: 20 }}>
                      <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-3)", display: "block", marginBottom: 6 }}>Preço (opcional)</label>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-3)" }}>R$</span>
                        <input
                          type="number" step="0.01" min="0"
                          value={quickSabor.preco}
                          onChange={e => setQuickSabor(s => ({ ...s, preco: e.target.value }))}
                          placeholder="0,00"
                          style={{
                            flex: 1, padding: "10px 12px", borderRadius: 10,
                            border: "1.5px solid var(--border-1)", fontSize: 13, color: "var(--text-1)",
                            outline: "none", boxSizing: "border-box",
                          }}
                        />
                      </div>
                    </div>
                  </>
                )}
              </>
            ) : (
              <>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-3)", display: "block", marginBottom: 6 }}>Nome do adicional *</label>
                  <input
                    value={quickAdicional.nome}
                    onChange={e => setQuickAdicional(a => ({ ...a, nome: e.target.value }))}
                    placeholder="Ex: Bacon extra"
                    style={{
                      width: "100%", padding: "10px 12px", borderRadius: 10,
                      border: "1.5px solid var(--border-1)", fontSize: 13, color: "var(--text-1)",
                      outline: "none", boxSizing: "border-box",
                    }}
                  />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-3)", display: "block", marginBottom: 6 }}>Preço</label>
                  <input
                    value={quickAdicional.preco}
                    onChange={e => setQuickAdicional(a => ({ ...a, preco: e.target.value }))}
                    placeholder="0,00"
                    type="number" min="0" step="0.01"
                    style={{
                      width: "100%", padding: "10px 12px", borderRadius: 10,
                      border: "1.5px solid var(--border-1)", fontSize: 13, color: "var(--text-1)",
                      outline: "none", boxSizing: "border-box",
                    }}
                  />
                </div>
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={quickAdicional.obrigatorio}
                      onChange={e => setQuickAdicional(a => ({ ...a, obrigatorio: e.target.checked }))}
                      style={{ width: 16, height: 16, accentColor: cor }}
                    />
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Adicional obrigatório</span>
                  </label>
                </div>
                {produtos.filter(p => p.id !== quickProdutoId).length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-3)", display: "block", marginBottom: 6 }}>Incluir também em outros produtos (opcional)</label>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 140, overflowY: "auto", padding: 8, borderRadius: 10, border: "1.5px solid var(--border-1)" }}>
                      {produtos.filter(p => p.id !== quickProdutoId).map(p => (
                        <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-2)", cursor: "pointer" }}>
                          <input type="checkbox" checked={quickAdicionalOutrosProdutos.includes(p.id)}
                            onChange={e => setQuickAdicionalOutrosProdutos(prev => e.target.checked ? [...prev, p.id] : prev.filter(id => id !== p.id))}
                            style={{ width: 14, height: 14 }} />
                          {p.nome}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { setQuickOpen(false); setQuickImportOpen(false); setQuickImportList([]); }}
                style={{
                  flex: 1, padding: "12px", borderRadius: 12,
                  background: "var(--bg-input)", border: "1px solid var(--border-1)",
                  color: "var(--text-3)", fontSize: 13, fontWeight: 700, cursor: "pointer",
                }}>
                Cancelar
              </button>
              {quickImportOpen ? (
                <button
                  onClick={handleSalvarQuickImport}
                  disabled={salvandoQuickImport || quickImportLoading || quickImportList.filter(s => s.sel).length === 0}
                  style={{
                    flex: 2, padding: "12px", borderRadius: 12,
                    background: (salvandoQuickImport || quickImportLoading || quickImportList.filter(s => s.sel).length === 0) ? "var(--text-4)" : cor,
                    border: "none", color: "#fff", fontSize: 13, fontWeight: 800,
                    cursor: (salvandoQuickImport || quickImportLoading) ? "not-allowed" : "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  }}>
                  {salvandoQuickImport ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : null}
                  {salvandoQuickImport ? "Salvando..." : `Salvar ${quickImportList.filter(s => s.sel).length} sabores`}
                </button>
              ) : (
                <button
                  onClick={handleSaveQuick}
                  disabled={savingQuick || (quickType === "sabor" ? !quickSabor.nome.trim() : !quickAdicional.nome.trim())}
                  style={{
                    flex: 2, padding: "12px", borderRadius: 12,
                    background: savingQuick ? "var(--text-4)" : cor,
                    border: "none", color: "#fff", fontSize: 13, fontWeight: 800,
                    cursor: savingQuick ? "not-allowed" : "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  }}>
                  {savingQuick ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : null}
                  {savingQuick ? "Salvando..." : "Salvar"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          MODAL ADD / EDIT PRODUTO
      ══════════════════════════════════════════════════════════ */}
      {modalOpen && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 300,
          background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
        }} onClick={e => { if (e.target === e.currentTarget) setModalOpen(false); }}>
          <div style={{
            background: "var(--bg-1)", borderRadius: 22,
            width: "100%", maxWidth: 520,
            maxHeight: "92vh", overflowY: "auto",
            boxShadow: "0 24px 64px rgba(0,0,0,0.18)",
          }}>
            {/* ── Header ── */}
            <div style={{ padding: "18px 22px 0", borderBottom: "1px solid var(--border-1)" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: (wizardStep > 0 || editId) ? 14 : 0, paddingBottom: (!editId && wizardStep === 0) ? 18 : 0 }}>
                <div>
                  {wizardStep > 0 ? (
                    <>
                      <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-4)", margin: "0 0 3px", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                        Novo produto — passo {wizardStep} de 4
                      </p>
                      <p style={{ fontSize: 16, fontWeight: 900, color: "var(--text-1)", margin: 0 }}>
                        {["", "Informações básicas", form.variantes_label || "Variantes", "Sabores", "Adicionais"][wizardStep]}
                      </p>
                    </>
                  ) : (
                    <p style={{ fontSize: 16, fontWeight: 900, color: "var(--text-1)", margin: 0 }}>
                      {editId ? "Editar produto" : "Novo produto"}
                    </p>
                  )}
                </div>
                <button onClick={() => setModalOpen(false)}
                  style={{ background: "var(--bg-input)", border: "none", borderRadius: 8, padding: 6, cursor: "pointer", color: "var(--text-3)", marginTop: 2 }}>
                  <X size={16} />
                </button>
              </div>
              {/* Wizard progress bars */}
              {wizardStep > 0 && (
                <div style={{ display: "flex", gap: 5, paddingBottom: 14 }}>
                  {[1, 2, 3, 4].map(s => (
                    <div key={s} style={{
                      flex: 1, height: 4, borderRadius: 999,
                      background: s <= wizardStep ? cor : "var(--border-1)",
                      opacity: s < wizardStep ? 0.45 : 1,
                      transition: "all 0.3s",
                    }} />
                  ))}
                </div>
              )}
              {/* Edit mode tabs */}
              {wizardStep === 0 && editId && (
                <div style={{ display: "flex", gap: 2, paddingBottom: 0 }}>
                  {([ ["basico","Produto"], ["tamanhos", form.variantes_label || "Variantes"], ["sabores","Sabores"], ["adicionais","Adicionais"] ] as [ModalTab, string][]).map(([key, label]) => (
                    <button key={key} onClick={() => setModalTab(key)}
                      style={{
                        padding: "8px 14px", borderRadius: "8px 8px 0 0",
                        background: modalTab === key ? "var(--bg-1)" : "transparent",
                        border: modalTab === key ? "1px solid var(--border-1)" : "none",
                        borderBottom: modalTab === key ? "1px solid #fff" : "none",
                        color: modalTab === key ? "var(--text-1)" : "var(--text-4)",
                        fontSize: 12, fontWeight: modalTab === key ? 800 : 600,
                        cursor: "pointer", transition: "all 0.15s",
                        marginBottom: modalTab === key ? -1 : 0,
                      }}>
                      {label}
                      {key === "tamanhos" && variacoes.length > 0 && (
                        <span style={{ marginLeft: 5, background: cor, color: "#fff", borderRadius: 999, padding: "1px 6px", fontSize: 10, fontWeight: 800 }}>{variacoes.length}</span>
                      )}
                      {key === "sabores" && sabores.length > 0 && (
                        <span style={{ marginLeft: 5, background: cor, color: "#fff", borderRadius: 999, padding: "1px 6px", fontSize: 10, fontWeight: 800 }}>{sabores.length}</span>
                      )}
                      {key === "adicionais" && adicionais.length > 0 && (
                        <span style={{ marginLeft: 5, background: cor, color: "#fff", borderRadius: 999, padding: "1px 6px", fontSize: 10, fontWeight: 800 }}>{adicionais.length}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* ── STEP 1 / Tab Produto ── */}
            {(wizardStep === 1 || (wizardStep === 0 && (!editId || modalTab === "basico"))) && (
              <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 16 }}>

                {/* Tipo — mostrado no wizard e no edit */}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.06em", textTransform: "uppercase", display: "block", marginBottom: 8 }}>
                    Estrutura do produto
                  </label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {/* Produto único */}
                    <button onClick={() => setForm(f => ({ ...f, tipo: "simples", variantes_label: "" }))}
                      style={{
                        padding: "14px 12px", borderRadius: 14, cursor: "pointer", transition: "all 0.15s",
                        border: `2px solid ${form.tipo === "simples" ? cor : "var(--border-1)"}`,
                        background: form.tipo === "simples" ? `${cor}10` : "var(--bg-input)",
                        textAlign: "left",
                      }}>
                      <div style={{ fontSize: 22, marginBottom: 6 }}>📦</div>
                      <p style={{ fontSize: 13, fontWeight: 800, color: form.tipo === "simples" ? cor : "var(--text-1)", margin: "0 0 2px" }}>Produto único</p>
                      <p style={{ fontSize: 11, color: "var(--text-4)", margin: 0, lineHeight: 1.4 }}>Preço fixo, sem variações</p>
                    </button>
                    {/* Com variantes */}
                    <button onClick={() => setForm(f => ({ ...f, tipo: "pizza" }))}
                      style={{
                        padding: "14px 12px", borderRadius: 14, cursor: "pointer", transition: "all 0.15s",
                        border: `2px solid ${form.tipo === "pizza" ? cor : "var(--border-1)"}`,
                        background: form.tipo === "pizza" ? `${cor}10` : "var(--bg-input)",
                        textAlign: "left",
                      }}>
                      <div style={{ fontSize: 22, marginBottom: 6 }}>🎛️</div>
                      <p style={{ fontSize: 13, fontWeight: 800, color: form.tipo === "pizza" ? cor : "var(--text-1)", margin: "0 0 2px" }}>Com variantes</p>
                      <p style={{ fontSize: 11, color: "var(--text-4)", margin: 0, lineHeight: 1.4 }}>Tamanhos, modelos ou estilos com preços diferentes</p>
                    </button>
                  </div>

                  {/* Nome das variantes — só quando tipo = pizza */}
                  {form.tipo === "pizza" && (
                    <div style={{ marginTop: 10 }}>
                      <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.06em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>
                        Como se chamam as variantes?
                      </label>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                        {["Tamanhos", "Especiais", "Modelos", "Opções", "Estilos"].map(s => (
                          <button key={s} onClick={() => setForm(f => ({ ...f, variantes_label: s }))}
                            style={{
                              padding: "5px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "all 0.15s",
                              background: form.variantes_label === s ? cor : "var(--bg-input)",
                              color: form.variantes_label === s ? "#fff" : "var(--text-3)",
                              border: `1px solid ${form.variantes_label === s ? cor : "var(--border-1)"}`,
                            }}>
                            {s}
                          </button>
                        ))}
                      </div>
                      <input
                        value={form.variantes_label}
                        onChange={e => setForm(f => ({ ...f, variantes_label: e.target.value }))}
                        placeholder="Ou escreva um nome personalizado…"
                        style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: `1.5px solid ${form.variantes_label ? cor : "var(--border-1)"}`, fontSize: 13, fontWeight: 600, color: "var(--text-1)", background: "var(--bg-input)", outline: "none" }}
                      />
                    </div>
                  )}
                </div>

                {/* Nome */}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.06em", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 5, marginBottom: 7 }}>
                    <Tag size={11} /> Nome *
                  </label>
                  <input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                    placeholder="Ex: Pizza Calabresa, X-Burguer…"
                    style={{ width: "100%", padding: "11px 13px", borderRadius: 11, border: "1px solid var(--border-1)", fontSize: 14, color: "var(--text-1)", background: "var(--bg-input)" }} />
                </div>

                {/* Categoria */}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.06em", textTransform: "uppercase", display: "block", marginBottom: 7 }}>
                    Categoria
                  </label>
                  <select value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}
                    style={{ width: "100%", padding: "11px 13px", borderRadius: 11, border: "1px solid var(--border-1)", fontSize: 13, color: "var(--text-1)", background: "var(--bg-input)" }}>
                    {CATEGORIAS_PADRAO.map(c => <option key={c} value={c}>{c}</option>)}
                    <option value="__custom__">+ Personalizada…</option>
                  </select>
                </div>
                {form.categoria === "__custom__" && (
                  <input value={form.categoriaCustom} onChange={e => setForm(f => ({ ...f, categoriaCustom: e.target.value }))}
                    placeholder="Nome da categoria personalizada"
                    style={{ width: "100%", padding: "11px 13px", borderRadius: 11, border: "1px solid var(--border-1)", fontSize: 13, color: "var(--text-1)", background: "var(--bg-input)" }} />
                )}

                {/* Categoria de preço — opcional, só relevante para tipo pizza */}
                {form.tipo === "pizza" && categoriasPreco.length > 0 && (
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.06em", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 5, marginBottom: 7 }}>
                      <DollarSign size={11} /> Categoria de preço
                    </label>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      <button
                        onClick={() => setForm(f => ({ ...f, categoria_preco_id: "" }))}
                        style={{
                          padding: "6px 14px", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "all 0.15s",
                          background: form.categoria_preco_id === "" ? "var(--text-3)" : "var(--bg-input)",
                          color: form.categoria_preco_id === "" ? "#fff" : "var(--text-3)",
                          border: `1.5px solid ${form.categoria_preco_id === "" ? "var(--text-3)" : "var(--border-1)"}`,
                        }}>
                        Manual
                      </button>
                      {categoriasPreco.map(c => (
                        <button key={c.id}
                          onClick={() => setForm(f => ({ ...f, categoria_preco_id: c.id }))}
                          style={{
                            padding: "6px 14px", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "all 0.15s",
                            background: form.categoria_preco_id === c.id ? c.cor : "var(--bg-input)",
                            color: form.categoria_preco_id === c.id ? "#fff" : "var(--text-2)",
                            border: `1.5px solid ${form.categoria_preco_id === c.id ? c.cor : "var(--border-1)"}`,
                          }}>
                          {c.nome}
                        </button>
                      ))}
                    </div>
                    {form.categoria_preco_id && (
                      <p style={{ fontSize: 11, color: "var(--text-4)", margin: "6px 0 0" }}>
                        Na aba "Variantes" você seleciona os tamanhos disponíveis para este produto.
                      </p>
                    )}
                  </div>
                )}

                {/* Imagem — opcional */}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.06em", textTransform: "uppercase", display: "block", marginBottom: 8 }}>
                    Foto do produto <span style={{ fontWeight: 500, textTransform: "none", fontSize: 10 }}>(opcional)</span>
                  </label>
                  <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: "none" }}
                    onChange={e => { if (e.target.files?.[0]) handleImageUpload(e.target.files[0]); }} />
                  <div
                    onClick={() => fileRef.current?.click()}
                    style={{
                      height: 110, borderRadius: 14, border: "2px dashed var(--border-1)", background: "var(--bg-input)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      cursor: "pointer", overflow: "hidden", position: "relative", transition: "border-color 0.2s",
                    }}>
                    {uploading ? (
                      <p style={{ fontSize: 13, color: "var(--text-4)" }}>Enviando…</p>
                    ) : imgPreview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imgPreview} alt="preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <Upload size={18} style={{ color: "var(--text-5)" }} />
                        <p style={{ fontSize: 12, color: "var(--text-4)", margin: 0 }}>Clique para enviar (JPG, PNG, WebP)</p>
                      </div>
                    )}
                    {imgPreview && (
                      <button onClick={e => { e.stopPropagation(); setImgPreview(""); setForm(f => ({ ...f, imagem_url: "" })); }}
                        style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,0.6)", border: "none", borderRadius: 6, padding: 4, color: "#fff", cursor: "pointer" }}>
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Campos extras apenas no modo edição (tabs) */}
                {wizardStep === 0 && (
                  <>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.06em", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 5, marginBottom: 7 }}>
                        <AlignLeft size={11} /> Descrição
                      </label>
                      <textarea value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                        placeholder="Ingredientes, tamanho, observações…" rows={2}
                        style={{ width: "100%", padding: "10px 13px", borderRadius: 11, border: "1px solid var(--border-1)", fontSize: 13, color: "var(--text-1)", background: "var(--bg-input)", resize: "vertical", fontFamily: "inherit" }} />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.06em", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 5, marginBottom: 7 }}>
                          <DollarSign size={11} /> Preço base
                        </label>
                        <input type="number" min="0" step="0.50" value={form.preco}
                          onChange={e => setForm(f => ({ ...f, preco: e.target.value }))}
                          placeholder="0.00"
                          style={{ width: "100%", padding: "10px 13px", borderRadius: 11, border: "1px solid var(--border-1)", fontSize: 14, color: "var(--text-1)", background: "var(--bg-input)" }} />
                      </div>
                      <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "10px 13px", borderRadius: 11, border: "1px solid var(--border-1)", background: "var(--bg-input)" }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)" }}>Ativo</span>
                          <button onClick={() => setForm(f => ({ ...f, ativo: !f.ativo }))}
                            style={{ width: 40, height: 22, borderRadius: 11, background: form.ativo ? "#22c55e" : "var(--border-1)", border: "none", cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
                            <span style={{ position: "absolute", top: 2, left: form.ativo ? 20 : 2, width: 18, height: 18, borderRadius: "50%", background: "var(--bg-1)", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {/* Action button */}
                {wizardStep === 1 ? (
                  <button onClick={handleSave} disabled={saving || !form.nome.trim()}
                    style={{
                      width: "100%", padding: "13px", borderRadius: 14,
                      background: cor, color: "#fff", border: "none",
                      fontSize: 14, fontWeight: 900, cursor: "pointer",
                      boxShadow: `0 6px 20px ${cor}40`,
                      opacity: saving || !form.nome.trim() ? 0.7 : 1,
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    }}>
                    {saving ? "Salvando…" : <><span>Próximo</span><ChevronRight size={16} /></>}
                  </button>
                ) : (
                  <button onClick={handleSave} disabled={saving || !form.nome.trim()}
                    style={{
                      width: "100%", padding: "13px", borderRadius: 14,
                      background: cor, color: "#fff", border: "none",
                      fontSize: 14, fontWeight: 900, cursor: "pointer",
                      boxShadow: `0 6px 20px ${cor}40`,
                      opacity: saving || !form.nome.trim() ? 0.7 : 1,
                    }}>
                    {saving ? "Salvando…" : editId ? "Salvar alterações" : "Adicionar produto"}
                  </button>
                )}
              </div>
            )}

            {/* ── STEP 2 / Tab Tamanhos ── */}
            {(wizardStep === 2 || (wizardStep === 0 && editId && modalTab === "tamanhos")) && (
              <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
                {loadingTabs ? (
                  <div style={{ display: "flex", justifyContent: "center", padding: 20 }}><Loader2 size={20} style={{ color: "var(--text-4)", animation: "spin 1s linear infinite" }} /></div>
                ) : form.categoria_preco_id ? (() => {
                  // ── Modo categoria: checkboxes dos tamanhos da categoria ──
                  const catPreco = categoriasPreco.find(c => c.id === form.categoria_preco_id);
                  const tamsCat = catPreco?.tamanhos ?? [];
                  return (
                    <>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 12, background: `${catPreco?.cor ?? "#6366f1"}10`, border: `1.5px solid ${catPreco?.cor ?? "#6366f1"}30` }}>
                        <DollarSign size={14} style={{ color: catPreco?.cor ?? "#6366f1", flexShrink: 0 }} />
                        <div>
                          <p style={{ fontSize: 12, fontWeight: 800, color: "var(--text-1)", margin: 0 }}>Categoria: {catPreco?.nome}</p>
                          <p style={{ fontSize: 11, color: "var(--text-3)", margin: 0 }}>Selecione quais tamanhos este produto oferece</p>
                        </div>
                      </div>
                      {tamsCat.length === 0 ? (
                        <p style={{ fontSize: 12, color: "var(--text-4)", textAlign: "center", padding: "16px 0" }}>
                          Nenhum tamanho cadastrado nesta categoria. Adicione tamanhos em Configurações → Categorias de preço.
                        </p>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {tamsCat.map(t => {
                            const ativo = variacoes.some(v => v.nome === t.nome);
                            return (
                              <label key={t.id} style={{
                                display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 12,
                                cursor: "pointer", transition: "all 0.15s",
                                background: ativo ? `${catPreco?.cor ?? "#6366f1"}08` : "var(--bg-input)",
                                border: `1.5px solid ${ativo ? (catPreco?.cor ?? "#6366f1") + "40" : "var(--border-1)"}`,
                              }} onClick={() => toggleTamanhoVariacao(t)}>
                                <div style={{
                                  width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                                  background: ativo ? (catPreco?.cor ?? "#6366f1") : "var(--bg-1)",
                                  border: `2px solid ${ativo ? (catPreco?.cor ?? "#6366f1") : "var(--border-2)"}`,
                                  display: "flex", alignItems: "center", justifyContent: "center",
                                }}>
                                  {ativo && <Check size={11} color="#fff" strokeWidth={3} />}
                                </div>
                                <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: "var(--text-1)" }}>{t.nome}</span>
                                <span style={{ fontSize: 13, fontWeight: 800, color: catPreco?.cor ?? "#6366f1" }}>R${t.preco.toFixed(2)}</span>
                                <span style={{ fontSize: 11, color: "var(--text-4)", background: "var(--bg-3)", padding: "2px 7px", borderRadius: 6 }}>até {t.max_sabores} sab.</span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </>
                  );
                })() : (
                  <>
                    <p style={{ fontSize: 12, color: "var(--text-3)", margin: 0 }}>
                      Defina versões com preços diferentes (P/M/G, 25cm/35cm, etc.).<br />
                      Para pizzas, configure também o máximo de sabores por tamanho.
                    </p>
                    {variacoes.length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {variacoes.map(v => (
                          <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 12, background: v.ativo ? "var(--bg-input)" : "var(--bg-2)", border: "1px solid var(--border-1)", opacity: v.ativo ? 1 : 0.55 }}>
                            <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: "var(--text-1)" }}>{v.nome}</span>
                            {editingVariacaoPreco?.id === v.id ? (
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <input
                                  type="number" min="0" step="0.50"
                                  value={editingVariacaoPreco.preco}
                                  onChange={e => setEditingVariacaoPreco(x => x ? { ...x, preco: e.target.value } : x)}
                                  onKeyDown={e => { if (e.key === "Enter") handleSaveVariacaoPreco(); if (e.key === "Escape") setEditingVariacaoPreco(null); }}
                                  autoFocus
                                  style={{ width: 80, padding: "4px 8px", borderRadius: 8, border: `1.5px solid ${cor}`, fontSize: 13, fontWeight: 800, color: "var(--text-1)", background: "var(--bg-1)" }}
                                />
                                <button onClick={handleSaveVariacaoPreco} style={{ padding: "4px 8px", borderRadius: 8, background: cor, color: "#fff", border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>✓</button>
                                <button onClick={() => setEditingVariacaoPreco(null)} style={{ padding: "4px 8px", borderRadius: 8, background: "var(--bg-3)", color: "var(--text-3)", border: "none", fontSize: 12, cursor: "pointer" }}>✕</button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setEditingVariacaoPreco({ id: v.id, preco: v.preco.toFixed(2) })}
                                style={{ fontSize: 13, fontWeight: 800, color: cor, background: `${cor}12`, border: `1px solid ${cor}30`, borderRadius: 8, padding: "4px 10px", cursor: "pointer" }}
                                title="Clique para editar o preço">
                                R${v.preco.toFixed(2)} ✏️
                              </button>
                            )}
                            {v.max_sabores > 0 && (
                              <span style={{ fontSize: 11, color: "var(--text-4)", background: "var(--bg-3)", padding: "2px 8px", borderRadius: 6 }}>até {v.max_sabores} sab.</span>
                            )}
                            <button onClick={() => toggleVariacaoAtivo(v)} style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid var(--border-1)", background: v.ativo ? "#f0fdf4" : "var(--bg-input)", color: v.ativo ? "#16a34a" : "var(--text-4)", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                              {v.ativo ? "Ativo" : "Inativo"}
                            </button>
                            <button onClick={() => handleDeleteVariacao(v.id)} style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid #fee2e2", background: "#fef2f2", color: "#FF6A00", cursor: "pointer" }}><Trash2 size={12} /></button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "14px", background: "var(--bg-input)", borderRadius: 14, border: "1px solid var(--border-1)" }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: "var(--text-1)", margin: 0 }}>Novo tamanho</p>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 100px", gap: 8 }}>
                        <input value={novaVariacao.nome} onChange={e => setNovaVariacao(v => ({ ...v, nome: e.target.value }))}
                          placeholder="Nome (ex: Grande, G, 35cm)"
                          style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid var(--border-1)", fontSize: 13, color: "var(--text-1)", background: "var(--bg-1)" }} />
                        <input type="number" min="0" step="0.50" value={novaVariacao.preco} onChange={e => setNovaVariacao(v => ({ ...v, preco: e.target.value }))}
                          placeholder="Preço"
                          style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid var(--border-1)", fontSize: 13, color: "var(--text-1)", background: "var(--bg-1)" }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 600 }}>Máximo de sabores neste tamanho</label>
                        <input type="number" min="1" max="20" value={novaVariacao.max_sabores} onChange={e => setNovaVariacao(v => ({ ...v, max_sabores: e.target.value }))}
                          style={{ marginTop: 4, width: "100%", padding: "9px 12px", borderRadius: 10, border: "1px solid var(--border-1)", fontSize: 13, color: "var(--text-1)", background: "var(--bg-1)" }} />
                      </div>
                      <button onClick={handleAddVariacao} disabled={savingTab || !novaVariacao.nome.trim()}
                        style={{ padding: "10px", borderRadius: 10, background: cor, color: "#fff", border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: !novaVariacao.nome.trim() ? 0.5 : 1 }}>
                        {savingTab ? "Adicionando…" : <><Plus size={13} style={{ display: "inline", marginRight: 5 }} />Adicionar tamanho</>}
                      </button>
                    </div>
                  </>
                )}
                {wizardStep === 2 && (
                  <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
                    <button onClick={() => setWizardStep(1)}
                      style={{ padding: "11px 16px", borderRadius: 12, border: "1.5px solid var(--border-1)", background: "var(--bg-1)", fontSize: 13, fontWeight: 700, color: "var(--text-3)", cursor: "pointer" }}>
                      ← Voltar
                    </button>
                    <button onClick={() => setWizardStep(3)}
                      style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "11px 20px", borderRadius: 12, background: cor, color: "#fff", border: "none", fontSize: 13, fontWeight: 800, cursor: "pointer", boxShadow: `0 4px 14px ${cor}40` }}>
                      Próximo <ChevronRight size={14} />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── STEP 3 / Tab Sabores ── */}
            {(wizardStep === 3 || (wizardStep === 0 && editId && modalTab === "sabores")) && (
              <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
                {/* Preço padrão global */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 12, background: "#f0fdf4", border: "1.5px solid #bbf7d0" }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: "#15803d", margin: "0 0 4px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Preço Padrão</p>
                    <p style={{ fontSize: 11, color: "#166534", margin: 0 }}>Usado quando o sabor não tem preço definido individualmente</p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#15803d" }}>R$</span>
                    <input
                      type="number" min="0" step="0.01"
                      value={precoPadraoSaborEdit}
                      onChange={e => setPrecoPadraoSaborEdit(e.target.value)}
                      style={{ width: 80, padding: "6px 10px", borderRadius: 8, border: "1.5px solid #86efac", fontSize: 13, fontWeight: 700, color: "#15803d", outline: "none", background: "#fff" }}
                    />
                    <button
                      onClick={handleSalvarPrecoPadrao}
                      disabled={salvandoPrecoPadrao}
                      style={{ padding: "6px 12px", borderRadius: 8, background: salvandoPrecoPadrao ? "#86efac" : "#22c55e", color: "#fff", border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                      {salvandoPrecoPadrao ? "…" : "Salvar"}
                    </button>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                  <p style={{ fontSize: 12, color: "var(--text-3)", margin: 0 }}>
                    Deixe o preço em branco para usar o valor padrão acima, ou defina um preço específico por sabor.
                  </p>
                  <input ref={importSaboresRef} type="file" accept="image/*" style={{ display: "none" }}
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (f) handleImportSaboresImage(f);
                      e.target.value = "";
                    }} />
                  <button
                    onClick={() => importSaboresRef.current?.click()}
                    disabled={importSaboresLoading}
                    title="Importar sabores de uma foto do cardápio"
                    style={{
                      display: "flex", alignItems: "center", gap: 5, flexShrink: 0,
                      padding: "7px 12px", borderRadius: 10,
                      background: "var(--bg-input)", border: "1.5px solid var(--border-1)",
                      color: "var(--text-2)", fontSize: 12, fontWeight: 700,
                      cursor: importSaboresLoading ? "not-allowed" : "pointer",
                    }}>
                    {importSaboresLoading
                      ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />
                      : <ScanLine size={13} />}
                    {importSaboresLoading ? "Lendo…" : "Importar foto"}
                  </button>
                </div>

                {/* Import review panel */}
                {importSaboresOpen && !importSaboresLoading && importSaboresList.length > 0 && (
                  <div style={{ background: "#fffbeb", border: "1.5px solid #fde68a", borderRadius: 14, padding: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                      <p style={{ fontSize: 12, fontWeight: 800, color: "#92400e", margin: 0 }}>
                        📋 {importSaboresList.length} sabores encontrados — selecione os que deseja adicionar
                      </p>
                      <button onClick={() => setImportSaboresOpen(false)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "#92400e", padding: 2 }}>
                        <X size={14} />
                      </button>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
                      {importSaboresList.map((s, i) => (
                        <label key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 10, background: s.sel ? "#fff" : "#fef9ee", border: `1px solid ${s.sel ? "#fde68a" : "#e2e8f0"}`, cursor: "pointer" }}>
                          <input type="checkbox" checked={s.sel}
                            onChange={e => setImportSaboresList(prev => prev.map((x, j) => j === i ? { ...x, sel: e.target.checked } : x))}
                            style={{ width: 15, height: 15, accentColor: cor, flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", margin: 0 }}>{s.nome}</p>
                            {s.descricao && <p style={{ fontSize: 11, color: "#64748b", margin: 0 }}>{s.descricao}</p>}
                          </div>
                        </label>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => setImportSaboresList(prev => prev.map(s => ({ ...s, sel: true })))}
                        style={{ fontSize: 11, fontWeight: 700, color: "#92400e", background: "none", border: "none", cursor: "pointer", padding: "4px 0" }}>
                        Selecionar todos
                      </button>
                      <button
                        onClick={handleSalvarSaboresImport}
                        disabled={salvandoSaboresImport || !importSaboresList.some(s => s.sel)}
                        style={{
                          marginLeft: "auto", display: "flex", alignItems: "center", gap: 5,
                          padding: "9px 16px", borderRadius: 10,
                          background: salvandoSaboresImport ? "var(--text-4)" : cor,
                          color: "#fff", border: "none", fontSize: 12, fontWeight: 800,
                          cursor: salvandoSaboresImport ? "not-allowed" : "pointer",
                        }}>
                        {salvandoSaboresImport ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : <Plus size={12} />}
                        {salvandoSaboresImport ? "Salvando…" : `Adicionar ${importSaboresList.filter(s => s.sel).length} selecionados`}
                      </button>
                    </div>
                  </div>
                )}
                {/* ── Categorias de sabor ── */}
                {editId && (
                  <div style={{ background: "var(--bg-input)", borderRadius: 14, border: "1px solid var(--border-1)", padding: 14 }}>
                    <p style={{ fontSize: 12, fontWeight: 800, color: "var(--text-1)", margin: "0 0 10px" }}>Categorias de sabor</p>
                    {categoriasSabor.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                        {categoriasSabor.map(c => (
                          <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 999, background: "var(--bg-1)", border: "1px solid var(--border-1)" }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-1)" }}>{c.nome}</span>
                            {c.preco_adicional > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: "#9333ea" }}>+R${c.preco_adicional.toFixed(2)}</span>}
                            {c.preco_adicional === 0 && <span style={{ fontSize: 10, color: "var(--text-4)" }}>grátis</span>}
                            <button onClick={() => handleDeleteCategoria(c.id)}
                              style={{ background: "none", border: "none", cursor: "pointer", color: "#FF6A00", padding: 0, display: "flex", lineHeight: 1 }}>
                              <X size={11} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 6 }}>
                      <input
                        value={novaCategoria.nome}
                        onChange={e => setNovaCategoria(n => ({ ...n, nome: e.target.value }))}
                        placeholder="Nome (ex: Especial)"
                        style={{ flex: 2, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border-1)", fontSize: 12, fontWeight: 600, color: "var(--text-1)", background: "var(--bg-1)", outline: "none" }}
                      />
                      <div style={{ display: "flex", alignItems: "center", gap: 4, flex: 1 }}>
                        <span style={{ fontSize: 11, color: "var(--text-3)", flexShrink: 0 }}>+R$</span>
                        <input
                          type="number" min="0" step="0.01"
                          value={novaCategoria.preco_adicional}
                          onChange={e => setNovaCategoria(n => ({ ...n, preco_adicional: e.target.value }))}
                          placeholder="0,00"
                          style={{ width: "100%", padding: "8px 8px", borderRadius: 8, border: "1px solid var(--border-1)", fontSize: 12, fontWeight: 700, color: "#9333ea", background: "var(--bg-1)", outline: "none" }}
                        />
                      </div>
                      <button onClick={handleAddCategoria} disabled={savingCategoria || !novaCategoria.nome.trim()}
                        style={{ padding: "8px 12px", borderRadius: 8, border: "none", background: cor, color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer", opacity: !novaCategoria.nome.trim() ? 0.5 : 1, flexShrink: 0 }}>
                        {savingCategoria ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : <Plus size={12} />}
                      </button>
                    </div>
                  </div>
                )}

                {loadingTabs ? (
                  <div style={{ display: "flex", justifyContent: "center", padding: 20 }}><Loader2 size={20} style={{ color: "var(--text-4)", animation: "spin 1s linear infinite" }} /></div>
                ) : (
                  <>
                    {sabores.length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {sabores.map(s => (
                          <div key={s.id} style={{ borderRadius: 12, background: s.ativo ? "var(--bg-input)" : "var(--bg-2)", border: `1px solid ${editingSaborId === s.id ? cor : (s.ativo ? "var(--border-1)" : "var(--border-1)")}`, opacity: s.ativo ? 1 : 0.55, overflow: "hidden" }}>
                            {editingSaborId === s.id ? (
                              <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "12px 14px" }}>
                                {/* Image + nome row */}
                                <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                                  <div
                                    onClick={() => saborImgRef.current?.click()}
                                    style={{
                                      width: 52, height: 52, borderRadius: 10, flexShrink: 0,
                                      border: `2px dashed ${cor}55`, cursor: "pointer",
                                      background: s.imagem_url ? "#000" : "var(--bg-input)",
                                      display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", position: "relative",
                                    }}>
                                    {editingSaborForm.uploadingSaborImg
                                      ? <Loader2 size={14} style={{ color: cor, animation: "spin 1s linear infinite" }} />
                                      : s.imagem_url
                                        // eslint-disable-next-line @next/next/no-img-element
                                        ? <img src={s.imagem_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.8 }} />
                                        : <ImageIcon size={18} style={{ color: "var(--text-5)" }} />
                                    }
                                  </div>
                                  <input ref={saborImgRef} type="file" accept="image/*" style={{ display: "none" }}
                                    onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadSaborImg(f, s.id); e.target.value = ""; }} />
                                  <input
                                    autoFocus
                                    value={editingSaborForm.nome}
                                    onChange={e => setEditingSaborForm(f => ({ ...f, nome: e.target.value }))}
                                    onKeyDown={e => { if (e.key === "Escape") setEditingSaborId(null); }}
                                    placeholder="Nome do sabor"
                                    style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: `1.5px solid ${cor}`, fontSize: 13, fontWeight: 700, color: "var(--text-1)", outline: "none" }}
                                  />
                                </div>
                                <input
                                  value={editingSaborForm.descricao}
                                  onChange={e => setEditingSaborForm(f => ({ ...f, descricao: e.target.value }))}
                                  placeholder="Descrição / ingredientes (opcional)"
                                  style={{ padding: "7px 10px", borderRadius: 8, border: "1.5px solid var(--border-1)", fontSize: 12, color: "var(--text-3)", outline: "none" }}
                                />
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-3)", whiteSpace: "nowrap" }}>R$</span>
                                  <input
                                    type="number" step="0.01" min="0"
                                    value={editingSaborForm.preco}
                                    onChange={e => setEditingSaborForm(f => ({ ...f, preco: e.target.value }))}
                                    placeholder="Preço (opcional)"
                                    style={{ flex: 1, padding: "7px 10px", borderRadius: 8, border: "1.5px solid var(--border-1)", fontSize: 12, color: "var(--text-3)", outline: "none" }}
                                  />
                                </div>
                                {/* Categoria de sabor */}
                                {categoriasSabor.length > 0 && (
                                  <div>
                                    <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", letterSpacing: "0.06em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>
                                      Categoria
                                    </label>
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                      <button
                                        onClick={() => setEditingSaborForm(f => ({ ...f, categoria_sabor_id: "" }))}
                                        style={{
                                          padding: "5px 11px", borderRadius: 999, fontSize: 11, fontWeight: 700, cursor: "pointer",
                                          background: editingSaborForm.categoria_sabor_id === "" ? cor : "var(--bg-input)",
                                          color: editingSaborForm.categoria_sabor_id === "" ? "#fff" : "var(--text-3)",
                                          border: `1px solid ${editingSaborForm.categoria_sabor_id === "" ? cor : "var(--border-1)"}`,
                                        }}>
                                        Padrão
                                      </button>
                                      {categoriasSabor.map(c => (
                                        <button key={c.id}
                                          onClick={() => setEditingSaborForm(f => ({ ...f, categoria_sabor_id: c.id }))}
                                          style={{
                                            padding: "5px 11px", borderRadius: 999, fontSize: 11, fontWeight: 700, cursor: "pointer",
                                            background: editingSaborForm.categoria_sabor_id === c.id ? "#9333ea" : "var(--bg-input)",
                                            color: editingSaborForm.categoria_sabor_id === c.id ? "#fff" : "var(--text-3)",
                                            border: `1px solid ${editingSaborForm.categoria_sabor_id === c.id ? "#9333ea" : "var(--border-1)"}`,
                                          }}>
                                          {c.nome}{c.preco_adicional > 0 ? ` +R$${c.preco_adicional.toFixed(2)}` : ""}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                <div style={{ display: "flex", gap: 7 }}>
                                  <button onClick={() => setEditingSaborId(null)}
                                    style={{ flex: 1, padding: "7px", borderRadius: 8, border: "1px solid var(--border-1)", background: "var(--bg-1)", fontSize: 12, fontWeight: 700, color: "var(--text-3)", cursor: "pointer" }}>
                                    Cancelar
                                  </button>
                                  <button onClick={() => handleUpdateSabor(s.id)} disabled={savingTab || !editingSaborForm.nome.trim()}
                                    style={{ flex: 2, padding: "7px", borderRadius: 8, border: "none", background: cor, color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                                    {savingTab ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : <Check size={12} />}
                                    Salvar
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => { setEditingSaborId(s.id); setEditingSaborForm({ nome: s.nome, descricao: s.descricao ?? "", preco: s.preco_adicional ? String(s.preco_adicional) : "", categoria_sabor_id: s.categoria_sabor_id ?? "", uploadingSaborImg: false }); }}>
                                  {s.imagem_url && (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={s.imagem_url} alt={s.nome} style={{ width: 36, height: 36, borderRadius: 8, objectFit: "cover", flexShrink: 0, border: "1px solid var(--border-1)" }} />
                                  )}
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                      <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)", margin: 0 }}>{s.nome}</p>
                                      {s.categoria_sabor_id && categoriasSabor.find(c => c.id === s.categoria_sabor_id) && (
                                        <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-4)", background: "var(--bg-3)", borderRadius: 6, padding: "1px 7px" }}>
                                          {categoriasSabor.find(c => c.id === s.categoria_sabor_id)!.nome}
                                        </span>
                                      )}
                                      {(s.preco_adicional ?? 0) > 0 && (
                                        <span style={{ fontSize: 10, fontWeight: 800, color: cor, background: `${cor}12`, borderRadius: 6, padding: "1px 7px" }}>
                                          R${s.preco_adicional!.toFixed(2)}
                                        </span>
                                      )}
                                    </div>
                                    {s.descricao && <p style={{ fontSize: 11, color: "var(--text-4)", margin: "2px 0 0" }}>{s.descricao}</p>}
                                  </div>
                                </div>
                                <button onClick={() => { setEditingSaborId(s.id); setEditingSaborForm({ nome: s.nome, descricao: s.descricao ?? "", preco: s.preco_adicional ? String(s.preco_adicional) : "", categoria_sabor_id: s.categoria_sabor_id ?? "", uploadingSaborImg: false }); }}
                                  style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid var(--border-1)", background: "var(--bg-1)", color: "var(--text-3)", cursor: "pointer", flexShrink: 0 }}>
                                  <Pencil size={12} />
                                </button>
                                <button onClick={() => toggleSaborAtivo(s)} style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid var(--border-1)", background: s.ativo ? "#f0fdf4" : "var(--bg-input)", color: s.ativo ? "#16a34a" : "var(--text-4)", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                                  {s.ativo ? "Ativo" : "Inativo"}
                                </button>
                                <button onClick={() => handleDeleteSabor(s.id)} style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid #fee2e2", background: "#fef2f2", color: "#FF6A00", cursor: "pointer" }}><Trash2 size={12} /></button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "14px", background: "var(--bg-input)", borderRadius: 14, border: "1px solid var(--border-1)" }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: "var(--text-1)", margin: 0 }}>Novo sabor</p>
                      <input
                        value={novoSabor.nome}
                        onChange={e => setNovoSabor(s => ({ ...s, nome: e.target.value }))}
                        onKeyDown={e => { if (e.key === "Enter") handleAddSabor(); }}
                        placeholder="Nome do sabor (ex: Mussarela, Calabresa) *"
                        style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid var(--border-1)", fontSize: 13, color: "var(--text-1)", background: "var(--bg-1)" }}
                      />
                      <input
                        value={novoSabor.descricao}
                        onChange={e => setNovoSabor(s => ({ ...s, descricao: e.target.value }))}
                        placeholder="Descrição / ingredientes (opcional)"
                        style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid var(--border-1)", fontSize: 13, color: "var(--text-1)", background: "var(--bg-1)" }}
                      />
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-3)", whiteSpace: "nowrap" }}>R$</span>
                        <input type="number" step="0.01" min="0"
                          value={novoSabor.preco}
                          onChange={e => setNovoSabor(s => ({ ...s, preco: e.target.value }))}
                          placeholder="Preço adicional (opcional)"
                          style={{ flex: 1, padding: "9px 12px", borderRadius: 10, border: "1px solid var(--border-1)", fontSize: 13, color: "var(--text-1)", background: "var(--bg-1)" }}
                        />
                      </div>
                      <button onClick={handleAddSabor} disabled={savingTab || !novoSabor.nome.trim()}
                        style={{ padding: "10px", borderRadius: 10, background: cor, color: "#fff", border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: !novoSabor.nome.trim() ? 0.5 : 1 }}>
                        {savingTab ? "Adicionando…" : <><Plus size={13} style={{ display: "inline", marginRight: 5 }} />Adicionar sabor</>}
                      </button>
                    </div>
                  </>
                )}
                {wizardStep === 3 && (
                  <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
                    <button onClick={() => setWizardStep(2)}
                      style={{ padding: "11px 16px", borderRadius: 12, border: "1.5px solid var(--border-1)", background: "var(--bg-1)", fontSize: 13, fontWeight: 700, color: "var(--text-3)", cursor: "pointer" }}>
                      ← Voltar
                    </button>
                    <button onClick={() => setWizardStep(4)}
                      style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "11px 20px", borderRadius: 12, background: cor, color: "#fff", border: "none", fontSize: 13, fontWeight: 800, cursor: "pointer", boxShadow: `0 4px 14px ${cor}40` }}>
                      Próximo <ChevronRight size={14} />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── STEP 4 / Tab Adicionais ── */}
            {(wizardStep === 4 || (wizardStep === 0 && editId && modalTab === "adicionais")) && (
              <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                  <p style={{ fontSize: 12, color: "var(--text-3)", margin: 0 }}>
                    Itens opcionais ou obrigatórios que o cliente pode adicionar ao pedido (borda recheada, extra queijo, etc.).
                  </p>
                  <input ref={importAdicionaisRef} type="file" accept="image/*" style={{ display: "none" }}
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (f) handleImportAdicionaisImage(f);
                      e.target.value = "";
                    }} />
                  <button
                    onClick={() => importAdicionaisRef.current?.click()}
                    disabled={importAdicionaisLoading}
                    title="Importar adicionais de uma foto"
                    style={{
                      display: "flex", alignItems: "center", gap: 5, flexShrink: 0,
                      padding: "7px 12px", borderRadius: 10,
                      background: "var(--bg-input)", border: "1.5px solid var(--border-1)",
                      color: "var(--text-2)", fontSize: 12, fontWeight: 700,
                      cursor: importAdicionaisLoading ? "not-allowed" : "pointer",
                    }}>
                    {importAdicionaisLoading
                      ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />
                      : <ScanLine size={13} />}
                    {importAdicionaisLoading ? "Lendo…" : "Importar foto"}
                  </button>
                </div>

                {/* Import review panel */}
                {importAdicionaisOpen && !importAdicionaisLoading && importAdicionaisList.length > 0 && (
                  <div style={{ background: "#f0fdf4", border: "1.5px solid #bbf7d0", borderRadius: 14, padding: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                      <p style={{ fontSize: 12, fontWeight: 800, color: "#166534", margin: 0 }}>
                        📋 {importAdicionaisList.length} adicionais encontrados
                      </p>
                      <button onClick={() => setImportAdicionaisOpen(false)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "#166534", padding: 2 }}>
                        <X size={14} />
                      </button>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
                      {importAdicionaisList.map((a, i) => (
                        <label key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 10, background: a.sel ? "#fff" : "#f0fdf4", border: `1px solid ${a.sel ? "#bbf7d0" : "#e2e8f0"}`, cursor: "pointer" }}>
                          <input type="checkbox" checked={a.sel}
                            onChange={e => setImportAdicionaisList(prev => prev.map((x, j) => j === i ? { ...x, sel: e.target.checked } : x))}
                            style={{ width: 15, height: 15, accentColor: cor, flexShrink: 0 }} />
                          <div style={{ flex: 1 }}>
                            <p style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", margin: 0 }}>{a.nome}</p>
                            <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
                              {a.preco > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: cor }}>+R${a.preco.toFixed(2)}</span>}
                              {a.obrigatorio && <span style={{ fontSize: 10, fontWeight: 700, color: "#FF6A00" }}>Obrigatório</span>}
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => setImportAdicionaisList(prev => prev.map(a => ({ ...a, sel: true })))}
                        style={{ fontSize: 11, fontWeight: 700, color: "#166534", background: "none", border: "none", cursor: "pointer", padding: "4px 0" }}>
                        Selecionar todos
                      </button>
                      <button
                        onClick={handleSalvarAdicionaisImport}
                        disabled={salvandoAdicionaisImport || !importAdicionaisList.some(a => a.sel)}
                        style={{
                          marginLeft: "auto", display: "flex", alignItems: "center", gap: 5,
                          padding: "9px 16px", borderRadius: 10,
                          background: salvandoAdicionaisImport ? "var(--text-4)" : cor,
                          color: "#fff", border: "none", fontSize: 12, fontWeight: 800,
                          cursor: salvandoAdicionaisImport ? "not-allowed" : "pointer",
                        }}>
                        {salvandoAdicionaisImport ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : <Plus size={12} />}
                        {salvandoAdicionaisImport ? "Salvando…" : `Adicionar ${importAdicionaisList.filter(a => a.sel).length} selecionados`}
                      </button>
                    </div>
                  </div>
                )}
                {loadingTabs ? (
                  <div style={{ display: "flex", justifyContent: "center", padding: 20 }}><Loader2 size={20} style={{ color: "var(--text-4)", animation: "spin 1s linear infinite" }} /></div>
                ) : (
                  <>
                    {adicionais.length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {adicionais.map(a => (
                          <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 12, background: a.ativo ? "var(--bg-input)" : "var(--bg-2)", border: `1px solid ${a.ativo ? "var(--border-1)" : "var(--border-1)"}`, opacity: a.ativo ? 1 : 0.55 }}>
                            <div style={{ flex: 1 }}>
                              <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)", margin: 0 }}>{a.nome}</p>
                              <div style={{ display: "flex", gap: 6, marginTop: 3 }}>
                                {a.preco > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: cor }}>+R${a.preco.toFixed(2)}</span>}
                                {a.obrigatorio && <span style={{ fontSize: 10, fontWeight: 700, color: "#FF6A00", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, padding: "1px 6px" }}>Obrigatório</span>}
                              </div>
                            </div>
                            <button onClick={() => toggleAdicionalAtivo(a)} style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid var(--border-1)", background: a.ativo ? "#f0fdf4" : "var(--bg-input)", color: a.ativo ? "#16a34a" : "var(--text-4)", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                              {a.ativo ? "Ativo" : "Inativo"}
                            </button>
                            <button onClick={() => handleDeleteAdicional(a.id)} style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid #fee2e2", background: "#fef2f2", color: "#FF6A00", cursor: "pointer" }}><Trash2 size={12} /></button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "14px", background: "var(--bg-input)", borderRadius: 14, border: "1px solid var(--border-1)" }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: "var(--text-1)", margin: 0 }}>Novo adicional</p>
                      <input value={novoAdicional.nome} onChange={e => setNovoAdicional(a => ({ ...a, nome: e.target.value }))}
                        placeholder="Nome (ex: Borda recheada, Extra queijo)"
                        style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid var(--border-1)", fontSize: 13, color: "var(--text-1)", background: "var(--bg-1)" }} />
                      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center" }}>
                        <input type="number" min="0" step="0.50" value={novoAdicional.preco} onChange={e => setNovoAdicional(a => ({ ...a, preco: e.target.value }))}
                          placeholder="Preço adicional (R$)"
                          style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid var(--border-1)", fontSize: 13, color: "var(--text-1)", background: "var(--bg-1)" }} />
                        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-3)", fontWeight: 600, whiteSpace: "nowrap" }}>
                          <input type="checkbox" checked={novoAdicional.obrigatorio} onChange={e => setNovoAdicional(a => ({ ...a, obrigatorio: e.target.checked }))}
                            style={{ width: 16, height: 16 }} />
                          Obrigatório
                        </label>
                      </div>
                      {produtos.filter(p => p.id !== editId).length > 0 && (
                        <div>
                          <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text-3)", margin: "0 0 6px" }}>Incluir também em outros produtos (opcional)</p>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 140, overflowY: "auto", padding: 8, borderRadius: 10, border: "1px solid var(--border-1)", background: "var(--bg-1)" }}>
                            {produtos.filter(p => p.id !== editId).map(p => (
                              <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-2)", cursor: "pointer" }}>
                                <input type="checkbox" checked={novoAdicionalOutrosProdutos.includes(p.id)}
                                  onChange={e => setNovoAdicionalOutrosProdutos(prev => e.target.checked ? [...prev, p.id] : prev.filter(id => id !== p.id))}
                                  style={{ width: 14, height: 14 }} />
                                {p.nome}
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                      <button onClick={handleAddAdicional} disabled={savingTab || !novoAdicional.nome.trim()}
                        style={{ padding: "10px", borderRadius: 10, background: cor, color: "#fff", border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: !novoAdicional.nome.trim() ? 0.5 : 1 }}>
                        {savingTab ? "Adicionando…" : <><Plus size={13} style={{ display: "inline", marginRight: 5 }} />Adicionar</>}
                      </button>
                    </div>
                  </>
                )}
                {wizardStep === 4 && (
                  <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
                    <button onClick={() => setWizardStep(3)}
                      style={{ padding: "11px 16px", borderRadius: 12, border: "1.5px solid var(--border-1)", background: "var(--bg-1)", fontSize: 13, fontWeight: 700, color: "var(--text-3)", cursor: "pointer" }}>
                      ← Voltar
                    </button>
                    <button onClick={() => setModalOpen(false)}
                      style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "11px 20px", borderRadius: 12, background: cor, color: "#fff", border: "none", fontSize: 13, fontWeight: 800, cursor: "pointer", boxShadow: `0 4px 14px ${cor}40` }}>
                      <Check size={14} /> Finalizar
                    </button>
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      )}
      {/* ── Modal de crop do banner (pan + zoom) ── */}
      {bannerCropSrc && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.92)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#111", borderRadius: 20, maxWidth: 680, width: "100%", padding: "20px 20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <p style={{ color: "#fff", fontWeight: 800, fontSize: 16, margin: "0 0 2px" }}>Posicionar banner</p>
                <p style={{ color: "#64748b", fontSize: 12, margin: 0 }}>Arraste para reposicionar · use o zoom para ajustar</p>
              </div>
              <button onClick={() => setBannerCropSrc(null)} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer" }}>
                <X size={20} />
              </button>
            </div>

            {/* Área de preview 3:1 com pan */}
            <div
              ref={bannerContRef}
              onMouseDown={onBannerMouseDown}
              onMouseMove={onBannerMouseMove}
              onMouseUp={onBannerMouseUp}
              onMouseLeave={onBannerMouseUp}
              style={{
                position: "relative", width: "100%", aspectRatio: "3/1",
                overflow: "hidden", borderRadius: 12, cursor: bannerDrag ? "grabbing" : "grab",
                background: "#000", userSelect: "none",
              }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={bannerImgRef}
                src={bannerCropSrc}
                alt="banner"
                draggable={false}
                style={{
                  position: "absolute",
                  maxWidth: "none",
                  width: `${bannerZoom * 100}%`,
                  height: `${bannerZoom * 100}%`,
                  objectFit: "contain",
                  top: "50%", left: "50%",
                  transform: `translate(calc(-50% + ${bannerPan.x}px), calc(-50% + ${bannerPan.y}px))`,
                  pointerEvents: "none",
                }}
              />
              {/* Grade guia */}
              <div style={{ position: "absolute", inset: 0, pointerEvents: "none", border: "2px solid rgba(255,255,255,0.4)", borderRadius: 12 }} />
            </div>

            {/* Slider de zoom */}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 11, color: "#64748b", minWidth: 28 }}>Zoom</span>
              <input
                type="range" min="1" max="3" step="0.05"
                value={bannerZoom}
                onChange={e => { setBannerZoom(parseFloat(e.target.value)); setBannerPan({ x: 0, y: 0 }); }}
                style={{ flex: 1, accentColor: "#FF6A00" }}
              />
              <span style={{ fontSize: 11, color: "#64748b", minWidth: 28 }}>{bannerZoom.toFixed(1)}×</span>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setBannerCropSrc(null)}
                style={{ flex: 1, padding: "12px", borderRadius: 12, background: "#1e293b", border: "none", color: "#94a3b8", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                Cancelar
              </button>
              <button onClick={confirmBannerCrop}
                style={{ flex: 2, padding: "12px", borderRadius: 12, background: "#FF6A00", border: "none", color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
                Usar esta área
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
