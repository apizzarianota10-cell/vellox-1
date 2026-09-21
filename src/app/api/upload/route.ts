import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

// Bucket público, criado no projeto Supabase dedicado a imagens (separado do
// banco principal - ver IMAGES_SUPABASE_URL/IMAGES_SUPABASE_SERVICE_ROLE_KEY).
const BUCKET = "produtos";

// Admin client do projeto de imagens - usa a service_role key porque esse
// projeto não compartilha auth.users com o banco principal, então não dá pra
// validar a sessão do usuário lá. A checagem de "quem pode subir imagem"
// continua sendo feita contra o banco principal, abaixo.
const imagesAdmin = createClient(
  process.env.IMAGES_SUPABASE_URL!,
  process.env.IMAGES_SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file") as File | null;
  const folder = (form.get("folder") as string | null) ?? "vellox";

  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${folder}/${randomUUID()}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await imagesAdmin.storage.from(BUCKET).upload(path, buffer, {
    contentType: file.type || "image/jpeg",
    upsert: false,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data } = imagesAdmin.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl });
}
