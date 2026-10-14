import type { LayoutOpt, FonteOpt } from "@/lib/printService";

// Mesmo tamanho pra miniatura inteira, como no cupom impresso
// (normal 1x : grande ~1.4x : extra_grande 2x, mesma escala do ESC/POS).
const PREVIEW_PX: Record<FonteOpt, number> = { normal: 7, grande: 9, extra_grande: 10.5 };
const MONO = 'Consolas,"Lucida Console","Liberation Mono","DejaVu Sans Mono","Courier New",monospace';

// Linha com marcador numa coluna própria (quebra alinha sob o texto): sabor
// "1/2 Calabresa" ou adicional "+ Borda".
function Marcado({ marca, children }: { marca: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", fontWeight: 900, paddingLeft: "1.4em" }}>
      <span style={{ flex: "none", whiteSpace: "pre" }}>{marca}</span>
      <span style={{ flex: 1, minWidth: 0 }}>{children}</span>
    </div>
  );
}

// Bloco de item igual ao do cupom (escpos.ts itemBlock / printService itemHtml).
function ItemPizza() {
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 900 }}><span>1x Pizza G</span><span>R$44,90</span></div>
      <div style={{ paddingLeft: "1.4em", fontWeight: 900 }}>MEIO A MEIO:</div>
      <Marcado marca="1/2 ">Calabresa</Marcado>
      <Marcado marca="1/2 ">Mussarela</Marcado>
      <Marcado marca="+ ">Borda Catupiry</Marcado>
    </>
  );
}

// Miniaturas visuais dos 3 layouts de cupom — usadas na tela de configurações
// (Automações > Impressão) e no popup de novidades, pra ficarem sempre iguais.
export function buildLayoutPreviews(fonte: FonteOpt = "grande"): { id: LayoutOpt; label: string; preview: React.ReactNode }[] {
  const base: React.CSSProperties = {
    fontSize: PREVIEW_PX[fonte] ?? PREVIEW_PX.grande, lineHeight: 1.3, color: "#000",
    fontFamily: MONO, fontWeight: 700, padding: "6px 4px", overflowWrap: "break-word",
  };
  const B: React.CSSProperties = { fontWeight: 900 };
  const C: React.CSSProperties = { ...B, textAlign: "center" };
  return [
    {
      id: "classico",
      label: "Clássico",
      preview: (
        <div style={base}>
          <div style={C}>EMPRESA</div>
          <div style={{ borderTop: "1px dashed #000", margin: "2px 0" }} />
          <div style={C}>- DELIVERY -</div>
          <div style={{ borderTop: "1px dashed #000", margin: "2px 0" }} />
          <div style={B}>Cliente: João Silva</div>
          <div style={C}>---- ITENS ----</div>
          <ItemPizza />
          <div style={{ borderTop: "1px dashed #000", margin: "2px 0" }} />
          <div style={{ ...B, display: "flex", justifyContent: "space-between" }}><span>TOTAL:</span><span>R$49,90</span></div>
        </div>
      ),
    },
    {
      id: "moderno",
      label: "Moderno",
      preview: (
        <div style={base}>
          <div style={{ ...C, border: "1px solid #000", padding: "2px" }}>EMPRESA</div>
          <div style={{ borderTop: "2px solid #000", margin: "2px 0" }} />
          <div style={C}>[ DELIVERY ]</div>
          <div style={{ borderTop: "2px solid #000", margin: "2px 0" }} />
          <div style={B}>{">"} João Silva</div>
          <div style={C}>== ITENS ==</div>
          <ItemPizza />
          <div style={{ borderTop: "2px solid #000", margin: "2px 0" }} />
          <div style={C}>{">>"} TOTAL: R$49,90 {"<<"}</div>
        </div>
      ),
    },
    {
      id: "compacto",
      label: "Compacto",
      preview: (
        <div style={{ ...base, lineHeight: 1.25 }}>
          <div style={C}>EMPRESA</div>
          <div style={{ textAlign: "center" }}>01/01/25 10:30 | #A1B2C3D4</div>
          <div style={{ borderTop: "1px solid #000", margin: "2px 0" }} />
          <div style={B}>[DELIVERY] João</div>
          <div>Rua Exemplo, 123</div>
          <div style={{ borderTop: "1px solid #000", margin: "2px 0" }} />
          <ItemPizza />
          <div style={{ borderTop: "1px solid #000", margin: "2px 0" }} />
          <div style={B}>TOTAL: R$49,90</div>
          <div>Pgto: PIX</div>
        </div>
      ),
    },
  ];
}
