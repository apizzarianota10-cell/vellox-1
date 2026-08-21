"use client";

import Link from "next/link";
import { useState, useMemo, useEffect, useRef } from "react";
import {
  ShoppingCart, Plus, Minus, X, ChevronRight,
  MapPin, Phone, User, Clock, Truck, CheckCircle,
  Store, Package, Star, ChevronDown, BadgeCheck,
} from "lucide-react";
import type { Produto, ConfiguracaoLoja, Empresa, BairroTaxa, ProdutoVariacao, ProdutoSabor, ProdutoAdicional } from "@/types";

interface CartItem {
  produto: Produto;
  variacao: ProdutoVariacao | null;
  sabores: ProdutoSabor[];
  adicionais: ProdutoAdicional[];
  qty: number;
  precoUnit: number;
  cartKey: string;
}

type Step = "cart" | "form" | "success";
type TipoPedido = "entrega" | "retirada";
type Pagamento = "dinheiro" | "pix" | "credito" | "debito";

interface OrderForm {
  nome: string; telefone: string;
  rua: string; numero: string; complemento: string; referencia: string;
  bairro: string; observacoes: string; tipo: TipoPedido; pagamento: Pagamento; troco: string;
}

interface Props {
  produtos: Produto[];
  config: ConfiguracaoLoja | null;
  empresa: Pick<Empresa, "id" | "nome" | "codigo" | "verificado">;
  bairros: BairroTaxa[];
}

const PAG_LABELS: Record<Pagamento, string> = {
  dinheiro: "💵 Dinheiro", pix: "⚡ Pix",
  credito: "💳 Crédito", debito: "💳 Débito",
};

function buildCartKey(produtoId: string, variacaoId?: string, saboresIds?: string[], adicionaisIds?: string[]) {
  return [
    produtoId,
    variacaoId ?? "",
    (saboresIds ?? []).slice().sort().join(","),
    (adicionaisIds ?? []).slice().sort().join(","),
  ].join("|");
}

function describeItem(item: CartItem): string {
  const parts: string[] = [];
  if (item.variacao) parts.push(item.variacao.nome);
  if (item.sabores.length > 0) parts.push(item.sabores.map(s => s.nome).join("/"));
  if (item.adicionais.length > 0) parts.push(`+ ${item.adicionais.map(a => a.nome).join(", ")}`);
  return parts.join(" · ");
}

export default function LojaClient({ produtos, config, empresa, bairros }: Props) {
  const cor = config?.cor_principal ?? "#FF6A00";
  const taxaPadrao = config?.taxa_entrega ?? 0;
  const aberto = config?.aberto ?? true;
  const usaBairros = bairros.length > 0;
  const modoCalculo = (config?.modo_calculo_pizza ?? "maior_valor") as "maior_valor" | "proporcional";

  const [cart, setCart]       = useState<CartItem[]>([]);
  const [catSel, setCatSel]   = useState<string>("Todos");
  const [cartOpen, setCartOpen] = useState(false);
  const [step, setStep]       = useState<Step>("cart");
  const [submitting, setSubmitting] = useState(false);
  const [pedidoId, setPedidoId]         = useState<string>("");
  const [trackingToken, setTrackingToken] = useState<string>("");
  // Mesma chave em reenvios do mesmo checkout (ex: falha de rede + tentar de
  // novo) — o servidor usa ela pra não criar o pedido duplicado.
  const idempotencyKeyRef = useRef<string | null>(null);
  const [submitError, setSubmitError]   = useState<string>("");
  const [stickyNav, setStickyNav] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);
  const [form, setForm] = useState<OrderForm>({
    nome: "", telefone: "",
    rua: "", numero: "", complemento: "", referencia: "",
    bairro: "", observacoes: "", tipo: "entrega", pagamento: "pix", troco: "",
  });

  // Carousel
  const [carouselPaused, setCarouselPaused] = useState(false);

  // Product detail modal
  const [detailProduto, setDetailProduto]     = useState<Produto | null>(null);
  const [detailVariacao, setDetailVariacao]   = useState<ProdutoVariacao | null>(null);
  const [detailSaboresSel, setDetailSaboresSel] = useState<ProdutoSabor[]>([]);
  const [detailAdicionaisSel, setDetailAdicionaisSel] = useState<ProdutoAdicional[]>([]);
  const [detailQty, setDetailQty]             = useState(1);
  const [detailStep, setDetailStep]           = useState<"variacao" | "sabores" | "adicionais">("variacao");
  // Múltiplas unidades com sabores diferentes: null = ainda não perguntou,
  // "ask" = mostrando a pergunta, "collecting" = coletando sabor unidade a unidade
  const [multiSaborStage, setMultiSaborStage] = useState<"ask" | "collecting" | null>(null);
  const [unidadesColetadas, setUnidadesColetadas] = useState<ProdutoSabor[][]>([]);

  useEffect(() => {
    const onScroll = () => {
      if (heroRef.current) setStickyNav(window.scrollY > heroRef.current.offsetHeight - 60);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Pool global de sabores agrupado por produto
  const saboresPorProduto = useMemo(() =>
    produtos
      .map(p => ({ produto: p, sabores: p.produto_sabores?.filter(s => s.ativo) ?? [] }))
      .filter(g => g.sabores.length > 0),
    [produtos],
  );
  const allSaborCount = useMemo(() =>
    saboresPorProduto.reduce((n, g) => n + g.sabores.length, 0),
    [saboresPorProduto],
  );

  // Mapa saborId → produto-fonte (para buscar preço do tamanho correto por sabor)
  const saborToProduto = useMemo(() => {
    const map = new Map<string, Produto>();
    saboresPorProduto.forEach(({ produto: p, sabores }) => {
      sabores.forEach(s => map.set(s.id, p));
    });
    return map;
  }, [saboresPorProduto]);

  // Pool de sabores vinculado: um produto só compartilha sabores com os
  // produtos específicos que o admin vinculou explicitamente a ele
  // (sabores_vinculo_ids) — nada automático por categoria ou flag global.
  // Sem vínculo, o produto mostra só os próprios sabores. Percorre a cadeia
  // de vínculos (ex: P vinculado a M, M vinculado a G) para juntar todos os
  // produtos conectados na mesma lista.
  function poolMesclavelPara(produto: Produto) {
    const visitados = new Set<string>([produto.id]);
    const fila = [produto.id];
    while (fila.length > 0) {
      const id = fila.shift()!;
      const p = produtos.find(x => x.id === id);
      (p?.sabores_vinculo_ids ?? []).forEach(outroId => {
        if (!visitados.has(outroId)) { visitados.add(outroId); fila.push(outroId); }
      });
    }
    return saboresPorProduto.filter(g => visitados.has(g.produto.id));
  }

  // Busca o preço de um produto para um tamanho pelo nome (ex: "G", "M", "P")
  function precoByTamanhoNome(produto: Produto, nome: string): number {
    const cpTamanhos = produto.categoria_preco?.tamanhos;
    if (cpTamanhos) {
      const t = cpTamanhos.find(t => t.nome === nome);
      if (t) return t.preco;
    }
    const vars = produto.produto_variacoes?.filter(v => v.ativo) ?? [];
    const v = vars.find(v => v.nome === nome);
    if (v && v.preco > 0) return v.preco;
    return produto.preco;
  }

  const categorias = useMemo(() => {
    const cats = ["Todos", ...Array.from(new Set(produtos.map(p => p.categoria))).sort()];
    if (allSaborCount > 0) cats.push("__sabores__");
    return cats;
  }, [produtos, allSaborCount]);

  const produtosFiltrados = useMemo(
    () => catSel === "Todos" ? produtos : produtos.filter(p => p.categoria === catSel),
    [produtos, catSel],
  );

  function hasCustomizations(p: Produto): boolean {
    return p.tipo === "pizza"
      || (p.produto_variacoes?.filter(v => v.ativo).length ?? 0) > 0
      || (p.produto_sabores?.filter(s => s.ativo).length ?? 0) > 0
      || (p.produto_adicionais?.filter(a => a.ativo).length ?? 0) > 0;
  }

  function precoVariacao(produto: Produto, variacao: ProdutoVariacao): number {
    const tamanhos = produto.categoria_preco?.tamanhos;
    if (tamanhos) {
      const t = tamanhos.find(t => t.nome === variacao.nome);
      if (t) return t.preco;
    }
    return variacao.preco > 0 ? variacao.preco : produto.preco;
  }

  function maxSaboresVariacao(produto: Produto, variacao: ProdutoVariacao): number {
    const tamanhos = produto.categoria_preco?.tamanhos;
    if (tamanhos) {
      const t = tamanhos.find(t => t.nome === variacao.nome);
      if (t) return t.max_sabores;
    }
    return variacao.max_sabores;
  }

  function precoMinimo(p: Produto): number {
    const vars = p.produto_variacoes?.filter(v => v.ativo) ?? [];
    if (vars.length > 0) return Math.min(...vars.map(v => precoVariacao(p, v)));
    const sabsComPreco = p.produto_sabores?.filter(s => s.ativo && (s.preco_adicional ?? 0) > 0) ?? [];
    if (sabsComPreco.length > 0) return Math.min(...sabsComPreco.map(s => s.preco_adicional!));
    return p.preco;
  }

  function isAPartirDe(p: Produto): boolean {
    if ((p.produto_variacoes?.filter(v => v.ativo).length ?? 0) > 0) return true;
    return (p.produto_sabores?.filter(s => s.ativo && (s.preco_adicional ?? 0) > 0).length ?? 0) > 0;
  }

  const carouselItems = useMemo(() => {
    const withImg = produtos.filter(p => p.imagem_url);
    const without = produtos.filter(p => !p.imagem_url);
    return [...withImg, ...without].slice(0, 12);
  }, [produtos]);

  const totalItems  = cart.reduce((s, i) => s + i.qty, 0);
  const subtotal    = cart.reduce((s, i) => s + i.precoUnit * i.qty, 0);
  const taxaEntrega = form.tipo === "entrega"
    ? (usaBairros ? (bairros.find(b => b.bairro === form.bairro)?.taxa ?? 0) : taxaPadrao)
    : 0;
  const total = subtotal + taxaEntrega;

  function addSimple(p: Produto) {
    const key = buildCartKey(p.id);
    const precoUnit = p.preco;
    setCart(prev => {
      const ex = prev.find(i => i.cartKey === key);
      if (ex) return prev.map(i => i.cartKey === key ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { produto: p, variacao: null, sabores: [], adicionais: [], qty: 1, precoUnit, cartKey: key }];
    });
  }

  // Preço efetivo do sabor para o tamanho selecionado:
  // 1. preco_adicional no sabor → override absoluto
  // 2. Busca o preço do produto-fonte do sabor para o tamanho selecionado
  // 3. Fallback: precoBase do produto atual
  function precoDeSabor(s: ProdutoSabor, precoBase: number, tamanhoNome?: string): number {
    if ((s.preco_adicional ?? 0) > 0) return s.preco_adicional!;
    if (tamanhoNome) {
      const src = saborToProduto.get(s.id);
      if (src) return precoByTamanhoNome(src, tamanhoNome);
    }
    return precoBase;
  }

  function calcularPrecoSabores(precos: number[]): number {
    if (precos.length === 0) return 0;
    return modoCalculo === "proporcional"
      ? precos.reduce((a, b) => a + b, 0) / precos.length
      : Math.max(...precos);
  }

  function precoUnidadeComSabores(p: Produto, variacao: ProdutoVariacao | null, sabores: ProdutoSabor[], adicionais: ProdutoAdicional[]): number {
    const produtoPrecoBase = variacao ? precoVariacao(p, variacao) : p.preco;
    const tamanhoNome = variacao?.nome;
    const precoBase = sabores.length > 0
      ? calcularPrecoSabores(sabores.map(s => precoDeSabor(s, produtoPrecoBase, tamanhoNome)))
      : produtoPrecoBase;
    return precoBase + adicionais.reduce((s, a) => s + a.preco, 0);
  }

  function addWithConfig(p: Produto, variacao: ProdutoVariacao | null, sabores: ProdutoSabor[], adicionais: ProdutoAdicional[], qty: number) {
    const key = buildCartKey(p.id, variacao?.id, sabores.map(s => s.id), adicionais.map(a => a.id));
    const precoUnit = precoUnidadeComSabores(p, variacao, sabores, adicionais);
    setCart(prev => {
      const ex = prev.find(i => i.cartKey === key);
      if (ex) return prev.map(i => i.cartKey === key ? { ...i, qty: i.qty + qty } : i);
      return [...prev, { produto: p, variacao, sabores, adicionais, qty, precoUnit, cartKey: key }];
    });
  }

  function removeOne(cartKey: string) {
    setCart(prev => prev.map(i => i.cartKey === cartKey ? { ...i, qty: i.qty - 1 } : i).filter(i => i.qty > 0));
  }
  function removeAll(cartKey: string) { setCart(prev => prev.filter(i => i.cartKey !== cartKey)); }
  function qtyOf(id: string) { return cart.filter(i => i.produto.id === id).reduce((s, i) => s + i.qty, 0); }

  function openDetail(p: Produto) {
    const variacoes = p.produto_variacoes?.filter(v => v.ativo) ?? [];
    const sabores   = p.produto_sabores?.filter(s => s.ativo)   ?? [];
    setDetailProduto(p);
    setDetailVariacao(variacoes[0] ?? null);
    setDetailSaboresSel([]);
    setDetailAdicionaisSel([]);
    setDetailQty(1);
    setMultiSaborStage(null);
    setUnidadesColetadas([]);
    const hasSaborStep = sabores.length > 0 || poolMesclavelPara(p).some(g => g.sabores.length > 0);
    if (variacoes.length > 0)    setDetailStep("variacao");
    else if (hasSaborStep)       setDetailStep("sabores");
    else                         setDetailStep("adicionais");
  }

  function confirmDetail() {
    if (!detailProduto) return;
    addWithConfig(detailProduto, detailVariacao, detailSaboresSel, detailAdicionaisSel, detailQty);
    setDetailProduto(null);
  }

  // Unidade atual sendo configurada durante a coleta de sabores diferentes (1-based)
  const unidadeAtual = unidadesColetadas.length + 1;

  function escolherMesmoSabor() {
    setMultiSaborStage(null);
    confirmDetail();
  }

  function escolherSaborDiferente() {
    // A seleção já feita conta como a 1ª unidade; segue coletando as demais
    setUnidadesColetadas([detailSaboresSel]);
    setDetailSaboresSel([]);
    setMultiSaborStage("collecting");
    setDetailStep("sabores");
  }

  function avancarProximaUnidade() {
    if (detailSaboresSel.length === 0) return;
    setUnidadesColetadas(prev => [...prev, detailSaboresSel]);
    setDetailSaboresSel([]);
  }

  function voltarUnidadeAnterior() {
    if (unidadesColetadas.length === 0) return;
    const anteriores = unidadesColetadas.slice(0, -1);
    const ultima = unidadesColetadas[unidadesColetadas.length - 1];
    if (anteriores.length === 0) {
      setMultiSaborStage(null);
      setDetailSaboresSel(ultima);
      setUnidadesColetadas([]);
    } else {
      setUnidadesColetadas(anteriores);
      setDetailSaboresSel(ultima);
    }
  }

  function confirmMultiSabores() {
    if (!detailProduto || detailSaboresSel.length === 0) return;
    const todasUnidades = [...unidadesColetadas, detailSaboresSel];
    todasUnidades.forEach(sab => addWithConfig(detailProduto, detailVariacao, sab, detailAdicionaisSel, 1));
    setDetailProduto(null);
  }

  async function handleSubmit() {
    if (!form.nome.trim() || !form.telefone.trim()) return;
    if (form.tipo === "entrega" && !form.rua.trim()) return;
    if (form.tipo === "entrega" && usaBairros && !form.bairro) return;
    if (cart.length === 0) return;
    setSubmitting(true);
    setSubmitError("");
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = crypto.randomUUID();
    }
    try {
      const itens = cart.map(i => {
        const desc = describeItem(i);
        const nome = desc ? `${i.produto.nome} (${desc})` : i.produto.nome;
        return `${i.qty}x ${nome} — R$${(i.precoUnit * i.qty).toFixed(2).replace(".", ",")}`;
      }).join("\n");
      const res = await fetch("/api/loja/pedido", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empresa_id: empresa.id,
          idempotency_key: idempotencyKeyRef.current,
          cliente_nome: form.nome.trim(),
          cliente_telefone: form.telefone.replace(/\D/g, ""),
          endereco_entrega: form.tipo === "entrega"
            ? [form.rua.trim(), form.numero.trim(), form.complemento.trim()].filter(Boolean).join(", ")
            : "Retirada no local",
          bairro: form.tipo === "entrega" && form.bairro ? form.bairro : null,
          tipo_pedido: form.tipo,
          descricao_itens: itens,
          observacoes: [form.observacoes.trim(), form.referencia.trim() ? `Ref: ${form.referencia.trim()}` : ""].filter(Boolean).join(" | ") || null,
          valor_pedido: subtotal,
          valor_motoboy: taxaEntrega,
          forma_pagamento: form.pagamento,
          troco_para: form.pagamento === "dinheiro" && form.troco ? parseFloat(form.troco) : null,
          endereco_lat: null,
          endereco_lng: null,
          status: "em_fila",
        }),
      });
      const json = await res.json();
      if (json.id) {
        idempotencyKeyRef.current = null; // próximo pedido usa uma chave nova
        setPedidoId(json.id);
        setTrackingToken(json.tracking_token ?? "");
        setStep("success");
        setCart([]);
      } else {
        setSubmitError(json.error ?? "Erro ao enviar pedido. Tente novamente.");
      }
    } catch {
      setSubmitError("Erro de conexão. Verifique sua internet e tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Loja fechada ──────────────────────────────────────────────────
  if (!aberto) {
    const hasBannerClosed = Boolean(config?.banner_url);
    return (
      <div style={{ minHeight: "100vh", fontFamily: "system-ui,sans-serif", background: "#f8f7f5" }}>

        {/* Banner + logo sobrepostos */}
        <div style={{ position: "relative", width: "100%", marginBottom: 60 }}>
          {/* Banner */}
          <div style={{
            position: "relative", width: "100%", height: hasBannerClosed ? 220 : 140,
            overflow: "hidden",
            background: hasBannerClosed ? "#000" : `linear-gradient(135deg, ${cor}dd 0%, ${cor}88 100%)`,
          }}>
            {hasBannerClosed && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={config!.banner_url!} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.55 }} />
            )}
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.4) 100%)" }} />
          </div>

          {/* Logo centralizado sobre a borda inferior do banner */}
          <div style={{ position: "absolute", bottom: -44, left: "50%", transform: "translateX(-50%)" }}>
            {config?.logo_url
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={config.logo_url} alt={empresa.nome} style={{ width: 88, height: 88, borderRadius: 26, objectFit: "cover", border: "4px solid #f8f7f5", boxShadow: "0 8px 28px rgba(0,0,0,0.18)", display: "block" }} />
              : <div style={{ width: 88, height: 88, borderRadius: 26, background: `linear-gradient(135deg, ${cor}, ${cor}bb)`, display: "flex", alignItems: "center", justifyContent: "center", border: "4px solid #f8f7f5", boxShadow: `0 8px 28px ${cor}50` }}>
                  <span style={{ color: "#fff", fontWeight: 900, fontSize: 32 }}>{empresa.nome.charAt(0)}</span>
                </div>
            }
          </div>
        </div>

        {/* Card central */}
        <div style={{ maxWidth: 480, margin: "0 auto", padding: "0 20px 48px" }}>

          {/* Nome + badge fechado */}
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <h1 style={{ fontSize: 24, fontWeight: 900, color: "#0f172a", margin: "0 0 10px", letterSpacing: "-0.02em" }}>{empresa.nome}</h1>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "6px 16px", borderRadius: 999, background: "#fff1f2", border: "1.5px solid #fecaca" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#FF6A00", display: "inline-block", flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: "#cc5500" }}>Fechado agora</span>
            </div>
          </div>

          {/* Horários ou mensagem */}
          {config?.horario_funcionamento ? (
            <div style={{ background: "#fff", borderRadius: 20, boxShadow: "0 2px 20px rgba(0,0,0,0.07)", overflow: "hidden" }}>
              {/* Cabeçalho do card */}
              <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: `${cor}15`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Clock size={16} style={{ color: cor }} />
                </div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 800, color: "#0f172a", margin: 0 }}>Horários de funcionamento</p>
                  <p style={{ fontSize: 11, color: "#94a3b8", margin: 0 }}>Voltamos em breve!</p>
                </div>
              </div>
              {/* Linhas de horário */}
              <div style={{ padding: "12px 20px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
                {config.horario_funcionamento.split("\n").filter(l => l.trim()).map((linha, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 10, background: i % 2 === 0 ? "#f8fafc" : "#fff" }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: cor, flexShrink: 0, opacity: 0.7 }} />
                    <span style={{ fontSize: 13, color: "#334155", fontWeight: 500, flex: 1 }}>{linha}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ background: "#fff", borderRadius: 20, padding: "28px 24px", textAlign: "center", boxShadow: "0 2px 20px rgba(0,0,0,0.07)" }}>
              <p style={{ fontSize: 15, color: "#475569", margin: 0, lineHeight: 1.6 }}>
                Voltamos em breve.<br />
                <span style={{ color: "#94a3b8", fontSize: 13 }}>Obrigado pela preferência!</span>
              </p>
            </div>
          )}

          {/* Rodapé acolhedor */}
          <p style={{ textAlign: "center", fontSize: 12, color: "#cbd5e1", marginTop: 28 }}>
            Aguardamos você com muito carinho 🍕
          </p>
        </div>
      </div>
    );
  }

  const hasBanner = Boolean(config?.banner_url);

  // Detail modal vars — memoized para não recomputar a cada render do carrinho
  const detailVars = useMemo(() => detailProduto?.produto_variacoes?.filter(v => v.ativo) ?? [], [detailProduto]);
  const detailAdds = useMemo(() => detailProduto?.produto_adicionais?.filter(a => a.ativo) ?? [], [detailProduto]);

  const maxSabores = useMemo(() =>
    detailProduto && detailVariacao
      ? maxSaboresVariacao(detailProduto, detailVariacao)
      : (detailVars[0] && detailProduto ? maxSaboresVariacao(detailProduto, detailVars[0]) : 1),
    [detailProduto, detailVariacao, detailVars],
  );

  const detailProdutoPrecoBase = useMemo(() =>
    detailProduto && detailVariacao
      ? precoVariacao(detailProduto, detailVariacao)
      : (detailProduto?.preco ?? 0),
    [detailProduto, detailVariacao],
  );

  const detailPrecoBase = useMemo(() => {
    if (detailSaboresSel.length > 0 && detailProduto) {
      const tamanhoNome = detailVariacao?.nome;
      const precos = detailSaboresSel.map(s => precoDeSabor(s, detailProdutoPrecoBase, tamanhoNome));
      return calcularPrecoSabores(precos);
    }
    return detailProdutoPrecoBase;
  }, [detailSaboresSel, detailProduto, detailProdutoPrecoBase, detailVariacao, modoCalculo]);

  const detailPrecoTotal = useMemo(() =>
    (detailPrecoBase + detailAdicionaisSel.reduce((s, a) => s + a.preco, 0)) * detailQty,
    [detailPrecoBase, detailAdicionaisSel, detailQty],
  );

  // Total ao coletar sabores diferentes por unidade — cada unidade pode ter
  // um preço distinto (sabores diferentes custam diferente)
  const multiPrecoTotal = useMemo(() => {
    if (!detailProduto) return 0;
    const todas = [...unidadesColetadas, detailSaboresSel];
    return todas.reduce((sum, sab) => sum + precoUnidadeComSabores(detailProduto, detailVariacao, sab, detailAdicionaisSel), 0);
  }, [detailProduto, detailVariacao, unidadesColetadas, detailSaboresSel, detailAdicionaisSel]);

  const anyPoolSaborHasPrice = useMemo(() =>
    saboresPorProduto.some(g => g.sabores.some(s => (s.preco_adicional ?? 0) > 0)),
    [saboresPorProduto],
  );

  // Grupos exibidos no passo de sabores: o próprio produto mais qualquer
  // produto explicitamente vinculado a ele (sabores_vinculo_ids)
  const detailGruposSabor = useMemo(() =>
    detailProduto ? poolMesclavelPara(detailProduto) : [],
    [detailProduto, saboresPorProduto, produtos],
  );

  const detailTemSaborStep = detailGruposSabor.some(g => g.sabores.length > 0);

  const detailSteps = useMemo((): ("variacao" | "sabores" | "adicionais")[] => [
    ...(detailVars.length > 0 ? ["variacao"   as const] : []),
    ...(detailTemSaborStep ? ["sabores" as const] : []),
    ...(detailAdds.length > 0 ? ["adicionais" as const] : []),
  ], [detailVars, detailTemSaborStep, detailAdds]);

  const detailStepIdx    = Math.max(0, detailSteps.indexOf(detailStep));
  const detailIsLastStep = detailStepIdx >= detailSteps.length - 1;
  const detailCanNext    = detailStep !== "sabores" || detailSaboresSel.length > 0;

  return (
    <div style={{ minHeight: "100vh", background: "#f7f7f8", fontFamily: "system-ui,sans-serif" }}>

      {/* ══ HERO ══ */}
      <div ref={heroRef}>
        {/* Banner com logo ancorada embaixo-esquerda */}
        <div style={{
          position: "relative", height: 175, overflow: "visible",
          background: hasBanner ? "#000" : `linear-gradient(135deg, ${cor}dd 0%, ${cor}66 100%)`,
        }}>
          <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
            {hasBanner && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={config!.banner_url!} alt="banner" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.95 }} />
            )}
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, transparent 50%, rgba(0,0,0,0.35))" }} />
          </div>

          {/* Logo — ancorada no bottom-left do banner */}
          <div style={{
            position: "absolute", bottom: -28, left: 20, zIndex: 10,
            width: 72, height: 72, borderRadius: 18,
            border: "3px solid #fff",
            boxShadow: "0 4px 18px rgba(0,0,0,0.22)",
            background: config?.logo_url ? "#f0f0f0" : `linear-gradient(135deg, ${cor}, ${cor}aa)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            overflow: "hidden",
          }}>
            {config?.logo_url
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={config.logo_url} alt={empresa.nome} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : <span style={{ color: "#fff", fontWeight: 900, fontSize: 26, lineHeight: 1 }}>{empresa.nome.charAt(0)}</span>
            }
          </div>
        </div>

        {/* Info card */}
        <div style={{ background: "#fff", position: "relative", zIndex: 2 }}>
          <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px 20px 18px" }}>

            {/* Nome + verificado + badge aberto */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
              <h1 style={{ fontSize: 20, fontWeight: 900, color: "#0f172a", margin: 0, letterSpacing: "-0.025em", lineHeight: 1.2 }}>
                {empresa.nome}
              </h1>
              {empresa.verificado && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 3, background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 999, padding: "2px 8px", fontSize: 10, fontWeight: 700, color: "#1d4ed8", flexShrink: 0 }}>
                  <BadgeCheck size={10} /> Verificado
                </span>
              )}
              {aberto && (
                <div style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 999, background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#16a34a" }}>Aberto agora</span>
                </div>
              )}
            </div>

            {/* Descrição */}
            {config?.descricao && (
              <p style={{ fontSize: 13, color: "#64748b", margin: "6px 0 0", lineHeight: 1.6 }}>{config.descricao}</p>
            )}

            {/* Chips de info */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 12 }}>
              {config?.tempo_entrega && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 999, background: "#f8fafc", border: "1px solid #e2e8f0", fontSize: 12, fontWeight: 600, color: "#475569" }}>
                  <Clock size={12} style={{ color: cor }} />{config.tempo_entrega}
                </span>
              )}
              {usaBairros ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 999, background: "#f8fafc", border: "1px solid #e2e8f0", fontSize: 12, fontWeight: 600, color: "#475569" }}>
                  <MapPin size={12} style={{ color: cor }} />Taxa por bairro
                </span>
              ) : taxaPadrao === 0 ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 999, background: "#f0fdf4", border: "1px solid #bbf7d0", fontSize: 12, fontWeight: 700, color: "#16a34a" }}>
                  <Truck size={12} />Entrega grátis
                </span>
              ) : (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 999, background: "#f8fafc", border: "1px solid #e2e8f0", fontSize: 12, fontWeight: 600, color: "#475569" }}>
                  <Truck size={12} style={{ color: cor }} />Entrega R${taxaPadrao.toFixed(2)}
                </span>
              )}
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 999, background: "#fffbeb", border: "1px solid #fde68a", fontSize: 12, fontWeight: 600, color: "#92400e" }}>
                <Star size={11} style={{ color: "#f59e0b", fill: "#f59e0b" }} />Peça pelo site
              </span>
            </div>

          </div>
        </div>
      </div>

      {/* ══ STICKY NAV ══ */}
      <div style={{
        position: "sticky", top: 0, zIndex: 100, background: "#fff",
        borderBottom: "1px solid #f0f0f0",
        boxShadow: stickyNav ? "0 2px 12px rgba(0,0,0,0.08)" : "none",
        transition: "box-shadow 0.2s",
      }}>
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 20px", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1, overflowX: "auto", display: "flex", gap: 4, padding: "10px 0", scrollbarWidth: "none" }}>
            {categorias.map(c => (
              <button key={c} onClick={() => setCatSel(c)}
                style={{
                  padding: "7px 16px", borderRadius: 999, whiteSpace: "nowrap",
                  background: catSel === c ? (c === "__sabores__" ? "#7c3aed" : cor) : "transparent",
                  color: catSel === c ? "#fff" : (c === "__sabores__" ? "#7c3aed" : "#64748b"),
                  border: catSel === c ? "none" : `1px solid ${c === "__sabores__" ? "#ddd6fe" : "#e2e8f0"}`,
                  fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "all 0.15s", flexShrink: 0,
                }}>
                {c === "__sabores__" ? "🍕 Sabores" : c}
              </button>
            ))}
          </div>
          <button onClick={() => setCartOpen(true)} disabled={cart.length === 0}
            className="hidden sm:flex"
            style={{
              alignItems: "center", gap: 7, flexShrink: 0,
              padding: "8px 16px", borderRadius: 12,
              background: cart.length > 0 ? cor : "#f1f5f9",
              color: cart.length > 0 ? "#fff" : "#94a3b8",
              border: "none", fontSize: 12, fontWeight: 800,
              cursor: cart.length > 0 ? "pointer" : "not-allowed",
              boxShadow: cart.length > 0 ? `0 4px 14px ${cor}40` : "none", transition: "all 0.2s",
            }}>
            <ShoppingCart size={14} />
            {cart.length > 0 ? `${totalItems} · R$${subtotal.toFixed(2)}` : "Vazio"}
          </button>
        </div>
      </div>

      {/* ══ MAIS VENDIDOS CAROUSEL ══ */}
      {carouselItems.length >= 1 && (
        <section style={{ background: "#fff", borderBottom: "1px solid #f0f0f0", overflow: "hidden", padding: "22px 0 26px" }}>
          <style>{`
            @keyframes vellox-belt {
              from { transform: translateX(0); }
              to { transform: translateX(-50%); }
            }
          `}</style>
          <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 20px 14px", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 20 }}>🔥</span>
            <p style={{ fontSize: 16, fontWeight: 900, color: "#0f172a", margin: 0, letterSpacing: "-0.02em" }}>Mais vendidos</p>
          </div>
          <div
            style={{ position: "relative", overflow: "hidden" }}
            onMouseEnter={() => setCarouselPaused(true)}
            onMouseLeave={() => setCarouselPaused(false)}
            onTouchStart={() => setCarouselPaused(true)}
            onTouchEnd={() => setTimeout(() => setCarouselPaused(false), 2500)}
          >
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 28, zIndex: 10, background: "linear-gradient(to right, #fff, transparent)", pointerEvents: "none" }} />
            <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 28, zIndex: 10, background: "linear-gradient(to left, #fff, transparent)", pointerEvents: "none" }} />
            <div style={{
              display: "flex", gap: 12, paddingLeft: 20,
              animation: `vellox-belt ${Math.max(carouselItems.length * 5, 25)}s linear infinite`,
              animationPlayState: carouselPaused ? "paused" : "running",
              width: "max-content",
            }}>
              {[...carouselItems, ...carouselItems].map((p, i) => {
                const qty = qtyOf(p.id);
                const customizable = hasCustomizations(p);
                const aPartirDe = isAPartirDe(p);
                const preco = precoMinimo(p);
                const badgeIdx = i % 3;
                const badge = badgeIdx === 0
                  ? { label: "Mais vendido", bg: "#fff7ed", color: "#c2410c", border: "#fed7aa" }
                  : badgeIdx === 1
                  ? { label: "Popular", bg: "#fffbeb", color: "#92400e", border: "#fde68a" }
                  : null;
                const rating = (4.3 + (i % 6) * 0.1).toFixed(1);
                return (
                  <div
                    key={`${p.id}-${i}`}
                    onClick={() => customizable ? openDetail(p) : addSimple(p)}
                    style={{
                      width: 172, flexShrink: 0, borderRadius: 18,
                      background: "#fff", border: "1px solid #f0f0f0",
                      boxShadow: "0 2px 10px rgba(0,0,0,0.06)",
                      overflow: "hidden", cursor: "pointer",
                    }}
                  >
                    <div style={{ position: "relative", aspectRatio: "1/1", background: p.imagem_url ? "#f0f0f0" : `linear-gradient(135deg, ${cor}18, ${cor}08)`, overflow: "hidden" }}>
                      {p.imagem_url
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={p.imagem_url} alt={p.nome} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        : <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 38 }}>🍽️</div>
                      }
                      {badge && (
                        <span style={{
                          position: "absolute", top: 8, left: 8,
                          background: badge.bg, color: badge.color,
                          border: `1px solid ${badge.border}`,
                          fontSize: 9, fontWeight: 800, padding: "2px 7px", borderRadius: 999,
                        }}>
                          {badge.label}
                        </span>
                      )}
                      {qty > 0 && (
                        <span style={{
                          position: "absolute", top: 8, right: 8,
                          width: 20, height: 20, borderRadius: "50%",
                          background: cor, color: "#fff", fontSize: 11, fontWeight: 900,
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>{qty}</span>
                      )}
                    </div>
                    <div style={{ padding: "10px 12px 12px" }}>
                      <p style={{
                        fontSize: 13, fontWeight: 800, color: "#0f172a", margin: "0 0 4px", lineHeight: 1.3,
                        overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                      }}>
                        {p.nome}
                      </p>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 10, fontWeight: 700, color: "#f59e0b" }}>
                          <Star size={10} style={{ fill: "#f59e0b", color: "#f59e0b" }} />{rating}
                        </span>
                        {config?.tempo_entrega && (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 10, color: "#94a3b8", fontWeight: 600 }}>
                            <Clock size={9} />{config.tempo_entrega}
                          </span>
                        )}
                      </div>
                      <p style={{ fontSize: 14, fontWeight: 900, color: cor, margin: "0 0 8px", letterSpacing: "-0.02em" }}>
                        {aPartirDe && <span style={{ fontSize: 10, fontWeight: 600 }}>A partir de </span>}
                        R${preco.toFixed(2)}
                      </p>
                      <button
                        onClick={e => { e.stopPropagation(); customizable ? openDetail(p) : addSimple(p); }}
                        style={{
                          width: "100%", padding: "7px 0", borderRadius: 10,
                          background: cor, color: "#fff", border: "none",
                          fontSize: 11, fontWeight: 800, cursor: "pointer",
                          boxShadow: `0 3px 10px ${cor}35`,
                        }}>
                        {customizable ? "Ver opções" : qty > 0 ? `+ Adicionar (${qty})` : "+ Adicionar"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ══ SEÇÃO DE SABORES ══ */}
      {catSel === "__sabores__" && (
        <main style={{ maxWidth: 720, margin: "0 auto", padding: "16px 20px calc(120px + env(safe-area-inset-bottom, 0px))" }}>
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 22, fontWeight: 900, color: "#0f172a", margin: "0 0 4px", letterSpacing: "-0.02em" }}>🍕 Sabores disponíveis</p>
            <p style={{ fontSize: 13, color: "#94a3b8", margin: 0 }}>Toque num sabor pra ver o produto e montar seu pedido</p>
          </div>
          {saboresPorProduto.map(({ produto: p, sabores }) => (
            <div key={p.id} style={{ marginBottom: 28 }}>
              {/* Cabeçalho do grupo */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                {p.imagem_url
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={p.imagem_url} alt={p.nome} loading="lazy" style={{ width: 36, height: 36, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
                  : <div style={{ width: 36, height: 36, borderRadius: 10, background: `${cor}15`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 18 }}>🍕</div>
                }
                <div>
                  <p style={{ fontSize: 14, fontWeight: 800, color: "#0f172a", margin: 0 }}>{p.nome}</p>
                  <p style={{ fontSize: 11, color: "#94a3b8", margin: 0 }}>{sabores.length} sabor{sabores.length !== 1 ? "es" : ""}</p>
                </div>
                <button
                  onClick={() => openDetail(p)}
                  style={{ marginLeft: "auto", padding: "6px 14px", borderRadius: 999, background: cor, color: "#fff", border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
                  Pedir
                </button>
              </div>
              {/* Grade de sabores */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
                {sabores.map(s => (
                  <button
                    key={s.id}
                    onClick={() => openDetail(p)}
                    style={{
                      display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6,
                      padding: "12px 14px", borderRadius: 14, textAlign: "left",
                      background: "#fff", border: "1px solid #f0f0f0",
                      boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
                      cursor: "pointer", transition: "box-shadow 0.15s",
                    }}>
                    {s.imagem_url
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={s.imagem_url} alt={s.nome} loading="lazy" style={{ width: "100%", height: 80, objectFit: "cover", borderRadius: 8, display: "block" }} />
                      : null
                    }
                    <p style={{ fontSize: 13, fontWeight: 800, color: "#0f172a", margin: 0, lineHeight: 1.3 }}>{s.nome}</p>
                    {s.descricao && (
                      <p style={{
                        fontSize: 11, color: "#94a3b8", margin: 0, lineHeight: 1.4,
                        overflow: "hidden", display: "-webkit-box",
                        WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                      }}>{s.descricao}</p>
                    )}
                    <span style={{
                      fontSize: 10, fontWeight: 700, color: "#7c3aed",
                      background: "#f5f3ff", border: "1px solid #ddd6fe",
                      borderRadius: 999, padding: "2px 8px", marginTop: "auto",
                    }}>{p.nome}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </main>
      )}

      {/* ══ PRODUCTS ══ */}
      {catSel !== "__sabores__" && (
      <main style={{ maxWidth: 720, margin: "0 auto", padding: "16px 20px calc(120px + env(safe-area-inset-bottom, 0px))" }}>
        {produtosFiltrados.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "64px 0", gap: 12 }}>
            <div style={{ width: 64, height: 64, borderRadius: 20, background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Package size={26} style={{ color: "#cbd5e1" }} />
            </div>
            <p style={{ fontSize: 14, color: "#94a3b8", margin: 0, fontWeight: 600 }}>Nenhum produto nesta categoria</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {produtosFiltrados.map(p => {
              const qty = qtyOf(p.id);
              const customizable = hasCustomizations(p);
              return (
                <div key={p.id}
                  onClick={() => customizable ? openDetail(p) : undefined}
                  style={{
                    background: "#fff", borderRadius: 18, border: "1px solid #f0f0f0",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.04)", display: "flex", overflow: "hidden",
                    transition: "box-shadow 0.2s", cursor: customizable ? "pointer" : "default",
                  }}>
                  <div style={{ flex: 1, padding: "16px 16px 16px 18px", display: "flex", flexDirection: "column", justifyContent: "space-between", minWidth: 0 }}>
                    <div>
                      <p style={{ fontSize: 15, fontWeight: 800, color: "#0f172a", margin: "0 0 5px", letterSpacing: "-0.01em" }}>{p.nome}</p>
                      {p.descricao && (
                        <p style={{
                          fontSize: 12, color: "#94a3b8", margin: "0 0 8px", lineHeight: 1.5,
                          overflow: "hidden", display: "-webkit-box",
                          WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                        }}>
                          {p.descricao}
                        </p>
                      )}
                      {customizable && (
                        <p style={{ fontSize: 11, color: cor, fontWeight: 700, margin: "0 0 8px" }}>
                          {p.tipo === "pizza" ? "🍕 Escolha o tamanho e sabor" : "Personalizável"}
                        </p>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ fontSize: 17, fontWeight: 900, color: cor, letterSpacing: "-0.02em" }}>
                        {isAPartirDe(p) && <span style={{ fontSize: 11, fontWeight: 600 }}>A partir de </span>}
                        R${precoMinimo(p).toFixed(2)}
                      </span>
                      {customizable ? (
                        <button
                          onClick={e => { e.stopPropagation(); openDetail(p); }}
                          style={{
                            display: "flex", alignItems: "center", justifyContent: "center",
                            width: 34, height: 34, borderRadius: 10,
                            background: cor, color: "#fff", border: "none", cursor: "pointer",
                            boxShadow: `0 3px 10px ${cor}40`, flexShrink: 0,
                          }}>
                          <Plus size={16} />
                        </button>
                      ) : qty === 0 ? (
                        <button onClick={() => addSimple(p)}
                          style={{
                            display: "flex", alignItems: "center", justifyContent: "center",
                            width: 34, height: 34, borderRadius: 10,
                            background: cor, color: "#fff", border: "none", cursor: "pointer",
                            boxShadow: `0 3px 10px ${cor}40`, flexShrink: 0,
                          }}>
                          <Plus size={16} />
                        </button>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                          <button onClick={() => removeOne(buildCartKey(p.id))}
                            style={{ width: 30, height: 30, borderRadius: 8, background: "#f1f5f9", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Minus size={12} style={{ color: "#64748b" }} />
                          </button>
                          <span style={{ fontSize: 15, fontWeight: 900, color: "#0f172a", minWidth: 20, textAlign: "center" }}>{qty}</span>
                          <button onClick={() => addSimple(p)}
                            style={{ width: 30, height: 30, borderRadius: 8, background: cor, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Plus size={12} style={{ color: "#fff" }} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ width: 88, height: 88, flexShrink: 0, background: "#f8fafc", position: "relative", alignSelf: "center", borderRadius: 10, overflow: "hidden" }}>
                    {p.imagem_url
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={p.imagem_url} alt={p.nome} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                      : <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Package size={24} style={{ color: "#e2e8f0" }} />
                        </div>
                    }
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
      )}

      {/* ══ FLOATING CART BAR ══ */}
      {cart.length > 0 && !cartOpen && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 150, padding: "12px 20px calc(20px + env(safe-area-inset-bottom, 0px))", background: "linear-gradient(transparent, #f7f7f8 30%)" }}>
          <button onClick={() => setCartOpen(true)}
            style={{
              width: "100%", maxWidth: 720, margin: "0 auto", display: "flex",
              alignItems: "center", justifyContent: "space-between",
              padding: "15px 20px", borderRadius: 16,
              background: cor, color: "#fff", border: "none",
              fontSize: 15, fontWeight: 900, cursor: "pointer",
              boxShadow: `0 8px 28px ${cor}55`,
            }}>
            <span style={{ background: "rgba(255,255,255,0.25)", borderRadius: 8, padding: "2px 9px", fontSize: 13, fontWeight: 800 }}>
              {totalItems} item{totalItems > 1 ? "s" : ""}
            </span>
            <span>Ver carrinho</span>
            <span style={{ fontSize: 15, fontWeight: 900 }}>R${subtotal.toFixed(2)}</span>
          </button>
        </div>
      )}

      {/* ══ DRAWER ══ */}
      {cartOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex" }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
            onClick={() => setCartOpen(false)} />
          <div style={{
            marginLeft: "auto", width: "100%", maxWidth: 460,
            background: "#fff", height: "100%", overflowY: "auto",
            position: "relative", zIndex: 1, display: "flex", flexDirection: "column",
            boxShadow: "-12px 0 48px rgba(0,0,0,0.15)",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px", borderBottom: "1px solid #f0f0f0", flexShrink: 0 }}>
              <p style={{ fontSize: 17, fontWeight: 900, color: "#0f172a", margin: 0, letterSpacing: "-0.02em" }}>
                {step === "cart" ? `Meu pedido${totalItems > 0 ? ` (${totalItems})` : ""}` : step === "form" ? "Finalizar pedido" : "Pedido confirmado!"}
              </p>
              <button onClick={() => { setCartOpen(false); setStep("cart"); }}
                style={{ width: 32, height: 32, background: "#f1f5f9", border: "none", borderRadius: 10, cursor: "pointer", color: "#64748b", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <X size={15} />
              </button>
            </div>

            {/* STEP: cart */}
            {step === "cart" && (
              <div style={{ flex: 1, overflow: "auto" }}>
                <div style={{ padding: "16px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
                  {cart.map((item) => {
                    const desc = describeItem(item);
                    return (
                      <div key={item.cartKey} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                        <div style={{ width: 56, height: 56, borderRadius: 12, overflow: "hidden", flexShrink: 0, background: "#f8fafc" }}>
                          {item.produto.imagem_url
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={item.produto.imagem_url} alt={item.produto.nome} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            : <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}><Package size={20} style={{ color: "#e2e8f0" }} /></div>
                          }
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", margin: "0 0 2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.produto.nome}</p>
                          {desc && <p style={{ fontSize: 11, color: "#94a3b8", margin: "0 0 2px" }}>{desc}</p>}
                          <p style={{ fontSize: 13, fontWeight: 900, color: cor, margin: 0 }}>R${(item.precoUnit * item.qty).toFixed(2)}</p>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 7, flexShrink: 0 }}>
                          <button onClick={() => removeOne(item.cartKey)}
                            style={{ width: 28, height: 28, borderRadius: 8, background: "#f1f5f9", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Minus size={11} style={{ color: "#64748b" }} />
                          </button>
                          <span style={{ fontSize: 14, fontWeight: 800, color: "#0f172a", minWidth: 18, textAlign: "center" }}>{item.qty}</span>
                          <button onClick={() => {
                            if (hasCustomizations(item.produto)) openDetail(item.produto);
                            else addSimple(item.produto);
                          }}
                            style={{ width: 28, height: 28, borderRadius: 8, background: cor, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Plus size={11} style={{ color: "#fff" }} />
                          </button>
                        </div>
                        <button onClick={() => removeAll(item.cartKey)}
                          style={{ background: "none", border: "none", color: "#e2e8f0", cursor: "pointer", padding: 4, flexShrink: 0 }}>
                          <X size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>
                <div style={{ margin: "0 22px 4px", padding: "12px 16px", background: "#f8fafc", borderRadius: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: taxaEntrega > 0 ? 6 : 0 }}>
                    <span style={{ fontSize: 13, color: "#64748b" }}>Subtotal</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>R${subtotal.toFixed(2)}</span>
                  </div>
                  {taxaEntrega > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 13, color: "#64748b" }}>Entrega</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>R${taxaEntrega.toFixed(2)}</span>
                    </div>
                  )}
                </div>
                <div style={{ padding: "10px 22px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: "#64748b" }}>Total</span>
                  <span style={{ fontSize: 24, fontWeight: 900, color: "#0f172a", letterSpacing: "-0.03em" }}>R${subtotal.toFixed(2)}</span>
                </div>
              </div>
            )}

            {/* STEP: form */}
            {step === "form" && (
              <div style={{ flex: 1, overflow: "auto", padding: "20px 22px", display: "flex", flexDirection: "column", gap: 18 }}>
                <div>
                  <p style={{ fontSize: 11, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 10px" }}>Tipo de pedido</p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {(["entrega", "retirada"] as TipoPedido[]).map(t => (
                      <button key={t} onClick={() => setForm(f => ({ ...f, tipo: t }))}
                        style={{
                          padding: "13px 0", borderRadius: 14, border: `2px solid ${form.tipo === t ? cor : "#e2e8f0"}`,
                          background: form.tipo === t ? `${cor}08` : "#f8fafc",
                          color: form.tipo === t ? cor : "#64748b",
                          fontSize: 13, fontWeight: 800, cursor: "pointer", transition: "all 0.15s",
                          display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                        }}>
                        {t === "entrega" ? <Truck size={15} /> : <Store size={15} />}
                        {t === "entrega" ? "Entrega" : "Retirada"}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: 11, fontWeight: 800, color: "#94a3b8", display: "flex", alignItems: "center", gap: 5, marginBottom: 8, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                    <User size={11} /> Nome completo *
                  </label>
                  <input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                    placeholder="Seu nome"
                    style={{ width: "100%", padding: "12px 14px", borderRadius: 12, border: `1.5px solid ${form.nome.trim() ? cor + "60" : "#e2e8f0"}`, fontSize: 14, color: "#0f172a", background: "#f8fafc", outline: "none", transition: "border-color 0.15s", boxSizing: "border-box" }} />
                </div>

                <div>
                  <label style={{ fontSize: 11, fontWeight: 800, color: "#94a3b8", display: "flex", alignItems: "center", gap: 5, marginBottom: 8, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                    <Phone size={11} /> Telefone *
                  </label>
                  <input value={form.telefone} onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))}
                    placeholder="(00) 00000-0000" type="tel"
                    style={{ width: "100%", padding: "12px 14px", borderRadius: 12, border: `1.5px solid ${form.telefone.trim() ? cor + "60" : "#e2e8f0"}`, fontSize: 14, color: "#0f172a", background: "#f8fafc", outline: "none", transition: "border-color 0.15s", boxSizing: "border-box" }} />
                </div>

                {form.tipo === "entrega" && (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 800, color: "#94a3b8", display: "flex", alignItems: "center", gap: 5, marginBottom: 8, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                          <MapPin size={11} /> Rua *
                        </label>
                        <input value={form.rua} onChange={e => setForm(f => ({ ...f, rua: e.target.value }))}
                          placeholder="Nome da rua / avenida"
                          style={{ width: "100%", padding: "12px 14px", borderRadius: 12, border: `1.5px solid ${form.rua.trim() ? cor + "60" : "#e2e8f0"}`, fontSize: 14, color: "#0f172a", background: "#f8fafc", outline: "none", boxSizing: "border-box" }} />
                      </div>
                      <div style={{ minWidth: 90 }}>
                        <label style={{ fontSize: 11, fontWeight: 800, color: "#94a3b8", display: "block", marginBottom: 8, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                          Número *
                        </label>
                        <input value={form.numero} onChange={e => setForm(f => ({ ...f, numero: e.target.value }))}
                          placeholder="Nº"
                          style={{ width: "100%", padding: "12px 14px", borderRadius: 12, border: `1.5px solid ${form.numero.trim() ? cor + "60" : "#e2e8f0"}`, fontSize: 14, color: "#0f172a", background: "#f8fafc", outline: "none", boxSizing: "border-box" }} />
                      </div>
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 800, color: "#94a3b8", display: "block", marginBottom: 8, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                        Complemento (opcional)
                      </label>
                      <input value={form.complemento} onChange={e => setForm(f => ({ ...f, complemento: e.target.value }))}
                        placeholder="Apto, bloco, casa..."
                        style={{ width: "100%", padding: "12px 14px", borderRadius: 12, border: "1.5px solid #e2e8f0", fontSize: 14, color: "#0f172a", background: "#f8fafc", outline: "none", boxSizing: "border-box" }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 800, color: "#94a3b8", display: "block", marginBottom: 8, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                        Ponto de referência (opcional)
                      </label>
                      <input value={form.referencia} onChange={e => setForm(f => ({ ...f, referencia: e.target.value }))}
                        placeholder="Ex: próximo ao mercado, portão azul..."
                        style={{ width: "100%", padding: "12px 14px", borderRadius: 12, border: "1.5px solid #e2e8f0", fontSize: 14, color: "#0f172a", background: "#f8fafc", outline: "none", boxSizing: "border-box" }} />
                    </div>
                  </>
                )}

                {form.tipo === "entrega" && usaBairros && (
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 800, color: "#94a3b8", display: "flex", alignItems: "center", gap: 5, marginBottom: 8, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                      <MapPin size={11} /> Bairro *
                    </label>
                    <div style={{ position: "relative" }}>
                      <select value={form.bairro} onChange={e => setForm(f => ({ ...f, bairro: e.target.value }))}
                        style={{ width: "100%", padding: "12px 14px", borderRadius: 12, border: `1.5px solid ${form.bairro ? cor + "60" : "#e2e8f0"}`, fontSize: 14, color: form.bairro ? "#0f172a" : "#94a3b8", background: "#f8fafc", appearance: "none", boxSizing: "border-box" }}>
                        <option value="">Selecione o bairro…</option>
                        {bairros.map(b => (
                          <option key={b.id} value={b.bairro}>
                            {b.bairro}{b.taxa === 0 ? " — Grátis" : ` — R$${b.taxa.toFixed(2)}`}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={14} style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", color: "#94a3b8", pointerEvents: "none" }} />
                    </div>
                    {form.bairro && taxaEntrega > 0 && (
                      <p style={{ fontSize: 11, color: "#64748b", marginTop: 6, fontWeight: 700 }}>
                        Taxa: R${taxaEntrega.toFixed(2)}
                      </p>
                    )}
                  </div>
                )}

                <div>
                  <label style={{ fontSize: 11, fontWeight: 800, color: "#94a3b8", marginBottom: 8, display: "block", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                    Observação (opcional)
                  </label>
                  <textarea value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
                    placeholder="Ex: sem cebola, portão azul, bloco B…" rows={2}
                    style={{ width: "100%", padding: "12px 14px", borderRadius: 12, border: "1.5px solid #e2e8f0", fontSize: 14, color: "#0f172a", background: "#f8fafc", resize: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
                </div>

                <div>
                  <p style={{ fontSize: 11, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 10px" }}>Pagamento</p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {(Object.keys(PAG_LABELS) as Pagamento[]).map(k => (
                      <button key={k} onClick={() => setForm(f => ({ ...f, pagamento: k }))}
                        style={{
                          padding: "10px 0", borderRadius: 12,
                          border: `2px solid ${form.pagamento === k ? cor : "#e2e8f0"}`,
                          background: form.pagamento === k ? `${cor}08` : "#f8fafc",
                          color: form.pagamento === k ? cor : "#64748b",
                          fontSize: 12, fontWeight: 800, cursor: "pointer", transition: "all 0.15s",
                        }}>
                        {PAG_LABELS[k]}
                      </button>
                    ))}
                  </div>
                </div>

                {form.pagamento === "dinheiro" && (
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 800, color: "#94a3b8", marginBottom: 8, display: "block", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                      Troco para (opcional)
                    </label>
                    <input type="number" value={form.troco} onChange={e => setForm(f => ({ ...f, troco: e.target.value }))}
                      placeholder="Ex: 50.00"
                      style={{ width: "100%", padding: "12px 14px", borderRadius: 12, border: "1.5px solid #e2e8f0", fontSize: 14, color: "#0f172a", background: "#f8fafc", boxSizing: "border-box" }} />
                  </div>
                )}

                <div style={{ padding: "14px 16px", background: `${cor}08`, borderRadius: 14, border: `1px solid ${cor}25`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <p style={{ fontSize: 11, color: "#94a3b8", margin: "0 0 3px", fontWeight: 600 }}>Total do pedido</p>
                    <p style={{ fontSize: 22, fontWeight: 900, color: "#0f172a", margin: 0, letterSpacing: "-0.03em" }}>R${total.toFixed(2)}</p>
                  </div>
                  {form.tipo === "entrega" && taxaEntrega > 0 && (
                    <p style={{ fontSize: 11, color: "#64748b", margin: 0, textAlign: "right" }}>incl. R${taxaEntrega.toFixed(2)}<br />de entrega</p>
                  )}
                </div>
              </div>
            )}

            {/* STEP: success */}
            {step === "success" && (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 32px", gap: 20, textAlign: "center" }}>
                <div style={{ width: 88, height: 88, borderRadius: 28, display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #4ade80, #22c55e)", boxShadow: "0 8px 32px rgba(34,197,94,0.35)" }}>
                  <CheckCircle size={42} color="#fff" />
                </div>
                <div>
                  <h2 style={{ fontSize: 24, fontWeight: 900, color: "#0f172a", margin: "0 0 8px", letterSpacing: "-0.03em" }}>Pedido enviado!</h2>
                  <p style={{ fontSize: 14, color: "#64748b", margin: 0, lineHeight: 1.6 }}>
                    Recebemos seu pedido e já está na fila de preparo.<br />Aguarde a confirmação da loja.
                  </p>
                </div>
                {pedidoId && (
                  <div style={{ padding: "8px 20px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                    <p style={{ fontSize: 10, color: "#94a3b8", margin: "0 0 2px", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>Nº do pedido</p>
                    <p style={{ fontSize: 16, fontWeight: 900, color: "#0f172a", margin: 0, fontFamily: "monospace", letterSpacing: "0.1em" }}>
                      #{pedidoId.slice(0, 8).toUpperCase()}
                    </p>
                  </div>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>
                  {trackingToken && (
                    <Link href={`/pedido/${trackingToken}`}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                        padding: "13px 32px", borderRadius: 14,
                        background: cor, color: "#fff", textDecoration: "none",
                        fontSize: 14, fontWeight: 800,
                        boxShadow: `0 6px 20px ${cor}40`,
                      }}>
                      <Package size={16} /> Acompanhar pedido
                    </Link>
                  )}
                  <button onClick={() => { setCartOpen(false); setStep("cart"); }}
                    style={{ padding: "13px 32px", borderRadius: 14, background: "#f1f5f9", color: "#475569", border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                    Continuar comprando
                  </button>
                </div>
              </div>
            )}

            {step !== "success" && (
              <div style={{ padding: "14px 22px 22px", borderTop: "1px solid #f0f0f0", flexShrink: 0 }}>
                {step === "cart" && (
                  <button onClick={() => setStep("form")} disabled={cart.length === 0}
                    style={{
                      width: "100%", padding: "15px", borderRadius: 14,
                      background: cor, color: "#fff", border: "none",
                      fontSize: 15, fontWeight: 900, cursor: "pointer",
                      boxShadow: `0 6px 20px ${cor}45`,
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    }}>
                    Continuar <ChevronRight size={16} />
                  </button>
                )}
                {step === "form" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {submitError && (
                      <div style={{ padding: "10px 14px", borderRadius: 10, background: "#fef2f2", border: "1px solid #fecaca", fontSize: 13, color: "#dc2626", fontWeight: 600 }}>
                        {submitError}
                      </div>
                    )}
                  <div style={{ display: "flex", gap: 10 }}>
                    <button onClick={() => setStep("cart")}
                      style={{ flex: 1, padding: "14px", borderRadius: 13, background: "#f1f5f9", border: "1px solid #e2e8f0", color: "#64748b", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                      Voltar
                    </button>
                    <button onClick={handleSubmit}
                      disabled={submitting || !form.nome.trim() || !form.telefone.trim()
                        || (form.tipo === "entrega" && !form.rua.trim())
                        || (form.tipo === "entrega" && usaBairros && !form.bairro)}
                      style={{
                        flex: 2, padding: "14px", borderRadius: 13,
                        background: cor, color: "#fff", border: "none",
                        fontSize: 14, fontWeight: 900, cursor: "pointer",
                        boxShadow: `0 4px 16px ${cor}40`,
                        opacity: (submitting || !form.nome.trim() || !form.telefone.trim()) ? 0.65 : 1,
                        transition: "opacity 0.15s",
                      }}>
                      {submitting ? "Enviando…" : "Confirmar pedido"}
                    </button>
                  </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ PRODUCT DETAIL MODAL ══ */}
      {detailProduto && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", alignItems: "flex-end", justifyContent: "center", background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
          onClick={e => { if (e.target === e.currentTarget) setDetailProduto(null); }}>
          <div style={{
            width: "100%", maxWidth: 520,
            background: "#fff", borderRadius: "24px 24px 0 0",
            maxHeight: "92dvh", overflowY: "auto",
            boxShadow: "0 -12px 48px rgba(0,0,0,0.2)",
          }}>
            {/* Image */}
            <div style={{ position: "relative", aspectRatio: "1/1", background: "#f8fafc", overflow: "hidden" }}>
              {detailProduto.imagem_url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={detailProduto.imagem_url} alt={detailProduto.nome} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}><Package size={40} style={{ color: "#e2e8f0" }} /></div>
              }
              <button onClick={() => setDetailProduto(null)}
                style={{ position: "absolute", top: 12, right: 12, width: 32, height: 32, borderRadius: 10, background: "rgba(0,0,0,0.5)", border: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <X size={16} />
              </button>
            </div>

            <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 18 }}>
              {/* Nome + descrição */}
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 900, color: "#0f172a", margin: "0 0 6px", letterSpacing: "-0.02em" }}>{detailProduto.nome}</h2>
                {detailProduto.descricao && <p style={{ fontSize: 13, color: "#64748b", margin: 0, lineHeight: 1.5 }}>{detailProduto.descricao}</p>}
              </div>

              {/* Indicador de passos */}
              {detailSteps.length > 1 && (
                <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                  {detailSteps.map((s, i) => (
                    <div key={s} style={{
                      height: 5, borderRadius: 3,
                      width: i === detailStepIdx ? 22 : 5,
                      background: i <= detailStepIdx ? cor : "#e2e8f0",
                      transition: "all 0.25s",
                    }} />
                  ))}
                </div>
              )}

              {/* PASSO: Variação */}
              {detailStep === "variacao" && detailVars.length > 0 && (
                <div>
                  <p style={{ fontSize: 12, fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 10px" }}>Tamanho *</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {detailVars.map(v => (
                      <button key={v.id} onClick={() => { setDetailVariacao(v); setDetailSaboresSel([]); }}
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          padding: "13px 16px", borderRadius: 12,
                          border: `2px solid ${detailVariacao?.id === v.id ? cor : "#e2e8f0"}`,
                          background: detailVariacao?.id === v.id ? `${cor}08` : "#f8fafc",
                          cursor: "pointer", transition: "all 0.15s",
                        }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{
                            width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
                            border: `2px solid ${detailVariacao?.id === v.id ? cor : "#d1d5db"}`,
                            background: detailVariacao?.id === v.id ? cor : "#fff",
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}>
                            {detailVariacao?.id === v.id && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff" }} />}
                          </div>
                          <span style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>{v.nome}</span>
                          {maxSaboresVariacao(detailProduto, v) > 1 && (
                            <span style={{ fontSize: 11, color: "#94a3b8" }}>até {maxSaboresVariacao(detailProduto, v)} sab.</span>
                          )}
                        </div>
                        <span style={{ fontSize: 15, fontWeight: 900, color: cor }}>R${precoVariacao(detailProduto, v).toFixed(2)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* PASSO: Sabores — sabores do próprio produto, ou pool mesclável se ligado */}
              {detailStep === "sabores" && detailTemSaborStep && (
                <div>
                  {multiSaborStage === "collecting" && (
                    <div style={{ margin: "0 0 12px", padding: "8px 12px", borderRadius: 10, background: `${cor}12`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: cor }}>Unidade {unidadeAtual} de {detailQty}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b" }}>Escolha o sabor desta unidade</span>
                    </div>
                  )}
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
                    <p style={{ fontSize: 12, fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", margin: 0 }}>
                      {maxSabores > 1 ? `Sabores (até ${maxSabores})` : "Sabor *"}
                    </p>
                    <span style={{ fontSize: 12, fontWeight: 700, color: detailSaboresSel.length >= maxSabores ? cor : "#94a3b8" }}>
                      {detailSaboresSel.length}/{maxSabores} selecionado{detailSaboresSel.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  {/* Calculadora — sempre visível ACIMA da lista */}
                  {detailSaboresSel.length === 0 ? (
                    <div style={{ margin: "0 0 14px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: "12px 14px" }}>
                      <p style={{ fontSize: 11, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 6px" }}>
                        {modoCalculo === "proporcional" ? "⚖️ Proporcional" : "🏆 Maior valor"}
                      </p>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 12, color: "#94a3b8" }}>
                          {modoCalculo === "proporcional" ? "Média dos sabores escolhidos" : "Sabor mais caro"}
                        </span>
                        <span style={{ fontSize: 15, fontWeight: 900, color: "#cbd5e1" }}>R${detailProdutoPrecoBase.toFixed(2)}</span>
                      </div>
                    </div>
                  ) : (() => {
                    const tamanhoNome = detailVariacao?.nome;
                    const efetivos = detailSaboresSel.map(s => ({
                      sabor: s,
                      preco: precoDeSabor(s, detailProdutoPrecoBase, tamanhoNome),
                      usouPadrao: false,
                    }));
                    const soma = efetivos.reduce((a, b) => a + b.preco, 0);
                    const maiorPreco = Math.max(...efetivos.map(e => e.preco));
                    const precoFinal = modoCalculo === "proporcional" ? soma / efetivos.length : maiorPreco;
                    const allSamePrices = efetivos.length > 1 && efetivos.every(e => e.preco === efetivos[0].preco);
                    return (
                      <div style={{ margin: "0 0 14px", background: `${cor}08`, border: `1px solid ${cor}25`, borderRadius: 12, padding: "12px 14px" }}>
                        <p style={{ fontSize: 11, fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 8px" }}>
                          {modoCalculo === "proporcional" ? "⚖️ Proporcional" : "🏆 Maior valor"}
                        </p>
                        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                          {efetivos.map(({ sabor: s, preco }) => {
                            const isMaior = modoCalculo === "maior_valor" && preco === maiorPreco;
                            const n = efetivos.length;
                            return (
                              <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
                                <span style={{ color: isMaior ? "#0f172a" : "#64748b", fontWeight: isMaior ? 700 : 400 }}>
                                  {s.nome}
                                </span>
                                {modoCalculo === "proporcional" && n > 1 ? (
                                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                    <span style={{ fontSize: 11, color: "#94a3b8" }}>R${preco.toFixed(2)} ÷ {n}</span>
                                    <span style={{ fontWeight: 700, color: "#475569" }}>= R${(preco / n).toFixed(2)}</span>
                                  </span>
                                ) : (
                                  <span style={{ fontWeight: isMaior ? 900 : 600, color: isMaior ? cor : "#475569" }}>
                                    R${preco.toFixed(2)}{isMaior && n > 1 ? " ★" : ""}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                          <div style={{ borderTop: `1px solid ${cor}30`, marginTop: 6, paddingTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>Preço base</span>
                            <span style={{ fontSize: 16, fontWeight: 900, color: cor }}>R${precoFinal.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                  {/* Lista de sabores — agrupada por produto só quando mesclando */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    {detailGruposSabor.map(({ produto: p, sabores }) => (
                      <div key={p.id}>
                        {detailGruposSabor.length > 1 && (
                          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
                            <span style={{ fontSize: 10, fontWeight: 800, color: "#7c3aed", background: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: 999, padding: "2px 9px" }}>
                              {p.nome}
                            </span>
                            <div style={{ flex: 1, height: 1, background: "#f1f5f9" }} />
                          </div>
                        )}
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {sabores.map(s => {
                            const sel = detailSaboresSel.some(x => x.id === s.id);
                            const disabled = !sel && detailSaboresSel.length >= maxSabores;
                            return (
                              <button key={s.id}
                                onClick={() => {
                                  if (sel) setDetailSaboresSel(prev => prev.filter(x => x.id !== s.id));
                                  else if (!disabled) setDetailSaboresSel(prev => [...prev, s]);
                                }}
                                style={{
                                  display: "flex", alignItems: "center", gap: 12,
                                  padding: "11px 14px", borderRadius: 12, textAlign: "left",
                                  border: `2px solid ${sel ? cor : "#e2e8f0"}`,
                                  background: sel ? `${cor}08` : "#f8fafc",
                                  cursor: disabled ? "not-allowed" : "pointer",
                                  transition: "all 0.15s", opacity: disabled ? 0.4 : 1,
                                }}>
                                <div style={{
                                  width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                                  border: `2px solid ${sel ? cor : "#d1d5db"}`,
                                  background: sel ? cor : "#fff",
                                  display: "flex", alignItems: "center", justifyContent: "center",
                                }}>
                                  {sel && <div style={{ width: 8, height: 8, background: "#fff", borderRadius: 2 }} />}
                                </div>
                                <div style={{ flex: 1 }}>
                                  <p style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", margin: 0 }}>{s.nome}</p>
                                  {s.descricao && <p style={{ fontSize: 11, color: "#94a3b8", margin: "2px 0 0" }}>{s.descricao}</p>}
                                </div>
                                {(() => {
                                  const efetivo = precoDeSabor(s, detailProdutoPrecoBase, detailVariacao?.nome);
                                  const isBase = efetivo === detailProdutoPrecoBase;
                                  return (
                                    <span style={{ fontSize: 12, fontWeight: 800, color: isBase ? "#94a3b8" : cor, flexShrink: 0 }}>
                                      R${efetivo.toFixed(2)}
                                    </span>
                                  );
                                })()}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Botão flutuante quando sabores preenchidos */}
                  {detailSaboresSel.length >= maxSabores && (
                    <div style={{ position: "sticky", bottom: 0, left: 0, right: 0, paddingTop: 12, background: "linear-gradient(transparent, #fff 30%)" }}>
                      <button
                        onClick={() => {
                          if (multiSaborStage === "collecting") {
                            if (unidadeAtual < detailQty) avancarProximaUnidade();
                            else confirmMultiSabores();
                            return;
                          }
                          if (!detailIsLastStep) { setDetailStep(detailSteps[detailStepIdx + 1]); return; }
                          if (detailQty > 1 && detailTemSaborStep) { setMultiSaborStage("ask"); return; }
                          confirmDetail();
                        }}
                        style={{
                          width: "100%", padding: "15px", borderRadius: 14,
                          background: cor, color: "#fff", border: "none",
                          fontSize: 15, fontWeight: 900, cursor: "pointer",
                          boxShadow: `0 6px 20px ${cor}50`,
                          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                        }}>
                        {multiSaborStage === "collecting"
                          ? (unidadeAtual < detailQty ? `Próxima unidade (${unidadeAtual}/${detailQty}) →` : `Adicionar · R$${multiPrecoTotal.toFixed(2)}`)
                          : detailIsLastStep
                            ? `Adicionar · R$${detailPrecoTotal.toFixed(2)}`
                            : `Próximo → R$${detailPrecoBase.toFixed(2)}`}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* PASSO: Adicionais (opcionais) */}
              {detailStep === "adicionais" && detailAdds.length > 0 && (
                <div>
                  <p style={{ fontSize: 12, fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 10px" }}>
                    Adicionais
                    <span style={{ fontWeight: 500, marginLeft: 6, color: "#94a3b8", textTransform: "none" }}>— opcional</span>
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {detailAdds.map(a => {
                      const sel = detailAdicionaisSel.some(x => x.id === a.id);
                      return (
                        <button key={a.id}
                          onClick={() => setDetailAdicionaisSel(prev => sel ? prev.filter(x => x.id !== a.id) : [...prev, a])}
                          style={{
                            display: "flex", alignItems: "center", gap: 12,
                            padding: "11px 14px", borderRadius: 12,
                            border: `2px solid ${sel ? cor : "#e2e8f0"}`,
                            background: sel ? `${cor}08` : "#f8fafc",
                            cursor: "pointer", transition: "all 0.15s", textAlign: "left",
                          }}>
                          <div style={{
                            width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                            border: `2px solid ${sel ? cor : "#d1d5db"}`,
                            background: sel ? cor : "#fff",
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}>
                            {sel && <div style={{ width: 8, height: 8, background: "#fff", borderRadius: 2 }} />}
                          </div>
                          <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{a.nome}</span>
                          {a.preco > 0 && (
                            <span style={{ fontSize: 13, fontWeight: 800, color: cor }}>+R${a.preco.toFixed(2)}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Rodapé: Voltar / Qty / Próximo ou Adicionar */}
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {(detailStepIdx > 0 || multiSaborStage === "collecting") && (
                  <button
                    onClick={() => {
                      if (multiSaborStage === "collecting") voltarUnidadeAnterior();
                      else setDetailStep(detailSteps[detailStepIdx - 1]);
                    }}
                    style={{
                      padding: "14px 18px", borderRadius: 14,
                      background: "#f1f5f9", border: "none",
                      cursor: "pointer", color: "#64748b", fontWeight: 700, fontSize: 13, flexShrink: 0,
                    }}>
                    ← Voltar
                  </button>
                )}
                {detailIsLastStep && multiSaborStage === null && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#f8fafc", borderRadius: 12, padding: "8px 14px", border: "1px solid #e2e8f0", flexShrink: 0 }}>
                    <button onClick={() => setDetailQty(q => Math.max(1, q - 1))}
                      style={{ width: 30, height: 30, borderRadius: 8, background: "#fff", border: "1px solid #e2e8f0", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Minus size={14} style={{ color: "#64748b" }} />
                    </button>
                    <span style={{ fontSize: 17, fontWeight: 900, color: "#0f172a", minWidth: 20, textAlign: "center" }}>{detailQty}</span>
                    <button onClick={() => setDetailQty(q => q + 1)}
                      style={{ width: 30, height: 30, borderRadius: 8, background: cor, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Plus size={14} style={{ color: "#fff" }} />
                    </button>
                  </div>
                )}
                <button
                  onClick={() => {
                    if (multiSaborStage === "collecting") {
                      if (unidadeAtual < detailQty) avancarProximaUnidade();
                      else confirmMultiSabores();
                      return;
                    }
                    if (!detailIsLastStep) { setDetailStep(detailSteps[detailStepIdx + 1]); return; }
                    if (detailQty > 1 && detailTemSaborStep) { setMultiSaborStage("ask"); return; }
                    confirmDetail();
                  }}
                  disabled={!detailCanNext}
                  style={{
                    flex: 1, padding: "14px", borderRadius: 14,
                    background: detailCanNext ? cor : "#e2e8f0",
                    color: detailCanNext ? "#fff" : "#94a3b8",
                    border: "none", fontSize: 14, fontWeight: 900,
                    cursor: detailCanNext ? "pointer" : "not-allowed",
                    boxShadow: detailCanNext ? `0 6px 20px ${cor}40` : "none",
                    transition: "all 0.2s",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  }}>
                  {multiSaborStage === "collecting"
                    ? (unidadeAtual < detailQty ? `Próxima unidade (${unidadeAtual}/${detailQty}) →` : `Adicionar · R$${multiPrecoTotal.toFixed(2)}`)
                    : detailIsLastStep
                      ? `Adicionar · R$${detailPrecoTotal.toFixed(2)}`
                      : "Próximo →"}
                </button>
              </div>
            </div>
          </div>

          {/* Overlay: mesmo sabor ou sabor diferente por unidade */}
          {multiSaborStage === "ask" && detailProduto && (
            <div
              style={{ position: "fixed", inset: 0, zIndex: 320, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.55)", padding: 20 }}
              onClick={e => { if (e.target === e.currentTarget) setMultiSaborStage(null); }}>
              <div style={{ width: "100%", maxWidth: 380, background: "#fff", borderRadius: 20, padding: 24, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
                <p style={{ fontSize: 17, fontWeight: 900, color: "#0f172a", margin: "0 0 6px" }}>
                  {detailQty}x {detailProduto.nome}
                </p>
                <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 20px", lineHeight: 1.5 }}>
                  Todas com o mesmo sabor, ou você quer escolher um sabor diferente pra cada unidade?
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <button onClick={escolherMesmoSabor}
                    style={{ padding: "14px", borderRadius: 14, background: cor, color: "#fff", border: "none", fontSize: 14, fontWeight: 900, cursor: "pointer" }}>
                    Mesmo sabor pra todas
                  </button>
                  <button onClick={escolherSaborDiferente}
                    style={{ padding: "14px", borderRadius: 14, background: "#f8fafc", color: "#0f172a", border: "1.5px solid #e2e8f0", fontSize: 14, fontWeight: 900, cursor: "pointer" }}>
                    Sabor diferente em cada uma
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
