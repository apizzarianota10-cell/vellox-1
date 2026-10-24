// Compartilhar um prato da loja (WhatsApp / folha de compartilhamento do celular).
// O link profundo /loja/<slug>?produto=<id> abre a loja já com o detalhe do
// produto, e o generateMetadata da página gera a prévia com a foto do prato.

export function brlTexto(v: number) {
  return `R$ ${v.toFixed(2).replace(".", ",")}`;
}

export function linkDoProduto(produtoId: string): string {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}?produto=${encodeURIComponent(produtoId)}`;
}

export function textoCompartilhar(nome: string, preco: number, loja: string, aPartirDe: boolean): string {
  const valor = preco > 0 ? ` por ${aPartirDe ? "a partir de " : ""}${brlTexto(preco)}` : "";
  return `Olha que delícia: ${nome}${valor} na ${loja} 👇`;
}

/**
 * No celular usa a folha nativa (navigator.share) — o WhatsApp aparece lá;
 * no computador (ou se a folha falhar) abre o wa.me com o texto pronto.
 */
export async function compartilharProduto(opts: { produtoId: string; nome: string; preco: number; loja: string; aPartirDe: boolean }) {
  const url = linkDoProduto(opts.produtoId);
  const texto = textoCompartilhar(opts.nome, opts.preco, opts.loja, opts.aPartirDe);
  const celular = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
  if (celular && typeof navigator.share === "function") {
    try {
      await navigator.share({ title: opts.nome, text: texto, url });
      return;
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return; // cliente fechou a folha
    }
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(`${texto}\n${url}`)}`, "_blank", "noopener,noreferrer");
}
