import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {}
          },
        },
      }
    );

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      const meta  = data.user.user_metadata ?? {};
      const tipo  = meta.tipo as string | undefined;
      let destination = next;

      if (tipo === "motoboy") {
        // Garante que o registro na tabela motoboys existe
        const { data: rows } = await supabase
          .from("motoboys")
          .select("id")
          .eq("auth_id", data.user.id)
          .limit(1);

        if (!rows || rows.length === 0) {
          await supabase.from("motoboys").insert({
            auth_id:      data.user.id,
            nome:         (meta.nome     as string) || data.user.email?.split("@")[0] || "Motoboy",
            telefone:     (meta.telefone as string) || "",
            email:        data.user.email || "",
            status:       "disponivel",
            posicao_fila: 999,
          });
        }

        if (next === "/dashboard") destination = "/motoboy";
      } else if (tipo === "cliente") {
        // Cliente final: nunca cai no painel da empresa
        if (next === "/dashboard" || next === "/reset-password") {
          destination = next === "/reset-password" ? "/explorar/nova-senha" : "/explorar?aba=perfil";
        }
      } else if (tipo === "god") {
        if (next === "/dashboard") destination = "/god";
      } else if (tipo === "empresa") {
        // Salva CNPJ do metadata caso ainda não esteja na tabela
        const cnpj = meta.cnpj as string | undefined;
        if (cnpj) {
          await supabase
            .from("empresas")
            .update({ cnpj })
            .eq("id", data.user.id)
            .is("cnpj", null);
        }
      }

      return NextResponse.redirect(`${origin}${destination}`);
    }
  }

  // Links da conta do cliente final (/explorar, /loja) voltam para o /explorar,
  // não para o login da empresa. O e-mail já foi confirmado pelo Supabase
  // antes deste redirect; o que falhou foi a troca do código (ex.: link aberto
  // em outro navegador), então basta entrar com e-mail e senha.
  if (next.startsWith("/explorar") || next.startsWith("/loja/")) {
    return NextResponse.redirect(`${origin}/explorar?aba=perfil&erro=link`);
  }
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
