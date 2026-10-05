const ITENS = [
  "⚡ Despacho em menos de 30s", "📦 Catálogo digital próprio", "🛵 Rastreamento ao vivo",
  "💰 Relatório financeiro automático", "🍕 Pizzaria", "🍔 Hamburgeria", "🍣 Sushi",
  "⭐ Avaliação de clientes", "🖨️ Impressão automática", "📱 Sem app pra instalar",
];

// Faixa rolando infinita — duplica a lista uma vez e anima translateX(-50%)
// em loop; como as duas metades são idênticas, no instante em que a
// primeira sai de cena a segunda já está exatamente na posição dela, sem
// salto visível.
export default function Marquee() {
  return (
    <div style={{ background: "#0f172a", padding: "18px 0", overflow: "hidden", borderTop: "1px solid rgba(255,255,255,.06)", borderBottom: "1px solid rgba(255,255,255,.06)" }}>
      <div className="land-marquee-track" style={{ display: "flex", width: "max-content", gap: 0 }}>
        {[0, 1].map(copy => (
          <div key={copy} style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
            {ITENS.map((item, i) => (
              <span key={`${copy}-${i}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 28px", fontSize: 15, fontWeight: 700, color: "#cbd5e1", whiteSpace: "nowrap" }}>
                {item}
                <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#E4002B", display: "inline-block" }} />
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
