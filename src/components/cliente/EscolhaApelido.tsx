"use client";

// Nome do endereço salvo: Casa / Trabalho / outro (texto livre).

import { C } from "@/app/explorar/utils";
import { CampoTexto } from "./AuthCliente";

export default function EscolhaApelido({ valor, onChange, cor = C.ink }: { valor: string; onChange: (v: string) => void; cor?: string }) {
  const fixos = ["Casa", "Trabalho"];
  const outro = !fixos.includes(valor);
  return (
    <fieldset style={{ border: "none", padding: 0, margin: 0, minWidth: 0 }}>
      <legend style={{ fontSize: 14, fontWeight: 700, color: C.ink, marginBottom: 6, padding: 0 }}>Nome do endereço</legend>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {[...fixos, "Outro"].map(op => {
          const ativo = op === "Outro" ? outro : valor === op;
          return (
            <button key={op} type="button" aria-pressed={ativo} onClick={() => onChange(op === "Outro" ? (outro ? valor : "") : op)} className="vx-press"
              style={{
                minHeight: 44, padding: "0 16px", borderRadius: 999, fontSize: 15, fontWeight: 700, border: "none", cursor: "pointer",
                background: ativo ? cor : C.chip, color: ativo ? "#fff" : C.ink,
              }}>
              {op}
            </button>
          );
        })}
      </div>
      {outro && (
        <div style={{ marginTop: 10 }}>
          <CampoTexto label="Qual nome?" value={valor} onChange={onChange} placeholder="Ex.: Casa da mãe" maxLength={40} />
        </div>
      )}
    </fieldset>
  );
}
