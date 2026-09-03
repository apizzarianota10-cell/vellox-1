"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Eye, EyeOff, Zap, Loader2, ArrowRight } from "lucide-react";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword]   = useState("");
  const [confirm, setConfirm]     = useState("");
  const [showPass, setShowPass]   = useState(false);
  const [showConf, setShowConf]   = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");
  const [done, setDone]           = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError("As senhas não coincidem."); return; }
    if (password.length < 6)  { setError("A senha deve ter pelo menos 6 caracteres."); return; }
    setLoading(true);
    setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setDone(true);
    setTimeout(() => router.push("/login"), 2500);
  }

  return (
    <>
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes glowPulse {
          0%, 100% { box-shadow: 0 0 24px rgba(168,0,33,0.5), 0 4px 32px rgba(0,0,0,0.4); }
          50%       { box-shadow: 0 0 50px rgba(168,0,33,0.85), 0 4px 32px rgba(0,0,0,0.4); }
        }
        .fade-up { animation: fadeUp 0.6s cubic-bezier(0.16,1,0.3,1) forwards; }
        .glow-btn { animation: glowPulse 2.5s ease-in-out infinite; transition: transform 0.2s ease, opacity 0.2s ease; }
        .glow-btn:not(:disabled):hover { transform: translateY(-2px); }
        .input-field { transition: border-color 0.25s, box-shadow 0.25s, background 0.25s; }
        .input-field:focus {
          border-color: rgba(228,0,43,0.65) !important;
          box-shadow: 0 0 0 3px rgba(168,0,33,0.14), 0 0 18px rgba(168,0,33,0.08) !important;
          background: rgba(228,0,43,0.035) !important;
        }
      `}</style>

      <div className="min-h-screen flex items-center justify-center px-6 py-10" style={{ background: "var(--bg-base)" }}>
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] h-[520px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(228,0,43,0.07) 0%, transparent 70%)", filter: "blur(60px)" }}
        />

        <div
          className="relative z-10 w-full max-w-[420px] rounded-2xl p-8 fade-up"
          style={{
            background: "rgba(255,255,255,0.025)",
            border: "1px solid rgba(255,255,255,0.08)",
            backdropFilter: "blur(24px)",
            boxShadow: [
              "0 0 0 1px rgba(228,0,43,0.05)",
              "0 8px 16px rgba(0,0,0,0.5)",
              "0 32px 80px rgba(0,0,0,0.65)",
              "inset 0 1px 0 rgba(255,255,255,0.06)",
            ].join(", "),
            animationDelay: "0.1s",
          }}
        >
          {done ? (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.25)" }}
              >
                <span style={{ fontSize: 24 }}>✓</span>
              </div>
              <p className="text-base font-bold text-white">Senha atualizada!</p>
              <p className="text-sm" style={{ color: "#9ca3af" }}>Redirecionando para o login...</p>
            </div>
          ) : (
            <>
              <div className="flex justify-center mb-6">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center"
                  style={{
                    background: "linear-gradient(135deg, rgba(228,0,43,0.2), rgba(228,0,43,0.04))",
                    border: "1px solid rgba(228,0,43,0.2)",
                    boxShadow: "0 0 30px rgba(228,0,43,0.18), inset 0 1px 0 rgba(228,0,43,0.08)",
                  }}
                >
                  <Zap size={24} style={{ color: "#E4002B" }} strokeWidth={2.5}/>
                </div>
              </div>

              <div className="text-center mb-8">
                <h2 className="text-[22px] font-bold text-white" style={{ letterSpacing: "-0.04em" }}>
                  Nova senha
                </h2>
                <p className="text-sm mt-1.5" style={{ color: "#6b7280" }}>Escolha uma senha para sua conta</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-[11px] font-semibold mb-2 uppercase" style={{ color: "#4b5563", letterSpacing: "0.07em" }}>
                    Nova senha
                  </label>
                  <div className="relative">
                    <input
                      type={showPass ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required autoFocus autoComplete="new-password"
                      placeholder="••••••••"
                      className="input-field w-full pl-4 pr-12 rounded-xl text-sm text-white placeholder-gray-700 outline-none"
                      style={{ height: 48, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(!showPass)}
                      className="absolute right-4 top-1/2 -translate-y-1/2"
                      style={{ color: "#4b5563", transition: "color 0.2s" }}
                    >
                      {showPass ? <EyeOff size={16}/> : <Eye size={16}/>}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold mb-2 uppercase" style={{ color: "#4b5563", letterSpacing: "0.07em" }}>
                    Confirmar senha
                  </label>
                  <div className="relative">
                    <input
                      type={showConf ? "text" : "password"}
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      required autoComplete="new-password"
                      placeholder="••••••••"
                      className="input-field w-full pl-4 pr-12 rounded-xl text-sm text-white placeholder-gray-700 outline-none"
                      style={{ height: 48, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConf(!showConf)}
                      className="absolute right-4 top-1/2 -translate-y-1/2"
                      style={{ color: "#4b5563", transition: "color 0.2s" }}
                    >
                      {showConf ? <EyeOff size={16}/> : <Eye size={16}/>}
                    </button>
                  </div>
                </div>

                {error && (
                  <div
                    className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm"
                    style={{
                      background: "rgba(228,0,43,0.08)",
                      border: "1px solid rgba(228,0,43,0.2)",
                      color: "#FFC72C",
                      boxShadow: "0 0 16px rgba(228,0,43,0.08)",
                    }}
                  >
                    <span>⚠</span> {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="glow-btn w-full flex items-center justify-center gap-2 rounded-xl text-sm font-bold text-white"
                  style={{
                    height: 48,
                    background: loading
                      ? "#7f1d1d"
                      : "linear-gradient(135deg, #FFC72C 0%, #E4002B 45%, #a84400 100%)",
                    opacity: loading ? 0.7 : 1,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {loading
                    ? <><Loader2 size={16} className="animate-spin"/> Salvando...</>
                    : <>Salvar senha <ArrowRight size={15}/></>
                  }
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </>
  );
}

