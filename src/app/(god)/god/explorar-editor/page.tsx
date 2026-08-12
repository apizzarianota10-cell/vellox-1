import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ExplorarEditorClient from "./ExplorarEditorClient";

export default async function ExplorarEditorPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== process.env.GOD_EMAIL) redirect("/");
  return <ExplorarEditorClient />;
}
