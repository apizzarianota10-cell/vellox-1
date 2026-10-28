"use client";

import { useMemo, useState } from "react";
import { Database, Megaphone, HardDrive, Image as ImageIcon, RefreshCw, ChevronDown, Search, HelpCircle } from "lucide-react";
import { Kpi, Secao, Aviso, Carregando, Vazio, PlanoBadge, fmtBytes, fmtNum, fmtDataHora } from "./ui";
import { useUsoBanco, type UsoEmpresa } from "./usoBancoData";
import { presetBanco, type AbrirAviso } from "./Avisos";

type Ordem = "total" | "db" | "arquivos" | "linhas" | "nome";

export default function UsoBanco({ abrirLoja, abrirAviso }: { abrirLoja: (id: string) => void; abrirAviso: (a: AbrirAviso) => void }) {
  const { data, loading, error, recarregar } = useUsoBanco(true);
  const [ordem, setOrdem] = useState<Ordem>("total");
  const [q, setQ] = useState("");
  const [aberta, setAberta] = useState<string | null>(null);

  const arquivos = (e: UsoEmpresa) => e.storage_bytes + e.imagens_bytes;
  const lista = useMemo(() => {
    const t = q.trim().toLowerCase();
    const out = (data?.empresas ?? []).filter(e => !t || e.nome.toLowerCase().includes(t));
    out.sort((a, b) => {
      switch (ordem) {
        case "db": return b.db_estimado_bytes - a.db_estimado_bytes;
        case "arquivos": return arquivos(b) - arquivos(a);
        case "linhas": return b.linhas - a.linhas;
        case "nome": return a.nome.localeCompare(b.nome, "pt-BR");
        default: return b.total_bytes - a.total_bytes;
      }
    });
    return out;
  }, [data, ordem, q]);

  const somaLojas = (data?.empresas ?? []).reduce((s, e) => s + e.total_bytes, 0);
  const maior = Math.max(1, ...(data?.empresas ?? []).map(e => e.total_bytes));
  const img = data?.storage_imagens;
  const stp = data?.storage_principal;

  return (
    <div className="space-y-4 md:space-y-5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm gd-muted">{data ? `Calculado em ${fmtDataHora(data.gerado_em)}` : "Medindo tabelas e arquivos..."}</p>
        <button className="gd-btn gd-btn-sm" onClick={recarregar} disabled={loading}>
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Recalcular
        </button>
      </div>

      {error && <Aviso tom="red" titulo="Erro ao medir o uso">{error}</Aviso>}
      {data?.migracao_pendente && (
        <Aviso titulo="Rode supabase/schema_v75.sql no Supabase">
          A função <code>god_uso_banco()</code> ainda não existe, então o tamanho do banco por loja não pode ser medido.
          {img?.configurado ? " Os arquivos do projeto de imagens já aparecem abaixo." : ""}
        </Aviso>
      )}
      {data?.erro && <Aviso tom="red" titulo="A função do banco respondeu com erro">{data.erro}</Aviso>}

      {!data && loading ? <Carregando texto="Medindo..." /> : data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi destaque label="Banco total" icone={<Database size={16} />} valor={data.db ? fmtBytes(data.db.total_bytes) : "—"}
              sub={data.db ? `${fmtBytes(data.db.atribuido_bytes)} atribuído às lojas` : "precisa da v75"} />
            <Kpi label="Storage (projeto principal)" icone={<HardDrive size={16} />} valor={stp?.total_bytes != null ? fmtBytes(stp.total_bytes) : "—"}
              sub={stp ? `${fmtBytes(stp.nao_atribuido_bytes)} não atribuído` : "precisa da v75"} />
            <Kpi label="Imagens (projeto de imagens)" icone={<ImageIcon size={16} />} valor={img?.configurado ? fmtBytes(img.total_bytes) : "—"}
              sub={img?.configurado ? `${fmtNum(img.arquivos)} arquivos${img.truncado ? " (parcial)" : ""}` : "IMAGES_SUPABASE_* não configurado"} />
            <Kpi label="Não atribuído" icone={<HelpCircle size={16} />}
              valor={fmtBytes((img?.nao_atribuido_bytes ?? 0) + (stp?.nao_atribuido_bytes ?? 0))}
              sub={img?.configurado ? `${fmtNum(img.nao_atribuido_arquivos)} imagens órfãs · ${fmtBytes(img.plataforma_bytes)} da plataforma` : "arquivos sem dono identificável"} />
          </div>
          {img?.erro && <Aviso titulo="Leitura parcial do Storage de imagens">{img.erro}</Aviso>}

          <Secao titulo="Uso por loja" acao={<span className="text-xs gd-muted">{lista.length} lojas</span>}>
            <div className="px-4 md:px-5 pb-3 flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--faint)" }} />
                <input className="gd-input" style={{ paddingLeft: 34 }} placeholder="Buscar loja" value={q} onChange={e => setQ(e.target.value)} />
              </div>
              <select className="gd-input sm:w-48" value={ordem} onChange={e => setOrdem(e.target.value as Ordem)} aria-label="Ordenar">
                <option value="total">Maior uso total</option>
                <option value="db">Maior uso de banco</option>
                <option value="arquivos">Mais arquivos (MB)</option>
                <option value="linhas">Mais linhas</option>
                <option value="nome">Nome (A–Z)</option>
              </select>
            </div>
            {lista.length === 0 ? <Vazio texto="Nenhuma loja." /> : (
              <ul className="gd-divide" style={{ borderTop: "1px solid var(--line)" }}>
                {lista.map(e => {
                  const pct = somaLojas > 0 ? (e.total_bytes / somaLojas) * 100 : 0;
                  const aberto = aberta === e.id;
                  return (
                    <li key={e.id}>
                      <button className="gd-row w-full text-left px-4 md:px-5 py-3" style={{ background: aberto ? "var(--hover)" : undefined, border: 0, color: "inherit" }}
                        onClick={() => setAberta(aberto ? null : e.id)} aria-expanded={aberto}>
                        <div className="flex items-center gap-2 min-w-0">
                          <p className="text-sm font-bold truncate flex-1 min-w-0">{e.nome}</p>
                          <span className="hidden sm:inline"><PlanoBadge plano={e.plano} /></span>
                          <span className="text-sm font-extrabold shrink-0">{fmtBytes(e.total_bytes)}</span>
                          <span className="text-xs gd-muted w-12 text-right shrink-0">{pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</span>
                          <ChevronDown size={15} style={{ color: "var(--faint)", transform: aberto ? "rotate(180deg)" : undefined, transition: "transform .15s", flexShrink: 0 }} />
                        </div>
                        <div className="gd-bar mt-2 flex" style={{ height: 7 }} title="Banco · Arquivos">
                          <span style={{ width: `${(e.db_estimado_bytes / maior) * 100}%`, borderRadius: "999px 0 0 999px" }} />
                          <span style={{ width: `${(arquivos(e) / maior) * 100}%`, background: "var(--ink2)", opacity: 0.55, borderRadius: "0 999px 999px 0", marginLeft: e.db_estimado_bytes > 0 ? 2 : 0 }} />
                        </div>
                        <p className="text-xs gd-muted mt-1.5">
                          Banco {fmtBytes(e.db_estimado_bytes)} · Arquivos {fmtBytes(arquivos(e))} ({fmtNum(e.storage_arquivos + e.imagens_arquivos)}) · {fmtNum(e.linhas)} linhas
                        </p>
                      </button>
                      {aberto && (
                        <div className="px-4 md:px-5 pb-4 pt-1 gd-fade" style={{ background: "var(--hover)" }}>
                          {e.tabelas.length === 0 ? <p className="text-xs gd-muted">{data.migracao_pendente ? "Detalhe por tabela disponível depois da schema_v75.sql." : "Sem linhas no banco."}</p> : (
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs" style={{ minWidth: 300 }}>
                                <thead>
                                  <tr className="gd-label" style={{ fontSize: 10 }}>
                                    <th className="text-left py-1.5 font-bold">Tabela</th>
                                    <th className="text-right py-1.5 font-bold">Linhas</th>
                                    <th className="text-right py-1.5 font-bold">Dados</th>
                                    <th className="text-right py-1.5 font-bold">c/ índices (est.)</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {e.tabelas.map(t => (
                                    <tr key={t.tabela} style={{ borderTop: "1px solid var(--line)" }}>
                                      <td className="py-1.5 font-mono pr-2">{t.tabela}</td>
                                      <td className="py-1.5 text-right">{fmtNum(t.linhas)}</td>
                                      <td className="py-1.5 text-right">{fmtBytes(t.bytes)}</td>
                                      <td className="py-1.5 text-right font-bold">{fmtBytes(t.estimado_bytes)}</td>
                                    </tr>
                                  ))}
                                  {(e.storage_bytes > 0 || e.imagens_bytes > 0) && (
                                    <tr style={{ borderTop: "1px solid var(--line)" }}>
                                      <td className="py-1.5 pr-2">Arquivos (Storage + imagens)</td>
                                      <td className="py-1.5 text-right">{fmtNum(e.storage_arquivos + e.imagens_arquivos)}</td>
                                      <td className="py-1.5 text-right" colSpan={2}><b>{fmtBytes(arquivos(e))}</b></td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          )}
                          <div className="flex gap-2 flex-wrap mt-3">
                            <button className="gd-btn gd-btn-sm" onClick={() => abrirLoja(e.id)}>Abrir loja</button>
                            <button className="gd-btn gd-btn-sm gd-btn-danger" onClick={() => abrirAviso(presetBanco(data, e))}>
                              <Megaphone size={13} /> Alerta de banco cheio
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Secao>

          {data.db && data.db.tabelas.length > 0 && (
            <Secao titulo="Maiores tabelas do banco">
              <ul className="px-4 md:px-5 pb-4 space-y-2">
                {data.db.tabelas.slice(0, 12).map(t => (
                  <li key={t.tabela} className="text-xs">
                    <div className="flex justify-between gap-2">
                      <span className="font-mono truncate">{t.tabela}</span>
                      <span className="gd-muted shrink-0">~{fmtNum(t.linhas_estimadas)} lin · <b style={{ color: "var(--ink)" }}>{fmtBytes(t.total_bytes)}</b></span>
                    </div>
                    <div className="gd-bar mt-1" style={{ height: 5 }}><span style={{ width: `${(t.total_bytes / (data.db!.tabelas[0].total_bytes || 1)) * 100}%`, opacity: 0.7 }} /></div>
                  </li>
                ))}
              </ul>
            </Secao>
          )}

          <p className="text-xs gd-muted leading-relaxed">
            Como é medido: “Dados” soma <code>pg_column_size</code> de cada linha da loja (incluindo variações, sabores e adicionais via produto);
            “c/ índices” distribui o tamanho real de cada tabela proporcionalmente. Arquivos do Storage principal são atribuídos pelo dono do upload
            (a loja ou um motoboy dela) ou pela pasta com o id da loja; imagens do projeto de imagens, pelas URLs gravadas em produtos, sabores, logos,
            banners, fotos de motoboy e pela pasta <code>avaliacoes/&lt;loja&gt;</code>. O que não dá para atribuir com segurança aparece como “não atribuído”.
            Clientes são contas compartilhadas entre lojas e não entram na soma.
          </p>
        </>
      )}
    </div>
  );
}
