import type { LayoutOpt, FonteOpt } from "@/lib/printService";

// Mesmo tamanho pra miniatura inteira, como no cupom impresso.
const PREVIEW_PX: Record<FonteOpt, number> = { normal: 7, grande: 8.5, extra_grande: 10 };

// Sabores numerados com o texto numa coluna própria (quebra alinha sob o texto).
function Sabor({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", fontWeight: 900 }}>
      <span style={{ flex: "none", whiteSpace: "pre" }}>{`${n}. `}</span>
      <span style={{ flex: 1, minWidth: 0 }}>{children}</span>
    </div>
  );
}

// Miniaturas visuais dos 3 layouts de cupom — usadas na tela de configurações
// (Automações > Impressão) e no popup de novidades, pra ficarem sempre iguais.
export function buildLayoutPreviews(fonte: FonteOpt = "grande"): { id: LayoutOpt; label: string; preview: React.ReactNode }[] {
  const base: React.CSSProperties = {
    fontSize: PREVIEW_PX[fonte] ?? PREVIEW_PX.grande, lineHeight: 1.35, color: "#000",
    fontFamily: "monospace", fontWeight: 700, padding: "6px 4px", overflowWrap: "break-word",
  };
  const B: React.CSSProperties = { fontWeight: 900 };
  return [
    {
      id: "classico",
      label: "Clássico",
      preview: (
        <div style={base}>
          <div style={{ ...B, textAlign: "center" }}>EMPRESA</div>
          <div style={{ borderTop: "1px dashed #000", margin: "2px 0" }} />
          <div style={B}>CLIENTE</div>
          <div style={B}>João Silva</div>
          <div style={{ borderTop: "1px dashed #000", margin: "2px 0" }} />
          <div style={B}>ITENS</div>
          <div style={B}>1x Pizza G</div>
          <Sabor n={1}>Calabresa</Sabor>
          <Sabor n={2}>Mussarela</Sabor>
          <div style={{ borderTop: "1px dashed #000", margin: "2px 0" }} />
          <div style={{ ...B, textAlign: "center" }}>TOTAL R$44,90</div>
        </div>
      ),
    },
    {
      id: "moderno",
      label: "Moderno",
      preview: (
        <div style={base}>
          <div style={{ ...B, border: "1px solid #000", textAlign: "center", padding: "2px" }}>EMPRESA</div>
          <div style={{ borderTop: "2px solid #000", margin: "2px 0" }} />
          <div style={B}>[DELIVERY]</div>
          <div style={{ borderTop: "1px dashed #000", margin: "2px 0" }} />
          <div style={B}>{">"} João Silva</div>
          <div style={{ borderTop: "2px solid #000", margin: "2px 0" }} />
          <div style={B}>- 1x Pizza G</div>
          <Sabor n={1}>Calabresa</Sabor>
          <Sabor n={2}>Mussarela</Sabor>
          <div style={{ borderTop: "2px solid #000", margin: "2px 0" }} />
          <div style={B}>{">>"} R$44,90 {"<<"}</div>
        </div>
      ),
    },
    {
      id: "compacto",
      label: "Compacto",
      preview: (
        <div style={{ ...base, lineHeight: 1.25 }}>
          <div style={{ ...B, textAlign: "center" }}>EMPRESA</div>
          <div>01/01/25 10:30</div>
          <div style={{ borderTop: "1px solid #000", margin: "2px 0" }} />
          <div style={B}>[DELIVERY] João</div>
          <div>Rua Exemplo, 123</div>
          <div style={{ borderTop: "1px solid #000", margin: "2px 0" }} />
          <div style={B}>1x Pizza G</div>
          <Sabor n={1}>Calabresa</Sabor>
          <Sabor n={2}>Mussarela</Sabor>
          <div style={{ borderTop: "1px solid #000", margin: "2px 0" }} />
          <div style={B}>TOTAL: R$44,90</div>
          <div>Pgto: PIX</div>
        </div>
      ),
    },
  ];
}
