"use client";

import { useEffect, useRef, useState } from "react";

const PATH = "M 100 330 C 200 330, 270 75, 430 145 S 660 375, 740 285";

export default function SplashScreen({ onComplete }: { onComplete: () => void }) {
  const pathRef  = useRef<SVGPathElement>(null);
  const rafRef   = useRef<number>(0);
  const [pathLen,   setPathLen]   = useState(0);
  const [progress,  setProgress]  = useState(0);
  const [showCoins, setShowCoins] = useState(false);
  const [showText,  setShowText]  = useState(false);
  const [exiting,   setExiting]   = useState(false);
  const [coinPos,   setCoinPos]   = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const el = pathRef.current;
    if (!el) return;
    const len = el.getTotalLength();
    setPathLen(len);

    const DURATION = 2200;
    let start: number | null = null;

    function ease(t: number) {
      return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    }

    function tick(now: number) {
      if (!start) start = now;
      const raw = Math.min((now - start) / DURATION, 1);
      setProgress(ease(raw));

      if (raw < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        // Converte coordenada SVG (740,285) para pixels reais de tela via CTM
        const svgEl = pathRef.current?.ownerSVGElement;
        if (svgEl) {
          const ctm = svgEl.getScreenCTM();
          if (ctm) {
            const pt = svgEl.createSVGPoint();
            pt.x = 740; pt.y = 285;
            const screen = pt.matrixTransform(ctm);
            setCoinPos({ x: screen.x, y: screen.y });
          }
        }
        setTimeout(() => setShowCoins(true),  60);
        setTimeout(() => setShowText(true),   500);
        setTimeout(() => setExiting(true),    2200);
        setTimeout(onComplete,                2900);
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [onComplete]);

  const offset = pathLen > 0 ? pathLen * (1 - progress) : 9999;


  return (
    <>
      <style>{`
        @keyframes coin-rise {
          0%   { transform: translateY(0px)    scaleX(1);   opacity: 1; }
          18%  { transform: translateY(-28px)  scaleX(0.08); opacity: 1; }
          36%  { transform: translateY(-62px)  scaleX(1);   opacity: 1; }
          54%  { transform: translateY(-96px)  scaleX(0.08); opacity: 1; }
          72%  { transform: translateY(-128px) scaleX(1);   opacity: 0.7; }
          88%  { transform: translateY(-155px) scaleX(0.08); opacity: 0.3; }
          100% { transform: translateY(-170px) scaleX(1);   opacity: 0; }
        }
        @keyframes splash-text-in {
          from { opacity: 0; letter-spacing: 0.5em; filter: blur(12px); transform: scale(0.92); }
          to   { opacity: 1; letter-spacing: 0.22em; filter: blur(0);   transform: scale(1); }
        }
        @keyframes splash-line-in {
          from { width: 0; opacity: 0; }
          to   { width: 180px; opacity: 1; }
        }
        @keyframes splash-sub-in {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .sp-text { animation: splash-text-in 0.9s cubic-bezier(.22,1,.36,1) forwards; }
        .sp-line { animation: splash-line-in 1s ease 0.4s forwards; opacity: 0; width: 0; }
        .sp-sub  { animation: splash-sub-in  0.6s ease 0.7s forwards; opacity: 0; }
      `}</style>

      <div style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "#060606",
        display: "flex", alignItems: "center", justifyContent: "center",
        opacity: exiting ? 0 : 1,
        transition: "opacity 0.75s ease",
        overflow: "hidden",
      }}>
        {/* Grid de fundo */}
        <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.1 }}>
          <defs>
            <pattern id="g1" width="50"  height="50"  patternUnits="userSpaceOnUse">
              <path d="M50 0L0 0 0 50" fill="none" stroke="rgba(200,0,0,0.45)" strokeWidth="0.4" />
            </pattern>
            <pattern id="g2" width="150" height="150" patternUnits="userSpaceOnUse">
              <path d="M150 0L0 0 0 150" fill="none" stroke="rgba(200,0,0,0.8)" strokeWidth="0.8" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#g1)" />
          <rect width="100%" height="100%" fill="url(#g2)" />
        </svg>

        {/* Vignette */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: "radial-gradient(ellipse 75% 75% at 50% 45%, transparent 10%, #060606 78%)",
        }} />

        {/* SVG da linha */}
        <svg viewBox="0 0 840 420"
          style={{ position: "absolute", width: "100%", height: "100%", overflow: "visible" }}>
          <defs>
            <filter id="sp-glow-sm">
              <feGaussianBlur stdDeviation="3"  result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <filter id="sp-glow-md">
              <feGaussianBlur stdDeviation="7"  result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <filter id="sp-glow-lg">
              <feGaussianBlur stdDeviation="16" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {/* path de medição oculto */}
          <path ref={pathRef} d={PATH} fill="none" stroke="none" />

          {/* glow externo */}
          <path d={PATH} fill="none" stroke="#E4002B" strokeWidth="22"
            opacity="0.07" filter="url(#sp-glow-lg)"
            strokeDasharray={pathLen} strokeDashoffset={offset} strokeLinecap="round" />

          {/* glow médio */}
          <path d={PATH} fill="none" stroke="#E4002B" strokeWidth="8"
            opacity="0.22" filter="url(#sp-glow-md)"
            strokeDasharray={pathLen} strokeDashoffset={offset} strokeLinecap="round" />

          {/* linha principal */}
          <path d={PATH} fill="none" stroke="#E4002B" strokeWidth="2.5"
            filter="url(#sp-glow-sm)"
            strokeDasharray={pathLen} strokeDashoffset={offset} strokeLinecap="round" />

          {/* ponto de origem */}
          <circle cx="100" cy="330" r="6"  fill="#E4002B" filter="url(#sp-glow-md)" />
          <circle cx="100" cy="330" r="14" fill="none" stroke="#E4002B" strokeWidth="1.2" opacity="0.55" />
          <circle cx="100" cy="330" r="22" fill="none" stroke="#E4002B" strokeWidth="0.6" opacity="0.25" />

          {/* ponto de destino (aparece ao fim) */}
          <circle cx="740" cy="285" r="6"  fill="#E4002B" filter="url(#sp-glow-md)"
            opacity={progress > 0.9 ? (progress - 0.9) / 0.1 : 0} />
          <circle cx="740" cy="285" r="14" fill="none" stroke="#E4002B" strokeWidth="1.2"
            opacity={progress > 0.9 ? 0.55 * ((progress - 0.9) / 0.1) : 0} />
          <circle cx="740" cy="285" r="22" fill="none" stroke="#E4002B" strokeWidth="0.6"
            opacity={progress > 0.9 ? 0.25 * ((progress - 0.9) / 0.1) : 0} />
        </svg>

        {/* Moeda Mario — posicionada via CTM no ponto exato da linha */}
        {showCoins && coinPos && (
          <div style={{
            position: "fixed",
            left: coinPos.x,
            top:  coinPos.y,
            transform: "translate(-50%, -50%)",
            animation: "coin-rise 0.72s cubic-bezier(.22,1,.36,1) forwards",
            zIndex: 10,
            pointerEvents: "none",
          }}>
            <div style={{
              width: 26, height: 26,
              borderRadius: "50%",
              background: "radial-gradient(circle at 35% 35%, #ffe066, #f5a623 55%, #c47d00)",
              boxShadow: "0 0 12px rgba(245,166,35,0.95), 0 0 28px rgba(245,166,35,0.55)",
              display: "flex", alignItems: "center", justifyContent: "center",
              border: "1.5px solid rgba(255,220,50,0.6)",
            }}>
              <span style={{
                fontSize: 12, fontWeight: 900, color: "#7a4800",
                fontFamily: "system-ui, sans-serif",
                lineHeight: 1, userSelect: "none",
              }}>$</span>
            </div>
          </div>
        )}

        {/* Texto VELLOX */}
        {showText && (
          <div style={{
            position: "absolute", bottom: "18%",
            left: 0, right: 0,
            display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
          }}>
            <h1 className="sp-text" style={{
              margin: 0,
              fontSize: "clamp(52px, 11vw, 104px)",
              fontWeight: 900,
              color: "white",
              fontFamily: "system-ui, sans-serif",
              letterSpacing: "0.22em",
              textShadow:
                "0 0 24px rgba(228,0,43,0.9), 0 0 50px rgba(228,0,43,0.5), 0 0 90px rgba(228,0,43,0.25)",
            }}>
              VELLOX
            </h1>
            <div className="sp-line" style={{
              height: 2,
              background: "linear-gradient(90deg, transparent, #E4002B, transparent)",
              boxShadow: "0 0 10px #E4002B, 0 0 22px rgba(228,0,43,0.45)",
              borderRadius: 2,
            }} />
            <p className="sp-sub" style={{
              margin: 0, fontSize: 13, letterSpacing: "0.18em",
              color: "rgba(228,0,43,0.55)",
              textTransform: "uppercase",
              fontWeight: 500,
            }}>
              Gestão de Entregas
            </p>
          </div>
        )}
      </div>
    </>
  );
}
