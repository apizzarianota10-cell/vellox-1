import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { geocodificarCidade } from "@/lib/geocodePedido";

// GET /api/geocode/cidade?cidade=Palmares&uf=PE
// Centro da cidade (Nominatim/OSM) para centralizar o mapa do painel.
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const cidade = (req.nextUrl.searchParams.get("cidade") ?? "").trim().slice(0, 80);
  const uf     = (req.nextUrl.searchParams.get("uf") ?? "").trim().slice(0, 2).toUpperCase();
  if (!cidade || !/^[A-Z]{2}$/.test(uf)) {
    return NextResponse.json({ error: "Informe cidade e UF" }, { status: 400 });
  }

  const coord = await geocodificarCidade(cidade, uf);
  if (!coord) return NextResponse.json({ error: "Cidade não encontrada" }, { status: 404 });
  return NextResponse.json(coord);
}
