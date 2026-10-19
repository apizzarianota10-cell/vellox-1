"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { emAlerta, EVENTO_ESTOQUE_ATUALIZADO } from "@/lib/estoque";

// Conta produtos controlados em alerta (zerados/negativos ou no mínimo).
// Falha em silêncio se a migração (schema_v67) ainda não rodou.
export function useEstoqueAlertas(empresaId: string | null): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!empresaId) return;
    const supabase = createClient();
    let ativo = true;

    async function carregar() {
      try {
        const { data, error } = await supabase
          .from("produtos")
          .select("estoque_qtd, estoque_minimo")
          .eq("empresa_id", empresaId)
          .eq("controla_estoque", true);
        if (!ativo || error || !data) return;
        const rows = data as unknown as { estoque_qtd: number; estoque_minimo: number | null }[];
        setCount(rows.filter(p => emAlerta(p.estoque_qtd ?? 0, p.estoque_minimo)).length);
      } catch { /* silencioso */ }
    }

    carregar();
    const t = setInterval(carregar, 3 * 60_000);
    window.addEventListener(EVENTO_ESTOQUE_ATUALIZADO, carregar);
    return () => {
      ativo = false;
      clearInterval(t);
      window.removeEventListener(EVENTO_ESTOQUE_ATUALIZADO, carregar);
    };
  }, [empresaId]);

  return count;
}

export default function EstoqueBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      title={`${count} produto(s) com estoque baixo ou zerado`}
      style={{
        minWidth: 18, height: 18, padding: "0 5px", borderRadius: 999,
        background: "#E4002B", color: "#fff", fontSize: 10, fontWeight: 900, lineHeight: 1,
        display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
