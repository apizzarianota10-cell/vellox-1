import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import Sidebar from "@/components/dashboard/Sidebar";
import LocationProvider from "@/components/dashboard/LocationProvider";
import PrintListener from "@/components/dashboard/PrintListener";
import NewOrderPopup from "@/components/dashboard/NewOrderPopup";
import PrintAgentBanner from "@/components/dashboard/PrintAgentBanner";
import { PlanoProvider } from "@/contexts/PlanoContext";
import { LojaProvider } from "@/contexts/LojaContext";
import type { Plano, Loja } from "@/types";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) redirect("/login");
    if (user.email === process.env.GOD_EMAIL) redirect("/god");

    const tipo = user.user_metadata?.tipo as string | undefined;
    if (tipo === "motoboy") redirect("/motoboy");

    const { data: empresa } = await supabase
      .from("empresas")
      .select("id, nome, cnpj, codigo, lat, lng, assinatura_ativa, assinatura_expira_em, plano")
      .eq("id", user.id)
      .single();

    // Sem registro de empresa → redireciona (conta nova sem plano)
    if (!empresa) redirect("/assinatura");

    const expirou = empresa.assinatura_expira_em
      ? new Date(empresa.assinatura_expira_em) < new Date()
      : false;
    const semPlano = !empresa.assinatura_ativa || expirou;
    if (semPlano) redirect("/assinatura");

    // Buscar lojas (tabela criada no schema_v30)
    const { data: lojasRaw } = await supabase
      .from("lojas")
      .select("id, empresa_id, nome, slug, descricao, cor, logo_url, ativo, ordem, created_at")
      .eq("empresa_id", user.id)
      .order("ordem")
      .order("created_at");

    const lojas: Loja[] = (lojasRaw ?? []) as Loja[];
    const plano: Plano  = (empresa?.plano ?? "basic") as Plano;

    return (
      <PlanoProvider plano={plano} assinaturaAtiva={empresa?.assinatura_ativa ?? false}>
        <LojaProvider initialLojas={lojas} empresaId={user.id}>
          <PrintListener empresaId={empresa.id} empresaNome={empresa.nome} empresaCnpj={empresa.cnpj} />
          <NewOrderPopup empresaId={empresa.id} empresaNome={empresa.nome} empresaCnpj={empresa.cnpj} />
          <div className="flex flex-col h-full">
            <PrintAgentBanner />
            <div className="flex flex-1 min-h-0" style={{ background: "var(--bg-base)" }}>
              <Sidebar
                empresaNome={empresa?.nome ?? null}
                empresaCodigo={empresa?.codigo ?? null}
                empresaId={empresa?.id ?? null}
                plano={plano}
                lojas={lojas}
              />
              <main className="flex-1 overflow-y-auto pt-[52px] md:pt-0 pb-[78px] md:pb-0">
                <LocationProvider lat={empresa?.lat ?? null} lng={empresa?.lng ?? null}>
                  {children}
                </LocationProvider>
              </main>
            </div>
          </div>
        </LojaProvider>
      </PlanoProvider>
    );
  } catch (e) {
    if (isRedirectError(e)) throw e;
    redirect("/login");
  }
}
