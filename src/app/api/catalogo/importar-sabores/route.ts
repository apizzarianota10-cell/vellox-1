import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { lerImagemComIA, ErroLeitura } from "@/lib/lerImagemIA";

// Leitura de imagem pela IA pode levar alguns segundos a mais que o padrão.
export const maxDuration = 60;

interface SaborExtraido {
  nome: string;
  descricao: string;
}

const SCHEMA = {
  type: "object",
  properties: {
    sabores: {
      type: "array",
      items: {
        type: "object",
        properties: { nome: { type: "string" }, descricao: { type: "string" } },
        required: ["nome", "descricao"],
        additionalProperties: false,
      },
    },
  },
  required: ["sabores"],
  additionalProperties: false,
};

const INSTRUCOES = `Esta imagem é um cardápio ou lista. Extraia TODOS os sabores ou opções visíveis.
Para cada um:
- nome: nome do sabor (ex.: "Calabresa").
- descricao: ingredientes ou descrição breve, se houver; senão "".`;

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
    const { sabores: brutos } = await lerImagemComIA<{ sabores: SaborExtraido[] }>(file, INSTRUCOES, SCHEMA);
    const sabores = brutos
      .filter(s => s.nome?.trim())
      .map(s => ({ nome: s.nome.trim(), descricao: (s.descricao ?? "").trim() }));
    if (sabores.length === 0) return NextResponse.json({ error: "Nenhum sabor encontrado na imagem." }, { status: 422 });
    return NextResponse.json({ sabores });
  } catch (err) {
    if (err instanceof ErroLeitura) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[catalogo/importar-sabores]", err);
    return NextResponse.json({ error: "Erro inesperado ao ler a imagem. Tente de novo." }, { status: 500 });
  }
}
