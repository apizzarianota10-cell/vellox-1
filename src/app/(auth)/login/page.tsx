"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  Eye, EyeOff, Loader2, ArrowRight, ChevronLeft,
  Zap, Building2, Bike, LogOut,
} from "lucide-react";
import SplashScreen from "@/components/SplashScreen";

type Step = "select" | "empresa" | "motoboy" | "forgot";

export default function LoginPage() {
  const [splashDone, setSplashDone]   = useState(false);
  const handleSplashDone = useCallback(() => setSplashDone(true), []);

  const [step, setStep]               = useState<Step>("select");
  // Sessão existente
  const [sessaoAtiva, setSessaoAtiva] = useState<{ email: string; tipo: string } | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setCheckingSession(false), 3_000); // fallback: 3s
    async function checkSession() {
      const supabase = createClient();
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const tipo = (user.user_metadata?.tipo as string | undefined) ?? "empresa";
          setSessaoAtiva({ email: user.email ?? "", tipo });
        }
      } catch { /* sem conectividade — mostra login normalmente */ }
      clearTimeout(timer);
      setCheckingSession(false);
    }
    checkSession();
    return () => clearTimeout(timer);
  }, []);
  const [email, setEmail]             = useState("");
  const [password, setPassword]       = useState("");
  const [showPass, setShowPass]       = useState(false);
  const [error, setError]             = useState("");
  const [loading, setLoading]         = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent]   = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotType, setForgotType]   = useState<"empresa" | "motoboy">("empresa");

  const isYellow =
    step === "motoboy" || (step === "forgot" && forgotType === "motoboy");
  const accent = isYellow ? "#fbbf24" : "#FF6A00";

  function goTo(s: Step) {
    setStep(s);
    setError("");
    if (s === "select") { setEmail(""); setPassword(""); }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setError(error.message || "Email ou senha inválidos."); setLoading(false); return; }
    const tipo = data.user?.user_metadata?.tipo as string | undefined;
    window.location.href = tipo === "motoboy" ? "/motoboy" : tipo === "god" ? "/god" : "/dashboard";
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setForgotLoading(true);
    const supabase = createClient();
    await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    setForgotLoading(false);
    setForgotSent(true);
  }

  if (!splashDone) return <SplashScreen onComplete={handleSplashDone} />;

  // ── Tela de carregamento ──
  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-base)" }}>
        <Loader2 size={28} className="animate-spin" style={{ color: "#FF6A00" }} />
      </div>
    );
  }

  // ── Sessão existente: confirmar ou trocar ──
  if (sessaoAtiva) {
    const destino = sessaoAtiva.tipo === "motoboy" ? "/motoboy" : sessaoAtiva.tipo === "god" ? "/god" : "/dashboard";
    const label   = sessaoAtiva.tipo === "motoboy" ? "Motoboy" : sessaoAtiva.tipo === "god" ? "God" : "Empresa";
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6" style={{ background: "var(--bg-base)" }}>
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center mb-6"
          style={{ background: "linear-gradient(135deg,#FF6A00,#a84400)", boxShadow: "0 0 24px rgba(255,106,0,0.35)" }}>
          <Zap size={20} className="text-white" />
        </div>
        <h1 className="text-xl font-bold text-white mb-1">Sessão ativa</h1>
        <p className="text-sm mb-6 text-center" style={{ color: "#64748b" }}>
          Você está logado como <strong className="text-white">{sessaoAtiva.email}</strong>
        </p>
        <div className="w-full max-w-xs space-y-3">
          <button
            onClick={() => { window.location.href = destino; }}
            className="w-full py-4 rounded-2xl text-sm font-bold text-white"
            style={{ background: "linear-gradient(135deg,#cc5500,#a84400)" }}
          >
            Continuar como {label}
          </button>
          <button
            onClick={async () => {
              const supabase = createClient();
              await supabase.auth.signOut({ scope: "global" });
              setSessaoAtiva(null);
            }}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-sm font-semibold"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#94a3b8" }}
          >
            <LogOut size={15} /> Trocar conta
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        /* ── Background blobs ── */
        @keyframes blobA {
          0%,100%{transform:translate(0,0) scale(1);opacity:.55}
          30%{transform:translate(4%,-7%) scale(1.1);opacity:.75}
          70%{transform:translate(-3%,5%) scale(.93);opacity:.4}
        }
        @keyframes blobB {
          0%,100%{transform:translate(0,0) scale(1);opacity:.35}
          40%{transform:translate(-5%,4%) scale(1.13);opacity:.55}
          80%{transform:translate(3%,-4%) scale(.9);opacity:.25}
        }
        @keyframes blobC {
          0%,100%{transform:translate(0,0) scale(1);opacity:.2}
          50%{transform:translate(4%,7%) scale(1.18);opacity:.38}
        }
        /* ── Logo float ── */
        @keyframes float {
          0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}
        }
        /* ── Card entrance ── */
        @keyframes cardIn {
          from{opacity:0;transform:translateY(28px) scale(.97)}
          to{opacity:1;transform:translateY(0) scale(1)}
        }
        /* ── Step content slide ── */
        @keyframes stepIn {
          from{opacity:0;transform:translateX(18px)}
          to{opacity:1;transform:translateX(0)}
        }
        /* ── Glowing border pulse ── */
        @keyframes pulseRed {
          0%,100%{box-shadow:0 0 0 1px rgba(255,106,0,.12),0 0 40px rgba(255,106,0,.08),0 32px 96px rgba(0,0,0,.75)}
          50%{box-shadow:0 0 0 1px rgba(255,106,0,.28),0 0 70px rgba(255,106,0,.18),0 32px 96px rgba(0,0,0,.75)}
        }
        @keyframes pulseYellow {
          0%,100%{box-shadow:0 0 0 1px rgba(251,191,36,.12),0 0 40px rgba(251,191,36,.08),0 32px 96px rgba(0,0,0,.75)}
          50%{box-shadow:0 0 0 1px rgba(251,191,36,.28),0 0 70px rgba(251,191,36,.18),0 32px 96px rgba(0,0,0,.75)}
        }
        /* ── Button shimmer ── */
        @keyframes shimmer {
          0%{transform:translateX(-130%)}
          100%{transform:translateX(130%)}
        }
        /* ── Particles float ── */
        @keyframes particleUp {
          0%{transform:translateY(0) scale(1);opacity:.6}
          100%{transform:translateY(-100vh) scale(.5);opacity:0}
        }

        .logo-float{animation:float 4s ease-in-out infinite}
        .card-in{animation:cardIn .55s cubic-bezier(.16,1,.3,1) both}
        .step-in{animation:stepIn .38s cubic-bezier(.16,1,.3,1) both}
        .card-red{animation:pulseRed 3.5s ease-in-out infinite}
        .card-yellow{animation:pulseYellow 3.5s ease-in-out infinite}

        .btn-primary{
          position:relative;overflow:hidden;
          transition:transform .2s,box-shadow .2s;
        }
        .btn-primary::after{
          content:'';position:absolute;inset:0;
          background:linear-gradient(105deg,transparent 30%,rgba(255,255,255,.2) 50%,transparent 70%);
          animation:shimmer 3s ease-in-out infinite;
        }
        .btn-primary:hover:not(:disabled){transform:translateY(-2px)}
        .btn-primary:active:not(:disabled){transform:scale(.98)}

        .type-card{transition:transform .22s cubic-bezier(.16,1,.3,1),background .18s,border-color .18s;cursor:pointer}
        .type-card:hover{transform:translateY(-3px) scale(1.015)}
        .type-card:active{transform:scale(.98)}

        .input-field{transition:border-color .2s,box-shadow .2s,background .2s;outline:none}
        .input-red:focus{border-color:rgba(255,106,0,.5)!important;box-shadow:0 0 0 3px rgba(255,106,0,.1)!important;background:rgba(255,106,0,.03)!important}
        .input-yellow:focus{border-color:rgba(251,191,36,.5)!important;box-shadow:0 0 0 3px rgba(251,191,36,.1)!important;background:rgba(251,191,36,.03)!important}

        .back-btn{transition:background .15s,color .15s}
        .back-btn:hover{background:rgba(255,255,255,.1)!important}
      `}</style>

      {/* ── Fixed background ── */}
      <div className="fixed inset-0" style={{ background: "var(--bg-base)" }}>
        {/* Blob A — big red */}
        <div className="absolute pointer-events-none" style={{
          width: 720, height: 720, top: "-18%", left: "-12%", borderRadius: "50%",
          background: "radial-gradient(circle, rgba(204,85,0,.22) 0%, transparent 65%)",
          animation: "blobA 14s ease-in-out infinite",
        }} />
        {/* Blob B — medium red bottom-right */}
        <div className="absolute pointer-events-none" style={{
          width: 580, height: 580, bottom: "-18%", right: "-10%", borderRadius: "50%",
          background: "radial-gradient(circle, rgba(255,106,0,.16) 0%, transparent 65%)",
          animation: "blobB 18s ease-in-out infinite",
        }} />
        {/* Blob C — warm yellow accent */}
        <div className="absolute pointer-events-none" style={{
          width: 380, height: 380, top: "35%", right: "18%", borderRadius: "50%",
          background: "radial-gradient(circle, rgba(251,191,36,.07) 0%, transparent 65%)",
          animation: "blobC 11s ease-in-out infinite",
        }} />
        {/* Dot grid */}
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,.065) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }} />
        {/* Radial vignette */}
        <div className="absolute inset-0 pointer-events-none" style={{
          background: "radial-gradient(ellipse 85% 85% at 50% 50%, transparent 20%, rgba(7,7,10,.78) 100%)",
        }} />
      </div>

      {/* ── Page ── */}
      <div className="relative min-h-screen flex flex-col items-center justify-center px-5 py-12">

        {/* Logo */}
        <div className="flex items-center gap-3 mb-10 card-in" style={{ animationDelay: "0ms" }}>
          <div
            className="logo-float w-11 h-11 rounded-2xl flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, #FF8C1A 0%, #cc5500 100%)",
              boxShadow: "0 0 28px rgba(255,106,0,.55), 0 0 70px rgba(255,106,0,.18)",
            }}
          >
            <Zap size={22} className="text-white" strokeWidth={2.5} />
          </div>
          <span className="text-[26px] font-black text-white" style={{ letterSpacing: "-0.045em" }}>
            Vellox
          </span>
        </div>

        {/* Card */}
        <div
          className={`${isYellow ? "card-yellow" : "card-red"} card-in w-full max-w-[400px] rounded-[28px] p-8`}
          style={{
            background: "rgba(255,255,255,.022)",
            border: `1px solid ${isYellow ? "rgba(251,191,36,.14)" : "rgba(255,106,0,.14)"}`,
            backdropFilter: "blur(52px)",
            animationDelay: "80ms",
            transition: "border-color .4s",
          }}
        >

          {/* ── SELECT ── */}
          {step === "select" && (
            <div key="select" className="step-in">
              <p className="text-[10px] font-bold uppercase tracking-[.14em] mb-2" style={{ color: "#374151" }}>
                VELLOX · PAINEL
              </p>
              <h1 className="text-[27px] font-black text-white mb-1" style={{ letterSpacing: "-0.042em" }}>
                Bem-vindo de volta
              </h1>
              <p className="text-sm mb-8" style={{ color: "#6b7280" }}>
                Selecione como deseja entrar
              </p>

              <div className="space-y-3">
                <button
                  className="type-card w-full p-5 rounded-2xl text-left"
                  style={{
                    background: "linear-gradient(135deg, rgba(255,106,0,.09) 0%, rgba(255,106,0,.04) 100%)",
                    border: "1px solid rgba(255,106,0,.2)",
                  }}
                  onClick={() => goTo("empresa")}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                      style={{
                        background: "linear-gradient(135deg, rgba(255,106,0,.28) 0%, rgba(255,106,0,.1) 100%)",
                        boxShadow: "0 0 20px rgba(255,106,0,.22)",
                      }}>
                      <Building2 size={20} style={{ color: "#FF6A00" }} />
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-white text-sm leading-tight">Entrar como Empresa</p>
                      <p className="text-xs mt-0.5" style={{ color: "#6b7280" }}>Painel de gestão de entregas</p>
                    </div>
                    <ArrowRight size={16} style={{ color: "#374151" }} />
                  </div>
                </button>

                <button
                  className="type-card w-full p-5 rounded-2xl text-left"
                  style={{
                    background: "linear-gradient(135deg, rgba(251,191,36,.09) 0%, rgba(251,191,36,.04) 100%)",
                    border: "1px solid rgba(251,191,36,.2)",
                  }}
                  onClick={() => { window.location.href = "/motoboy"; }}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                      style={{
                        background: "linear-gradient(135deg, rgba(251,191,36,.28) 0%, rgba(251,191,36,.1) 100%)",
                        boxShadow: "0 0 20px rgba(251,191,36,.22)",
                      }}>
                      <Bike size={20} style={{ color: "#fbbf24" }} />
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-white text-sm leading-tight">Entrar como Motoboy</p>
                      <p className="text-xs mt-0.5" style={{ color: "#6b7280" }}>Acesse suas rotas e entregas</p>
                    </div>
                    <ArrowRight size={16} style={{ color: "#374151" }} />
                  </div>
                </button>
              </div>

              <div className="mt-6 pt-5" style={{ borderTop: "1px solid rgba(255,255,255,.06)" }}>
                <p className="text-center text-xs" style={{ color: "#4b5563" }}>
                  Ainda não tem conta?{" "}
                  <Link href="/register" className="font-bold" style={{ color: "#FF6A00" }}>
                    Criar conta gratuitamente
                  </Link>
                </p>
              </div>
            </div>
          )}

          {/* ── LOGIN FORM ── */}
          {(step === "empresa" || step === "motoboy") && (
            <div key={step} className="step-in">
              <div className="flex items-center gap-3 mb-7">
                <button
                  className="back-btn w-8 h-8 rounded-xl flex items-center justify-center"
                  style={{ background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.08)", color: "#6b7280" }}
                  onClick={() => goTo("select")}
                >
                  <ChevronLeft size={15} />
                </button>
                <div>
                  <h2 className="text-lg font-black text-white" style={{ letterSpacing: "-0.035em" }}>
                    {step === "empresa" ? "Acesso Empresa" : "Acesso Motoboy"}
                  </h2>
                  <p className="text-xs" style={{ color: "#6b7280" }}>Entre com suas credenciais</p>
                </div>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold mb-2 uppercase tracking-[.1em]" style={{ color: "#374151" }}>
                    Email
                  </label>
                  <input
                    type="email" required autoFocus autoComplete="email" inputMode="email"
                    value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder={step === "empresa" ? "empresa@email.com" : "motoboy@email.com"}
                    className={`input-field ${isYellow ? "input-yellow" : "input-red"} w-full px-4 text-sm text-white placeholder-gray-700 rounded-xl`}
                    style={{ height: 48, background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", caretColor: accent }}
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold mb-2 uppercase tracking-[.1em]" style={{ color: "#374151" }}>
                    Senha
                  </label>
                  <div className="relative">
                    <input
                      type={showPass ? "text" : "password"} required autoComplete="current-password"
                      value={password} onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className={`input-field ${isYellow ? "input-yellow" : "input-red"} w-full pl-4 pr-12 text-sm text-white placeholder-gray-700 rounded-xl`}
                      style={{ height: 48, background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", caretColor: accent }}
                    />
                    <button
                      type="button" onClick={() => setShowPass(!showPass)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 transition-colors"
                      style={{ color: "#374151" }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "#9ca3af")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "#374151")}
                    >
                      {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    className="text-xs font-semibold transition-opacity"
                    style={{ color: accent }}
                    onClick={() => {
                      setForgotType(step as "empresa" | "motoboy");
                      setForgotEmail(email);
                      setForgotSent(false);
                      setStep("forgot");
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.opacity = ".65")}
                    onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
                  >
                    Esqueci a senha
                  </button>
                </div>

                {error && (
                  <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-xs"
                    style={{ background: "rgba(255,106,0,.07)", border: "1px solid rgba(255,106,0,.2)", color: "#FF8C1A" }}>
                    <span>⚠</span> {error}
                  </div>
                )}

                <button
                  type="submit" disabled={loading}
                  className="btn-primary w-full flex items-center justify-center gap-2 rounded-xl text-sm font-bold"
                  style={{
                    height: 50,
                    background: loading
                      ? (isYellow ? "#78350f" : "#7f1d1d")
                      : isYellow
                        ? "linear-gradient(135deg, #fef3c7 0%, #fbbf24 45%, #d97706 100%)"
                        : "linear-gradient(135deg, #fca5a5 0%, #FF6A00 45%, #a84400 100%)",
                    color: isYellow && !loading ? "#000" : "#fff",
                    boxShadow: loading ? "none" : isYellow
                      ? "0 4px 24px rgba(251,191,36,.3)"
                      : "0 4px 24px rgba(255,106,0,.3)",
                    opacity: loading ? .7 : 1,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {loading
                    ? <><Loader2 size={16} className="animate-spin" /> Entrando...</>
                    : <>Entrar <ArrowRight size={15} /></>
                  }
                </button>

                <p className="text-center text-xs" style={{ color: "#4b5563" }}>
                  Sem conta?{" "}
                  <Link href="/register" className="font-bold" style={{ color: accent }}>
                    Criar conta
                  </Link>
                </p>
              </form>
            </div>
          )}

          {/* ── FORGOT ── */}
          {step === "forgot" && (
            <div key="forgot" className="step-in">
              <div className="flex items-center gap-3 mb-7">
                <button
                  className="back-btn w-8 h-8 rounded-xl flex items-center justify-center"
                  style={{ background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.08)", color: "#6b7280" }}
                  onClick={() => { setStep(forgotType); setForgotSent(false); }}
                >
                  <ChevronLeft size={15} />
                </button>
                <div>
                  <h2 className="text-lg font-black text-white" style={{ letterSpacing: "-0.035em" }}>Recuperar senha</h2>
                  <p className="text-xs" style={{ color: "#6b7280" }}>Enviaremos um link ao seu email</p>
                </div>
              </div>

              {forgotSent ? (
                <div className="text-center py-4 step-in">
                  <div className="text-5xl mb-4">✉️</div>
                  <p className="font-black text-white text-xl mb-2" style={{ letterSpacing: "-0.03em" }}>Email enviado!</p>
                  <p className="text-sm" style={{ color: "#6b7280", lineHeight: 1.65 }}>
                    Verifique sua caixa de entrada e siga as instruções para redefinir sua senha.
                  </p>
                  <button
                    onClick={() => { setStep(forgotType); setForgotSent(false); }}
                    className="mt-6 text-sm font-bold transition-opacity"
                    style={{ color: accent }}
                    onMouseEnter={(e) => (e.currentTarget.style.opacity = ".65")}
                    onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
                  >
                    ← Voltar ao login
                  </button>
                </div>
              ) : (
                <form onSubmit={handleForgot} className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold mb-2 uppercase tracking-[.1em]" style={{ color: "#374151" }}>
                      Email
                    </label>
                    <input
                      type="email" required autoFocus autoComplete="email"
                      value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="seu@email.com"
                      className="input-field input-red w-full px-4 text-sm text-white placeholder-gray-700 rounded-xl"
                      style={{ height: 48, background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)" }}
                    />
                  </div>
                  <button
                    type="submit" disabled={forgotLoading}
                    className="btn-primary w-full flex items-center justify-center gap-2 rounded-xl text-sm font-bold"
                    style={{
                      height: 50,
                      background: forgotType === "empresa"
                        ? "linear-gradient(135deg, #fca5a5 0%, #FF6A00 45%, #a84400 100%)"
                        : "linear-gradient(135deg, #fef3c7 0%, #fbbf24 45%, #d97706 100%)",
                      color: forgotType === "motoboy" ? "#000" : "#fff",
                      boxShadow: forgotType === "empresa"
                        ? "0 4px 24px rgba(255,106,0,.3)"
                        : "0 4px 24px rgba(251,191,36,.3)",
                      opacity: forgotLoading ? .7 : 1,
                    }}
                  >
                    {forgotLoading
                      ? <><Loader2 size={16} className="animate-spin" /> Enviando...</>
                      : <>Enviar link <ArrowRight size={15} /></>
                    }
                  </button>
                </form>
              )}
            </div>
          )}
        </div>

        <p className="mt-8 text-xs card-in" style={{ color: "#1f2937", animationDelay: "200ms" }}>
          © 2025 Vellox · Todos os direitos reservados
        </p>
      </div>
    </>
  );
}

