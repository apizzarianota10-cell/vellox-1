"use client";

// Nova senha do cliente final — destino do link "Esqueci minha senha"
// enviado pelo /explorar (via /auth/callback?next=/explorar/nova-senha).

import { useEffect, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, KeyRound, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ehContaCliente } from "@/lib/clienteConta";
import { BotaoPrimario, CampoTexto } from "@/components/cliente/AuthCliente";
import { EstilosExplorar } from "../componentes";
import { C } from "../utils";

export default function NovaSenhaClientePage() {
  const [temSessao, setTemSessao] = useState<boolean | null>(null);
  const [senha, setSenha]         = useState("");
  const [confirma, setConfirma]   = useState("");
  const [ver, setVer]             = useState(false);
  const [tentou, setTentou]       = useState(false);
  const [salvando, setSalvando]   = useState(false);
  const [erro, setErro]           = useState("");
  const [pronto, setPronto]       = useState(false);

  useEffect(() => {
    createClient().auth.getSession().then(({ data }) => setTemSessao(!!data.session));
  }, []);

  const erroSenha = senha.length < 6 ? "A senha precisa ter pelo menos 6 caracteres." : "";
  const erroConfirma = confirma !== senha ? "As duas senhas não estão iguais." : "";

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setTentou(true);
    if (erroSenha || erroConfirma) return;
    setSalvando(true); setErro("");
    const sb = createClient();
    const { data, error } = await sb.auth.updateUser({ password: senha });
    setSalvando(false);
    if (error) {
      setErro(/same|different/i.test(error.message) ? "Escolha uma senha diferente da anterior." : "Não foi possível salvar. Peça um novo link e tente de novo.");
      return;
    }
    setPronto(true);
    const destino = ehContaCliente(data.user) ? "/explorar?aba=perfil" : "/login";
    setTimeout(() => { window.location.href = destino; }, 1800);
  }

  const olho = (
    <button type="button" onClick={() => setVer(v => !v)} aria-label={ver ? "Esconder senha" : "Mostrar senha"} aria-pressed={ver}
      className="vx-press" style={{ width: 44, height: 44, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", color: C.ink3 }}>
      {ver ? <EyeOff size={19} /> : <Eye size={19} />}
    </button>
  );

  return (
    <div className="vx-root" style={{ minHeight: "100dvh", background: C.bg, color: C.ink, overflowX: "clip" }}>
      <EstilosExplorar />
      <main className="vx-wrap" style={{ paddingTop: 40, paddingBottom: 40 }}>
        <div style={{ maxWidth: 440, margin: "0 auto", background: C.surface, borderRadius: 28, padding: 24, boxShadow: C.shadow2 }}>
          <div className="flex items-center justify-center" aria-hidden
            style={{ width: 60, height: 60, borderRadius: 20, background: pronto ? C.greenSoft : C.redSoft, color: pronto ? C.green : C.red, marginBottom: 16 }}>
            {pronto ? <Check size={28} /> : <KeyRound size={26} />}
          </div>

          {temSessao === null ? (
            <div className="vx-skel" style={{ height: 160, borderRadius: 18 }} />
          ) : pronto ? (
            <div aria-live="polite">
              <h1 style={{ fontSize: 24, fontWeight: 900, letterSpacing: "-0.03em" }}>Senha alterada!</h1>
              <p style={{ fontSize: 15, color: C.ink2, marginTop: 6 }}>Pronto, você já está na sua conta. Levando você de volta…</p>
            </div>
          ) : !temSessao ? (
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 900, letterSpacing: "-0.03em" }}>Link expirado</h1>
              <p style={{ fontSize: 15, color: C.ink2, marginTop: 6, lineHeight: 1.5 }}>
                Este link não vale mais. Peça um novo em “Esqueci minha senha”.
              </p>
              <Link href="/explorar?aba=perfil" className="vx-press flex items-center justify-center"
                style={{ marginTop: 18, minHeight: 52, borderRadius: 16, background: C.ink, color: "#fff", fontSize: 16, fontWeight: 800 }}>
                Voltar para entrar
              </Link>
            </div>
          ) : (
            <form onSubmit={salvar} noValidate className="grid gap-3">
              <h1 style={{ fontSize: 24, fontWeight: 900, letterSpacing: "-0.03em" }}>Crie uma senha nova</h1>
              <p style={{ fontSize: 15, color: C.ink2, marginTop: -4, marginBottom: 4 }}>Use pelo menos 6 caracteres.</p>
              <CampoTexto label="Nova senha" value={senha} onChange={setSenha} type={ver ? "text" : "password"} autoComplete="new-password"
                autoFocus erro={tentou ? erroSenha : ""} direita={olho} />
              <CampoTexto label="Repita a senha" value={confirma} onChange={setConfirma} type={ver ? "text" : "password"} autoComplete="new-password"
                erro={tentou && !erroSenha ? erroConfirma : ""} />
              {erro && <p role="alert" style={{ fontSize: 14, color: C.redDark, fontWeight: 700 }}>{erro}</p>}
              <BotaoPrimario carregando={salvando}>Salvar nova senha</BotaoPrimario>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
