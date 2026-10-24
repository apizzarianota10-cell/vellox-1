"use client";

// Entrar / Criar conta / Esqueci minha senha — conta do cliente final.
// Visual claro premium do /explorar; campos grandes (≥ 52px), fonte 16px
// (sem zoom no iOS), textos curtos e diretos.

import { useEffect, useId, useState } from "react";
import { Eye, EyeOff, LoaderCircle, Mail, CircleAlert, ArrowLeft, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { C } from "@/app/explorar/utils";
import { ehContaCliente, emailValido, mascaraTelefone, soDigitos, telefoneValido } from "@/lib/clienteConta";
import { suspenderEventosConta } from "./useContaCliente";

type Modo = "entrar" | "cadastrar" | "esqueci" | "link-enviado" | "confirme-email";

interface Props {
  modoInicial?: "entrar" | "cadastrar";
  /** Chamado quando o cliente fica logado. */
  onPronto?: () => void;
  /** Para onde o link do e-mail (confirmação de cadastro) leva depois. */
  voltarPara?: string;
}

export function CampoTexto({ label, value, onChange, type = "text", autoComplete, inputMode, placeholder, dica, erro, autoFocus, maxLength, direita }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; autoComplete?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"]; placeholder?: string; dica?: string; erro?: string;
  autoFocus?: boolean; maxLength?: number; direita?: React.ReactNode;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} style={{ display: "block", fontSize: 14, fontWeight: 700, color: C.ink, marginBottom: 6 }}>{label}</label>
      <div style={{ position: "relative" }}>
        <input id={id} value={value} onChange={e => onChange(e.target.value)} type={type} autoComplete={autoComplete}
          inputMode={inputMode} placeholder={placeholder} autoFocus={autoFocus} maxLength={maxLength}
          aria-invalid={erro ? true : undefined} aria-describedby={erro || dica ? `${id}-d` : undefined}
          style={{
            width: "100%", height: 52, padding: direita ? "0 52px 0 16px" : "0 16px", borderRadius: 14,
            border: `1.5px solid ${erro ? C.red : C.line}`, background: C.surface, fontSize: 16, color: C.ink,
            outline: "none", boxSizing: "border-box",
          }} />
        {direita && <div style={{ position: "absolute", right: 4, top: 4 }}>{direita}</div>}
      </div>
      {(erro || dica) && (
        <p id={`${id}-d`} style={{ fontSize: 13, marginTop: 5, color: erro ? C.redDark : C.ink3, fontWeight: erro ? 700 : 500 }}>{erro || dica}</p>
      )}
    </div>
  );
}

export function BotaoPrimario({ children, carregando, disabled, onClick, type = "submit" }: {
  children: React.ReactNode; carregando?: boolean; disabled?: boolean; onClick?: () => void; type?: "submit" | "button";
}) {
  return (
    <button type={type} onClick={onClick} disabled={disabled || carregando} className="vx-press"
      style={{
        width: "100%", minHeight: 54, borderRadius: 16, border: "none", background: C.red, color: "#fff",
        fontSize: 16, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        boxShadow: "0 8px 22px rgba(228,0,43,0.25)", opacity: disabled || carregando ? 0.65 : 1, cursor: "pointer",
      }}>
      {carregando && <LoaderCircle size={18} className="animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

function BotaoLink({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="vx-press"
      style={{ minHeight: 44, padding: "0 6px", fontSize: 15, fontWeight: 700, color: C.redDark, background: "none", border: "none", cursor: "pointer" }}>
      {children}
    </button>
  );
}

function Alerta({ texto }: { texto: string }) {
  return (
    <div role="alert" style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "12px 14px", borderRadius: 14, background: C.redSoft, color: C.redDark, fontSize: 14, fontWeight: 600, lineHeight: 1.4 }}>
      <CircleAlert size={18} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden /> <span>{texto}</span>
    </div>
  );
}

function traduzirErro(msg: string): string {
  if (/invalid login credentials/i.test(msg)) return "E-mail ou senha incorretos. Confira e tente de novo.";
  if (/email not confirmed/i.test(msg)) return "Falta confirmar seu e-mail. Abra o link que enviamos para você.";
  if (/already registered|already been registered|already exists/i.test(msg)) return "Este e-mail já tem cadastro no Vellox. Toque em “Entrar” e use sua senha.";
  if (/password.*(at least|characters)|weak/i.test(msg)) return "Escolha uma senha mais forte, com pelo menos 6 caracteres.";
  if (/rate limit|too many|security purposes/i.test(msg)) return "Muitas tentativas seguidas. Aguarde um minuto e tente de novo.";
  if (/fetch|network/i.test(msg)) return "Sem conexão. Verifique sua internet e tente de novo.";
  return "Não deu certo agora. Tente de novo em instantes.";
}

export default function AuthCliente({ modoInicial = "entrar", onPronto, voltarPara = "/explorar?aba=perfil" }: Props) {
  const [modo, setModo]         = useState<Modo>(modoInicial);
  const [nome, setNome]         = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail]       = useState("");
  const [senha, setSenha]       = useState("");
  const [verSenha, setVerSenha] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro]         = useState("");
  const [tentou, setTentou]     = useState(false);

  // Voltou de um link de e-mail que não abriu (/auth/callback → ?erro=link)
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("erro") === "link") {
      setErro("Não conseguimos abrir o link neste navegador. Se você confirmou o cadastro, é só entrar com e-mail e senha. Para trocar a senha, peça um link novo.");
    }
  }, []);

  const trocar = (m: Modo) => { setModo(m); setErro(""); setTentou(false); };
  const urlCallback = (next: string) => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  const errosCadastro = {
    nome: nome.trim().length < 2 ? "Digite seu nome." : "",
    telefone: !telefoneValido(telefone) ? "Digite o WhatsApp com DDD." : "",
    email: !emailValido(email) ? "Digite um e-mail válido." : "",
    senha: senha.length < 6 ? "A senha precisa ter pelo menos 6 caracteres." : "",
  };

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setTentou(true);
    if (!emailValido(email) || !senha) return;
    setEnviando(true); setErro("");
    const sb = createClient();
    suspenderEventosConta(true);
    try {
      const { data, error } = await sb.auth.signInWithPassword({ email: email.trim(), password: senha });
      if (error || !data.user) { setErro(traduzirErro(error?.message ?? "")); return; }
      if (!ehContaCliente(data.user)) {
        // Conta de empresa/motoboy: não vira cliente
        await sb.auth.signOut();
        setErro("Este e-mail é de uma conta de restaurante ou motoboy do Vellox. Para pedir comida, crie uma conta de cliente com outro e-mail.");
        return;
      }
      onPronto?.();
    } catch (err) {
      setErro(traduzirErro((err as Error).message ?? ""));
    } finally {
      setEnviando(false);
      suspenderEventosConta(false);
    }
  }

  async function cadastrar(e: React.FormEvent) {
    e.preventDefault();
    setTentou(true);
    if (Object.values(errosCadastro).some(Boolean)) return;
    setEnviando(true); setErro("");
    const sb = createClient();
    try {
      const { data, error } = await sb.auth.signUp({
        email: email.trim(),
        password: senha,
        options: {
          data: { tipo: "cliente", nome: nome.trim(), telefone: soDigitos(telefone) },
          emailRedirectTo: urlCallback(voltarPara),
        },
      });
      if (error) { setErro(traduzirErro(error.message)); return; }
      // E-mail já cadastrado (com confirmação ligada o Supabase devolve um usuário sem identidades)
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        setErro(traduzirErro("already registered"));
        return;
      }
      if (data.session) { onPronto?.(); return; }
      trocar("confirme-email");
    } catch (err) {
      setErro(traduzirErro((err as Error).message ?? ""));
    } finally {
      setEnviando(false);
    }
  }

  async function esqueci(e: React.FormEvent) {
    e.preventDefault();
    setTentou(true);
    if (!emailValido(email)) return;
    setEnviando(true); setErro("");
    try {
      const { error } = await createClient().auth.resetPasswordForEmail(email.trim(), { redirectTo: urlCallback("/explorar/nova-senha") });
      if (error && /rate limit|security purposes/i.test(error.message)) { setErro(traduzirErro(error.message)); return; }
      trocar("link-enviado");
    } catch (err) {
      setErro(traduzirErro((err as Error).message ?? ""));
    } finally {
      setEnviando(false);
    }
  }

  const olho = (
    <button type="button" onClick={() => setVerSenha(v => !v)} aria-label={verSenha ? "Esconder senha" : "Mostrar senha"} aria-pressed={verSenha}
      className="vx-press" style={{ width: 44, height: 44, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", color: C.ink3, background: "none", border: "none", cursor: "pointer" }}>
      {verSenha ? <EyeOff size={19} /> : <Eye size={19} />}
    </button>
  );

  const titulo = (t: string, s?: string) => (
    <div style={{ marginBottom: 18 }}>
      <h2 style={{ fontSize: 24, fontWeight: 900, letterSpacing: "-0.03em", color: C.ink, lineHeight: 1.15 }}>{t}</h2>
      {s && <p style={{ fontSize: 15, color: C.ink2, marginTop: 6, lineHeight: 1.45 }}>{s}</p>}
    </div>
  );

  if (modo === "link-enviado" || modo === "confirme-email") {
    return (
      <div style={{ textAlign: "center", padding: "8px 4px" }} aria-live="polite">
        <div style={{ width: 64, height: 64, borderRadius: 22, margin: "0 auto 14px", background: C.greenSoft, color: C.green, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Mail size={28} aria-hidden />
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 900, color: C.ink, letterSpacing: "-0.02em" }}>Confira seu e-mail</h2>
        <p style={{ fontSize: 15, color: C.ink2, marginTop: 8, lineHeight: 1.5 }}>
          {modo === "confirme-email"
            ? <>Enviamos um link para <strong style={{ color: C.ink, wordBreak: "break-all" }}>{email.trim()}</strong>. Toque nele para ativar sua conta.</>
            : <>Se existir uma conta com <strong style={{ color: C.ink, wordBreak: "break-all" }}>{email.trim()}</strong>, você vai receber um link para criar uma nova senha.</>}
        </p>
        <p style={{ fontSize: 13, color: C.ink3, marginTop: 8 }}>Não chegou? Olhe a caixa de spam.</p>
        <div style={{ marginTop: 16 }}><BotaoLink onClick={() => trocar("entrar")}>Voltar para entrar</BotaoLink></div>
      </div>
    );
  }

  if (modo === "esqueci") {
    return (
      <form onSubmit={esqueci} noValidate style={{ display: "grid", gap: 14 }}>
        <button type="button" onClick={() => trocar("entrar")} className="vx-press" aria-label="Voltar"
          style={{ width: 44, height: 44, borderRadius: 999, background: C.chip, border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <ArrowLeft size={18} />
        </button>
        {titulo("Esqueceu a senha?", "Digite seu e-mail. Vamos enviar um link para você criar uma senha nova.")}
        <CampoTexto label="E-mail" value={email} onChange={setEmail} type="email" autoComplete="email" inputMode="email"
          placeholder="voce@email.com" autoFocus erro={tentou && !emailValido(email) ? "Digite um e-mail válido." : ""} />
        {erro && <Alerta texto={erro} />}
        <BotaoPrimario carregando={enviando}>Enviar link</BotaoPrimario>
      </form>
    );
  }

  const abas = (
    <div role="tablist" aria-label="Entrar ou criar conta" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", padding: 4, borderRadius: 16, background: C.chip, marginBottom: 18 }}>
      {(["entrar", "cadastrar"] as const).map(m => (
        <button key={m} type="button" role="tab" aria-selected={modo === m} onClick={() => trocar(m)} className="vx-press"
          style={{
            minHeight: 46, borderRadius: 12, border: "none", cursor: "pointer", fontSize: 15, fontWeight: 800,
            background: modo === m ? C.surface : "transparent", color: modo === m ? C.ink : C.ink3,
            boxShadow: modo === m ? C.shadow1 : "none",
          }}>
          {m === "entrar" ? "Entrar" : "Criar conta"}
        </button>
      ))}
    </div>
  );

  if (modo === "cadastrar") {
    return (
      <form onSubmit={cadastrar} noValidate style={{ display: "grid", gap: 14 }}>
        {abas}
        {titulo("Crie sua conta", "Leva menos de um minuto. Seus dados e endereços ficam salvos para os próximos pedidos.")}
        <CampoTexto label="Seu nome" value={nome} onChange={setNome} autoComplete="name" placeholder="Como podemos te chamar?" maxLength={120}
          erro={tentou ? errosCadastro.nome : ""} />
        <CampoTexto label="WhatsApp" value={telefone} onChange={v => setTelefone(mascaraTelefone(v))} type="tel" autoComplete="tel-national"
          inputMode="tel" placeholder="(00) 00000-0000" dica="A loja usa para falar sobre o seu pedido." erro={tentou ? errosCadastro.telefone : ""} />
        <CampoTexto label="E-mail" value={email} onChange={setEmail} type="email" autoComplete="email" inputMode="email" placeholder="voce@email.com"
          erro={tentou ? errosCadastro.email : ""} />
        <CampoTexto label="Crie uma senha" value={senha} onChange={setSenha} type={verSenha ? "text" : "password"} autoComplete="new-password"
          dica="Pelo menos 6 caracteres." erro={tentou ? errosCadastro.senha : ""} direita={olho} />
        {erro && <Alerta texto={erro} />}
        <BotaoPrimario carregando={enviando}><Check size={18} aria-hidden /> Criar minha conta</BotaoPrimario>
        <p style={{ fontSize: 12.5, color: C.ink3, textAlign: "center", lineHeight: 1.5 }}>
          Você pode continuar pedindo sem conta, se preferir.
        </p>
      </form>
    );
  }

  return (
    <form onSubmit={entrar} noValidate style={{ display: "grid", gap: 14 }}>
      {abas}
      {titulo("Que bom te ver!", "Entre para pedir mais rápido, com seus dados e endereços salvos.")}
      <CampoTexto label="E-mail" value={email} onChange={setEmail} type="email" autoComplete="email" inputMode="email" placeholder="voce@email.com"
        erro={tentou && !emailValido(email) ? "Digite um e-mail válido." : ""} />
      <CampoTexto label="Senha" value={senha} onChange={setSenha} type={verSenha ? "text" : "password"} autoComplete="current-password"
        erro={tentou && !senha ? "Digite sua senha." : ""} direita={olho} />
      <div style={{ marginTop: -6, textAlign: "right" }}>
        <BotaoLink onClick={() => trocar("esqueci")}>Esqueci minha senha</BotaoLink>
      </div>
      {erro && <Alerta texto={erro} />}
      <BotaoPrimario carregando={enviando}>Entrar</BotaoPrimario>
      <p style={{ fontSize: 14, color: C.ink2, textAlign: "center" }}>
        Ainda não tem conta? <BotaoLink onClick={() => trocar("cadastrar")}>Criar conta</BotaoLink>
      </p>
    </form>
  );
}
