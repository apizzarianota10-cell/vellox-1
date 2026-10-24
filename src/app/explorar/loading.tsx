// Skeleton exibido enquanto o /explorar carrega no servidor (tema claro).
export default function LoadingExplorar() {
  const skel = "linear-gradient(90deg, #ecebe7 0%, #f6f5f2 50%, #ecebe7 100%)";
  const bloco = (style: React.CSSProperties) => (
    <div style={{ background: skel, backgroundSize: "200% 100%", animation: "vxShimmer 1.3s linear infinite", ...style }} />
  );
  return (
    <div aria-busy="true" aria-label="Carregando lojas" style={{ background: "#f7f7f5", minHeight: "100dvh", overflowX: "clip" }}>
      <style>{`@keyframes vxShimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }`}</style>
      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "16px 16px 120px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          {bloco({ width: 110, height: 34, borderRadius: 12 })}
          {bloco({ width: 150, height: 40, borderRadius: 999 })}
        </div>
        {bloco({ width: 160, height: 12, borderRadius: 6, marginTop: 30 })}
        {bloco({ width: "72%", maxWidth: 420, height: 38, borderRadius: 12, marginTop: 14 })}
        {bloco({ width: "56%", maxWidth: 320, height: 38, borderRadius: 12, marginTop: 8 })}
        {bloco({ width: "100%", height: 58, borderRadius: 20, marginTop: 28 })}
        <div style={{ display: "flex", gap: 14, marginTop: 22, overflow: "hidden" }}>
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} style={{ flexShrink: 0 }}>{bloco({ width: 72, height: 72, borderRadius: 999 })}</div>
          ))}
        </div>
        {bloco({ width: "100%", height: 230, borderRadius: 28, marginTop: 30 })}
        <div style={{ display: "grid", gap: 18, gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", marginTop: 30 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ background: "#fff", borderRadius: 24, overflow: "hidden", boxShadow: "0 1px 2px rgba(16,12,8,0.04), 0 2px 8px rgba(16,12,8,0.04)" }}>
              {bloco({ height: 158 })}
              <div style={{ padding: 18 }}>
                {bloco({ width: "60%", height: 16, borderRadius: 8 })}
                {bloco({ width: "40%", height: 12, borderRadius: 8, marginTop: 12 })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
