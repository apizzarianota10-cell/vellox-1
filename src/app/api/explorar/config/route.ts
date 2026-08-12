import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const revalidate = 60;

const DEFAULTS = {
  badge_text:     "DESCUBRA · PEÇA · RECEBA",
  hero_titulo:    "Peça comida no",
  hero_destaque:  "seu jeito",
  hero_subtitulo: "Descubra restaurantes incríveis e peça com entrega rápida",
  accent_color:   "#FF6A00",
};

export async function GET() {
  try {
    const supabase = await createClient();
    const { data } = await supabase.from("explorar_config").select("*").eq("id", 1).single();
    return NextResponse.json({ config: data ?? DEFAULTS });
  } catch {
    return NextResponse.json({ config: DEFAULTS });
  }
}
