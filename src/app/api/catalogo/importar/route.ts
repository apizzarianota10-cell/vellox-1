import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { lerImagemComIA, ErroLeitura } from "@/lib/lerImagemIA";

// Leitura de imagem pela IA pode levar alguns segundos a mais que o padrão.
export const maxDuration = 60;

interface ProdutoExtraido {
  nome: string;
  preco: number;
  descricao: string;
  categoria: string;
}

const SCHEMA = {
  type: "object",
  properties: {
    produtos: {
      type: "array",
      items: {
        type: "object",
        properties: {
          nome: { type: "string" },
          preco: { type: "number" },
          descricao: { type: "string" },
          categoria: { type: "string" },
        },
        required: ["nome", "preco", "descricao", "categoria"],
        additionalProperties: false,
      },
    },
  },
  required: ["produtos"],
  additionalProperties: false,
};

const INSTRUCOES = `Esta é a foto de um cardápio de restaurante. Extraia TODOS os produtos visíveis, sem pular nenhum.
Para cada produto:
- nome: nome do produto como está escrito.
- preco: preço em reais como número (ex.: 29.9). Se não houver preço, use 0.
- descricao: descrição ou ingredientes, se houver; senão "".
- categoria: a seção do cardápio onde o produto aparece (ex.: "Executivos", "Bebidas"). Se não houver seção visível, escolha a mais adequada: Lanches, Bebidas, Combos, Sobremesas, Entradas, Pizzas, Porções, Pratos ou Outros.
Quando um item lista variações com preços diferentes (ex.: "Lasanha carne ou frango R$25"), crie um produto para cada variação.`;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 403 });

  let file: File | null = null;
  try {
    file = (await req.formData()).get("imagem") as File | null;
  } catch {
    return NextResponse.json({ error: "Envio inválido. Tente de novo." }, { status: 400 });
  }
  if (!file) return NextResponse.json({ error: "Nenhuma imagem enviada" }, { status: 400 });

  try {
    const { produtos: brutos } = await lerImagemComIA<{ produtos: ProdutoExtraido[] }>(file, INSTRUCOES, SCHEMA);
    const produtos = brutos
      .filter(p => p.nome?.trim())
      .map(p => ({
        nome: p.nome.trim(),
        preco: Number.isFinite(p.preco) && p.preco > 0 ? Math.round(p.preco * 100) / 100 : 0,
        descricao: (p.descricao ?? "").trim(),
        categoria: (p.categoria ?? "").trim() || "Outros",
      }));
    if (produtos.length === 0) return NextResponse.json({ error: "Nenhum produto encontrado na imagem." }, { status: 422 });
    return NextResponse.json({ produtos });
  } catch (err) {
    if (err instanceof ErroLeitura) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[catalogo/importar]", err);
    return NextResponse.json({ error: "Erro inesperado ao ler a imagem. Tente de novo." }, { status: 500 });
  }
}
