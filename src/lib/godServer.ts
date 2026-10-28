// Helpers SÓ DE SERVIDOR do painel God (rotas /api/god/*).
// Nunca importe isto num componente "use client": usa o service role.
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { inicioDiaBRT, inicioMesBRT, diaBRT } from "@/lib/dataBRT";

/** Mesmo critério das rotas god existentes: sessão + e-mail === GOD_EMAIL. */
export async function requireGod() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !process.env.GOD_EMAIL || user.email !== process.env.GOD_EMAIL) return null;
  return user;
}

export type Admin = ReturnType<typeof createAdminClient>;
export { createAdminClient };

/** Erro do PostgREST/Postgres de "tabela/função não existe" (migration não rodada). */
export function faltaMigracao(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  const c = err.code ?? "";
  return c === "42P01" || c === "42883" || c === "PGRST202" || c === "PGRST205" || c === "PGRST204"
    || /does not exist|could not find|schema cache/i.test(err.message ?? "");
}

/**
 * Busca todas as linhas de uma consulta paginando de 1000 em 1000 (limite do
 * PostgREST). `limite` evita estourar memória em bases enormes — o chamador
 * recebe `parcial: true` quando parou antes do fim.
 */
export async function buscarTudo<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  montar: (de: number, ate: number) => PromiseLike<{ data: any[] | null; error: any }>,
  limite = 100_000,
): Promise<{ rows: T[]; parcial: boolean; error: { code?: string; message?: string } | null }> {
  const rows: T[] = [];
  const passo = 1000;
  for (let de = 0; de < limite; de += passo) {
    const { data, error } = await montar(de, de + passo - 1);
    if (error) return { rows, parcial: true, error };
    const lote = (data ?? []) as T[];
    rows.push(...lote);
    if (lote.length < passo) return { rows, parcial: false, error: null };
  }
  return { rows, parcial: true, error: null };
}

export const PERIODOS = ["7", "30", "90", "mes"] as const;
export type Periodo = typeof PERIODOS[number];

/** Início do período em BRT (7/30/90 dias contando hoje, ou mês atual). */
export function inicioPeriodo(p: string | null | undefined): { periodo: Periodo; inicio: Date; rotulo: string } {
  const periodo: Periodo = (PERIODOS as readonly string[]).includes(p ?? "") ? (p as Periodo) : "30";
  if (periodo === "mes") {
    const inicio = inicioMesBRT();
    const rotulo = inicio.toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "America/Sao_Paulo" });
    return { periodo, inicio, rotulo: rotulo.charAt(0).toUpperCase() + rotulo.slice(1) };
  }
  const dias = Number(periodo);
  const inicio = new Date(inicioDiaBRT().getTime() - (dias - 1) * 86400000);
  return { periodo, inicio, rotulo: `Últimos ${dias} dias` };
}

/** Lista de dias "YYYY-MM-DD" (BRT) de `inicio` até hoje. */
export function diasDesde(inicio: Date): string[] {
  const out: string[] = [];
  const hoje = diaBRT();
  // meio-dia evita escorregar de dia por causa do fuso
  for (let t = inicio.getTime() + 12 * 3600000; ; t += 86400000) {
    const d = diaBRT(new Date(t));
    out.push(d);
    if (d >= hoje || out.length > 400) break;
  }
  return out;
}

export function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Soma dias à assinatura. Mesma gravação do /api/god/set-dias
 *  (assinatura_ativa = true + assinatura_expira_em). Com `somar`, conta a partir
 *  do vencimento atual se ele ainda estiver no futuro (prêmio não "come" dias). */
export async function aplicarDiasAssinatura(admin: Admin, empresaId: string, dias: number, somar = true) {
  if (!empresaId || !Number.isFinite(dias) || dias < 1 || dias > 3650) {
    return { error: "Parâmetros inválidos", expira_em: null as string | null };
  }
  let base = new Date();
  if (somar) {
    const { data } = await admin.from("empresas").select("assinatura_expira_em").eq("id", empresaId).maybeSingle();
    const atual = data?.assinatura_expira_em ? new Date(data.assinatura_expira_em as string) : null;
    if (atual && atual > base) base = atual;
  }
  const expira = new Date(base.getTime() + Math.round(dias) * 86400000);
  const { error } = await admin
    .from("empresas")
    .update({ assinatura_ativa: true, assinatura_expira_em: expira.toISOString() })
    .eq("id", empresaId);
  return { error: error?.message ?? null, expira_em: error ? null : expira.toISOString() };
}
