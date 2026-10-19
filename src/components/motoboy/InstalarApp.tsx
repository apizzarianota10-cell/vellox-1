"use client";

/**
 * "Instalar app" do motoboy.
 *
 * - Android/Chrome/Edge: usa o evento beforeinstallprompt (manifest
 *   /motoboy-manifest.json, ligado em src/app/motoboy/layout.tsx).
 * - iPhone/iPad (Safari não tem prompt): mostra o passo a passo
 *   "Compartilhar > Adicionar à Tela de Início".
 * - Some quando o app já está instalado (modo standalone).
 *
 * variante="banner" (padrão): cartão flutuante dispensável.
 * variante="botao": só um botão, para colocar em telas como Perfil.
 */

import { useEffect, useState } from "react";
import { Download, Share, PlusSquare, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

const DISPENSA_KEY = "vellox_mb_instalar_dispensado_ate";
const DISPENSA_MS = 3 * 24 * 60 * 60 * 1000;

function ehIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
}

function ehStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export default function InstalarApp({ variante = "banner" }: { variante?: "banner" | "botao" }) {
  const [evento, setEvento] = useState<BeforeInstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [instalado, setInstalado] = useState(true);
  const [dispensado, setDispensado] = useState(true);
  const [mostrarPassos, setMostrarPassos] = useState(false);

  useEffect(() => {
    setIos(ehIOS());
    setInstalado(ehStandalone());
    try { setDispensado(Number(localStorage.getItem(DISPENSA_KEY) ?? 0) > Date.now()); } catch { setDispensado(false); }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvento(e as BeforeInstallPromptEvent);
    };
    const onInstalado = () => { setInstalado(true); setEvento(null); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalado);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalado);
    };
  }, []);

  async function instalar() {
    if (evento) {
      try {
        await evento.prompt();
        const escolha = await evento.userChoice;
        if (escolha.outcome === "accepted") setInstalado(true);
      } catch { /* prompt já usado */ }
      setEvento(null);
      return;
    }
    if (ios) setMostrarPassos(v => !v);
  }

  function dispensar() {
    setDispensado(true);
    try { localStorage.setItem(DISPENSA_KEY, String(Date.now() + DISPENSA_MS)); } catch { /* ignora */ }
  }

  const podeInstalar = !instalado && (!!evento || ios);
  if (!podeInstalar) return null;
  if (variante === "banner" && dispensado) return null;

  const passosIOS = mostrarPassos && ios && (
    <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 10, background: "rgba(255,255,255,0.05)", fontSize: 12, color: "#cbd5e1", lineHeight: 1.6 }}>
      <p style={{ margin: 0, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        1. No Safari, toque em <b style={{ color: "#fff" }}>Compartilhar</b> <Share size={13} style={{ color: "#60a5fa" }} />
      </p>
      <p style={{ margin: 0, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        2. Escolha <b style={{ color: "#fff" }}>Adicionar à Tela de Início</b> <PlusSquare size={13} />
      </p>
      <p style={{ margin: 0 }}>3. Toque em <b style={{ color: "#fff" }}>Adicionar</b> e abra pelo ícone “Vellox Motoboy”.</p>
    </div>
  );

  const botao = (
    <button type="button" onClick={instalar}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
        background: "#E4002B", color: "#fff", border: "none", borderRadius: 10,
        padding: "8px 12px", fontSize: 12, fontWeight: 800, cursor: "pointer", flexShrink: 0,
      }}>
      <Download size={14} />
      {evento ? "Instalar app" : "Como instalar"}
    </button>
  );

  if (variante === "botao") {
    return (
      <div style={{ fontFamily: "system-ui, sans-serif" }}>
        {botao}
        {passosIOS}
      </div>
    );
  }

  return (
    <div style={{
      pointerEvents: "auto",
      background: "#111114", color: "#f8fafc",
      border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14,
      padding: "10px 12px", boxShadow: "0 10px 30px rgba(0,0,0,0.45)",
      fontFamily: "system-ui, sans-serif",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/motoboy-icone?s=192" alt="" width={34} height={34} style={{ borderRadius: 9, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 800, margin: 0 }}>Instale o Vellox Motoboy</p>
          <p style={{ fontSize: 11, color: "#94a3b8", margin: "1px 0 0", lineHeight: 1.35 }}>
            Abre direto na tela inicial, em tela cheia, e recebe avisos de pedido.
          </p>
        </div>
        {botao}
        <button type="button" onClick={dispensar} aria-label="Fechar"
          style={{ background: "none", border: "none", color: "#64748b", padding: 4, cursor: "pointer", flexShrink: 0 }}>
          <X size={15} />
        </button>
      </div>
      {passosIOS}
    </div>
  );
}
