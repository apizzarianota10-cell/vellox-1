import type { LayoutOpt } from "@/lib/printService";

// Miniaturas visuais dos 3 layouts de cupom — usadas na tela de configurações
// (Automações > Impressão) e no popup de novidades, pra ficarem sempre iguais.
export const LAYOUT_PREVIEWS: { id: LayoutOpt; label: string; preview: React.ReactNode }[] = [
  {
    id: "classico",
    label: "Clássico",
    preview: (
      <div style={{ fontSize: 8, lineHeight: 1.4, color: "#000", fontFamily: "monospace", padding: "6px 4px" }}>
        <div style={{ textAlign: "center", fontWeight: 900 }}>EMPRESA</div>
        <div style={{ borderTop: "1px dashed #000", margin: "2px 0" }} />
        <div style={{ fontSize: 7 }}>CLIENTE</div>
        <div style={{ fontWeight: 700 }}>João Silva</div>
        <div style={{ borderTop: "1px dashed #000", margin: "2px 0" }} />
        <div style={{ fontSize: 7 }}>ITENS</div>
        <div>1x Pizza</div>
        <div style={{ borderTop: "1px dashed #000", margin: "2px 0" }} />
        <div style={{ textAlign: "center", fontWeight: 900 }}>TOTAL R$44,90</div>
      </div>
    ),
  },
  {
    id: "moderno",
    label: "Moderno",
    preview: (
      <div style={{ fontSize: 8, lineHeight: 1.4, color: "#000", fontFamily: "monospace", padding: "6px 4px" }}>
        <div style={{ border: "1px solid #000", textAlign: "center", fontWeight: 900, padding: "2px" }}>EMPRESA</div>
        <div style={{ borderTop: "2px solid #000", margin: "2px 0" }} />
        <div style={{ fontWeight: 900 }}>[DELIVERY]</div>
        <div style={{ borderTop: "1px dashed #000", margin: "2px 0" }} />
        <div>{">"} João Silva</div>
        <div style={{ borderTop: "2px solid #000", margin: "2px 0" }} />
        <div>• 1x Pizza</div>
        <div style={{ borderTop: "2px solid #000", margin: "2px 0" }} />
        <div style={{ fontWeight: 900 }}>{">>"} R$44,90 {"<<"}</div>
      </div>
    ),
  },
  {
    id: "compacto",
    label: "Compacto",
    preview: (
      <div style={{ fontSize: 7.5, lineHeight: 1.3, color: "#000", fontFamily: "monospace", padding: "6px 4px" }}>
        <div style={{ textAlign: "center", fontWeight: 900, fontSize: 8 }}>EMPRESA</div>
        <div style={{ fontSize: 6.5 }}>01/01/25 10:30 | #ABC123</div>
        <div style={{ borderTop: "1px solid #000", margin: "2px 0" }} />
        <div>[DELIVERY] João</div>
        <div>Rua Exemplo, 123</div>
        <div style={{ borderTop: "1px solid #000", margin: "2px 0" }} />
        <div>1x Pizza</div>
        <div style={{ borderTop: "1px solid #000", margin: "2px 0" }} />
        <div style={{ fontWeight: 900, fontSize: 8 }}>TOTAL: R$44,90</div>
        <div style={{ fontSize: 6.5 }}>Pgto: PIX</div>
      </div>
    ),
  },
];
