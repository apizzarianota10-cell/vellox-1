// Conta do cliente final (quem pede comida) — helpers sem React.
// Tabelas: clientes, cliente_enderecos e pedidos.cliente_id (supabase/schema_v73.sql).
// Contas de cliente são identificadas por user_metadata.tipo === "cliente";
// empresas e motoboys usam o mesmo Supabase Auth com outros tipos.

import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { PedidoItem, PedidoStatus } from "@/types";

export interface Cliente {
  id: string;
  nome: string;
  telefone: string;
  email: string | null;
  created_at?: string;
}

export interface EnderecoCliente {
  id: string;
  cliente_id: string;
  apelido: string;
  rua: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  referencia: string;
  principal: boolean;
  created_at?: string;
}

export type EnderecoNovo = Omit<EnderecoCliente, "id" | "cliente_id" | "created_at">;

export interface PedidoCliente {
  id: string;
  tracking_token: string | null;
  status: PedidoStatus;
  created_at: string;
  valor_pedido: number;
  valor_motoboy: number;
  tipo_pedido: string | null;
  descricao_itens: string | null;
  itens: PedidoItem[] | null;
  empresa_id: string;
  loja: { nome: string; slug: string | null; logo_url: string | null; cor: string | null } | null;
}

export const CAMPOS_ENDERECO = "id, cliente_id, apelido, rua, numero, complemento, bairro, cidade, referencia, principal, created_at";

export function ehContaCliente(user: Pick<User, "user_metadata"> | null | undefined): boolean {
  return user?.user_metadata?.tipo === "cliente";
}

/** Tabela/coluna da schema_v73 ainda não existe (PostgREST: PGRST205/PGRST204; Postgres: 42P01/42703). */
export function migrationClienteAusente(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  return ["PGRST205", "PGRST204", "42P01", "42703"].includes(err.code ?? "")
    || /does not exist|could not find the table|schema cache/i.test(err.message ?? "");
}

let avisouMigration = false;
export function avisarMigrationAusente() {
  if (avisouMigration) return;
  avisouMigration = true;
  console.warn("[Vellox] Conta do cliente desativada: rode supabase/schema_v73.sql (tabelas clientes/cliente_enderecos).");
}

// ─── Formatação ─────────────────────────────────────────────────────────────
export function soDigitos(v: string) { return v.replace(/\D/g, ""); }

export function mascaraTelefone(v: string): string {
  const d = soDigitos(v).slice(0, 11);
  if (!d) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function telefoneValido(v: string) {
  const n = soDigitos(v).length;
  return n >= 10 && n <= 11;
}

export function emailValido(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
}

/** "Rua A, 10 — Apto 2 · Centro" */
export function linhaEndereco(e: Pick<EnderecoCliente, "rua" | "numero" | "complemento" | "bairro" | "cidade">): string {
  const base = [e.rua.trim(), e.numero.trim()].filter(Boolean).join(", ");
  const extra = [e.complemento.trim(), e.bairro.trim(), e.cidade.trim()].filter(Boolean).join(" · ");
  return extra ? `${base} — ${extra}` : base;
}

function norm(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}

/** Mesmo endereço (ignora maiúsculas, acentos e espaços)? */
export function mesmoEndereco(
  a: Pick<EnderecoCliente, "rua" | "numero" | "complemento">,
  b: Pick<EnderecoCliente, "rua" | "numero" | "complemento">,
) {
  return norm(a.rua) === norm(b.rua) && norm(a.numero) === norm(b.numero) && norm(a.complemento) === norm(b.complemento);
}

export function primeiroNome(nome: string) {
  return nome.trim().split(/\s+/)[0] ?? "";
}

// ─── Status do pedido ───────────────────────────────────────────────────────
export const STATUS_PEDIDO: Record<PedidoStatus, { label: string; bg: string; text: string }> = {
  em_fila:                { label: "Na fila",       bg: "#f1f5f9", text: "#475569" },
  em_preparo:             { label: "Em preparo",    bg: "#fff7e0", text: "#9a5b00" },
  finalizado:             { label: "Pronto",        bg: "#e8f0ff", text: "#1d4ed8" },
  em_coleta:              { label: "Saindo",        bg: "#fff0e8", text: "#b23c00" },
  em_rota_de_entrega:     { label: "A caminho",     bg: "#f1ecff", text: "#6d28d9" },
  aguardando_confirmacao: { label: "Confirmando",   bg: "#fff7e0", text: "#9a5b00" },
  entregue:               { label: "Entregue",      bg: "#e7f6ee", text: "#0f7a43" },
  cancelado:              { label: "Cancelado",     bg: "#fdecef", text: "#b4001f" },
};

/** "2x X-Burguer, 1x Coca" a partir de pedidos.itens ou do texto descricao_itens. */
export function resumoItens(p: Pick<PedidoCliente, "itens" | "descricao_itens">, max = 3): string {
  let partes: string[] = [];
  if (Array.isArray(p.itens) && p.itens.length) {
    partes = p.itens.map(i => `${i.qtd}x ${i.nome}`);
  } else if (p.descricao_itens) {
    partes = p.descricao_itens.split("\n").map(l => l.split(" — ")[0].trim()).filter(Boolean);
  }
  if (!partes.length) return "";
  const extra = partes.length - max;
  return partes.slice(0, max).join(", ") + (extra > 0 ? ` e mais ${extra}` : "");
}

// ─── Acesso a dados (RLS: cada cliente só enxerga o que é seu) ──────────────

/** Busca (ou cria no 1º acesso) a linha em clientes do usuário logado. */
export async function carregarOuCriarCliente(sb: SupabaseClient, user: User): Promise<{ cliente: Cliente | null; semMigration: boolean }> {
  const { data, error } = await sb.from("clientes").select("id, nome, telefone, email, created_at").eq("id", user.id).maybeSingle();
  if (error) {
    if (migrationClienteAusente(error)) { avisarMigrationAusente(); return { cliente: null, semMigration: true }; }
    console.warn("[Vellox] Falha ao carregar cliente:", error.message);
    return { cliente: null, semMigration: false };
  }
  if (data) return { cliente: data as Cliente, semMigration: false };

  const meta = user.user_metadata ?? {};
  const novo = {
    id: user.id,
    nome: String(meta.nome ?? "").trim().slice(0, 120) || (user.email?.split("@")[0] ?? ""),
    telefone: soDigitos(String(meta.telefone ?? "")).slice(0, 30),
    email: user.email ?? null,
  };
  const ins = await sb.from("clientes").insert(novo).select("id, nome, telefone, email, created_at").maybeSingle();
  if (ins.error) {
    if (migrationClienteAusente(ins.error)) { avisarMigrationAusente(); return { cliente: null, semMigration: true }; }
    console.warn("[Vellox] Falha ao criar cliente:", ins.error.message);
    return { cliente: null, semMigration: false };
  }
  return { cliente: (ins.data as Cliente) ?? novo, semMigration: false };
}

export async function listarEnderecos(sb: SupabaseClient, clienteId: string): Promise<EnderecoCliente[]> {
  const { data, error } = await sb.from("cliente_enderecos").select(CAMPOS_ENDERECO)
    .eq("cliente_id", clienteId).order("principal", { ascending: false }).order("created_at");
  if (error) { if (migrationClienteAusente(error)) avisarMigrationAusente(); return []; }
  return (data ?? []) as EnderecoCliente[];
}

function limparEndereco(e: EnderecoNovo): EnderecoNovo {
  return {
    apelido: e.apelido.trim().slice(0, 40) || "Casa",
    rua: e.rua.trim().slice(0, 200),
    numero: e.numero.trim().slice(0, 20),
    complemento: e.complemento.trim().slice(0, 120),
    bairro: e.bairro.trim().slice(0, 120),
    cidade: e.cidade.trim().slice(0, 120),
    referencia: e.referencia.trim().slice(0, 200),
    principal: !!e.principal,
  };
}

/** Insere (sem id) ou atualiza (com id). Garante um único principal. */
export async function salvarEndereco(sb: SupabaseClient, clienteId: string, e: EnderecoNovo, id?: string): Promise<{ ok: boolean; erro?: string }> {
  const dados = limparEndereco(e);
  if (!dados.rua) return { ok: false, erro: "Informe a rua." };
  if (dados.principal) {
    let q = sb.from("cliente_enderecos").update({ principal: false }).eq("cliente_id", clienteId).eq("principal", true);
    if (id) q = q.neq("id", id);
    await q;
  }
  const { error } = id
    ? await sb.from("cliente_enderecos").update(dados).eq("id", id).eq("cliente_id", clienteId)
    : await sb.from("cliente_enderecos").insert({ ...dados, cliente_id: clienteId });
  if (error) {
    if (/row-level security/i.test(error.message)) return { ok: false, erro: "Você chegou ao limite de 20 endereços. Remova um para adicionar outro." };
    return { ok: false, erro: "Não foi possível salvar o endereço. Tente de novo." };
  }
  return { ok: true };
}

export async function definirPrincipal(sb: SupabaseClient, clienteId: string, id: string): Promise<boolean> {
  await sb.from("cliente_enderecos").update({ principal: false }).eq("cliente_id", clienteId).eq("principal", true);
  const { error } = await sb.from("cliente_enderecos").update({ principal: true }).eq("id", id).eq("cliente_id", clienteId);
  return !error;
}

export async function removerEndereco(sb: SupabaseClient, clienteId: string, id: string): Promise<boolean> {
  const { error } = await sb.from("cliente_enderecos").delete().eq("id", id).eq("cliente_id", clienteId);
  return !error;
}

/** Pedidos do cliente (todas as lojas), mais recentes primeiro. */
export async function listarPedidosCliente(sb: SupabaseClient, clienteId: string, limite = 50): Promise<PedidoCliente[]> {
  const base = "id, tracking_token, status, created_at, valor_pedido, valor_motoboy, tipo_pedido, descricao_itens, empresa_id";
  const consulta = (campos: string) => sb.from("pedidos").select(campos)
    .eq("cliente_id", clienteId).order("created_at", { ascending: false }).limit(limite);

  let { data, error } = await consulta(`${base}, itens`);
  // schema_v67 (pedidos.itens) ainda não aplicada: busca sem os itens estruturados
  if (error && /itens/i.test(error.message ?? "") && !/cliente_id/i.test(error.message ?? "")) {
    ({ data, error } = await consulta(base));
  }
  if (error) { if (migrationClienteAusente(error)) avisarMigrationAusente(); return []; }

  const rows = (data ?? []) as unknown as Omit<PedidoCliente, "loja">[];
  const ids = [...new Set(rows.map(r => r.empresa_id))];
  const lojas = new Map<string, NonNullable<PedidoCliente["loja"]>>();
  if (ids.length) {
    const [{ data: emps }, { data: cfgs }] = await Promise.all([
      sb.from("empresas_publica").select("id, nome, slug").in("id", ids),
      sb.from("configuracao_loja").select("empresa_id, logo_url, cor_principal").in("empresa_id", ids),
    ]);
    const cfgMap = new Map((cfgs ?? []).map((c: { empresa_id: string; logo_url: string | null; cor_principal: string | null }) => [c.empresa_id, c]));
    for (const e of (emps ?? []) as { id: string; nome: string; slug: string | null }[]) {
      const c = cfgMap.get(e.id);
      lojas.set(e.id, { nome: e.nome, slug: e.slug, logo_url: c?.logo_url ?? null, cor: c?.cor_principal ?? null });
    }
  }
  return rows.map(r => ({ ...r, itens: Array.isArray(r.itens) ? r.itens : null, loja: lojas.get(r.empresa_id) ?? null }));
}

/**
 * "Pedir de novo" a partir de um pedido antigo: grava a chave que a página
 * da loja já lê (vellox-ultimo-pedido:<empresa_id>) com os itens que dá pra
 * repetir sem escolhas — produtos ativos, sem tamanho/sabor obrigatório (o
 * pedidos.itens não guarda essas escolhas). Retorna quantos itens gravou.
 */
export async function prepararPedirDeNovo(sb: SupabaseClient, pedido: PedidoCliente): Promise<number> {
  if (!pedido.itens?.length) return 0;
  const ids = [...new Set(pedido.itens.map(i => i.produto_id))];
  const { data, error } = await sb.from("produtos")
    .select("*, produto_variacoes(id, ativo), produto_sabores(id, ativo), produto_adicionais(ativo, obrigatorio)")
    .eq("empresa_id", pedido.empresa_id).in("id", ids);
  if (error || !data) return 0;
  type P = {
    id: string; ativo: boolean | null; tipo?: string | null; sabores_vinculo_ids?: string[] | null;
    produto_variacoes: { ativo: boolean }[] | null; produto_sabores: { ativo: boolean }[] | null;
    produto_adicionais: { ativo: boolean; obrigatorio: boolean }[] | null;
  };
  const simples = new Set((data as P[])
    .filter(p => p.ativo !== false
      && p.tipo !== "pizza"
      && !(p.sabores_vinculo_ids ?? []).length
      && !(p.produto_variacoes ?? []).some(v => v.ativo)
      && !(p.produto_sabores ?? []).some(s => s.ativo)
      && !(p.produto_adicionais ?? []).some(a => a.ativo && a.obrigatorio))
    .map(p => p.id));
  const itens = pedido.itens
    .filter(i => simples.has(i.produto_id))
    .map(i => ({ p: i.produto_id, v: null, s: [], a: [], q: i.qtd }));
  if (!itens.length) return 0;
  try {
    localStorage.setItem(`vellox-ultimo-pedido:${pedido.empresa_id}`, JSON.stringify({ itens, quando: pedido.created_at }));
  } catch { return 0; }
  return itens.length;
}
