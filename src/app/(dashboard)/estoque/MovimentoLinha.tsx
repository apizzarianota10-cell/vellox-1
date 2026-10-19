"use client";

import { ArrowDownToLine, SlidersHorizontal, ShoppingBag, Undo2 } from "lucide-react";
import { fmtDataHora, fmtQtdSinal, labelMovimento, type MovimentoEstoque } from "@/lib/estoque";

const TIPO_CFG = {
  entrada:          { Icon: ArrowDownToLine,   color: "#22c55e" },
  ajuste:           { Icon: SlidersHorizontal, color: "#60a5fa" },
  saida_pedido:     { Icon: ShoppingBag,       color: "#f59e0b" },
  devolucao_pedido: { Icon: Undo2,             color: "#a78bfa" },
} as const;

interface Props {
  m: MovimentoEstoque;
  produtoNome?: string;
}

export default function MovimentoLinha({ m, produtoNome }: Props) {
  const cfg = TIPO_CFG[m.tipo] ?? TIPO_CFG.ajuste;
  const { Icon, color } = cfg;
  const qtdColor = m.quantidade > 0 ? "#22c55e" : m.quantidade < 0 ? "#E4002B" : "var(--text-3)";

  return (
    <div className="flex items-start gap-3 px-3 py-2.5" style={{ borderTop: "1px solid var(--border-1)" }}>
      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5" style={{ background: `${color}1f` }}>
        <Icon size={14} style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        {produtoNome && (
          <p className="text-xs font-bold truncate" style={{ color: "var(--text-1)" }}>{produtoNome}</p>
        )}
        <p className="text-xs" style={{ color: produtoNome ? "var(--text-3)" : "var(--text-1)", fontWeight: produtoNome ? 500 : 700 }}>
          {labelMovimento(m)}
        </p>
        {m.observacao && (
          <p className="text-xs mt-0.5 italic" style={{ color: "var(--text-4)" }}>{m.observacao}</p>
        )}
        <p className="text-xs mt-0.5" style={{ color: "var(--text-5)" }}>{fmtDataHora(m.created_at)}</p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-black" style={{ color: qtdColor }}>{fmtQtdSinal(m.quantidade)}</p>
        <p className="text-xs" style={{ color: "var(--text-4)" }}>saldo {m.saldo_apos}</p>
      </div>
    </div>
  );
}
