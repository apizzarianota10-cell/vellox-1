"use client";

// Conta do cliente no checkout da loja (etapa "form" e tela de sucesso).
// Tudo opcional: sem conta (ou sem a schema_v73) o checkout segue igual a antes.
//  - <CheckoutConta>: cliente logado → preenche nome/WhatsApp e oferece os
//    endereços salvos; visitante → link discreto "Entrar para salvar seus dados".
//  - <SalvarEnderecoPosPedido>: depois do pedido, oferece salvar o endereço novo.

import { useEffect, useRef, useState } from "react";
import { MapPin, Check, X, UserRound, House, Briefcase, Plus } from "lucide-react";
import AuthCliente from "@/components/cliente/AuthCliente";
import EscolhaApelido from "@/components/cliente/EscolhaApelido";
import { useContaCliente } from "@/components/cliente/useContaCliente";
import {
  linhaEndereco, listarEnderecos, mascaraTelefone, mesmoEndereco, primeiroNome, salvarEndereco, type EnderecoCliente,
} from "@/lib/clienteConta";

/** Campos do formulário do checkout que a conta preenche. */
interface CamposConta {
  nome: string; telefone: string; tipo: string;
  rua: string; numero: string; complemento: string; referencia: string; bairro: string;
}

function norm(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

function icone(apelido: string) {
  const a = apelido.toLowerCase();
  return a.startsWith("casa") ? House : a.startsWith("trab") ? Briefcase : MapPin;
}

export function CheckoutConta<F extends CamposConta>({ form, setForm, cor, bairrosValidos }: {
  form: F;
  setForm: React.Dispatch<React.SetStateAction<F>>;
  cor: string;
  /** Bairros atendidos pela loja (null se a loja não usa taxa por bairro). */
  bairrosValidos: string[] | null;
}) {
  const { sb, estado, cliente } = useContaCliente();
  const [enderecos, setEnderecos] = useState<EnderecoCliente[]>([]);
  const [loginAberto, setLoginAberto] = useState(false);
  const preencheu = useRef(false);

  function aplicarEndereco(e: EnderecoCliente) {
    let bairro = e.bairro;
    if (bairrosValidos) bairro = bairrosValidos.find(b => norm(b) === norm(e.bairro)) ?? "";
    setForm(f => ({ ...f, rua: e.rua, numero: e.numero, complemento: e.complemento, referencia: e.referencia, bairro }));
  }

  function usarOutro() {
    setForm(f => ({ ...f, rua: "", numero: "", complemento: "", referencia: "", bairro: "" }));
  }

  // Cliente logado: preenche uma vez (sem apagar o que a pessoa já digitou)
  useEffect(() => {
    if (estado !== "cliente" || !cliente || preencheu.current) return;
    preencheu.current = true;
    setForm(f => ({
      ...f,
      nome: f.nome.trim() ? f.nome : cliente.nome,
      telefone: f.telefone.trim() ? f.telefone : mascaraTelefone(cliente.telefone),
    }));
    listarEnderecos(sb, cliente.id).then(lista => {
      setEnderecos(lista);
      const principal = lista.find(x => x.principal) ?? lista[0];
      if (principal) setForm(f => (f.rua.trim() ? f : (() => {
        let bairro = principal.bairro;
        if (bairrosValidos) bairro = bairrosValidos.find(b => norm(b) === norm(principal.bairro)) ?? "";
        return { ...f, rua: principal.rua, numero: principal.numero, complemento: principal.complemento, referencia: principal.referencia, bairro };
      })()));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado, cliente]);

  if (estado === "anonimo") {
    return (
      <>
        <button type="button" onClick={() => setLoginAberto(true)}
          style={{
            display: "flex", alignItems: "center", gap: 8, minHeight: 44, padding: "0 2px", background: "none", border: "none",
            color: "#475569", fontSize: 13.5, fontWeight: 600, cursor: "pointer", textAlign: "left",
          }}>
          <UserRound size={16} aria-hidden style={{ color: cor, flexShrink: 0 }} />
          <span>Tem conta? <span style={{ color: cor, fontWeight: 800, textDecoration: "underline", textUnderlineOffset: 3 }}>Entrar para salvar seus dados</span></span>
        </button>
        {loginAberto && (
          <div role="dialog" aria-modal="true" aria-label="Entrar na sua conta"
            style={{ position: "fixed", inset: 0, zIndex: 500, display: "flex", alignItems: "flex-end", justifyContent: "center", background: "rgba(0,0,0,0.55)" }}
            onClick={e => { if (e.target === e.currentTarget) setLoginAberto(false); }}>
            <div style={{
              width: "100%", maxWidth: 480, maxHeight: "92dvh", overflowY: "auto", background: "#f7f7f5",
              borderRadius: "24px 24px 0 0", padding: "14px 18px calc(22px + env(safe-area-inset-bottom, 0px))", boxSizing: "border-box",
            }}>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button type="button" onClick={() => setLoginAberto(false)} aria-label="Fechar"
                  style={{ width: 44, height: 44, borderRadius: 999, border: "none", background: "#efeeea", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                  <X size={18} />
                </button>
              </div>
              <AuthCliente onPronto={() => setLoginAberto(false)} voltarPara={typeof window !== "undefined" ? window.location.pathname : "/explorar?aba=perfil"} />
              <p style={{ fontSize: 12.5, color: "#6f6a63", textAlign: "center", marginTop: 12 }}>Seu carrinho continua guardado.</p>
            </div>
          </div>
        )}
      </>
    );
  }

  if (estado !== "cliente" || !cliente) return null;

  const selecionado = enderecos.find(e => mesmoEndereco(e, form));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <p style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#475569", margin: 0 }}>
        <Check size={15} aria-hidden style={{ color: "#16a34a" }} />
        Pedindo como <strong style={{ color: "#0f172a" }}>{primeiroNome(cliente.nome) || "você"}</strong> — seus dados já estão preenchidos.
      </p>
      {form.tipo === "entrega" && enderecos.length > 0 && (
        <div role="group" aria-label="Endereços salvos">
          <p style={{ fontSize: 11, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 8px" }}>Entregar em</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {enderecos.map(e => {
              const ativo = selecionado?.id === e.id;
              const Icone = icone(e.apelido);
              return (
                <button key={e.id} type="button" aria-pressed={ativo} onClick={() => aplicarEndereco(e)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, minHeight: 56, padding: "10px 12px", borderRadius: 14, textAlign: "left",
                    border: `2px solid ${ativo ? cor : "#e2e8f0"}`, background: ativo ? `${cor}0d` : "#f8fafc", cursor: "pointer", width: "100%",
                  }}>
                  <Icone size={18} aria-hidden style={{ color: ativo ? cor : "#64748b", flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 14, fontWeight: 800, color: "#0f172a" }}>{e.apelido}</span>
                    <span style={{ display: "block", fontSize: 12.5, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{linhaEndereco(e)}</span>
                  </span>
                  {ativo && <Check size={18} aria-hidden style={{ color: cor, flexShrink: 0 }} />}
                </button>
              );
            })}
            <button type="button" onClick={usarOutro} aria-pressed={!selecionado}
              style={{
                display: "flex", alignItems: "center", gap: 10, minHeight: 48, padding: "0 12px", borderRadius: 14,
                border: `2px dashed ${!selecionado ? cor : "#e2e8f0"}`, background: "#fff", color: "#334155", fontSize: 14, fontWeight: 700, cursor: "pointer", width: "100%",
              }}>
              <Plus size={17} aria-hidden /> Usar outro endereço
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function SalvarEnderecoPosPedido({ form, cor }: { form: CamposConta; cor: string }) {
  const { sb, estado, cliente } = useContaCliente();
  const [enderecos, setEnderecos] = useState<EnderecoCliente[] | null>(null);
  const [apelido, setApelido] = useState("Casa");
  const [status, setStatus] = useState<"idle" | "salvando" | "salvo" | "dispensado">("idle");
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (estado === "cliente" && cliente) listarEnderecos(sb, cliente.id).then(setEnderecos);
  }, [estado, cliente, sb]);

  if (estado !== "cliente" || !cliente || enderecos === null || status === "dispensado") return null;
  if (form.tipo !== "entrega" || !form.rua.trim()) return null;
  if (status !== "salvo" && enderecos.some(e => mesmoEndereco(e, form))) return null;

  if (status === "salvo") {
    return (
      <p role="status" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 700, color: "#16a34a", margin: 0 }}>
        <Check size={16} aria-hidden /> Endereço salvo na sua conta
      </p>
    );
  }

  async function salvar() {
    if (!cliente || !apelido.trim()) return;
    setStatus("salvando"); setErro("");
    const r = await salvarEndereco(sb, cliente.id, {
      apelido, rua: form.rua, numero: form.numero, complemento: form.complemento, bairro: form.bairro,
      cidade: "", referencia: form.referencia, principal: (enderecos?.length ?? 0) === 0,
    });
    if (r.ok) setStatus("salvo"); else { setStatus("idle"); setErro(r.erro ?? "Não foi possível salvar."); }
  }

  return (
    <div style={{ width: "100%", textAlign: "left", padding: 14, borderRadius: 16, background: "#f8fafc", border: "1px solid #e2e8f0", boxSizing: "border-box" }}>
      <p style={{ fontSize: 14, fontWeight: 800, color: "#0f172a", margin: "0 0 2px" }}>Salvar este endereço?</p>
      <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 12px", overflowWrap: "anywhere" }}>
        {linhaEndereco({ rua: form.rua, numero: form.numero, complemento: form.complemento, bairro: form.bairro, cidade: "" })}
      </p>
      <EscolhaApelido valor={apelido} onChange={setApelido} cor={cor} />
      {erro && <p role="alert" style={{ fontSize: 13, color: "#dc2626", fontWeight: 700, margin: "8px 0 0" }}>{erro}</p>}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button type="button" onClick={() => setStatus("dispensado")}
          style={{ flex: 1, minHeight: 46, borderRadius: 12, background: "#fff", border: "1px solid #e2e8f0", color: "#64748b", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
          Agora não
        </button>
        <button type="button" onClick={salvar} disabled={status === "salvando" || !apelido.trim()}
          style={{ flex: 2, minHeight: 46, borderRadius: 12, background: cor, border: "none", color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer", opacity: status === "salvando" || !apelido.trim() ? 0.65 : 1 }}>
          {status === "salvando" ? "Salvando…" : "Salvar endereço"}
        </button>
      </div>
    </div>
  );
}
