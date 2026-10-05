"use client";

import { useRef } from "react";
import {
  Printer, Navigation, Store, Star, BarChart3, Building2,
  ChevronLeft, ChevronRight,
} from "lucide-react";

const FACILIDADES = [
  { icon: Printer,    color: "#E4002B", title: "Impressão automática",   desc: "Cupom sai sozinho na impressora térmica assim que o pedido cai — sem clicar em nada." },
  { icon: Navigation, color: "#3b82f6", title: "Rastreamento ao vivo",   desc: "Veja no mapa onde cada motoboy está, em tempo real, direto do painel." },
  { icon: Store,      color: "#16a34a", title: "Catálogo digital",      desc: "Link próprio com seu cardápio, cores e logo. Cliente pede, pedido cai no painel." },
  { icon: Star,       color: "#f59e0b", title: "Avaliação de clientes", desc: "Cliente avalia o pedido depois de entregue — vira prova social na sua vitrine." },
  { icon: BarChart3,  color: "#0ea5e9", title: "Financeiro completo",   desc: "Faturamento, taxas de entrega e comissão dos motoboys calculados sozinhos." },
  { icon: Building2,  color: "#8b5cf6", title: "Multi-loja",            desc: "Gerencie várias unidades numa conta só, com relatório separado por loja." },
];

export default function FacilidadesCarousel() {
  const trackRef = useRef<HTMLDivElement>(null);

  function scroll(dir: 1 | -1) {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.min(320, el.clientWidth * 0.8), behavior: "smooth" });
  }

  return (
    <div data-reveal className="land-reveal" style={{ position: "relative" }}>
      <div
        ref={trackRef}
        className="land-carousel-track"
        style={{
          display: "flex", gap: 18, overflowX: "auto", scrollSnapType: "x mandatory",
          padding: "4px 24px 16px", margin: "0 -24px",
          scrollbarWidth: "none",
        }}
      >
        {FACILIDADES.map((f, i) => (
          <div key={i} style={{
            scrollSnapAlign: "start", flex: "0 0 auto",
            width: 260, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 20,
            padding: 24, boxShadow: "0 2px 12px rgba(0,0,0,.05)",
          }}>
            <div style={{ width: 48, height: 48, borderRadius: 13, background: `${f.color}15`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
              <f.icon size={22} color={f.color} strokeWidth={2} />
            </div>
            <h3 style={{ fontWeight: 800, fontSize: 16, color: "#0f172a", margin: "0 0 6px", letterSpacing: "-0.02em" }}>{f.title}</h3>
            <p style={{ fontSize: 13.5, color: "#64748b", lineHeight: 1.6, margin: 0 }}>{f.desc}</p>
          </div>
        ))}
      </div>

      {/* Setas — só desktop (ver media query em LandingPage.tsx), scroll por toque já funciona sozinho no mobile */}
      <div className="land-carousel-arrows" style={{ justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
        <button onClick={() => scroll(-1)} aria-label="Anterior"
          style={{ width: 38, height: 38, borderRadius: 999, border: "1.5px solid #e2e8f0", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <ChevronLeft size={18} color="#475569" />
        </button>
        <button onClick={() => scroll(1)} aria-label="Próximo"
          style={{ width: 38, height: 38, borderRadius: 999, border: "1.5px solid #e2e8f0", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <ChevronRight size={18} color="#475569" />
        </button>
      </div>
    </div>
  );
}
