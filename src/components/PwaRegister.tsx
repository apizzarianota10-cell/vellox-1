"use client";

import { useEffect } from "react";

// Escopo do service worker do app do motoboy (public/motoboy-sw.js). Ele cuida
// só de notificações (sem cache) e NÃO pode ser removido aqui.
const ESCOPO_MOTOBOY = "/motoboy";

export default function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
          let escopo = "";
          try { escopo = new URL(registration.scope).pathname; } catch { /* ignora */ }
          if (escopo.startsWith(ESCOPO_MOTOBOY)) continue;
          // SWs antigos (ex.: /sw.js com cache) continuam sendo removidos.
          registration.unregister();
        }
      });
    }
  }, []);
  return null;
}
