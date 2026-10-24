// Bairro de entrega escolhido pelo cliente no /explorar ("Entrega no meu
// bairro?"). Fica salvo neste aparelho e a página da loja usa para
// pré-selecionar o bairro no checkout.

export const BAIRRO_KEY = "vellox-bairro-entrega";

/** Compara bairros sem acento, caixa, pontuação ou espaços duplicados. */
export function normalizarBairro(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function lerBairroSalvo(): string | null {
  try {
    const v = JSON.parse(localStorage.getItem(BAIRRO_KEY) ?? "null");
    const nome = typeof v?.nome === "string" ? v.nome.trim() : "";
    return nome ? nome.slice(0, 80) : null;
  } catch {
    return null;
  }
}

export function salvarBairro(nome: string | null) {
  try {
    if (nome && nome.trim()) localStorage.setItem(BAIRRO_KEY, JSON.stringify({ nome: nome.trim().slice(0, 80), em: new Date().toISOString() }));
    else localStorage.removeItem(BAIRRO_KEY);
  } catch { /* sem storage (aba anônima etc.) */ }
}
