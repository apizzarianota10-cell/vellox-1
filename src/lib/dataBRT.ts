// Datas no fuso de Brasília (America/Sao_Paulo).
// toISOString() devolve o dia em UTC — depois das 21h em BRT ele já "vira" o
// dia seguinte, então nunca use isso para calcular "hoje" de um restaurante.

const TZ = "America/Sao_Paulo";

/** "YYYY-MM-DD" do dia corrente (ou de `d`) no fuso de Brasília. */
export function diaBRT(d: Date = new Date()): string {
  // en-CA formata como YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

/** Offset do fuso de Brasília em um instante, ex.: "-03:00". */
function offsetBRT(d: Date): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "longOffset" }).formatToParts(d);
    const tz = parts.find(p => p.type === "timeZoneName")?.value ?? "";
    const m = tz.match(/GMT([+-]\d{2}:\d{2})/);
    if (m) return m[1];
  } catch { /* navegador antigo sem longOffset */ }
  return "-03:00"; // Brasil sem horário de verão desde 2019
}

/** Instante da meia-noite (início do dia) em Brasília. */
export function inicioDiaBRT(d: Date = new Date()): Date {
  return new Date(`${diaBRT(d)}T00:00:00${offsetBRT(d)}`);
}

/** Instante da meia-noite seguinte em Brasília (fim exclusivo do dia). */
export function fimDiaBRT(d: Date = new Date()): Date {
  return new Date(inicioDiaBRT(d).getTime() + 86400000);
}

/** Primeiro instante do mês corrente em Brasília. */
export function inicioMesBRT(d: Date = new Date()): Date {
  const dia = diaBRT(d);
  return new Date(`${dia.slice(0, 8)}01T00:00:00${offsetBRT(d)}`);
}
