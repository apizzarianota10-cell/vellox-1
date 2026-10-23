import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { lerImagemComIA, ErroLeitura } from "@/lib/lerImagemIA";

// Leitura de imagem pela IA pode levar alguns segundos a mais que o padrão.
export const maxDuration = 60;

interface AdicionalExtraido {
  nome: string;
  preco: number;
  obrigatorio: boolean;
}

const SCHEMA = {
  type: "object",
  properties: {
    adicionais: {
      type: "array",
      items: {
        type: "object",
        properties: {
          nome: { type: "string" },
          preco: { type: "number" },
          obrigatorio: { type: "boolean" },
        },
        required: ["nome", "preco", "obrigatorio"],
        additionalProperties: false,
      },
    },
  },
  required: ["adicionais"],
  additionalProperties: false,
};

const INSTRUCOES = `Extraia desta imagem TODOS os itens extras/adicionais visíveis (bordas recheadas, ingredientes extras, complementos, acompanhamentos etc.).
Para cada item:
- nome: nome do item.
- preco: preço em reais como número (ex.: 5). Se não houver preço, use 0.
- obrigatorio: true só se a imagem disser que é obrigatório; senão false.`;

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
    const { adicionais: brutos } = await lerImagemComIA<{ adicionais: AdicionalExtraido[] }>(file, INSTRUCOES, SCHEMA);
    const adicionais = brutos
      .filter(a => a.nome?.trim())
      .map(a => ({
        nome: a.nome.trim(),
        preco: Number.isFinite(a.preco) && a.preco > 0 ? Math.round(a.preco * 100) / 100 : 0,
        obrigatorio: Boolean(a.obrigatorio),
      }));
    if (adicionais.length === 0) return NextResponse.json({ error: "Nenhum adicional encontrado na imagem." }, { status: 422 });
    return NextResponse.json({ adicionais });
  } catch (err) {
    if (err instanceof ErroLeitura) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[catalogo/importar-adicionais]", err);
    return NextResponse.json({ error: "Erro inesperado ao ler a imagem. Tente de novo." }, { status: 500 });
  }
}
