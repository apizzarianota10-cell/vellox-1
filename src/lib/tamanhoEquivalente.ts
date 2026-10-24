// Preço de um sabor de OUTRO produto no tamanho escolhido (meio a meio entre
// produtos vinculados). Cada produto costuma nomear o tamanho de um jeito
// ("PIZZA G", "ESPECIAL G", "PREMIUM G"); comparar o nome exato falhava e o
// preço caía no valor base (o da P), deixando a pizza mais barata que o certo.
//
// Ordem de busca: nome igual → mesma "letra" de tamanho (P/M/G/GG...) →
// mesma posição na lista de tamanhos (quando os dois têm a mesma quantidade).
// Sem correspondência: null (quem chama usa o preço do tamanho escolhido).
import type { Produto } from "@/types";

const SINONIMOS: Record<string, string> = {
  PEQUENA: "P", PEQUENO: "P", MEDIA: "M", MEDIO: "M", GRANDE: "G",
  BROTINHO: "BROTO", FAMILIAR: "FAMILIA",
};
const TOKENS = new Set(["PP", "P", "M", "G", "GG", "XG", "EG", "XGG", "BROTO", "FAMILIA", "GIGANTE", "INDIVIDUAL", "MINI"]);

function normalizar(nome: string): string {
  return nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim().replace(/\s+/g, " ");
}

/** "PREMIUM G" → "G"; "Pizza Grande" → "G"; "8 fatias" → "8F"; "35cm" → "35CM". */
export function chaveTamanho(nome: string): string | null {
  const n = normalizar(nome);
  const fatias = n.match(/(\d+)\s*(FATIAS?|PEDACOS?)/);
  if (fatias) return fatias[1] + "F";
  const cm = n.match(/(\d+)\s*CM\b/);
  if (cm) return cm[1] + "CM";
  const tokens = n.split(/[^A-Z0-9]+/).filter(Boolean).map(t => SINONIMOS[t] ?? t);
  for (let i = tokens.length - 1; i >= 0; i--) if (TOKENS.has(tokens[i])) return tokens[i];
  return null;
}

type Tam = { nome: string; preco: number; ordem?: number; ativo?: boolean };

function tamanhosDe(p: Produto): Tam[] {
  const cp = p.categoria_preco?.tamanhos;
  if (cp && cp.length > 0) return [...cp].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
  return (p.produto_variacoes ?? []).filter(v => v.ativo).sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
}

/**
 * Preço do produto `fonte` no tamanho `nome` escolhido em `origem` (o produto
 * que o cliente abriu). Retorna null se não achar tamanho equivalente.
 */
export function precoNoTamanhoEquivalente(fonte: Produto, nome: string, origem?: Produto | null): number | null {
  const lista = tamanhosDe(fonte);
  if (lista.length === 0) return null;
  const alvo = normalizar(nome);

  const exato = lista.find(t => normalizar(t.nome) === alvo);
  if (exato && exato.preco > 0) return exato.preco;

  const chave = chaveTamanho(nome);
  if (chave) {
    const mesmos = lista.filter(t => chaveTamanho(t.nome) === chave);
    if (mesmos.length === 1 && mesmos[0].preco > 0) return mesmos[0].preco;
  }

  if (origem) {
    const listaOrigem = tamanhosDe(origem);
    const idx = listaOrigem.findIndex(t => normalizar(t.nome) === alvo);
    if (idx >= 0 && listaOrigem.length === lista.length && lista[idx].preco > 0) return lista[idx].preco;
  }
  return null;
}
