"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Zap, CreditCard, CheckCircle2, LogOut, ArrowRight } from "lucide-react";

const KIRVANO_CHECKOUT_URL = process.env.NEXT_PUBLIC_KIRVANO_CHECKOUT_URL ?? "#";

const beneficios = [
  "Painel de pedidos em tempo real",
  "Gestão completa de motoboys",
  "Mapa de rastreamento ao vivo",
  "Relatórios financeiros",
  "Sistema de fila inteligente",
];

export default function AssinaturaPage() {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{ background: "#070707" }}
    >
      <div
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(228,0,43,0.06) 0%, transparent 70%)",
          filter: "blur(80px)",
        }}
      />

      <div
        className="relative z-10 w-full max-w-md rounded-2xl p-8"
        style={{
          background: "rgba(255,255,255,0.025)",
          border: "1px solid rgba(255,255,255,0.08)",
          backdropFilter: "blur(24px)",
          boxShadow: [
            "0 0 0 1px rgba(228,0,43,0.05)",
            "0 8px 16px rgba(0,0,0,0.5)",
            "0 32px 80px rgba(0,0,0,0.65)",
          ].join(", "),
        }}
      >
        <div className="flex justify-center mb-6">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, rgba(228,0,43,0.2), rgba(228,0,43,0.04))",
              border: "1px solid rgba(228,0,43,0.2)",
              boxShadow: "0 0 30px rgba(228,0,43,0.18)",
            }}
          >
            <CreditCard size={24} style={{ color: "#E4002B" }} strokeWidth={2} />
          </div>
        </div>

        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white" style={{ letterSpacing: "-0.04em" }}>
            Assinatura necessária
          </h1>
          <p className="text-sm mt-2" style={{ color: "#6b7280", lineHeight: 1.6 }}>
            Seu período de teste expirou. Ative sua assinatura mensal para continuar usando o Vellox.
          </p>
        </div>

        <div
          className="rounded-xl p-4 mb-6 space-y-2.5"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          {beneficios.map((b) => (
            <div key={b} className="flex items-center gap-2.5">
              <CheckCircle2 size={14} style={{ color: "#4ade80", flexShrink: 0 }} />
              <span className="text-sm" style={{ color: "#9ca3af" }}>{b}</span>
            </div>
          ))}
        </div>

        <a
          href={KIRVANO_CHECKOUT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full flex items-center justify-center gap-2 rounded-xl text-sm font-bold text-white mb-3"
          style={{
            height: 48,
            background: "linear-gradient(135deg, #FFC72C 0%, #E4002B 45%, #a84400 100%)",
            boxShadow: "0 0 24px rgba(228,0,43,0.3), 0 4px 16px rgba(0,0,0,0.4)",
            textDecoration: "none",
            display: "flex",
          }}
        >
          <Zap size={15} strokeWidth={2.5} />
          Assinar agora
          <ArrowRight size={15} />
        </a>

        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 rounded-xl text-sm font-medium"
          style={{
            height: 44,
            border: "1px solid rgba(255,255,255,0.07)",
            color: "#4b5563",
            background: "transparent",
          }}
        >
          <LogOut size={14} />
          Sair da conta
        </button>

        <p className="text-center text-xs mt-6" style={{ color: "#1f2937" }}>
          Dúvidas? Fale com o suporte via WhatsApp
        </p>
      </div>
    </div>
  );
}
