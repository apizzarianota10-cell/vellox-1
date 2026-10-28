"use client";

import { useState } from "react";
import { Trophy, Loader2, Send, Trash2, CalendarPlus, Building2, Bike, Eye, Gift, Clock } from "lucide-react";
import { Modal, Aviso, Vazio, api, fmtBRL, fmtDataHora, type AlvoPremiacao, type Premiacao } from "./ui";

type Preset = "nenhum" | "mes" | "quinzena" | "r50" | "r100" | "outro";
const PRESETS: { v: Preset; l: string; empresa?: boolean; beneficio?: string; dias?: number; valor?: number }[] = [
  { v: "nenhum", l: "Só reconhecimento" },
  { v: "mes", l: "1 mês grátis", empresa: true, beneficio: "1 mês grátis", dias: 30 },
  { v: "quinzena", l: "15 dias grátis", empresa: true, beneficio: "15 dias grátis", dias: 15 },
  { v: "r50", l: "R$ 50", beneficio: "R$ 50", valor: 50 },
  { v: "r100", l: "R$ 100", beneficio: "R$ 100", valor: 100 },
  { v: "outro", l: "Personalizado" },
];

export function PremiacaoModal({ alvo, onClose, onSent, toast }: {
  alvo: AlvoPremiacao; onClose: () => void; onSent: () => void; toast: (t: string, erro?: boolean) => void;
}) {
  const ehEmpresa = alvo.tipo === "empresa";
  const [titulo, setTitulo] = useState(alvo.tituloSugerido ?? (ehEmpresa ? "Parabéns pelo desempenho!" : "Motoboy destaque!"));
  const [mensagem, setMensagem] = useState(
    ehEmpresa
      ? `Olá, ${alvo.nome}! Vocês estão entre as lojas que mais cresceram na Vellox. Obrigado por fazer parte — continuem assim!`
      : `Valeu, ${alvo.nome}! Você está entre os motoboys com mais entregas na Vellox. Obrigado pela dedicação!`,
  );
  const [preset, setPreset] = useState<Preset>(ehEmpresa ? "mes" : "nenhum");
  const [beneficio, setBeneficio] = useState("");
  const [valor, setValor] = useState("");
  const [dias, setDias] = useState("");
  const [aplicar, setAplicar] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const p = PRESETS.find(x => x.v === preset)!;
  const diasFinal = preset === "outro" ? (dias ? Number(dias) : null) : p.dias ?? null;
  const valorFinal = preset === "outro" ? (valor ? Number(valor.replace(",", ".")) : null) : p.valor ?? null;
  const beneficioFinal = preset === "outro" ? beneficio.trim() || null : p.beneficio ?? null;

  async function enviar() {
    if (!titulo.trim()) { setErro("Dê um título para a premiação."); return; }
    setEnviando(true); setErro(null);
    try {
      const r = await api<{ aplicado: { expira_em: string | null; error: string | null } | null }>("/api/god/premiacoes", {
        method: "POST",
        json: {
          alvo_tipo: alvo.tipo,
          empresa_id: ehEmpresa ? alvo.id : undefined,
          motoboy_id: !ehEmpresa ? alvo.id : undefined,
          titulo: titulo.trim(),
          mensagem: mensagem.trim(),
          beneficio: beneficioFinal,
          valor: valorFinal,
          dias_bonus: ehEmpresa ? diasFinal : null,
          periodo_ref: alvo.periodoRef ?? null,
          aplicar_dias: ehEmpresa && !!diasFinal && aplicar,
        },
      });
      if (r.aplicado?.error) toast(`Premiação enviada, mas os dias não foram aplicados: ${r.aplicado.error}`, true);
      else if (r.aplicado?.expira_em) toast(`Premiação enviada · assinatura até ${new Date(r.aplicado.expira_em).toLocaleDateString("pt-BR")}`);
      else toast("Premiação enviada");
      onSent(); onClose();
    } catch (e) {
      setErro((e as Error).message);
    } finally { setEnviando(false); }
  }

  return (
    <Modal onClose={onClose} z={90} titulo={<span className="flex items-center gap-2"><Trophy size={18} style={{ color: "var(--gold)" }} /> Enviar premiação</span>}>
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-2xl p-3" style={{ background: "var(--soft)" }}>
          {ehEmpresa ? <Building2 size={18} /> : <Bike size={18} />}
          <div className="min-w-0">
            <p className="gd-label" style={{ fontSize: 10 }}>{ehEmpresa ? "Loja" : "Motoboy"}</p>
            <p className="text-sm font-bold truncate">{alvo.nome}</p>
          </div>
          {alvo.periodoRef && <span className="ml-auto gd-badge" style={{ background: "var(--card)", color: "var(--ink2)" }}>{alvo.periodoRef}</span>}
        </div>

        <label className="block">
          <span className="gd-label">Título</span>
          <input className="gd-input mt-1.5" maxLength={120} value={titulo} onChange={e => setTitulo(e.target.value)} />
        </label>
        <label className="block">
          <span className="gd-label">Mensagem</span>
          <textarea className="gd-input mt-1.5" maxLength={1000} rows={3} value={mensagem} onChange={e => setMensagem(e.target.value)} />
        </label>

        <div>
          <span className="gd-label">Benefício</span>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {PRESETS.filter(x => ehEmpresa || !x.empresa).map(x => (
              <button key={x.v} type="button" className="gd-chip" data-on={preset === x.v} onClick={() => setPreset(x.v)}>{x.l}</button>
            ))}
          </div>
          {preset === "outro" && (
            <div className={`grid gap-2 mt-2 ${ehEmpresa ? "grid-cols-3" : "grid-cols-2"}`}>
              <input className="gd-input col-span-1" placeholder="Ex.: Kit Vellox" maxLength={120} value={beneficio} onChange={e => setBeneficio(e.target.value)} aria-label="Descrição do benefício" />
              <input className="gd-input" placeholder="R$ (opcional)" inputMode="decimal" value={valor} onChange={e => setValor(e.target.value)} aria-label="Valor" />
              {ehEmpresa && <input className="gd-input" placeholder="Dias (opc.)" type="number" min={1} max={3650} value={dias} onChange={e => setDias(e.target.value)} aria-label="Dias de assinatura" />}
            </div>
          )}
        </div>

        {ehEmpresa && diasFinal ? (
          <label className="flex items-start gap-3 rounded-2xl p-3 cursor-pointer" style={{ border: "1px solid var(--line2)" }}>
            <input type="checkbox" checked={aplicar} onChange={e => setAplicar(e.target.checked)} style={{ width: 18, height: 18, marginTop: 2, accentColor: "var(--red)" }} />
            <span className="text-sm">
              <b>Aplicar +{diasFinal} dias na assinatura agora</b>
              <span className="block text-xs gd-muted mt-0.5">Soma ao vencimento atual (ou a partir de hoje, se já venceu) e reativa a assinatura — mesma gravação do “definir dias”. Dá para aplicar depois pelo histórico.</span>
            </span>
          </label>
        ) : null}

        {erro && <Aviso tom="red" titulo="Não foi possível enviar">{erro}</Aviso>}

        <button className="gd-btn gd-btn-red w-full" style={{ height: 46 }} disabled={enviando} onClick={enviar}>
          {enviando ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Enviar premiação
        </button>
        <p className="text-xs gd-muted text-center">O destinatário vê um aviso no {ehEmpresa ? "painel da loja" : "app do motoboy"} na próxima vez que abrir.</p>
      </div>
    </Modal>
  );
}

const STATUS_PREM: Record<string, { l: string; cor: string; ic: typeof Eye }> = {
  enviada:   { l: "Enviada",   cor: "var(--muted)", ic: Send },
  vista:     { l: "Vista",     cor: "var(--info)",  ic: Eye },
  resgatada: { l: "Resgatada", cor: "var(--ok)",    ic: Gift },
};

export function PremiacaoLista({ itens, compacto, onChanged, toast, abrirAlvo }: {
  itens: Premiacao[]; compacto?: boolean; onChanged: () => void; toast: (t: string, erro?: boolean) => void;
  abrirAlvo?: (p: Premiacao) => void;
}) {
  const [ocupado, setOcupado] = useState<string | null>(null);

  async function aplicarDias(p: Premiacao) {
    if (!window.confirm(`Somar ${p.dias_bonus} dias à assinatura de ${p.alvo_nome ?? "esta loja"}?`)) return;
    setOcupado(p.id);
    try {
      const r = await api<{ expira_em: string }>("/api/god/premiacoes", { method: "PATCH", json: { id: p.id, acao: "aplicar_dias" } });
      toast(`Dias aplicados · assinatura até ${new Date(r.expira_em).toLocaleDateString("pt-BR")}`);
      onChanged();
    } catch (e) { toast((e as Error).message, true); }
    finally { setOcupado(null); }
  }
  async function excluir(p: Premiacao) {
    if (!window.confirm("Apagar esta premiação? O destinatário deixa de vê-la (dias já aplicados continuam).")) return;
    setOcupado(p.id);
    try { await api("/api/god/premiacoes", { method: "DELETE", json: { id: p.id } }); toast("Premiação apagada"); onChanged(); }
    catch (e) { toast((e as Error).message, true); }
    finally { setOcupado(null); }
  }

  if (itens.length === 0) return <Vazio texto="Nenhuma premiação enviada ainda." icone={<Trophy size={24} />} />;
  return (
    <ul className="gd-divide" style={{ borderTop: "1px solid var(--line)" }}>
      {itens.map(p => {
        const s = STATUS_PREM[p.status] ?? STATUS_PREM.enviada;
        const Ic = s.ic;
        return (
          <li key={p.id} className="px-4 md:px-5 py-3">
            <div className="flex items-start gap-3">
              <span className="flex items-center justify-center rounded-xl shrink-0" style={{ width: 34, height: 34, background: "color-mix(in srgb, var(--gold) 14%, transparent)", color: "var(--gold)" }}>
                <Trophy size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">{p.titulo}</p>
                {!compacto && p.alvo_nome && (
                  <button className="text-xs font-semibold inline-flex items-center gap-1 mt-0.5" style={{ color: "var(--ink2)", background: "none", border: 0, padding: 0, cursor: abrirAlvo ? "pointer" : "default" }}
                    onClick={() => abrirAlvo?.(p)}>
                    {p.alvo_tipo === "empresa" ? <Building2 size={11} /> : <Bike size={11} />} {p.alvo_nome}
                  </button>
                )}
                <p className="text-xs gd-muted mt-0.5">
                  {fmtDataHora(p.created_at)}{p.periodo_ref ? ` · ${p.periodo_ref}` : ""}
                  {p.beneficio ? ` · ${p.beneficio}` : ""}{p.valor != null && !p.beneficio ? ` · ${fmtBRL(Number(p.valor))}` : ""}
                </p>
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  <span className="gd-badge" style={{ color: s.cor, background: `color-mix(in srgb, ${s.cor} 12%, transparent)` }}><Ic size={11} /> {s.l}{p.vista_em ? ` ${fmtDataHora(p.vista_em)}` : ""}</span>
                  {p.dias_bonus ? (p.dias_aplicados_em
                    ? <span className="gd-badge" style={{ color: "var(--ok)", background: "var(--ok-soft)" }}><CalendarPlus size={11} /> +{p.dias_bonus}d aplicados</span>
                    : <button className="gd-btn gd-btn-sm" style={{ height: 24, fontSize: 11 }} disabled={ocupado === p.id} onClick={() => aplicarDias(p)}>
                        {ocupado === p.id ? <Loader2 size={11} className="animate-spin" /> : <Clock size={11} />} Aplicar +{p.dias_bonus}d
                      </button>) : null}
                </div>
              </div>
              <button className="gd-btn gd-btn-ghost gd-btn-sm shrink-0" style={{ width: 30, padding: 0, color: "var(--faint)" }} aria-label="Apagar premiação"
                disabled={ocupado === p.id} onClick={() => excluir(p)}><Trash2 size={14} /></button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
