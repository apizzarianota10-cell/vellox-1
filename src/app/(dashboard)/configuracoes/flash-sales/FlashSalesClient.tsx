"use client";

import { useState, useEffect, useCallback } from "react";
import { Zap, Plus, Trash2, Clock, ArrowLeft } from "lucide-react";
import Link from "next/link";

interface FlashSale {
  id: string; nome: string; descricao: string | null;
  preco_original: number | null; preco_flash: number;
  imagem_url: string | null; ativo: boolean;
  termina_em: string; created_at: string;
}

function CountdownBadge({ termina_em }: { termina_em: string }) {
  const [txt, setTxt] = useState("");
  useEffect(() => {
    function calc() {
      const diff = new Date(termina_em).getTime() - Date.now();
      if (diff <= 0) { setTxt("Encerrado"); return; }
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1_000);
      setTxt(h > 0 ? `${h}h ${m.toString().padStart(2,"0")}m` : `${m.toString().padStart(2,"0")}:${s.toString().padStart(2,"0")}`);
    }
    calc();
    const t = setInterval(calc, 1_000);
    return () => clearInterval(t);
  }, [termina_em]);

  const expired = new Date(termina_em).getTime() < Date.now();
  return (
    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: expired ? "rgba(100,116,139,0.1)" : "rgba(255,106,0,0.1)", color: expired ? "#64748b" : "#FF6A00", border: `1px solid ${expired ? "rgba(100,116,139,0.2)" : "rgba(255,106,0,0.25)"}` }}>
      <Clock size={10} /> {txt}
    </span>
  );
}

export default function FlashSalesClient({ empresaId, empresaNome }: { empresaId: string; empresaNome: string }) {
  const [sales,    setSales]    = useState<FlashSale[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [erro,     setErro]     = useState("");
  const [sucesso,  setSucesso]  = useState("");

  // Form
  const [nome,           setNome]           = useState("");
  const [descricao,      setDescricao]      = useState("");
  const [precoOriginal,  setPrecoOriginal]  = useState("");
  const [precoFlash,     setPrecoFlash]     = useState("");
  const [imagemUrl,      setImagemUrl]      = useState("");
  const [duracaoHoras,   setDuracaoHoras]   = useState("2");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/flash-sales?empresa_id=${empresaId}`);
      const data = await res.json();
      setSales(data.flash_sales ?? []);
    } catch {}
    setLoading(false);
  }, [empresaId]);

  useEffect(() => { load(); }, [load]);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    if (!nome || !precoFlash || !duracaoHoras) { setErro("Preencha nome, preço flash e duração."); return; }
    setSaving(true); setErro(""); setSucesso("");
    try {
      const res = await fetch("/api/flash-sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome, descricao: descricao || null,
          preco_original: precoOriginal ? Number(precoOriginal.replace(",", ".")) : null,
          preco_flash:    Number(precoFlash.replace(",", ".")),
          imagem_url:     imagemUrl || null,
          duracao_horas:  Number(duracaoHoras),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setErro(data.error ?? "Erro ao criar"); return; }
      setSucesso("Oferta criada! Já aparece no Explorar.");
      setNome(""); setDescricao(""); setPrecoOriginal(""); setPrecoFlash(""); setImagemUrl(""); setDuracaoHoras("2");
      await load();
    } catch { setErro("Erro de conexão"); }
    finally { setSaving(false); }
  }

  async function excluir(id: string) {
    if (!confirm("Remover esta oferta relâmpago?")) return;
    await fetch(`/api/flash-sales/${id}`, { method: "DELETE" });
    await load();
  }

  const ativas   = sales.filter(s => s.ativo && new Date(s.termina_em).getTime() > Date.now());
  const expiradas = sales.filter(s => !s.ativo || new Date(s.termina_em).getTime() <= Date.now());

  return (
    <div style={{ background: "#0B0B0B", minHeight: "100vh", color: "#fff", padding: "24px 16px 48px" }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <Link href="/configuracoes" className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <ArrowLeft size={16} style={{ color: "#fff" }} />
        </Link>
        <div>
          <h1 className="font-black text-white flex items-center gap-2" style={{ fontSize: 22 }}>
            <Zap size={20} style={{ color: "#FF6A00" }} /> Ofertas Relâmpago
          </h1>
          <p style={{ fontSize: 12, color: "#6b7280" }}>{empresaNome} — aparece no Explorar para todos os clientes</p>
        </div>
      </div>

      {/* Formulário */}
      <div className="rounded-2xl mb-8" style={{ background: "#111", border: "1px solid rgba(255,255,255,0.07)", padding: "20px" }}>
        <p className="font-bold text-white mb-4 flex items-center gap-2" style={{ fontSize: 15 }}>
          <Plus size={16} style={{ color: "#FF6A00" }} /> Nova Oferta
        </p>

        <form onSubmit={criar} className="flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 4 }}>Nome do produto *</label>
              <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: X-Burguer Especial"
                className="w-full rounded-xl px-3 py-2 outline-none text-white"
                style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.09)", fontSize: 13 }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 4 }}>URL da imagem</label>
              <input value={imagemUrl} onChange={e => setImagemUrl(e.target.value)} placeholder="https://..."
                className="w-full rounded-xl px-3 py-2 outline-none text-white"
                style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.09)", fontSize: 13 }} />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 4 }}>Descrição (opcional)</label>
            <input value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Ex: Acompanha fritas e refri"
              className="w-full rounded-xl px-3 py-2 outline-none text-white"
              style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.09)", fontSize: 13 }} />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 4 }}>Preço original</label>
              <input value={precoOriginal} onChange={e => setPrecoOriginal(e.target.value)} placeholder="18,00"
                className="w-full rounded-xl px-3 py-2 outline-none text-white"
                style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.09)", fontSize: 13 }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 4 }}>Preço flash *</label>
              <input value={precoFlash} onChange={e => setPrecoFlash(e.target.value)} placeholder="12,00"
                className="w-full rounded-xl px-3 py-2 outline-none text-white"
                style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.09)", fontSize: 13 }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 4 }}>Duração *</label>
              <select value={duracaoHoras} onChange={e => setDuracaoHoras(e.target.value)}
                className="w-full rounded-xl px-3 py-2 outline-none text-white"
                style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.09)", fontSize: 13 }}>
                <option value="1">1 hora</option>
                <option value="2">2 horas</option>
                <option value="4">4 horas</option>
                <option value="6">6 horas</option>
                <option value="12">12 horas</option>
                <option value="24">24 horas</option>
              </select>
            </div>
          </div>

          {erro    && <p style={{ fontSize: 13, color: "#ef4444" }}>{erro}</p>}
          {sucesso && <p style={{ fontSize: 13, color: "#22c55e" }}>{sucesso}</p>}

          <button type="submit" disabled={saving}
            className="flex items-center justify-center gap-2 py-3 rounded-xl font-black text-white"
            style={{ background: saving ? "#333" : "linear-gradient(135deg,#FF6A00,#FF6A00cc)", fontSize: 14 }}>
            {saving ? "Criando..." : <><Zap size={15} /> Publicar Oferta Relâmpago</>}
          </button>
        </form>
      </div>

      {/* Ativas */}
      {loading ? (
        <div className="text-center py-12" style={{ color: "#4b5563" }}>Carregando...</div>
      ) : (
        <>
          {ativas.length > 0 && (
            <div className="mb-6">
              <p className="font-bold mb-3 flex items-center gap-2" style={{ fontSize: 14, color: "#FF6A00" }}>
                <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: "#FF6A00", display: "inline-block" }} />
                Ativas agora ({ativas.length})
              </p>
              <div className="flex flex-col gap-3">
                {ativas.map(s => (
                  <div key={s.id} className="flex items-center gap-3 rounded-xl" style={{ background: "#111", border: "1px solid rgba(255,106,0,0.2)", padding: "12px 14px" }}>
                    {s.imagem_url && <img src={s.imagem_url} alt={s.nome} className="rounded-lg object-cover flex-shrink-0" style={{ width: 44, height: 44 }} />}
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-white truncate" style={{ fontSize: 13 }}>{s.nome}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="font-black" style={{ fontSize: 13, color: "#FF6A00" }}>R$ {s.preco_flash.toFixed(2).replace(".", ",")}</span>
                        {s.preco_original && <span style={{ fontSize: 11, color: "#6b7280", textDecoration: "line-through" }}>R$ {s.preco_original.toFixed(2).replace(".", ",")}</span>}
                        <CountdownBadge termina_em={s.termina_em} />
                      </div>
                    </div>
                    <button onClick={() => excluir(s.id)} className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
                      <Trash2 size={14} style={{ color: "#ef4444" }} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {ativas.length === 0 && (
            <div className="flex flex-col items-center py-12 gap-3" style={{ color: "#4b5563" }}>
              <Zap size={36} style={{ color: "#1f2937" }} />
              <p style={{ fontSize: 14 }}>Nenhuma oferta ativa. Crie uma acima!</p>
            </div>
          )}

          {expiradas.length > 0 && (
            <div>
              <p className="font-bold mb-3" style={{ fontSize: 13, color: "#4b5563" }}>Encerradas ({expiradas.length})</p>
              <div className="flex flex-col gap-2">
                {expiradas.map(s => (
                  <div key={s.id} className="flex items-center gap-3 rounded-xl opacity-50" style={{ background: "#111", border: "1px solid rgba(255,255,255,0.05)", padding: "10px 14px" }}>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-white truncate" style={{ fontSize: 13 }}>{s.nome}</p>
                      <span style={{ fontSize: 11, color: "#6b7280" }}>Encerrada</span>
                    </div>
                    <button onClick={() => excluir(s.id)} className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(239,68,68,0.08)" }}>
                      <Trash2 size={12} style={{ color: "#ef4444" }} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
