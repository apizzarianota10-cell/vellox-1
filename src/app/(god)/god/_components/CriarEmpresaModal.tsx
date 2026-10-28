"use client";

import { useState } from "react";
import { CheckCircle2, Copy, Check, Eye, EyeOff, KeyRound, Loader2, Plus } from "lucide-react";
import { Modal, Aviso, api, PLANOS, PLANO_LABEL, type Plano } from "./ui";

// Mesma chamada do painel antigo: POST /api/god/create-empresa { nome, email, senha, plano, dias }
export default function CriarEmpresaModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ nome: "", email: "", senha: "", plano: "pro" as Plano, dias: 365 });
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ nome: string; email: string; codigo: string; plano: Plano } | null>(null);
  const [verSenha, setVerSenha] = useState(false);
  const [copiado, setCopiado] = useState(false);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setCriando(true); setErro(null);
    try {
      const d = await api<{ empresa: { nome: string; email: string; codigo: string; plano: Plano } }>("/api/god/create-empresa", { method: "POST", json: form });
      setResultado(d.empresa);
      onCreated();
    } catch (err) { setErro((err as Error).message); }
    finally { setCriando(false); }
  }

  return (
    <Modal onClose={onClose} titulo={resultado ? "Loja criada" : "Nova loja"}>
      {resultado ? (
        <div className="text-center space-y-4">
          <CheckCircle2 size={40} className="mx-auto" style={{ color: "var(--ok)" }} />
          <p className="text-sm gd-muted">{resultado.email} · plano {PLANO_LABEL[resultado.plano] ?? resultado.plano}</p>
          <div className="rounded-2xl p-4" style={{ background: "var(--soft)" }}>
            <p className="gd-label mb-2">Código da empresa</p>
            <div className="flex items-center justify-center gap-3">
              <span className="text-3xl font-black tracking-widest font-mono">{resultado.codigo}</span>
              <button className="gd-btn gd-btn-sm" style={{ width: 36, padding: 0 }} aria-label="Copiar código"
                onClick={() => { navigator.clipboard.writeText(resultado.codigo); setCopiado(true); setTimeout(() => setCopiado(false), 2000); }}>
                {copiado ? <Check size={15} style={{ color: "var(--ok)" }} /> : <Copy size={15} />}
              </button>
            </div>
          </div>
          <div className="rounded-2xl p-3 text-left text-sm" style={{ border: "1px solid var(--line2)" }}>
            <p className="gd-label mb-1">Credenciais de acesso</p>
            <p>E-mail: <b className="font-mono">{resultado.email}</b></p>
            <p>Senha: <b className="font-mono">{form.senha}</b></p>
          </div>
          <button className="gd-btn gd-btn-primary w-full" style={{ height: 44 }} onClick={onClose}>Fechar</button>
        </div>
      ) : (
        <form onSubmit={criar} className="space-y-4">
          <p className="text-sm gd-muted -mt-1">A conta é criada já ativa, sem passar pelo pagamento.</p>
          <label className="block">
            <span className="gd-label">Nome da loja</span>
            <input className="gd-input mt-1.5" required value={form.nome} placeholder="Ex.: Delivery Exemplo" onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
          </label>
          <label className="block">
            <span className="gd-label">E-mail</span>
            <input className="gd-input mt-1.5" type="email" required value={form.email} placeholder="loja@exemplo.com" onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          </label>
          <label className="block">
            <span className="gd-label">Senha</span>
            <div className="relative mt-1.5">
              <KeyRound size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--faint)" }} />
              <input className="gd-input" style={{ paddingLeft: 34, paddingRight: 40 }} type={verSenha ? "text" : "password"} required minLength={6}
                value={form.senha} placeholder="Mínimo 6 caracteres" onChange={e => setForm(f => ({ ...f, senha: e.target.value }))} />
              <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 gd-btn gd-btn-ghost gd-btn-sm" style={{ width: 30, padding: 0 }}
                onClick={() => setVerSenha(s => !s)} aria-label={verSenha ? "Ocultar senha" : "Mostrar senha"}>
                {verSenha ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </label>
          <div>
            <span className="gd-label">Plano</span>
            <div className="grid grid-cols-4 gap-1.5 mt-1.5">
              {PLANOS.map(p => (
                <button key={p} type="button" className="gd-btn gd-btn-sm"
                  style={form.plano === p ? { background: "var(--ink)", color: "var(--card)", borderColor: "var(--ink)" } : undefined}
                  onClick={() => setForm(f => ({ ...f, plano: p }))}>{PLANO_LABEL[p]}</button>
              ))}
            </div>
          </div>
          <div>
            <span className="gd-label">Dias de assinatura</span>
            <div className="flex gap-1.5 mt-1.5 flex-wrap">
              {[30, 90, 365].map(d => (
                <button key={d} type="button" className="gd-chip" data-on={form.dias === d} onClick={() => setForm(f => ({ ...f, dias: d }))}>{d === 365 ? "1 ano" : `${d} dias`}</button>
              ))}
              <input className="gd-input" style={{ width: 90, height: 32 }} type="number" min={1} max={3650} value={form.dias} aria-label="Dias"
                onChange={e => setForm(f => ({ ...f, dias: parseInt(e.target.value) || 365 }))} />
            </div>
          </div>
          {erro && <Aviso tom="red" titulo="Erro ao criar a loja">{erro}</Aviso>}
          <button type="submit" className="gd-btn gd-btn-red w-full" style={{ height: 46 }} disabled={criando}>
            {criando ? <><Loader2 size={16} className="animate-spin" /> Criando...</> : <><Plus size={16} /> Criar loja</>}
          </button>
        </form>
      )}
    </Modal>
  );
}
