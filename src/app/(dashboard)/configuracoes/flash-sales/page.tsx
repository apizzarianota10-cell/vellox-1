import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import FlashSalesClient from "./FlashSalesClient";

export const dynamic = "force-dynamic";

export default async function FlashSalesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: empresa } = await supabase
    .from("empresas")
    .select("id, nome")
    .eq("id", user.id)
    .single();

  return <FlashSalesClient empresaId={user.id} empresaNome={empresa?.nome ?? ""} />;
}
