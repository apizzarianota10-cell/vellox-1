// Helpers do fechamento de caixa do motoboy (schema_v69)
import type { MotoboyAcerto } from "@/types";

export const MSG_MIGRATION_ACERTOS =
  "Para ativar o fechamento de caixa, rode supabase/schema_v69.sql no Supabase";

const TZ = "America/Sao_Paulo";
// Brasil não tem horário de verão desde 2019: São Paulo é sempre UTC−3.
const OFFSET_SP = "-03:00";

/** Erro do Supabase/PostgREST indicando que a migration v69 ainda não rodou. */
export function isMigrationAusente(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  const code = err.code ?? "";
  if (["42P01", "42703", "42883", "PGRST202", "PGRST204", "PGRST205"].includes(code)) return true;
  const msg = (err.message ?? "").toLowerCase();
  return (
    msg.includes("acerto_id") ||
    msg.includes("motoboy_acertos") ||
    msg.includes("fechar_acerto_motoboy") ||
    msg.includes("marcar_acerto_pago") ||
    msg.includes("schema cache")
  );
}

/** Data de hoje (YYYY-MM-DD) no fuso de São Paulo. */
export function hojeSP(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date());
}

/** Início do dia (00:00 em São Paulo) como ISO com offset. */
export function inicioDiaSP(data: string): string {
  return `${data}T00:00:00${OFFSET_SP}`;
}

/** Início do dia SEGUINTE (fim exclusivo do período) em São Paulo. */
export function fimExclusivoSP(data: string): string {
  const [y, m, d] = data.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const iso = next.toISOString().slice(0, 10);
  return `${iso}T00:00:00${OFFSET_SP}`;
}

export function brl(v: number | null | undefined): string {
  return (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function dataSP(iso: string, comHora = false): string {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    ...(comHora ? { hour: "2-digit", minute: "2-digit" } : { year: "numeric" }),
  });
}

/** Rótulo do período do acerto (fim é exclusivo → mostra o dia anterior). */
export function periodoLabel(a: Pick<MotoboyAcerto, "periodo_inicio" | "periodo_fim">): string {
  const ini = dataSP(a.periodo_inicio);
  const fimIncl = dataSP(new Date(new Date(a.periodo_fim).getTime() - 1).toISOString());
  return ini === fimIncl ? ini : `${ini} a ${fimIncl}`;
}

/** Texto claro do repasse, do ponto de vista da loja. */
export function textoRepasse(valor: number): { texto: string; cor: string } {
  const v = Number(valor) || 0;
  if (v > 0.004) return { texto: `Motoboy devolve ${brl(v)} à loja`, cor: "#22c55e" };
  if (v < -0.004) return { texto: `Loja paga ${brl(-v)} ao motoboy`, cor: "#fbbf24" };
  return { texto: "Nada a repassar (zerado)", cor: "var(--text-3)" };
}

/** Mesmo texto, do ponto de vista do motoboy. */
export function textoRepasseMotoboy(valor: number): { texto: string; cor: string } {
  const v = Number(valor) || 0;
  if (v > 0.004) return { texto: `Você devolve ${brl(v)} à loja`, cor: "#f87171" };
  if (v < -0.004) return { texto: `A loja te paga ${brl(-v)}`, cor: "#22c55e" };
  return { texto: "Nada a repassar (zerado)", cor: "#94a3b8" };
}

/** Normaliza números vindos do PostgREST (numeric chega como string em alguns casos). */
export function normalizarAcerto(a: MotoboyAcerto): MotoboyAcerto {
  return {
    ...a,
    qtd_entregas: Number(a.qtd_entregas) || 0,
    total_taxas: Number(a.total_taxas) || 0,
    total_dinheiro_recebido: Number(a.total_dinheiro_recebido) || 0,
    total_troco: Number(a.total_troco) || 0,
    valor_a_repassar: Number(a.valor_a_repassar) || 0,
  };
}
