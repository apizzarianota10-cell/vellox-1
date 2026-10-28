"use client";

import { useState } from "react";
import { Sun, Moon, LogOut, Palette, ExternalLink, Power, Loader2, ShieldCheck, Database } from "lucide-react";
import { Secao, Aviso, useJson, api, fmtData, assinaturaVigente, type EmpresaRow } from "./ui";

export default function Config({ empresas, modo, setModo, sair, onChanged, toast, abrirLoja }: {
  empresas: EmpresaRow[]; modo: "light" | "dark"; setModo: (m: "light" | "dark") => void;
  sair: () => void; onChanged: () => void; toast: (t: string, erro?: boolean) => void; abrirLoja: (id: string) => void;
}) {
  const prem = useJson<{ migracao_pendente: boolean }>("/api/god/premiacoes");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const vencidas = empresas.filter(e => e.assinatura_ativa && !assinaturaVigente(e));

  async function desativar(ids: string[]) {
    if (!ids.length) return;
    if (!window.confirm(ids.length === 1 ? "Desativar a assinatura desta loja?" : `Desativar ${ids.length} assinaturas vencidas?`)) return;
    setOcupado(ids.length === 1 ? ids[0] : "todas");
    let falhas = 0;
    for (const id of ids) {
      try { await api("/api/god/toggle-assinatura", { method: "POST", json: { empresaId: id, ativo: false } }); }
      catch { falhas++; }
    }
    setOcupado(null);
    toast(falhas ? `${falhas} falharam` : "Assinaturas desativadas", !!falhas);
    onChanged();
  }

  return (
    <div className="space-y-4 md:space-y-5 max-w-3xl">
      <Secao titulo="Aparência">
        <div className="px-4 md:px-5 pb-4 flex gap-2">
          <button className="gd-chip" data-on={modo === "light"} onClick={() => setModo("light")}><Sun size={14} /> Claro</button>
          <button className="gd-chip" data-on={modo === "dark"} onClick={() => setModo("dark")}><Moon size={14} /> Escuro</button>
        </div>
      </Secao>

      <Secao titulo={<span className="flex items-center gap-2"><Database size={15} /> Banco de dados</span>}>
        <div className="px-4 md:px-5 pb-4 space-y-3">
          {prem.loading ? <p className="text-sm gd-muted">Verificando migrações...</p>
            : prem.data?.migracao_pendente ? (
              <Aviso titulo="schema_v75.sql ainda não foi rodada">
                Rode <code>supabase/schema_v75.sql</code> no SQL Editor do Supabase para habilitar: uso de banco por loja, premiações
                e o fechamento das RPCs <code>god_*</code> (hoje elas aceitam chamadas com a anon key).
              </Aviso>
            ) : prem.data ? (
              <Aviso tom="ok" titulo="schema_v75.sql aplicada">Uso de banco por loja e premiações habilitados; RPCs god_* restritas ao service role.</Aviso>
            ) : <p className="text-sm gd-muted">{prem.error}</p>}
          <p className="text-xs gd-muted flex items-start gap-2"><ShieldCheck size={14} className="shrink-0 mt-0.5" />
            Todas as rotas /api/god/* conferem no servidor se a sessão é do e-mail GOD_EMAIL antes de usar o service role. A chave nunca vai para o navegador.</p>
        </div>
      </Secao>

      <Secao titulo="Explorar">
        <div className="px-4 md:px-5 pb-4 flex gap-2 flex-wrap">
          <a href="/god/explorar-editor" className="gd-btn"><Palette size={14} /> Editor visual do Explorar</a>
          <a href="/explorar" target="_blank" rel="noopener noreferrer" className="gd-btn"><ExternalLink size={14} /> Abrir /explorar</a>
        </div>
      </Secao>

      <section className="rounded-[18px] p-4 md:p-5 space-y-3" style={{ border: "1px solid color-mix(in srgb, var(--red) 30%, var(--line))", background: "var(--red-soft)" }}>
        <p className="gd-h2" style={{ color: "var(--red-ink)" }}>Ações perigosas</p>
        <div>
          <p className="text-sm font-bold">Assinaturas vencidas ainda marcadas como ativas ({vencidas.length})</p>
          <p className="text-xs mt-0.5" style={{ color: "var(--ink2)" }}>O painel da loja já bloqueia pelo vencimento, mas o status fica inconsistente. Desativar não apaga nada.</p>
          {vencidas.length > 0 && (
            <div className="mt-2 rounded-2xl overflow-hidden" style={{ background: "var(--card)", border: "1px solid var(--line)" }}>
              <ul className="gd-divide max-h-72 overflow-y-auto gd-scroll">
                {vencidas.map(e => (
                  <li key={e.id} className="flex items-center gap-3 px-4 py-2.5">
                    <button className="min-w-0 flex-1 text-left" style={{ background: "none", border: 0, padding: 0, color: "inherit", cursor: "pointer" }} onClick={() => abrirLoja(e.id)}>
                      <p className="text-sm font-bold truncate">{e.nome}</p>
                      <p className="text-xs gd-muted">venceu em {fmtData(e.assinatura_expira_em)}</p>
                    </button>
                    <button className="gd-btn gd-btn-sm gd-btn-danger" disabled={!!ocupado} onClick={() => desativar([e.id])}>
                      {ocupado === e.id ? <Loader2 size={12} className="animate-spin" /> : <Power size={12} />} Desativar
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {vencidas.length > 1 && (
            <button className="gd-btn gd-btn-red mt-2" disabled={!!ocupado} onClick={() => desativar(vencidas.map(e => e.id))}>
              {ocupado === "todas" ? <Loader2 size={14} className="animate-spin" /> : <Power size={14} />} Desativar todas
            </button>
          )}
        </div>
        <p className="text-xs" style={{ color: "var(--ink2)" }}>Para excluir uma loja, abra o registro dela em Lojas → Zona de perigo.</p>
      </section>

      <button className="gd-btn w-full md:w-auto" onClick={sair}><LogOut size={14} /> Sair do painel</button>
    </div>
  );
}
