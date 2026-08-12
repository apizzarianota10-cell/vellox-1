import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

const GOD_EMAIL = process.env.GOD_EMAIL;

async function checkGod() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.email === GOD_EMAIL ? user : null;
}

const DEFAULTS = {
  badge_text:     "DESCUBRA · PEÇA · RECEBA",
  hero_titulo:    "Peça comida no",
  hero_destaque:  "seu jeito",
  hero_subtitulo: "Descubra restaurantes incríveis e peça com entrega rápida",
  accent_color:   "#FF6A00",
};

export async function GET() {
  const god = await checkGod();
  if (!god) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const admin = createAdminClient();
    const { data } = await admin.from("explorar_config").select("*").eq("id", 1).single();
    return NextResponse.json({ config: data ?? DEFAULTS });
  } catch {
    return NextResponse.json({ config: DEFAULTS });
  }
}

export async function PATCH(req: Request) {
  const god = await checkGod();
  if (!god) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { badge_text, hero_titulo, hero_destaque, hero_subtitulo, accent_color } = body;

  try {
    const admin = createAdminClient();
    const { error } = await admin.from("explorar_config").upsert({
      id: 1,
      badge_text:     badge_text     ?? DEFAULTS.badge_text,
      hero_titulo:    hero_titulo    ?? DEFAULTS.hero_titulo,
      hero_destaque:  hero_destaque  ?? DEFAULTS.hero_destaque,
      hero_subtitulo: hero_subtitulo ?? DEFAULTS.hero_subtitulo,
      accent_color:   accent_color   ?? DEFAULTS.accent_color,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
