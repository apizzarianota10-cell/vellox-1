"use client";

import { useEffect, useState } from "react";
import { Loader2, MapPin } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import TrackingMapClient from "./TrackingMapClient";
import { infoDDD } from "@/lib/ddd";
import type { Motoboy, Pedido } from "@/types";

// Cidade do mapa: pergunta o DDD (e a cidade) uma vez, salva na empresa
// (schema_v70) e no navegador, e não pergunta mais.

export interface CidadeMapa { ddd: string; cidade: string; uf: string; lat: number; lng: number }

const LS_KEY = "vellox-mapa-cidade";

function lerLocal(): CidadeMapa | null {
  try {
    const v = JSON.parse(localStorage.getItem(LS_KEY) ?? "null") as CidadeMapa | null;
    return v && Number.isFinite(v.lat) && Number.isFinite(v.lng) ? v : null;
  } catch { return null; }
}

interface Props {
  motoboys: Motoboy[];
  pedidos: Pedido[];
  empresaId: string;
  empresaLat?: number | null;
  empresaLng?: number | null;
  empresaRaio?: number | null;
  empresaCidade?: string | null;
  cidadeSalva: CidadeMapa | null;
}

export default function MapaComCidade({ cidadeSalva, empresaCidade, ...mapa }: Props) {
  const [cidade, setCidade] = useState<CidadeMapa | null>(cidadeSalva);
  const [perguntar, setPerguntar] = useState(false);

  useEffect(() => {
    if (cidadeSalva) {
      try { localStorage.setItem(LS_KEY, JSON.stringify(cidadeSalva)); } catch { /* sem storage */ }
      return;
    }
    const local = lerLocal();
    if (local) setCidade(local);
    else setPerguntar(true);
  }, [cidadeSalva]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <TrackingMapClient {...mapa} cidadeCentro={cidade ? [cidade.lat, cidade.lng] : null} height="100%" />

      {cidade && !perguntar && (
        <button onClick={() => setPerguntar(true)} title="Trocar a cidade do mapa"
          style={{
            position: "absolute", left: 12, bottom: 48, zIndex: 500,
            display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 999,
            background: "rgba(10,10,10,0.85)", border: "1px solid #262626", color: "#e2e8f0",
            fontSize: 12, fontWeight: 700, cursor: "pointer",
          }}>
          <MapPin size={12} style={{ color: "#E4002B" }} />
          {cidade.cidade} - {cidade.uf}
          <span style={{ color: "#64748b", fontWeight: 600 }}>· trocar</span>
        </button>
      )}

      {perguntar && (
        <PerguntaDDD
          empresaId={mapa.empresaId}
          inicial={cidade}
          empresaCidade={empresaCidade ?? null}
          podeFechar={!!cidade}
          onFechar={() => setPerguntar(false)}
          onSalvo={c => { setCidade(c); setPerguntar(false); }}
        />
      )}
    </div>
  );
}

function PerguntaDDD({ empresaId, inicial, empresaCidade, podeFechar, onFechar, onSalvo }: {
  empresaId: string;
  inicial: CidadeMapa | null;
  empresaCidade: string | null;
  podeFechar: boolean;
  onFechar: () => void;
  onSalvo: (c: CidadeMapa) => void;
}) {
  const [ddd, setDdd] = useState(inicial?.ddd ?? "");
  const [nomeCidade, setNomeCidade] = useState(inicial?.cidade ?? empresaCidade ?? "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const info = ddd.length === 2 ? infoDDD(ddd) : null;

  async function salvar() {
    if (!info) { setErro("Digite um DDD válido (2 números)."); return; }
    setSalvando(true);
    setErro(null);
    const nome = nomeCidade.trim() || info.cidade;
    let lat = info.lat, lng = info.lng;
    // Centro exato da cidade digitada; se não achar, usa a cidade principal do DDD
    if (nome.toLowerCase() !== info.cidade.toLowerCase()) {
      try {
        const r = await fetch(`/api/geocode/cidade?cidade=${encodeURIComponent(nome)}&uf=${info.uf}`);
        if (r.ok) { const c = await r.json() as { lat: number; lng: number }; lat = c.lat; lng = c.lng; }
        else { setErro(`Não achei "${nome}" em ${info.uf}. Confira o nome da cidade.`); setSalvando(false); return; }
      } catch { /* sem rede: usa o centro do DDD */ }
    }
    const c: CidadeMapa = { ddd, cidade: nome, uf: info.uf, lat, lng };
    try { localStorage.setItem(LS_KEY, JSON.stringify(c)); } catch { /* sem storage */ }
    // Salva na empresa (se a migration schema_v70 ainda não rodou, fica só no navegador)
    const { error } = await createClient().from("empresas")
      .update({ mapa_ddd: ddd, mapa_cidade: `${nome} - ${info.uf}`, mapa_lat: lat, mapa_lng: lng })
      .eq("id", empresaId);
    if (error) console.warn("[mapa] cidade salva só no navegador (rode supabase/schema_v70.sql):", error.message);
    setSalvando(false);
    onSalvo(c);
  }

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, borderRadius: 16 }}>
      <div style={{ width: "100%", maxWidth: 360, background: "#111", border: "1px solid #262626", borderRadius: 16, padding: 20, boxShadow: "0 20px 50px rgba(0,0,0,0.5)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(228,0,43,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <MapPin size={18} style={{ color: "#E4002B" }} />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "#fff" }}>Onde fica sua loja?</p>
            <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>Pra abrir o mapa direto na sua cidade</p>
          </div>
        </div>

        <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#94a3b8", marginBottom: 6 }}>DDD</label>
        <input value={ddd} inputMode="numeric" autoFocus maxLength={2} placeholder="Ex.: 81"
          onChange={e => { setDdd(e.target.value.replace(/\D/g, "").slice(0, 2)); setErro(null); }}
          onKeyDown={e => { if (e.key === "Enter") salvar(); }}
          style={{ width: "100%", padding: "10px 12px", borderRadius: 10, background: "#0a0a0a", border: "1px solid #262626", color: "#fff", fontSize: 18, fontWeight: 800, letterSpacing: "0.1em", outline: "none" }} />
        {info && (
          <p style={{ margin: "6px 0 0", fontSize: 12, color: "#22c55e" }}>{info.uf} · região de {info.cidade}</p>
        )}

        <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#94a3b8", margin: "12px 0 6px" }}>Cidade</label>
        <input value={nomeCidade} placeholder={info ? info.cidade : "Ex.: Palmares"}
          onChange={e => { setNomeCidade(e.target.value); setErro(null); }}
          onKeyDown={e => { if (e.key === "Enter") salvar(); }}
          style={{ width: "100%", padding: "10px 12px", borderRadius: 10, background: "#0a0a0a", border: "1px solid #262626", color: "#fff", fontSize: 14, outline: "none" }} />
        <p style={{ margin: "6px 0 0", fontSize: 11, color: "#475569" }}>Em branco, usa a cidade principal do DDD.</p>

        {erro && <p style={{ margin: "10px 0 0", fontSize: 12, color: "#f87171" }}>{erro}</p>}

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          {podeFechar && (
            <button onClick={onFechar} disabled={salvando}
              style={{ flex: 1, padding: "10px", borderRadius: 10, background: "transparent", border: "1px solid #262626", color: "#94a3b8", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              Cancelar
            </button>
          )}
          <button onClick={salvar} disabled={salvando || !info}
            style={{ flex: 2, padding: "10px", borderRadius: 10, background: info ? "#E4002B" : "#3f3f46", border: "none", color: "#fff", fontSize: 14, fontWeight: 800, cursor: info ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            {salvando && <Loader2 size={15} className="animate-spin" />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
