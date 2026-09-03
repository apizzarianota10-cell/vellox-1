"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  Eye, EyeOff, Loader2, ArrowRight, ChevronLeft,
  Zap, Building2, Bike, CheckCircle, Copy, Check,
} from "lucide-react";

type Step = "choose" | "empresa" | "motoboy" | "ok_empresa" | "ok_motoboy";

function maskCNPJ(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function validarCNPJ(cnpj: string): boolean {
  const d = cnpj.replace(/\D/g, "");
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const calc = (len: number) => {
    let sum = 0, pos = len - 7;
    for (let i = len; i >= 1; i--) { sum += parseInt(d[len - i]) * pos--; if (pos < 2) pos = 9; }
    const r = sum % 11; return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === parseInt(d[12]) && calc(13) === parseInt(d[13]);
}

const STEPS_ORDER: Record<Step, number> = {
  choose: 1, empresa: 2, motoboy: 2, ok_empresa: 3, ok_motoboy: 3,
};

export default function RegisterPage() {
  const [step, setStep]           = useState<Step>("choose");
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");
  const [showPass, setShowPass]   = useState(false);
  const [emailPendente, setEmailPendente] = useState(false);
  const [codigoCriado, setCodigoCriado]   = useState("");
  const [copiado, setCopiado]     = useState(false);

  const [ef, setEf] = useState({ nome: "", cnpj: "", email: "", senha: "" });
  const [mf, setMf] = useState({ nome: "", telefone: "", email: "", senha: "" });

  const isYellow = step === "motoboy" || step === "ok_motoboy";
  const accent   = isYellow ? "#fbbf24" : "#E4002B";
  const progress = STEPS_ORDER[step];

  async function registerEmpresa(e: React.FormEvent) {
    e.preventDefault();
    if (!validarCNPJ(ef.cnpj)) { setError("CNPJ inválido."); return; }
    setLoading(true); setError("");

    const supabase = createClient();
    const { data, error: authErr } = await supabase.auth.signUp({
      email: ef.email, password: ef.senha,
      options: {
        data: { tipo: "empresa", nome: ef.nome, cnpj: ef.cnpj },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (authErr) { setError(authErr.message ?? "Erro ao criar conta."); setLoading(false); return; }

    if (!data.session) {
      setEmailPendente(true);
      setStep("ok_empresa");
      setLoading(false);
      return;
    }

    await new Promise((r) => setTimeout(r, 1200));
    const { data: { user } } = await supabase.auth.getUser();
    if (user) await supabase.from("empresas").update({ cnpj: ef.cnpj }).eq("id", user.id);
    const { data: emp } = await supabase.from("empresas").select("codigo").eq("id", user!.id).single();

    setCodigoCriado(emp?.codigo ?? "");
    setStep("ok_empresa");
    setLoading(false);
  }

  async function registerMotoboy(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError("");

    const supabase = createClient();
    const { data, error: authErr } = await supabase.auth.signUp({
      email: mf.email, password: mf.senha,
      options: {
        data: { tipo: "motoboy", nome: mf.nome, telefone: mf.telefone },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (authErr) { setError(authErr.message ?? "Erro ao criar conta."); setLoading(false); return; }

    if (!data.session) {
      setEmailPendente(true);
      setStep("ok_motoboy");
      setLoading(false);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("motoboys").insert({
        auth_id: user.id, nome: mf.nome, telefone: mf.telefone,
        email: mf.email, status: "disponivel", posicao_fila: 999,
      });
    }
    setStep("ok_motoboy");
    setLoading(false);
  }

  function copiar() {
    navigator.clipboard.writeText(codigoCriado);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  const IS = {
    height: 48,
    background: "rgba(255,255,255,.04)",
    border: "1px solid rgba(255,255,255,.08)",
  } as React.CSSProperties;

  return (
    <>
      <style>{`
        @keyframes blobA{0%,100%{transform:translate(0,0) scale(1);opacity:.55}30%{transform:translate(4%,-7%) scale(1.1);opacity:.75}70%{transform:translate(-3%,5%) scale(.93);opacity:.4}}
        @keyframes blobB{0%,100%{transform:translate(0,0) scale(1);opacity:.35}40%{transform:translate(-5%,4%) scale(1.13);opacity:.55}80%{transform:translate(3%,-4%) scale(.9);opacity:.25}}
        @keyframes blobC{0%,100%{transform:translate(0,0) scale(1);opacity:.2}50%{transform:translate(4%,7%) scale(1.18);opacity:.38}}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
        @keyframes cardIn{from{opacity:0;transform:translateY(28px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}
        @keyframes stepIn{from{opacity:0;transform:translateX(18px)}to{opacity:1;transform:translateX(0)}}
        @keyframes pulseRed{0%,100%{box-shadow:0 0 0 1px rgba(228,0,43,.12),0 0 40px rgba(228,0,43,.08),0 32px 96px rgba(0,0,0,.75)}50%{box-shadow:0 0 0 1px rgba(228,0,43,.28),0 0 70px rgba(228,0,43,.18),0 32px 96px rgba(0,0,0,.75)}}
        @keyframes pulseYellow{0%,100%{box-shadow:0 0 0 1px rgba(251,191,36,.12),0 0 40px rgba(251,191,36,.08),0 32px 96px rgba(0,0,0,.75)}50%{box-shadow:0 0 0 1px rgba(251,191,36,.28),0 0 70px rgba(251,191,36,.18),0 32px 96px rgba(0,0,0,.75)}}
        @keyframes shimmer{0%{transform:translateX(-130%)}100%{transform:translateX(130%)}}
        @keyframes progressFill{from{width:0}to{width:100%}}
        @keyframes successPop{0%{transform:scale(.6);opacity:0}70%{transform:scale(1.1)}100%{transform:scale(1);opacity:1}}

        .logo-float{animation:float 4s ease-in-out infinite}
        .card-in{animation:cardIn .55s cubic-bezier(.16,1,.3,1) both}
        .step-in{animation:stepIn .38s cubic-bezier(.16,1,.3,1) both}
        .card-red{animation:pulseRed 3.5s ease-in-out infinite}
        .card-yellow{animation:pulseYellow 3.5s ease-in-out infinite}
        .success-pop{animation:successPop .5s cubic-bezier(.34,1.56,.64,1) both}

        .btn-primary{position:relative;overflow:hidden;transition:transform .2s,box-shadow .2s}
        .btn-primary::after{content:'';position:absolute;inset:0;background:linear-gradient(105deg,transparent 30%,rgba(255,255,255,.2) 50%,transparent 70%);animation:shimmer 3s ease-in-out infinite}
        .btn-primary:hover:not(:disabled){transform:translateY(-2px)}
        .btn-primary:active:not(:disabled){transform:scale(.98)}

        .type-card{transition:transform .22s cubic-bezier(.16,1,.3,1),background .18s,border-color .18s;cursor:pointer}
        .type-card:hover{transform:translateY(-3px) scale(1.015)}
        .type-card:active{transform:scale(.98)}

        .input-field{transition:border-color .2s,box-shadow .2s,background .2s;outline:none}
        .input-red:focus{border-color:rgba(228,0,43,.5)!important;box-shadow:0 0 0 3px rgba(228,0,43,.1)!important;background:rgba(228,0,43,.03)!important}
        .input-yellow:focus{border-color:rgba(251,191,36,.5)!important;box-shadow:0 0 0 3px rgba(251,191,36,.1)!important;background:rgba(251,191,36,.03)!important}

        .back-btn{transition:background .15s}
        .back-btn:hover{background:rgba(255,255,255,.1)!important}

        .progress-dot{transition:background .35s,box-shadow .35s,transform .35s}
      `}</style>

      {/* ── Background ── */}
      <div className="fixed inset-0" style={{ background: "var(--bg-base)" }}>
        <div className="absolute pointer-events-none" style={{
          width:720,height:720,top:"-18%",left:"-12%",borderRadius:"50%",
          background:"radial-gradient(circle,rgba(168,0,33,.22) 0%,transparent 65%)",
          animation:"blobA 14s ease-in-out infinite",
        }}/>
        <div className="absolute pointer-events-none" style={{
          width:580,height:580,bottom:"-18%",right:"-10%",borderRadius:"50%",
          background:"radial-gradient(circle,rgba(228,0,43,.16) 0%,transparent 65%)",
          animation:"blobB 18s ease-in-out infinite",
        }}/>
        <div className="absolute pointer-events-none" style={{
          width:380,height:380,top:"35%",right:"18%",borderRadius:"50%",
          background:"radial-gradient(circle,rgba(251,191,36,.07) 0%,transparent 65%)",
          animation:"blobC 11s ease-in-out infinite",
        }}/>
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage:"radial-gradient(rgba(255,255,255,.065) 1px,transparent 1px)",
          backgroundSize:"28px 28px",
        }}/>
        <div className="absolute inset-0 pointer-events-none" style={{
          background:"radial-gradient(ellipse 85% 85% at 50% 50%,transparent 20%,rgba(7,7,10,.78) 100%)",
        }}/>
      </div>

      {/* ── Page ── */}
      <div className="relative min-h-screen flex flex-col items-center justify-center px-5 py-12">

        {/* Logo */}
        <div className="flex items-center gap-3 mb-10 card-in" style={{ animationDelay: "0ms" }}>
          <div className="logo-float w-11 h-11 rounded-2xl flex items-center justify-center"
            style={{
              background:"linear-gradient(135deg,#FFC72C 0%,#A80021 100%)",
              boxShadow:"0 0 28px rgba(228,0,43,.55),0 0 70px rgba(228,0,43,.18)",
            }}>
            <Zap size={22} className="text-white" strokeWidth={2.5}/>
          </div>
          <span className="text-[26px] font-black text-white" style={{ letterSpacing:"-0.045em" }}>Vellox</span>
        </div>

        {/* Progress dots */}
        <div className="flex items-center gap-2 mb-6 card-in" style={{ animationDelay:"60ms" }}>
          {[1,2,3].map((n) => {
            const active  = progress === n;
            const done    = progress > n;
            const dotAccent = (step === "motoboy" || step === "ok_motoboy") ? "#fbbf24" : "#E4002B";
            return (
              <div key={n} className="flex items-center gap-2">
                <div
                  className="progress-dot w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold"
                  style={{
                    background: active
                      ? `linear-gradient(135deg,${dotAccent}cc,${dotAccent})`
                      : done ? "rgba(255,255,255,.15)" : "rgba(255,255,255,.06)",
                    color: active ? "#fff" : done ? "#9ca3af" : "#374151",
                    boxShadow: active ? `0 0 16px ${dotAccent}55` : "none",
                    transform: active ? "scale(1.15)" : "scale(1)",
                  }}
                >
                  {done ? <Check size={11}/> : n}
                </div>
                {n < 3 && (
                  <div className="w-8 h-px" style={{ background: done ? "rgba(255,255,255,.2)" : "rgba(255,255,255,.07)" }}/>
                )}
              </div>
            );
          })}
        </div>

        {/* Card */}
        <div
          className={`${isYellow ? "card-yellow" : "card-red"} card-in w-full max-w-[420px] rounded-[28px] p-8`}
          style={{
            background:"rgba(255,255,255,.022)",
            border:`1px solid ${isYellow ? "rgba(251,191,36,.14)" : "rgba(228,0,43,.14)"}`,
            backdropFilter:"blur(52px)",
            animationDelay:"120ms",
            transition:"border-color .4s",
          }}
        >

          {/* ── CHOOSE ── */}
          {step === "choose" && (
            <div key="choose" className="step-in">
              <p className="text-[10px] font-bold uppercase tracking-[.14em] mb-2" style={{ color:"#374151" }}>
                CRIAR CONTA
              </p>
              <h1 className="text-[27px] font-black text-white mb-1" style={{ letterSpacing:"-0.042em" }}>
                Qual é seu perfil?
              </h1>
              <p className="text-sm mb-8" style={{ color:"#6b7280" }}>
                Escolha o tipo de conta que deseja criar
              </p>

              <div className="space-y-3">
                <button
                  className="type-card w-full p-5 rounded-2xl text-left"
                  style={{
                    background:"linear-gradient(135deg,rgba(228,0,43,.09) 0%,rgba(228,0,43,.04) 100%)",
                    border:"1px solid rgba(228,0,43,.2)",
                  }}
                  onClick={() => { setStep("empresa"); setError(""); }}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                      style={{
                        background:"linear-gradient(135deg,rgba(228,0,43,.28) 0%,rgba(228,0,43,.1) 100%)",
                        boxShadow:"0 0 20px rgba(228,0,43,.22)",
                      }}>
                      <Building2 size={20} style={{ color:"#E4002B" }}/>
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-white text-sm leading-tight">Empresa</p>
                      <p className="text-xs mt-0.5" style={{ color:"#6b7280" }}>Gerencie motoboys e pedidos</p>
                    </div>
                    <ArrowRight size={16} style={{ color:"#374151" }}/>
                  </div>
                </button>

                <button
                  className="type-card w-full p-5 rounded-2xl text-left"
                  style={{
                    background:"linear-gradient(135deg,rgba(251,191,36,.09) 0%,rgba(251,191,36,.04) 100%)",
                    border:"1px solid rgba(251,191,36,.2)",
                  }}
                  onClick={() => { setStep("motoboy"); setError(""); }}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                      style={{
                        background:"linear-gradient(135deg,rgba(251,191,36,.28) 0%,rgba(251,191,36,.1) 100%)",
                        boxShadow:"0 0 20px rgba(251,191,36,.22)",
                      }}>
                      <Bike size={20} style={{ color:"#fbbf24" }}/>
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-white text-sm leading-tight">Motoboy</p>
                      <p className="text-xs mt-0.5" style={{ color:"#6b7280" }}>Receba entregas de empresas</p>
                    </div>
                    <ArrowRight size={16} style={{ color:"#374151" }}/>
                  </div>
                </button>
              </div>

              <div className="mt-6 pt-5" style={{ borderTop:"1px solid rgba(255,255,255,.06)" }}>
                <p className="text-center text-xs" style={{ color:"#4b5563" }}>
                  Já tem conta?{" "}
                  <Link href="/login" className="font-bold" style={{ color:"#E4002B" }}>
                    Entrar
                  </Link>
                </p>
              </div>
            </div>
          )}

          {/* ── EMPRESA FORM ── */}
          {step === "empresa" && (
            <div key="empresa" className="step-in">
              <div className="flex items-center gap-3 mb-7">
                <button className="back-btn w-8 h-8 rounded-xl flex items-center justify-center"
                  style={{ background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.08)",color:"#6b7280" }}
                  onClick={() => { setStep("choose"); setError(""); }}>
                  <ChevronLeft size={15}/>
                </button>
                <div>
                  <h2 className="text-lg font-black text-white" style={{ letterSpacing:"-0.035em" }}>Cadastro de Empresa</h2>
                  <p className="text-xs" style={{ color:"#6b7280" }}>Preencha os dados da sua empresa</p>
                </div>
              </div>

              <form onSubmit={registerEmpresa} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold mb-2 uppercase tracking-[.1em]" style={{ color:"#374151" }}>Nome da empresa</label>
                  <input type="text" required value={ef.nome}
                    onChange={(e) => setEf((f) => ({ ...f, nome: e.target.value }))}
                    placeholder="Minha Empresa Ltda"
                    className="input-field input-red w-full px-4 text-sm text-white placeholder-gray-700 rounded-xl"
                    style={IS}/>
                </div>
                <div>
                  <label className="block text-[10px] font-bold mb-2 uppercase tracking-[.1em]" style={{ color:"#374151" }}>CNPJ</label>
                  <div className="relative">
                    <input
                      type="text" required inputMode="numeric"
                      value={ef.cnpj}
                      onChange={(e) => setEf((f) => ({ ...f, cnpj: maskCNPJ(e.target.value) }))}
                      placeholder="00.000.000/0000-00"
                      className="input-field input-red w-full px-4 text-sm text-white placeholder-gray-700 rounded-xl"
                      style={{
                        ...IS,
                        borderColor: ef.cnpj.replace(/\D/g,"").length === 14
                          ? (validarCNPJ(ef.cnpj) ? "rgba(34,197,94,.4)" : "rgba(228,0,43,.4)")
                          : "rgba(255,255,255,.08)",
                      }}
                    />
                    {ef.cnpj.replace(/\D/g,"").length === 14 && (
                      <span className="absolute right-4 top-1/2 -translate-y-1/2">
                        {validarCNPJ(ef.cnpj)
                          ? <CheckCircle size={13} style={{ color:"#22c55e" }}/>
                          : <span style={{ color:"#E4002B",fontSize:13 }}>✕</span>}
                      </span>
                    )}
                  </div>
                  {ef.cnpj.replace(/\D/g,"").length === 14 && !validarCNPJ(ef.cnpj) && (
                    <p className="text-xs mt-1" style={{ color:"#FFC72C" }}>CNPJ inválido</p>
                  )}
                </div>
                <div>
                  <label className="block text-[10px] font-bold mb-2 uppercase tracking-[.1em]" style={{ color:"#374151" }}>Email</label>
                  <input type="email" required value={ef.email}
                    onChange={(e) => setEf((f) => ({ ...f, email: e.target.value }))}
                    placeholder="empresa@email.com"
                    className="input-field input-red w-full px-4 text-sm text-white placeholder-gray-700 rounded-xl"
                    style={IS}/>
                </div>
                <div>
                  <label className="block text-[10px] font-bold mb-2 uppercase tracking-[.1em]" style={{ color:"#374151" }}>Senha</label>
                  <div className="relative">
                    <input type={showPass ? "text" : "password"} required minLength={6}
                      value={ef.senha}
                      onChange={(e) => setEf((f) => ({ ...f, senha: e.target.value }))}
                      placeholder="Mínimo 6 caracteres"
                      className="input-field input-red w-full pl-4 pr-12 text-sm text-white placeholder-gray-700 rounded-xl"
                      style={IS}/>
                    <button type="button" onClick={() => setShowPass(!showPass)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 transition-colors" style={{ color:"#374151" }}
                      onMouseEnter={(e)=>(e.currentTarget.style.color="#9ca3af")}
                      onMouseLeave={(e)=>(e.currentTarget.style.color="#374151")}>
                      {showPass ? <EyeOff size={16}/> : <Eye size={16}/>}
                    </button>
                  </div>
                </div>

                {error && (
                  <p className="text-xs px-4 py-3 rounded-xl" style={{ background:"rgba(228,0,43,.07)",border:"1px solid rgba(228,0,43,.2)",color:"#FFC72C" }}>
                    ⚠ {error}
                  </p>
                )}

                <button type="submit" disabled={loading}
                  className="btn-primary w-full flex items-center justify-center gap-2 rounded-xl text-sm font-bold text-white"
                  style={{
                    height:50,
                    background:loading ? "#7f1d1d" : "linear-gradient(135deg,#fca5a5 0%,#E4002B 45%,#a84400 100%)",
                    boxShadow:loading ? "none" : "0 4px 24px rgba(228,0,43,.3)",
                    opacity:loading ? .7 : 1,
                  }}>
                  {loading ? <><Loader2 size={16} className="animate-spin"/> Criando...</> : <>Criar conta <ArrowRight size={15}/></>}
                </button>

                <p className="text-center text-xs" style={{ color:"#4b5563" }}>
                  Já tem conta?{" "}
                  <Link href="/login" className="font-bold" style={{ color:"#E4002B" }}>Entrar</Link>
                </p>
              </form>
            </div>
          )}

          {/* ── MOTOBOY FORM ── */}
          {step === "motoboy" && (
            <div key="motoboy" className="step-in">
              <div className="flex items-center gap-3 mb-5">
                <button className="back-btn w-8 h-8 rounded-xl flex items-center justify-center"
                  style={{ background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.08)",color:"#6b7280" }}
                  onClick={() => { setStep("choose"); setError(""); }}>
                  <ChevronLeft size={15}/>
                </button>
                <div>
                  <h2 className="text-lg font-black text-white" style={{ letterSpacing:"-0.035em" }}>Cadastro de Motoboy</h2>
                  <p className="text-xs" style={{ color:"#6b7280" }}>Preencha seus dados pessoais</p>
                </div>
              </div>

              <div className="mb-5 px-4 py-3 rounded-2xl text-xs"
                style={{ background:"rgba(251,191,36,.06)",border:"1px solid rgba(251,191,36,.15)",color:"#d97706" }}>
                Após criar sua conta, aguarde o convite de uma empresa para começar a entregar.
              </div>

              <form onSubmit={registerMotoboy} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold mb-2 uppercase tracking-[.1em]" style={{ color:"#374151" }}>Seu nome</label>
                  <input type="text" required value={mf.nome}
                    onChange={(e) => setMf((f) => ({ ...f, nome: e.target.value }))}
                    placeholder="João da Silva"
                    className="input-field input-yellow w-full px-4 text-sm text-white placeholder-gray-700 rounded-xl"
                    style={IS}/>
                </div>
                <div>
                  <label className="block text-[10px] font-bold mb-2 uppercase tracking-[.1em]" style={{ color:"#374151" }}>Telefone</label>
                  <input type="tel" required value={mf.telefone}
                    onChange={(e) => setMf((f) => ({ ...f, telefone: e.target.value }))}
                    placeholder="(11) 99999-9999"
                    className="input-field input-yellow w-full px-4 text-sm text-white placeholder-gray-700 rounded-xl"
                    style={IS}/>
                </div>
                <div>
                  <label className="block text-[10px] font-bold mb-2 uppercase tracking-[.1em]" style={{ color:"#374151" }}>Email</label>
                  <input type="email" required value={mf.email}
                    onChange={(e) => setMf((f) => ({ ...f, email: e.target.value }))}
                    placeholder="motoboy@email.com"
                    className="input-field input-yellow w-full px-4 text-sm text-white placeholder-gray-700 rounded-xl"
                    style={IS}/>
                </div>
                <div>
                  <label className="block text-[10px] font-bold mb-2 uppercase tracking-[.1em]" style={{ color:"#374151" }}>Senha</label>
                  <div className="relative">
                    <input type={showPass ? "text" : "password"} required minLength={6}
                      value={mf.senha}
                      onChange={(e) => setMf((f) => ({ ...f, senha: e.target.value }))}
                      placeholder="Mínimo 6 caracteres"
                      className="input-field input-yellow w-full pl-4 pr-12 text-sm text-white placeholder-gray-700 rounded-xl"
                      style={IS}/>
                    <button type="button" onClick={() => setShowPass(!showPass)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 transition-colors" style={{ color:"#374151" }}
                      onMouseEnter={(e)=>(e.currentTarget.style.color="#9ca3af")}
                      onMouseLeave={(e)=>(e.currentTarget.style.color="#374151")}>
                      {showPass ? <EyeOff size={16}/> : <Eye size={16}/>}
                    </button>
                  </div>
                </div>

                {error && (
                  <p className="text-xs px-4 py-3 rounded-xl" style={{ background:"rgba(228,0,43,.07)",border:"1px solid rgba(228,0,43,.2)",color:"#FFC72C" }}>
                    ⚠ {error}
                  </p>
                )}

                <button type="submit" disabled={loading}
                  className="btn-primary w-full flex items-center justify-center gap-2 rounded-xl text-sm font-bold"
                  style={{
                    height:50,
                    background:loading ? "#78350f" : "linear-gradient(135deg,#fef3c7 0%,#fbbf24 45%,#d97706 100%)",
                    color:loading ? "#fff" : "#000",
                    boxShadow:loading ? "none" : "0 4px 24px rgba(251,191,36,.3)",
                    opacity:loading ? .7 : 1,
                  }}>
                  {loading ? <><Loader2 size={16} className="animate-spin"/> Criando...</> : <>Criar conta <ArrowRight size={15}/></>}
                </button>

                <p className="text-center text-xs" style={{ color:"#4b5563" }}>
                  Já tem conta?{" "}
                  <Link href="/login" className="font-bold" style={{ color:"#fbbf24" }}>Entrar</Link>
                </p>
              </form>
            </div>
          )}

          {/* ── SUCCESS EMPRESA ── */}
          {step === "ok_empresa" && (
            <div key="ok_empresa" className="step-in text-center py-4">
              <div className="success-pop w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6"
                style={{ background:"linear-gradient(135deg,rgba(34,197,94,.2) 0%,rgba(34,197,94,.05) 100%)",boxShadow:"0 0 40px rgba(34,197,94,.2)" }}>
                <CheckCircle size={36} style={{ color:"#22c55e" }}/>
              </div>
              <h2 className="text-2xl font-black text-white mb-2" style={{ letterSpacing:"-0.04em" }}>Conta criada!</h2>

              {emailPendente ? (
                <>
                  <p className="text-sm mb-8" style={{ color:"#6b7280",lineHeight:1.65 }}>
                    Enviamos um link de confirmação para{" "}
                    <span className="text-white font-medium">{ef.email}</span>.
                    <br/>Após confirmar, acesse o painel com seu e-mail e senha.
                  </p>
                  <Link href="/login"
                    className="btn-primary inline-flex items-center justify-center gap-2 px-8 rounded-xl text-sm font-bold text-white"
                    style={{
                      height:50,
                      background:"linear-gradient(135deg,#fca5a5 0%,#E4002B 45%,#a84400 100%)",
                      boxShadow:"0 4px 24px rgba(228,0,43,.3)",
                    }}>
                    Ir para o login <ArrowRight size={15}/>
                  </Link>
                </>
              ) : (
                <>
                  <p className="text-sm mb-6" style={{ color:"#6b7280",lineHeight:1.65 }}>
                    Compartilhe seu código com os motoboys da sua equipe.
                  </p>
                  {codigoCriado && (
                    <div className="mb-6 p-5 rounded-2xl"
                      style={{ background:"rgba(251,191,36,.07)",border:"1px solid rgba(251,191,36,.2)" }}>
                      <p className="text-[10px] font-bold uppercase tracking-[.12em] mb-3" style={{ color:"#4b5563" }}>Código da empresa</p>
                      <div className="flex items-center justify-center gap-3">
                        <span className="text-4xl font-black tracking-[.25em]"
                          style={{ color:"#fbbf24",fontFamily:"monospace" }}>
                          {codigoCriado}
                        </span>
                        <button onClick={copiar}
                          className="w-10 h-10 rounded-xl flex items-center justify-center transition-all"
                          style={{ background:"rgba(251,191,36,.15)",color:copiado ? "#22c55e" : "#fbbf24" }}>
                          {copiado ? <Check size={16}/> : <Copy size={16}/>}
                        </button>
                      </div>
                    </div>
                  )}
                  <button
                    onClick={() => { window.location.href = "/dashboard"; }}
                    className="btn-primary w-full flex items-center justify-center gap-2 rounded-xl text-sm font-bold text-white"
                    style={{
                      height:50,
                      background:"linear-gradient(135deg,#fca5a5 0%,#E4002B 45%,#a84400 100%)",
                      boxShadow:"0 4px 24px rgba(228,0,43,.3)",
                    }}>
                    Ir para o painel <ArrowRight size={15}/>
                  </button>
                </>
              )}
            </div>
          )}

          {/* ── SUCCESS MOTOBOY ── */}
          {step === "ok_motoboy" && (
            <div key="ok_motoboy" className="step-in text-center py-4">
              <div className="success-pop w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6"
                style={{ background:"linear-gradient(135deg,rgba(251,191,36,.2) 0%,rgba(251,191,36,.05) 100%)",boxShadow:"0 0 40px rgba(251,191,36,.2)" }}>
                <CheckCircle size={36} style={{ color:"#fbbf24" }}/>
              </div>
              <h2 className="text-2xl font-black text-white mb-2" style={{ letterSpacing:"-0.04em" }}>Cadastro feito!</h2>

              {emailPendente ? (
                <>
                  <p className="text-sm mb-8" style={{ color:"#6b7280",lineHeight:1.65 }}>
                    Enviamos um link de confirmação para{" "}
                    <span className="text-white font-medium">{mf.email}</span>.
                    <br/>Após confirmar, acesse o app com seu e-mail e senha.
                  </p>
                  <Link href="/login"
                    className="btn-primary inline-flex items-center justify-center gap-2 px-8 rounded-xl text-sm font-bold"
                    style={{
                      height:50,
                      background:"linear-gradient(135deg,#fef3c7 0%,#fbbf24 45%,#d97706 100%)",
                      color:"#000",
                      boxShadow:"0 4px 24px rgba(251,191,36,.3)",
                    }}>
                    Ir para o login <ArrowRight size={15}/>
                  </Link>
                </>
              ) : (
                <>
                  <p className="text-sm mb-8" style={{ color:"#6b7280",lineHeight:1.65 }}>
                    Sua conta foi criada. Acesse o app com seu e-mail e senha.
                  </p>
                  <button
                    onClick={() => { window.location.href = "/motoboy"; }}
                    className="btn-primary w-full flex items-center justify-center gap-2 rounded-xl text-sm font-bold"
                    style={{
                      height:50,
                      background:"linear-gradient(135deg,#fef3c7 0%,#fbbf24 45%,#d97706 100%)",
                      color:"#000",
                      boxShadow:"0 4px 24px rgba(251,191,36,.3)",
                    }}>
                    Abrir app do motoboy <ArrowRight size={15}/>
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        <p className="mt-8 text-xs card-in" style={{ color:"#1f2937",animationDelay:"200ms" }}>
          © 2025 Vellox · Todos os direitos reservados
        </p>
      </div>
    </>
  );
}

