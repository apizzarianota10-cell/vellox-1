import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: empresa } = await supabase
    .from("empresas")
    .select("id, nome")
    .eq("id", user.id)
    .single();

  if (!empresa) return NextResponse.json({ error: "Empresa nao encontrada" }, { status: 404 });

  const config = {
    supabase_url:      process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabase_anon_key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    empresa_id:        empresa.id,
    empresa_nome:      empresa.nome,
    printer_name:      "",
    tamanho_papel:     "80mm",
  };

  return new NextResponse(JSON.stringify(config, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="config.json"',
    },
  });
}
