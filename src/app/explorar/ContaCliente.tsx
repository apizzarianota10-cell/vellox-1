"use client";

// Conta do cliente final dentro do /explorar (abas Perfil e Pedidos).
// Sem a schema_v73 (estado "indisponivel") mostra o conteúdo antigo (fallback).

import { useCallback, useEffect, useId, useState } from "react";
import Link from "next/link";
import {
  LogOut, MapPin, Pencil, Plus, Trash2, Star, Package, RotateCcw, ChevronRight, ShoppingBag, House, Briefcase, UserRound, Search,
} from "lucide-react";
import AuthCliente, { BotaoPrimario, CampoTexto } from "@/components/cliente/AuthCliente";
import { useContaCliente } from "@/components/cliente/useContaCliente";
import EscolhaApelido from "@/components/cliente/EscolhaApelido";
import {
  STATUS_PEDIDO, definirPrincipal, linhaEndereco, listarEnderecos, listarPedidosCliente, mascaraTelefone,
  prepararPedirDeNovo, primeiroNome, removerEndereco, resumoItens, salvarEndereco, soDigitos, telefoneValido,
  type EnderecoCliente, type EnderecoNovo, type PedidoCliente,
} from "@/lib/clienteConta";
import { C, brl } from "./utils";

interface Props {
  vista: "perfil" | "pedidos";
  /** Conteúdo antigo do perfil (sem conta) — usado se a migration não rodou. */
  fallback?: React.ReactNode;
  onVerPedidos?: () => void;
}

const cartao: React.CSSProperties = { background: C.surface, borderRadius: 24, padding: 18, boxShadow: C.shadow2, border: `1px solid ${C.lineSoft}` };

function TituloSecao({ children, acao }: { children: React.ReactNode; acao?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3" style={{ margin: "26px 2px 10px" }}>
      <h2 style={{ fontSize: 19, fontWeight: 900, letterSpacing: "-0.02em", color: C.ink }}>{children}</h2>
      {acao}
    </div>
  );
}

function BotaoSecundario({ children, onClick, perigo, rotulo, disabled }: {
  children: React.ReactNode; onClick: () => void; perigo?: boolean; rotulo?: string; disabled?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} aria-label={rotulo} disabled={disabled} className="vx-press flex items-center justify-center gap-1.5"
      style={{
        minHeight: 44, padding: "0 14px", borderRadius: 999, fontSize: 14, fontWeight: 700, whiteSpace: "nowrap",
        background: perigo ? C.redSoft : C.chip, color: perigo ? C.redDark : C.ink, opacity: disabled ? 0.6 : 1,
      }}>
      {children}
    </button>
  );
}

function iconeApelido(apelido: string) {
  const a = apelido.toLowerCase();
  if (a.startsWith("casa")) return House;
  if (a.startsWith("trab")) return Briefcase;
  return MapPin;
}

function dataPedido(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const dia = d.toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined });
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${dia} · ${hora}`;
}

// ─── Formulário de endereço ─────────────────────────────────────────────────
const ENDERECO_VAZIO: EnderecoNovo = { apelido: "Casa", rua: "", numero: "", complemento: "", bairro: "", cidade: "", referencia: "", principal: false };

function FormEndereco({ inicial, onSalvar, onCancelar }: {
  inicial: EnderecoNovo; onSalvar: (e: EnderecoNovo) => Promise<string | null>; onCancelar: () => void;
}) {
  const [e, setE] = useState<EnderecoNovo>(inicial);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [tentou, setTentou] = useState(false);
  const idPrincipal = useId();
  const set = (k: keyof EnderecoNovo) => (v: string) => setE(x => ({ ...x, [k]: v }));

  async function enviar(ev: React.FormEvent) {
    ev.preventDefault();
    setTentou(true);
    if (!e.rua.trim() || !e.apelido.trim()) return;
    setSalvando(true);
    const r = await onSalvar(e);
    setSalvando(false);
    if (r) setErro(r);
  }

  return (
    <form onSubmit={enviar} noValidate className="grid gap-3" style={{ ...cartao, boxShadow: C.shadow1 }}>
      <EscolhaApelido valor={e.apelido} onChange={set("apelido")} />
      <CampoTexto label="Rua ou avenida" value={e.rua} onChange={set("rua")} autoComplete="address-line1" maxLength={200}
        erro={tentou && !e.rua.trim() ? "Digite a rua." : ""} />
      <div className="grid gap-3" style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.6fr)" }}>
        <CampoTexto label="Número" value={e.numero} onChange={set("numero")} inputMode="numeric" maxLength={20} />
        <CampoTexto label="Complemento" value={e.complemento} onChange={set("complemento")} placeholder="Apto, bloco…" maxLength={120} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <CampoTexto label="Bairro" value={e.bairro} onChange={set("bairro")} maxLength={120} />
        <CampoTexto label="Cidade" value={e.cidade} onChange={set("cidade")} autoComplete="address-level2" maxLength={120} />
      </div>
      <CampoTexto label="Ponto de referência (opcional)" value={e.referencia} onChange={set("referencia")} placeholder="Ex.: portão azul" maxLength={200} />
      <label htmlFor={idPrincipal} className="flex items-center gap-3" style={{ minHeight: 44, fontSize: 15, fontWeight: 600, color: C.ink, cursor: "pointer" }}>
        <input id={idPrincipal} type="checkbox" checked={e.principal} onChange={ev => setE(x => ({ ...x, principal: ev.target.checked }))}
          style={{ width: 22, height: 22, accentColor: C.red }} />
        Usar como endereço principal
      </label>
      {erro && <p role="alert" style={{ fontSize: 14, color: C.redDark, fontWeight: 700 }}>{erro}</p>}
      <div className="grid gap-2" style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 2fr)" }}>
        <BotaoSecundario onClick={onCancelar}>Cancelar</BotaoSecundario>
        <BotaoPrimario carregando={salvando}>Salvar endereço</BotaoPrimario>
      </div>
    </form>
  );
}

// ─── Cartão de pedido ───────────────────────────────────────────────────────
export function CartaoPedido({ p, onPedirDeNovo, repetindo }: { p: PedidoCliente; onPedirDeNovo: (p: PedidoCliente) => void; repetindo: boolean }) {
  const st = STATUS_PEDIDO[p.status] ?? { label: p.status, bg: C.chip, text: C.ink2 };
  const itens = resumoItens(p);
  const total = (Number(p.valor_pedido) || 0) + (Number(p.valor_motoboy) || 0);
  const nomeLoja = p.loja?.nome ?? "Loja";
  return (
    <article style={{ ...cartao, padding: 16, boxShadow: C.shadow1 }}>
      <div className="flex items-start gap-3">
        <div className="flex items-center justify-center flex-shrink-0 overflow-hidden" aria-hidden
          style={{ width: 48, height: 48, borderRadius: 14, background: p.loja?.cor ? `${p.loja.cor}18` : C.chip, color: p.loja?.cor ?? C.ink, fontWeight: 900, fontSize: 18 }}>
          {p.loja?.logo_url
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={p.loja.logo_url} alt="" width={48} height={48} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : nomeLoja.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate" style={{ fontSize: 16, fontWeight: 800, color: C.ink }}>{nomeLoja}</h3>
            <span style={{ flexShrink: 0, padding: "4px 10px", borderRadius: 999, background: st.bg, color: st.text, fontSize: 12.5, fontWeight: 800 }}>{st.label}</span>
          </div>
          <p style={{ fontSize: 13, color: C.ink3, marginTop: 2 }}>{dataPedido(p.created_at)}</p>
          {itens && <p className="vx-clamp2" style={{ fontSize: 14, color: C.ink2, marginTop: 6, lineHeight: 1.4 }}>{itens}</p>}
          <p style={{ fontSize: 15, fontWeight: 900, color: C.ink, marginTop: 6 }}>{brl(total)}</p>
        </div>
      </div>
      <div className="grid gap-2" style={{ marginTop: 12, gridTemplateColumns: p.tracking_token && p.loja?.slug ? "1fr 1fr" : "1fr" }}>
        {p.tracking_token && (
          <Link href={`/pedido/${p.tracking_token}`} className="vx-press flex items-center justify-center gap-1.5"
            style={{ minHeight: 46, borderRadius: 999, background: C.chip, color: C.ink, fontSize: 14, fontWeight: 800 }}>
            <Package size={16} aria-hidden /> Acompanhar
          </Link>
        )}
        {p.loja?.slug && (
          <button type="button" onClick={() => onPedirDeNovo(p)} disabled={repetindo} className="vx-press flex items-center justify-center gap-1.5"
            aria-label={`Pedir de novo em ${nomeLoja}`}
            style={{ minHeight: 46, borderRadius: 999, background: C.ink, color: "#fff", fontSize: 14, fontWeight: 800, opacity: repetindo ? 0.6 : 1 }}>
            <RotateCcw size={16} aria-hidden /> Pedir de novo
          </button>
        )}
      </div>
    </article>
  );
}

function SkeletonLinhas({ n = 2 }: { n?: number }) {
  return <div className="grid gap-3">{Array.from({ length: n }, (_, i) => <div key={i} className="vx-skel" style={{ height: 120, borderRadius: 24 }} />)}</div>;
}

// ─── Componente principal ───────────────────────────────────────────────────
export default function ContaCliente({ vista, fallback, onVerPedidos }: Props) {
  const { sb, estado, user, cliente, setCliente, sair } = useContaCliente();

  const [enderecos, setEnderecos]   = useState<EnderecoCliente[] | null>(null);
  const [pedidos, setPedidos]       = useState<PedidoCliente[] | null>(null);
  const [editandoDados, setEditandoDados] = useState(false);
  const [nome, setNome]             = useState("");
  const [tel, setTel]               = useState("");
  const [salvandoDados, setSalvandoDados] = useState(false);
  const [erroDados, setErroDados]   = useState("");
  const [formEnd, setFormEnd]       = useState<{ id?: string; inicial: EnderecoNovo } | null>(null);
  const [ocupado, setOcupado]       = useState<string | null>(null);
  const [aviso, setAviso]           = useState("");

  const clienteId = cliente?.id ?? null;

  const carregarEnderecos = useCallback(async () => {
    if (!clienteId) return;
    setEnderecos(await listarEnderecos(sb, clienteId));
  }, [sb, clienteId]);

  useEffect(() => {
    if (estado !== "cliente" || !clienteId) { setEnderecos(null); setPedidos(null); return; }
    let vivo = true;
    if (vista === "perfil") listarEnderecos(sb, clienteId).then(l => { if (vivo) setEnderecos(l); });
    listarPedidosCliente(sb, clienteId, vista === "perfil" ? 3 : 50).then(l => { if (vivo) setPedidos(l); });
    return () => { vivo = false; };
  }, [estado, clienteId, vista, sb]);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(""), 3500);
    return () => clearTimeout(t);
  }, [aviso]);

  async function pedirDeNovo(p: PedidoCliente) {
    if (!p.loja?.slug) return;
    setOcupado(p.id);
    try { await prepararPedirDeNovo(sb, p); } catch { /* abre a loja mesmo assim */ }
    window.location.href = `/loja/${p.loja.slug}`;
  }

  async function salvarDados(e: React.FormEvent) {
    e.preventDefault();
    if (!cliente) return;
    if (nome.trim().length < 2) { setErroDados("Digite seu nome."); return; }
    if (!telefoneValido(tel)) { setErroDados("Digite o WhatsApp com DDD."); return; }
    setSalvandoDados(true); setErroDados("");
    const dados = { nome: nome.trim().slice(0, 120), telefone: soDigitos(tel) };
    const { error } = await sb.from("clientes").update(dados).eq("id", cliente.id);
    setSalvandoDados(false);
    if (error) { setErroDados("Não foi possível salvar. Tente de novo."); return; }
    setCliente({ ...cliente, ...dados });
    setEditandoDados(false);
    setAviso("Dados atualizados.");
  }

  async function salvarEnd(dados: EnderecoNovo, id?: string): Promise<string | null> {
    if (!clienteId) return "Entre de novo na sua conta.";
    // O primeiro endereço já vira o principal
    const principal = dados.principal || (!id && (enderecos?.length ?? 0) === 0);
    const r = await salvarEndereco(sb, clienteId, { ...dados, principal }, id);
    if (!r.ok) return r.erro ?? "Não foi possível salvar.";
    setFormEnd(null);
    setAviso(id ? "Endereço atualizado." : "Endereço salvo.");
    await carregarEnderecos();
    return null;
  }

  async function tornarPrincipal(id: string) {
    if (!clienteId) return;
    setOcupado(id);
    const ok = await definirPrincipal(sb, clienteId, id);
    setOcupado(null);
    if (ok) { setAviso("Endereço principal alterado."); await carregarEnderecos(); }
  }

  async function remover(end: EnderecoCliente) {
    if (!clienteId) return;
    if (!window.confirm(`Remover o endereço “${end.apelido}”?`)) return;
    setOcupado(end.id);
    const ok = await removerEndereco(sb, clienteId, end.id);
    // Se removeu o principal, o mais antigo que sobrou vira principal
    const resto = (enderecos ?? []).filter(x => x.id !== end.id);
    if (ok && end.principal && resto.length) await definirPrincipal(sb, clienteId, resto[0].id);
    setOcupado(null);
    if (ok) { setAviso("Endereço removido."); await carregarEnderecos(); }
  }

  const avisoToast = aviso && (
    <div role="status" aria-live="polite" className="vx-in" style={{
      position: "fixed", left: 16, right: 16, bottom: 96, zIndex: 60, margin: "0 auto", maxWidth: 420,
      padding: "14px 18px", borderRadius: 16, background: C.ink, color: "#fff", fontSize: 15, fontWeight: 700, textAlign: "center", boxShadow: C.shadow3,
    }}>{aviso}</div>
  );

  const linkTelefone = (
    <Link href="/meus-pedidos" className="vx-card flex items-center gap-3"
      style={{ ...cartao, padding: "14px 16px", minHeight: 64, boxShadow: C.shadow1 }}>
      <span className="flex items-center justify-center flex-shrink-0" style={{ width: 40, height: 40, borderRadius: 12, background: C.chip }}><Search size={18} aria-hidden /></span>
      <span className="flex-1 min-w-0">
        <span className="block" style={{ fontSize: 15, fontWeight: 800 }}>Pediu sem conta?</span>
        <span className="block" style={{ fontSize: 13, color: C.ink3 }}>Encontre seus pedidos pelo telefone</span>
      </span>
      <ChevronRight size={18} style={{ color: C.ink3 }} aria-hidden />
    </Link>
  );

  // ── Estados sem conta de cliente ──────────────────────────────────────────
  if (estado === "carregando") return <SkeletonLinhas n={vista === "perfil" ? 1 : 3} />;

  if (estado === "indisponivel") {
    return <>{vista === "perfil" ? fallback : linkTelefone}</>;
  }

  if (estado === "outra-conta") {
    const tipo = user?.user_metadata?.tipo as string | undefined;
    const destino = tipo === "motoboy" ? "/motoboy" : tipo === "god" ? "/god" : "/dashboard";
    return (
      <div className="grid gap-3">
        <div style={cartao}>
          <p style={{ fontSize: 17, fontWeight: 800, color: C.ink }}>Você está conectado como {tipo === "motoboy" ? "motoboy" : "restaurante"}</p>
          <p style={{ fontSize: 14, color: C.ink2, marginTop: 6, lineHeight: 1.5 }}>
            <strong style={{ wordBreak: "break-all" }}>{user?.email}</strong> é uma conta de trabalho do Vellox. Para pedir comida com conta, saia e entre com uma conta de cliente.
          </p>
          <div className="grid gap-2 sm:grid-cols-2" style={{ marginTop: 14 }}>
            <Link href={destino} className="vx-press flex items-center justify-center"
              style={{ minHeight: 48, borderRadius: 999, background: C.ink, color: "#fff", fontSize: 15, fontWeight: 800 }}>
              Ir para o {tipo === "motoboy" ? "app do motoboy" : "painel"}
            </Link>
            <BotaoSecundario onClick={sair}><LogOut size={16} aria-hidden /> Sair desta conta</BotaoSecundario>
          </div>
        </div>
        {vista === "pedidos" ? linkTelefone : fallback}
      </div>
    );
  }

  if (estado === "anonimo") {
    return (
      <div className="grid gap-3">
        {vista === "pedidos" && (
          <p style={{ fontSize: 15, color: C.ink2, lineHeight: 1.5, margin: "0 2px" }}>
            Entre na sua conta para ver os pedidos de todas as lojas num lugar só.
          </p>
        )}
        <div style={cartao}><AuthCliente /></div>
        {vista === "pedidos" && linkTelefone}
      </div>
    );
  }

  // ── Cliente logado ────────────────────────────────────────────────────────
  if (!cliente) return null;

  const listaPedidos = pedidos === null
    ? <SkeletonLinhas n={vista === "perfil" ? 1 : 3} />
    : pedidos.length === 0
      ? (
        <div style={{ ...cartao, textAlign: "center", boxShadow: C.shadow1 }}>
          <ShoppingBag size={26} style={{ color: C.red, margin: "0 auto" }} aria-hidden />
          <p style={{ fontSize: 16, fontWeight: 800, marginTop: 8 }}>Nenhum pedido na conta ainda</p>
          <p style={{ fontSize: 14, color: C.ink3, marginTop: 4, lineHeight: 1.5 }}>Os pedidos que você fizer logado aparecem aqui.</p>
        </div>
      )
      : <div className="grid gap-3 md:grid-cols-2">{pedidos.map(p => <CartaoPedido key={p.id} p={p} onPedirDeNovo={pedirDeNovo} repetindo={ocupado === p.id} />)}</div>;

  if (vista === "pedidos") {
    return (
      <div>
        {listaPedidos}
        <div style={{ marginTop: 16 }}>{linkTelefone}</div>
        {avisoToast}
      </div>
    );
  }

  return (
    <div>
      {/* Dados */}
      <div style={cartao}>
        {editandoDados ? (
          <form onSubmit={salvarDados} noValidate className="grid gap-3">
            <p style={{ fontSize: 17, fontWeight: 800 }}>Seus dados</p>
            <CampoTexto label="Seu nome" value={nome} onChange={setNome} autoComplete="name" maxLength={120} />
            <CampoTexto label="WhatsApp" value={tel} onChange={v => setTel(mascaraTelefone(v))} type="tel" inputMode="tel" autoComplete="tel-national" placeholder="(00) 00000-0000" />
            {erroDados && <p role="alert" style={{ fontSize: 14, color: C.redDark, fontWeight: 700 }}>{erroDados}</p>}
            <div className="grid gap-2" style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 2fr)" }}>
              <BotaoSecundario onClick={() => setEditandoDados(false)}>Cancelar</BotaoSecundario>
              <BotaoPrimario carregando={salvandoDados}>Salvar</BotaoPrimario>
            </div>
          </form>
        ) : (
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center flex-shrink-0" aria-hidden
              style={{ width: 56, height: 56, borderRadius: 999, background: C.redSoft, color: C.red, fontWeight: 900, fontSize: 22 }}>
              {(cliente.nome.trim().charAt(0) || "V").toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="truncate" style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.01em" }}>Olá, {primeiroNome(cliente.nome) || "cliente"}!</p>
              <p className="truncate" style={{ fontSize: 13.5, color: C.ink3 }}>{cliente.telefone ? mascaraTelefone(cliente.telefone) : "WhatsApp não informado"}</p>
              <p className="truncate" style={{ fontSize: 13.5, color: C.ink3 }}>{cliente.email ?? user?.email}</p>
            </div>
            <BotaoSecundario rotulo="Editar seus dados" onClick={() => { setNome(cliente.nome); setTel(mascaraTelefone(cliente.telefone)); setErroDados(""); setEditandoDados(true); }}>
              <Pencil size={15} aria-hidden /> Editar
            </BotaoSecundario>
          </div>
        )}
      </div>

      {/* Endereços */}
      <TituloSecao acao={!formEnd && (enderecos?.length ?? 0) > 0 && (
        <BotaoSecundario onClick={() => setFormEnd({ inicial: ENDERECO_VAZIO })}><Plus size={16} aria-hidden /> Adicionar</BotaoSecundario>
      )}>Meus endereços</TituloSecao>
      {formEnd && !formEnd.id && (
        <div style={{ marginBottom: 12 }}>
          <FormEndereco inicial={formEnd.inicial} onSalvar={d => salvarEnd(d)} onCancelar={() => setFormEnd(null)} />
        </div>
      )}
      {enderecos === null ? <SkeletonLinhas n={1} /> : enderecos.length === 0 && !formEnd ? (
        <button type="button" onClick={() => setFormEnd({ inicial: ENDERECO_VAZIO })} className="vx-press w-full flex items-center gap-3 text-left"
          style={{ ...cartao, boxShadow: C.shadow1, border: `1.5px dashed ${C.line}`, minHeight: 72 }}>
          <span className="flex items-center justify-center flex-shrink-0" style={{ width: 44, height: 44, borderRadius: 14, background: C.redSoft, color: C.red }}><Plus size={20} aria-hidden /></span>
          <span>
            <span className="block" style={{ fontSize: 16, fontWeight: 800 }}>Adicionar endereço</span>
            <span className="block" style={{ fontSize: 13.5, color: C.ink3 }}>Salve sua casa ou trabalho para pedir com um toque</span>
          </span>
        </button>
      ) : (
        <ul className="grid gap-3" aria-label="Endereços salvos">
          {enderecos.map(end => {
            if (formEnd?.id === end.id) {
              return (
                <li key={end.id}>
                  <FormEndereco inicial={formEnd.inicial} onSalvar={d => salvarEnd(d, end.id)} onCancelar={() => setFormEnd(null)} />
                </li>
              );
            }
            const Icone = iconeApelido(end.apelido);
            return (
              <li key={end.id} style={{ ...cartao, padding: 16, boxShadow: C.shadow1 }}>
                <div className="flex items-start gap-3">
                  <span className="flex items-center justify-center flex-shrink-0" style={{ width: 42, height: 42, borderRadius: 14, background: C.chip }}><Icone size={19} aria-hidden /></span>
                  <div className="flex-1 min-w-0">
                    <p className="flex items-center gap-2 flex-wrap" style={{ fontSize: 16, fontWeight: 800 }}>
                      {end.apelido}
                      {end.principal && <span style={{ padding: "2px 9px", borderRadius: 999, background: C.greenSoft, color: C.green, fontSize: 12, fontWeight: 800 }}>Principal</span>}
                    </p>
                    <p style={{ fontSize: 14, color: C.ink2, marginTop: 2, lineHeight: 1.4, overflowWrap: "anywhere" }}>{linhaEndereco(end)}</p>
                    {end.referencia && <p style={{ fontSize: 13, color: C.ink3, marginTop: 2, overflowWrap: "anywhere" }}>Ref.: {end.referencia}</p>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2" style={{ marginTop: 12 }}>
                  {!end.principal && (
                    <BotaoSecundario onClick={() => tornarPrincipal(end.id)} disabled={ocupado === end.id} rotulo={`Tornar ${end.apelido} o endereço principal`}>
                      <Star size={15} aria-hidden /> Tornar principal
                    </BotaoSecundario>
                  )}
                  <BotaoSecundario rotulo={`Editar ${end.apelido}`} onClick={() => setFormEnd({ id: end.id, inicial: {
                    apelido: end.apelido, rua: end.rua, numero: end.numero, complemento: end.complemento, bairro: end.bairro,
                    cidade: end.cidade, referencia: end.referencia, principal: end.principal,
                  } })}>
                    <Pencil size={15} aria-hidden /> Editar
                  </BotaoSecundario>
                  <BotaoSecundario perigo rotulo={`Remover ${end.apelido}`} onClick={() => remover(end)} disabled={ocupado === end.id}>
                    <Trash2 size={15} aria-hidden /> Remover
                  </BotaoSecundario>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Pedidos (prévia) */}
      <TituloSecao acao={onVerPedidos && (pedidos?.length ?? 0) > 0 && (
        <BotaoSecundario onClick={onVerPedidos}>Ver todos <ChevronRight size={16} aria-hidden /></BotaoSecundario>
      )}>Meus pedidos</TituloSecao>
      {listaPedidos}

      {/* Sair */}
      <div style={{ marginTop: 26 }}>
        <button type="button" onClick={sair} className="vx-press w-full flex items-center justify-center gap-2"
          style={{ minHeight: 52, borderRadius: 18, background: C.surface, border: `1px solid ${C.line}`, color: C.redDark, fontSize: 15, fontWeight: 800 }}>
          <LogOut size={18} aria-hidden /> Sair da conta
        </button>
        <p className="flex items-center justify-center gap-1.5" style={{ fontSize: 12.5, color: C.ink3, marginTop: 8 }}>
          <UserRound size={13} aria-hidden /> Cliente desde {cliente.created_at ? new Date(cliente.created_at).toLocaleDateString("pt-BR", { month: "long", year: "numeric" }) : "hoje"}
        </p>
      </div>
      {avisoToast}
    </div>
  );
}
