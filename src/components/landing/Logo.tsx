import { Zap } from "lucide-react";

interface Props {
  size?: number;
  textSize?: number;
  textColor?: string;
  showText?: boolean;
}

// Logo flat (sem o render 3D brilhante laranja antigo) — mesmo raio e mesmo
// gradiente vermelho→vermelho-escuro do favicon (src/app/icon.tsx), pra tudo
// (navbar, rodapé, favicon) usar a mesma identidade visual.
export default function Logo({ size = 34, textSize = 18, textColor = "#0f172a", showText = true }: Props) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
      <div style={{
        width: size, height: size, borderRadius: size * 0.28, flexShrink: 0,
        background: "linear-gradient(135deg,#FFC72C 0%,#E4002B 55%,#A80021 100%)",
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 4px 14px rgba(228,0,43,.35)",
      }}>
        <Zap size={size * 0.56} color="#fff" strokeWidth={2.5} fill="#fff" />
      </div>
      {showText && (
        <span style={{ fontWeight: 900, fontSize: textSize, letterSpacing: "-0.04em", color: textColor }}>
          Vellox
        </span>
      )}
    </div>
  );
}
