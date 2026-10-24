// Helpers puros da vitrine /explorar (sem React).
import type { Loja, EntregaBairro } from "./tipos";
import { normalizarBairro } from "@/lib/bairroCliente";

// ─── Paleta (tema claro premium) ────────────────────────────────────────────
export const C = {
  bg:       "#f7f7f5",
  surface:  "#ffffff",
  ink:      "#16130f",
  ink2:     "#4a453f",
  ink3:     "#6f6a63",
  line:     "rgba(22,19,15,0.08)",
  lineSoft: "rgba(22,19,15,0.05)",
  chip:     "#efeeea",
  red:      "#E4002B",
  redDark:  "#A80021",
  redSoft:  "#fdecef",
  yellow:   "#FFC72C",
  green:    "#0f7a43",
  greenSoft:"#e7f6ee",
  shadow1:  "0 1px 2px rgba(16,12,8,0.04), 0 2px 8px rgba(16,12,8,0.04)",
  shadow2:  "0 1px 2px rgba(16,12,8,0.04), 0 6px 16px rgba(16,12,8,0.06), 0 16px 40px rgba(16,12,8,0.06)",
  shadow3:  "0 2px 4px rgba(16,12,8,0.05), 0 12px 28px rgba(16,12,8,0.10), 0 28px 64px rgba(16,12,8,0.10)",
  serif:    '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Times New Roman", serif',
};

// ─── Formatação ─────────────────────────────────────────────────────────────
export function brl(v: number) {
  return `R$ ${v.toFixed(2).replace(".", ",")}`;
}

export function isGratis(taxa: number | null | undefined) {
  return !taxa || taxa <= 0;
}

export function textoTaxa(taxa: number | null | undefined) {
  return isGratis(taxa) ? "Entrega grátis" : `Entrega ${brl(taxa!)}`;
}

export function getInitial(nome: string) { return nome.trim().charAt(0).toUpperCase(); }

export function isNew(createdAt: string) {
  return Date.now() - new Date(createdAt).getTime() < 30 * 24 * 60 * 60 * 1000;
}

/** "30-45 min" → 30 (minutos). Sem valor → 45. */
export function minutosEntrega(t: string | null | undefined) {
  const n = t ? parseInt(t, 10) : NaN;
  return Number.isFinite(n) ? n : 45;
}

export function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

export function textoDistancia(km: number) {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1).replace(".", ",")} km`;
}

export function saudacao(d: Date) {
  const h = d.getHours();
  if (h >= 5 && h < 12) return "Bom dia";
  if (h >= 12 && h < 18) return "Boa tarde";
  return "Boa noite";
}

export function dataEditorial(d: Date) {
  return d.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
}

export function tempoRelativo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff) || diff < 0) return "recentemente";
  const min = Math.floor(diff / 60000);
  if (min < 60) return "há pouco";
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return "ontem";
  if (d < 30) return `há ${d} dias`;
  const m = Math.floor(d / 30);
  return m === 1 ? "há 1 mês" : `há ${m} meses`;
}

export function normalizar(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// ─── Horário de funcionamento (texto livre do painel) ───────────────────────
// Exemplos reais: "Sex: 18:30 às 23:30", "Sáb: 17:30 às 00h",
// "Seg a Sex: 11h às 22h", "todos os dias ... das 16h30 às 23h30".
// Parser tolerante: o que não entender é ignorado (sem horário → só aberto/fechado).

export interface Intervalo { dia: number; abre: number; fecha: number } // minutos no dia; fecha pode passar de 1440

const DIA_RE = /\b(domingo|dom|segunda|seg|terca|ter|quarta|qua|quinta|qui|sexta|sex|sabado|sab)(?:-feira)?\b\.?/g;
const DIA_IDX: Record<string, number> = {
  dom: 0, domingo: 0, seg: 1, segunda: 1, ter: 2, terca: 2, qua: 3, quarta: 3,
  qui: 4, quinta: 4, sex: 5, sexta: 5, sab: 6, sabado: 6,
};
const TODOS = [0, 1, 2, 3, 4, 5, 6];

function diasDaLinha(l: string): number[] | null {
  if (/todos os dias|diariamente|toda a semana|todo dia/.test(l)) return TODOS;
  const toks: { d: number; ini: number; fim: number }[] = [];
  for (const m of l.matchAll(DIA_RE)) toks.push({ d: DIA_IDX[m[1]], ini: m.index!, fim: m.index! + m[0].length });
  if (!toks.length) return null;
  const dias = new Set<number>();
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i], n = toks[i + 1];
    if (n && /^\s*(a|ate|-|–|à)\s*$/.test(l.slice(t.fim, n.ini))) {
      if (t.d === n.d) return TODOS; // "segunda a segunda"
      let d = t.d;
      for (let k = 0; k < 8; k++) { dias.add(d); if (d === n.d) break; d = (d + 1) % 7; }
      i++;
    } else {
      dias.add(t.d);
    }
  }
  return [...dias];
}

function horasDaLinha(l: string): number[] {
  const out: number[] = [];
  for (const m of l.matchAll(/\b(\d{1,2})\s*(?::\s*(\d{2})|h\s*(\d{2})?)/g)) {
    const h = parseInt(m[1], 10), mi = parseInt(m[2] ?? m[3] ?? "0", 10);
    if (h <= 24 && mi < 60) out.push(h * 60 + mi);
  }
  return out;
}

export function parseHorario(txt: string | null | undefined): Intervalo[] {
  if (!txt) return [];
  const out: Intervalo[] = [];
  let ctx: number[] | null = null;
  for (const bruta of txt.split(/\n|;/)) {
    const l = normalizar(bruta);
    const dias = diasDaLinha(l);
    if (dias) ctx = dias;
    if (/fechad/.test(l) && dias && !horasDaLinha(l).length) continue;
    const hs = horasDaLinha(l);
    for (let i = 0; i + 1 < hs.length; i += 2) {
      const abre = hs[i];
      let fecha = hs[i + 1];
      if (fecha <= abre) fecha += 1440; // passa da meia-noite ("17:30 às 00h")
      for (const d of (dias ?? ctx ?? TODOS)) out.push({ dia: d, abre, fecha });
    }
  }
  return out;
}

const DIA_CURTO = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function hhmm(min: number) {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export interface StatusLoja {
  aberto: boolean;
  /** Texto curto: "Aberto · fecha às 23:30", "Fechado · abre às 18:00"… */
  texto: string;
  /** Minutos até abrir (só quando fechado e com horário conhecido). */
  abreEmMin: number | null;
}

/**
 * O interruptor "aberto" do painel é a verdade (é o que a loja usa para
 * aceitar pedidos); o horário só complementa com "fecha às"/"abre às".
 * Sem `agora` (antes de hidratar) devolve só Aberto/Fechado.
 */
export function statusLoja(loja: Loja, agora: Date | null): StatusLoja {
  const aberto = loja.config?.aberto !== false;
  const sched = agora ? parseHorario(loja.config?.horario_funcionamento) : [];
  if (!agora || !sched.length) {
    return { aberto, texto: aberto ? "Aberto agora" : "Fechado no momento", abreEmMin: null };
  }
  const SEMANA = 7 * 1440;
  const w = agora.getDay() * 1440 + agora.getHours() * 60 + agora.getMinutes();
  if (aberto) {
    for (const it of sched) {
      const ini = it.dia * 1440 + it.abre, fim = it.dia * 1440 + it.fecha;
      for (const ww of [w, w + SEMANA]) {
        if (ww >= ini && ww < fim) return { aberto, texto: `Aberto · fecha às ${hhmm(it.fecha)}`, abreEmMin: null };
      }
    }
    return { aberto, texto: "Aberto agora", abreEmMin: null };
  }
  let melhor: { diff: number; it: Intervalo } | null = null;
  for (const it of sched) {
    let diff = it.dia * 1440 + it.abre - w;
    if (diff <= 0) diff += SEMANA;
    if (!melhor || diff < melhor.diff) melhor = { diff, it };
  }
  if (!melhor) return { aberto, texto: "Fechado no momento", abreEmMin: null };
  const hoje = agora.getDay();
  const quando =
    melhor.it.dia === hoje && melhor.diff < 1440 ? `abre às ${hhmm(melhor.it.abre)}` :
    melhor.it.dia === (hoje + 1) % 7 && melhor.diff < 2880 ? `abre amanhã às ${hhmm(melhor.it.abre)}` :
    `abre ${DIA_CURTO[melhor.it.dia]} às ${hhmm(melhor.it.abre)}`;
  return { aberto, texto: `Fechado · ${quando}`, abreEmMin: melhor.diff };
}

// ─── Categorias com foto (Unsplash, licença livre, hotlink) ─────────────────
// Cada URL foi conferida (HTTP 200, image/jpeg). O filtro casa a categoria
// com a categoria da loja, nome/descrição e as categorias que dominam o
// cardápio (explorar_extras quase nunca está preenchido).

const UNS = (id: string) => `https://images.unsplash.com/photo-${id}?w=240&h=240&fit=crop&auto=format&q=70`;

interface CatInfo { foto: string; chaves: string[] }

const CAT_INFO: Record<string, CatInfo> = {
  pizza:      { foto: UNS("1565299624946-b28f40a0ae38"), chaves: ["pizza", "pizzaria"] },
  hamburguer: { foto: UNS("1568901346375-23c9450c58cd"), chaves: ["hamburg", "burger", "burguer", "smash"] },
  lanches:    { foto: UNS("1573080496219-bb080dd4f877"), chaves: ["lanche", "porcao", "porcoes", "pastel", "hot dog", "cachorro"] },
  marmitas:   { foto: UNS("1547592180-85f173990554"),    chaves: ["marmita", "quentinha", "executivo", "prato feito"] },
  nordestina: { foto: UNS("1585937421612-70a008356fbe"), chaves: ["nordest", "arrumadinho", "pirao", "baiao", "cuscuz", "tapioca"] },
  churrasco:  { foto: UNS("1555939594-58d7cb561ad1"),    chaves: ["churrasc", "espetinho", "espeto", "carne", "grelhad"] },
  japones:    { foto: UNS("1579871494447-9811cf80d66c"), chaves: ["japon", "sushi", "temaki", "sashimi", "oriental"] },
  massas:     { foto: UNS("1621996346565-e3dbc646d9a9"), chaves: ["massa", "macarr", "lasanha", "parmegian", "italian"] },
  bebidas:    { foto: UNS("1551024709-8f23befc6f87"),    chaves: ["bebida", "drink", "copao", "suco", "cervej", "adega"] },
  sobremesas: { foto: UNS("1551024601-bec78aea704b"),    chaves: ["sobremesa", "doce", "acai", "sorvete", "bolo", "confeitar"] },
  cafeteria:  { foto: UNS("1509042239860-f550ce710b93"), chaves: ["cafe", "cafeteria", "padaria"] },
  saudavel:   { foto: UNS("1512621776951-a57141f2eefd"), chaves: ["saudav", "salada", "fit", "natural", "vegan", "poke"] },
  mercado:    { foto: UNS("1542838132-92c53300491e"),    chaves: ["mercado", "mercearia", "hortifruti", "conveniencia"] },
};

export const FOTO_TODOS = UNS("1504674900247-0877df9cc836");
const FOTO_GENERICA = UNS("1414235077428-338989a2e8c0");

const ALIAS: Record<string, string> = {
  pizzas: "pizza", hamburgueres: "hamburguer", burger: "hamburguer", lanche: "lanches",
  marmita: "marmitas", "comida nordestina": "nordestina", nordeste: "nordestina",
  japonesa: "japones", massa: "massas", bebida: "bebidas", sobremesa: "sobremesas",
  cafeterias: "cafeteria", cafe: "cafeteria", saudaveis: "saudavel", fitness: "saudavel",
  mercados: "mercado",
};

function infoCategoria(nome: string): CatInfo {
  const n = normalizar(nome).trim();
  const key = CAT_INFO[n] ? n : ALIAS[n];
  if (key && CAT_INFO[key]) return CAT_INFO[key];
  // categoria criada pelo admin: usa o próprio nome como chave
  const viaChave = Object.values(CAT_INFO).find(c => c.chaves.some(k => n.includes(k)));
  return { foto: viaChave?.foto ?? FOTO_GENERICA, chaves: [n, ...(viaChave?.chaves ?? [])] };
}

export function fotoCategoria(nome: string) { return infoCategoria(nome).foto; }

export const CATEGORIAS_PADRAO: { id: string; nome: string }[] = [
  { id: "pizza",      nome: "Pizza" },
  { id: "hamburguer", nome: "Hambúrguer" },
  { id: "lanches",    nome: "Lanches" },
  { id: "marmitas",   nome: "Marmitas" },
  { id: "nordestina", nome: "Nordestina" },
  { id: "churrasco",  nome: "Churrasco" },
  { id: "japones",    nome: "Japonês" },
  { id: "massas",     nome: "Massas" },
  { id: "bebidas",    nome: "Bebidas" },
  { id: "sobremesas", nome: "Sobremesas" },
  { id: "cafeteria",  nome: "Cafeteria" },
  { id: "saudavel",   nome: "Saudável" },
  { id: "mercado",    nome: "Mercado" },
];

export function lojaNaCategoria(loja: Loja, categoria: string): boolean {
  if (loja.categoria && normalizar(loja.categoria) === normalizar(categoria)) return true;
  const { chaves } = infoCategoria(categoria);
  const texto = normalizar([
    loja.nome, loja.categoria ?? "", loja.config?.descricao ?? "", ...(loja.tagsPrincipais ?? []),
  ].join(" | "));
  return chaves.some(k => texto.includes(k));
}

/** O prato (nome + categoria do cardápio) é dessa categoria da vitrine? */
export function pratoNaCategoria(nome: string, categoriaProduto: string | null, categoria: string): boolean {
  const { chaves } = infoCategoria(categoria);
  const texto = normalizar(`${nome} | ${categoriaProduto ?? ""}`);
  return chaves.some(k => texto.includes(k));
}

export function lojaCasaBusca(loja: Loja, q: string): boolean {
  const n = normalizar(q).trim();
  if (!n) return true;
  const texto = normalizar([
    loja.nome, loja.categoria ?? "", loja.config?.descricao ?? "", ...(loja.catsProdutos ?? []),
  ].join(" | "));
  return n.split(/\s+/).every(p => texto.includes(p));
}

// ─── Entrega no bairro do cliente ───────────────────────────────────────────

/**
 * Como a loja entrega no bairro escolhido (já normalizado com
 * normalizarBairro). null = a loja tem lista de bairros e esse não está nela.
 * Loja sem lista (taxa fixa) sempre "entrega", com aviso no card.
 */
export function entregaNoBairro(loja: Loja, bairroNorm: string, bairroNome: string): EntregaBairro | null {
  const lista = loja.bairros ?? [];
  if (!lista.length) return { bairro: bairroNome, taxa: loja.config?.taxa_entrega ?? null, fixa: true };
  let taxa: number | null = null;
  for (const b of lista) {
    if (normalizarBairro(b.bairro) === bairroNorm && (taxa === null || b.taxa < taxa)) taxa = b.taxa;
  }
  return taxa === null ? null : { bairro: bairroNome, taxa, fixa: false };
}

/** Bairros cadastrados pelas lojas, sem repetição (grafia mais comum), em ordem alfabética. */
export function bairrosDasLojas(lojas: Loja[]): string[] {
  const porChave = new Map<string, Map<string, number>>();
  for (const l of lojas) {
    for (const b of l.bairros ?? []) {
      const k = normalizarBairro(b.bairro);
      if (!k) continue;
      const grafias = porChave.get(k) ?? new Map<string, number>();
      grafias.set(b.bairro, (grafias.get(b.bairro) ?? 0) + 1);
      porChave.set(k, grafias);
    }
  }
  return [...porChave.values()]
    .map(g => [...g.entries()].sort((a, b) => b[1] - a[1])[0][0])
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/** Gradiente elegante a partir da cor da loja (fallback de banner). */
export function gradienteLoja(cor: string | null | undefined) {
  const c = cor && /^#[0-9a-f]{6}$/i.test(cor) ? cor : C.red;
  return `radial-gradient(120% 140% at 0% 0%, ${c} 0%, ${c}e6 38%, ${c}99 70%, #1a1512 140%)`;
}
