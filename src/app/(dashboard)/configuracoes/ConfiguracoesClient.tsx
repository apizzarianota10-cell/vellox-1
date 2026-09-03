"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Save, Copy, CheckCircle, Power, Loader2, MapPin, Zap, Printer, Volume2, X, ChevronRight, ExternalLink } from "lucide-react";
import Link from "next/link";
// USB removido: WebUSB bloqueado pelo usbprint.sys no Windows
import CompanyLocationPicker from "@/components/company/CompanyLocationPicker";
import type { Empresa } from "@/types";
import { SOUNDS, SOUND_KEY, getSoundId, playSound, type SoundId } from "@/lib/sounds";

function maskCNPJ(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12)
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

interface Props {
  empresa: Empresa;
}

export default function ConfiguracoesClient({ empresa }: Props) {
  const supabase = createClient();
  const audioCtxRef = useRef<AudioContext | null>(null);

  const [nome, setNome] = useState(empresa.nome);
  const [cnpj, setCnpj] = useState(empresa.cnpj ?? "");
  const [ativo, setAtivo] = useState(empresa.ativo);
  const [autoDespacho, setAutoDespacho] = useState(empresa.despacho_automatico ?? false);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [togglingAuto, setTogglingAuto] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [copiadoCodigo,   setCopiadoCodigo]   = useState(false);
  const [copiadoEmpresaId, setCopiadoEmpresaId] = useState(false);


  // ── Som de notificação (localStorage) ───────────────────────────
  const [soundId,        setSoundId]        = useState<SoundId>("melodia");
  const [showSoundModal, setShowSoundModal] = useState(false);

  function previewSound(id: SoundId) {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!audioCtxRef.current) audioCtxRef.current = new AudioCtx();
      const ctx = audioCtxRef.current;
      ctx.resume().then(() => playSound(ctx, id));
    } catch { /* sem áudio */ }
  }

  function selectSound(id: SoundId) {
    setSoundId(id);
    localStorage.setItem(SOUND_KEY, id);
    previewSound(id);
  }

  useEffect(() => {
    setSoundId(getSoundId());
  }, []);


  async function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    await supabase.rpc("update_empresa", { p_nome: nome, p_cnpj: cnpj || null });
    setSaving(false);
    setSavedOk(true);
    setTimeout(() => setSavedOk(false), 2500);
  }

  async function toggleAtivo() {
    setToggling(true);
    const novo = !ativo;
    setAtivo(novo);
    await supabase.rpc("set_empresa_ativo", { p_ativo: novo });
    setToggling(false);
  }

  async function toggleAutoDespacho() {
    setTogglingAuto(true);
    const novo = !autoDespacho;
    setAutoDespacho(novo);
    await supabase.from("empresas").update({ despacho_automatico: novo }).eq("id", empresa.id);
    setTogglingAuto(false);
  }

  function copiar(text: string, set: (v: boolean) => void) {
    navigator.clipboard.writeText(text);
    set(true);
    setTimeout(() => set(false), 2000);
  }

  const IS = {
    background: "var(--overlay-sm)",
    border: "1px solid rgba(255,255,255,0.08)",
    height: 48,
    color: "var(--text-1)",
  };

  return (
    <div className="p-6 max-w-2xl space-y-6" style={{ background: "var(--bg-base)", minHeight: "100%" }}>
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-1)" }}>Configurações</h1>
        <p className="text-sm mt-1" style={{ color: "#64748b" }}>
          Gerencie seu perfil e preferências
        </p>
      </div>

      {/* ── Toggle funcionamento ── */}
      <div
        className="rounded-2xl p-5 flex items-center justify-between"
        style={{
          background: "var(--bg-2)",
          border: `1px solid ${ativo ? "rgba(34,197,94,0.2)" : "rgba(228,0,43,0.2)"}`,
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: ativo ? "rgba(34,197,94,0.1)" : "rgba(228,0,43,0.1)" }}
          >
            <Power size={18} style={{ color: ativo ? "#22c55e" : "#E4002B" }} />
          </div>
          <div>
            <p className="text-sm font-bold" style={{ color: "var(--text-1)" }}>
              {ativo ? "Aceitando pedidos" : "Parado — não aceita pedidos"}
            </p>
            <p className="text-xs mt-0.5" style={{ color: "#475569" }}>
              {ativo
                ? "Sua empresa está ativa e aparece para os motoboys"
                : "Sua empresa está pausada"}
            </p>
          </div>
        </div>
        <button
          onClick={toggleAtivo}
          disabled={toggling}
          className="relative w-12 h-6 rounded-full transition-all shrink-0"
          style={{ background: ativo ? "#22c55e" : "#374151" }}
        >
          {toggling && (
            <Loader2
              size={12}
              className="absolute inset-0 m-auto animate-spin text-white"
            />
          )}
          {!toggling && (
            <span
              className="absolute top-1 w-4 h-4 rounded-full bg-white transition-all"
              style={{ left: ativo ? "26px" : "4px" }}
            />
          )}
        </button>
      </div>

      {/* ── Despacho automático ── */}
      <div
        className="rounded-2xl p-5 flex items-center justify-between"
        style={{
          background: "var(--bg-2)",
          border: `1px solid ${autoDespacho ? "rgba(96,165,250,0.2)" : "var(--overlay-md)"}`,
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: autoDespacho ? "rgba(96,165,250,0.1)" : "var(--overlay-sm)" }}
          >
            <Zap size={18} style={{ color: autoDespacho ? "#60a5fa" : "#374151" }} />
          </div>
          <div>
            <p className="text-sm font-bold" style={{ color: "var(--text-1)" }}>Despacho automático</p>
            <p className="text-xs mt-0.5" style={{ color: "#475569" }}>
              {autoDespacho
                ? "Pedidos finalizados são enviados ao 1º motoboy da fila"
                : "Você escolhe manualmente para qual motoboy enviar"}
            </p>
          </div>
        </div>
        <button
          onClick={toggleAutoDespacho}
          disabled={togglingAuto}
          className="relative w-12 h-6 rounded-full transition-all shrink-0"
          style={{ background: autoDespacho ? "#60a5fa" : "#374151" }}
        >
          {togglingAuto && (
            <Loader2 size={12} className="absolute inset-0 m-auto animate-spin text-white" />
          )}
          {!togglingAuto && (
            <span
              className="absolute top-1 w-4 h-4 rounded-full bg-white transition-all"
              style={{ left: autoDespacho ? "26px" : "4px" }}
            />
          )}
        </button>
      </div>

      {/* ── Automações (impressão + WhatsApp) ── */}
      <Link
        href="/automacoes"
        className="rounded-2xl overflow-hidden flex items-center justify-between px-5 py-4 transition-all"
        style={{ background: "var(--bg-2)", border: "1px solid rgba(228,0,43,0.3)" }}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(228,0,43,0.1)" }}>
            <Printer size={16} style={{ color: "#E4002B" }} />
          </div>
          <div>
            <p className="text-sm font-bold" style={{ color: "var(--text-1)" }}>Automações</p>
            <p className="text-xs" style={{ color: "#475569" }}>Impressão automática e confirmação por WhatsApp</p>
          </div>
        </div>
        <ExternalLink size={14} style={{ color: "#E4002B", flexShrink: 0 }} />
      </Link>

      {/* Link para Ofertas Relâmpago */}
      <Link
        href="/configuracoes/flash-sales"
        className="rounded-2xl overflow-hidden flex items-center justify-between px-5 py-4 transition-all"
        style={{ background: "var(--bg-2)", border: "1px solid var(--border-1)" }}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(228,0,43,0.1)" }}>
            <Zap size={15} style={{ color: "#E4002B" }} />
          </div>
          <div>
            <p className="text-sm font-bold" style={{ color: "var(--text-1)" }}>Ofertas Relâmpago</p>
            <p className="text-xs" style={{ color: "#475569" }}>Crie promoções com timer no Explorar</p>
          </div>
        </div>
        <ChevronRight size={14} style={{ color: "#E4002B", flexShrink: 0 }} />
      </Link>

      {/* ── Som de notificação ── */}
      <button
        onClick={() => setShowSoundModal(true)}
        className="w-full rounded-2xl p-5 text-left transition-all"
        style={{ background: "var(--bg-2)", border: "1px solid var(--border-1)" }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(96,165,250,0.1)" }}>
              <Volume2 size={18} style={{ color: "#60a5fa" }} />
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>Som de notificação</p>
              <p className="text-xs mt-0.5" style={{ color: "#475569" }}>
                {SOUNDS.find(s => s.id === soundId)?.label ?? "—"}
              </p>
            </div>
          </div>
          <ChevronRight size={16} style={{ color: "#374151" }} />
        </div>
      </button>

      {/* Modal de seleção de som */}
      {showSoundModal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
          onClick={() => setShowSoundModal(false)}
        >
          <div
            className="w-full max-w-lg rounded-t-3xl p-5"
            style={{ background: "var(--bg-2)", border: "1px solid var(--border-1)", maxHeight: "80vh", overflowY: "auto" }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold" style={{ color: "var(--text-1)" }}>Som de notificação</h2>
              <button
                onClick={() => setShowSoundModal(false)}
                className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{ background: "var(--overlay-sm)", color: "#64748b" }}
              >
                <X size={14} />
              </button>
            </div>
            <p className="text-xs mb-4" style={{ color: "#475569" }}>Clique para ouvir e selecionar.</p>
            <div className="space-y-2">
              {SOUNDS.map(s => {
                const active = soundId === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => selectSound(s.id)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left"
                    style={{
                      background: active ? "rgba(96,165,250,0.08)" : "var(--overlay-sm)",
                      border: `1px solid ${active ? "rgba(96,165,250,0.35)" : "var(--border-1)"}`,
                    }}
                  >
                    <div style={{
                      width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
                      border: `2px solid ${active ? "#60a5fa" : "#374151"}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {active && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#60a5fa" }} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>{s.label}</p>
                      <p className="text-xs" style={{ color: "#475569" }}>{s.desc}</p>
                    </div>
                    <Volume2 size={13} style={{ color: active ? "#60a5fa" : "#374151" }} />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}


      {/* ── Dados da empresa ── */}
      <div
        className="rounded-2xl p-5"
        style={{ background: "var(--bg-2)", border: "1px solid var(--border-1)" }}
      >
        <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--text-1)" }}>Dados da empresa</h2>
        <form onSubmit={salvar} className="space-y-4">
          <div>
            <label
              className="block text-xs font-semibold mb-2 uppercase tracking-wide"
              style={{ color: "#4b5563" }}
            >
              Nome da empresa
            </label>
            <input
              type="text"
              required
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="w-full px-4 rounded-xl text-sm placeholder-gray-700 outline-none transition-all"
              style={IS}
              onFocus={(e) => (e.target.style.borderColor = "rgba(228,0,43,0.5)")}
              onBlur={(e) => (e.target.style.borderColor = "var(--overlay-lg)")}
            />
          </div>
          <div>
            <label
              className="block text-xs font-semibold mb-2 uppercase tracking-wide"
              style={{ color: "#4b5563" }}
            >
              CNPJ
            </label>
            <input
              type="text"
              value={cnpj}
              onChange={(e) => setCnpj(maskCNPJ(e.target.value))}
              placeholder="00.000.000/0000-00"
              className="w-full px-4 rounded-xl text-sm placeholder-gray-700 outline-none transition-all"
              style={IS}
              onFocus={(e) => (e.target.style.borderColor = "rgba(228,0,43,0.5)")}
              onBlur={(e) => (e.target.style.borderColor = "var(--overlay-lg)")}
            />
          </div>
          <div>
            <label
              className="block text-xs font-semibold mb-2 uppercase tracking-wide"
              style={{ color: "#4b5563" }}
            >
              Email
            </label>
            <input
              type="text"
              disabled
              value={empresa.email}
              className="w-full px-4 rounded-xl text-sm placeholder-gray-700 outline-none cursor-not-allowed"
              style={{ ...IS, color: "#475569", background: "var(--bg-1)" }}
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all"
            style={{
              background: savedOk
                ? "rgba(34,197,94,0.15)"
                : "linear-gradient(135deg,#A80021,#a84400)",
              color: savedOk ? "#4ade80" : "white",
            }}
          >
            {saving ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Salvando...
              </>
            ) : savedOk ? (
              <>
                <CheckCircle size={14} /> Salvo!
              </>
            ) : (
              <>
                <Save size={14} /> Salvar alterações
              </>
            )}
          </button>
        </form>
      </div>

      {/* ── Endereço da empresa ── */}
      <div
        className="rounded-2xl p-5"
        style={{ background: "var(--bg-2)", border: "1px solid var(--border-1)" }}
      >
        <div className="flex items-center gap-2 mb-1">
          <MapPin size={15} style={{ color: "#E4002B" }} />
          <h2 className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>Endereço da empresa</h2>
        </div>
        <p className="text-xs mb-5" style={{ color: "#475569" }}>
          Origem no mapa de entregas e raio de geofence dos motoboys
        </p>

        <CompanyLocationPicker
          empresaId={empresa.id}
          initialEndereco={empresa.endereco ?? ""}
          initialLat={empresa.lat}
          initialLng={empresa.lng}
          initialRaio={empresa.raio_geofence}
        />
      </div>

      {/* ── Código da empresa ── */}
      <div
        className="rounded-2xl p-5"
        style={{ background: "var(--bg-2)", border: "1px solid var(--border-1)" }}
      >
        <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--text-1)" }}>Acesso e compartilhamento</h2>
        <div>
          <label
            className="block text-xs font-semibold mb-2 uppercase tracking-wide"
            style={{ color: "#4b5563" }}
          >
            Código da empresa
          </label>
          <div className="flex items-center gap-2">
            <div
              className="flex-1 flex items-center px-4 rounded-xl"
              style={{
                ...IS,
                background: "rgba(251,191,36,0.06)",
                border: "1px solid rgba(251,191,36,0.2)",
              }}
            >
              <span
                className="text-xl font-black tracking-[0.25em]"
                style={{ color: "#fbbf24", fontFamily: "monospace" }}
              >
                {empresa.codigo}
              </span>
            </div>
            <button
              onClick={() => copiar(empresa.codigo, setCopiadoCodigo)}
              className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold shrink-0 transition-all"
              style={{
                background: "rgba(251,191,36,0.1)",
                color: copiadoCodigo ? "#22c55e" : "#fbbf24",
                border: "1px solid rgba(251,191,36,0.2)",
              }}
            >
              {copiadoCodigo ? <CheckCircle size={14} /> : <Copy size={14} />}
              Copiar
            </button>
          </div>
          <p className="text-xs mt-1.5" style={{ color: "#374151" }}>
            Compartilhe com seus motoboys para que eles se cadastrem
          </p>
        </div>
      </div>
    </div>
  );
}

