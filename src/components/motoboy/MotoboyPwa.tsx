"use client";

import InstalarApp from "./InstalarApp";
import NotificacoesMotoboy from "./NotificacoesMotoboy";

// Montado pelo layout de /motoboy: banners de instalar app e de ativar avisos,
// empilhados no rodapé. Cada um some sozinho quando não se aplica.
export default function MotoboyPwa() {
  return (
    <div style={{
      position: "fixed", left: 12, right: 12,
      bottom: "calc(12px + env(safe-area-inset-bottom))",
      zIndex: 9000, display: "flex", flexDirection: "column", gap: 8,
      maxWidth: 480, margin: "0 auto",
      pointerEvents: "none",
    }}>
      <NotificacoesMotoboy />
      <InstalarApp />
    </div>
  );
}
