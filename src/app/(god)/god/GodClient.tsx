"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard, Building2, Bike, Trophy, Database, Compass, Settings, Crown,
  RefreshCw, LogOut, Sun, Moon, MoreHorizontal, X, Megaphone,
} from "lucide-react";
import { GOD_CSS, useToast, type EmpresaRow, type AlvoPremiacao } from "./_components/ui";
import VisaoGeral from "./_components/VisaoGeral";
import Lojas from "./_components/Lojas";
import Motoboys from "./_components/Motoboys";
import Ranking from "./_components/Ranking";
import UsoBanco from "./_components/UsoBanco";
import ExplorarPanel from "./_components/ExplorarPanel";
import Config from "./_components/Config";
import LojaDetalhe from "./_components/LojaDetalhe";
import MotoboyDetalhe from "./_components/MotoboyDetalhe";
import CriarEmpresaModal from "./_components/CriarEmpresaModal";
import { PremiacaoModal } from "./_components/Premiacoes";
import AvisosSecao, { AvisoModal, type AbrirAviso } from "./_components/Avisos";

export type { EmpresaRow };

interface Props {
  empresas: EmpresaRow[];
  error: string | null;
}

type SecaoId = "visao" | "lojas" | "motoboys" | "ranking" | "avisos" | "banco" | "explorar" | "config";

const SECOES: { id: SecaoId; label: string; curto: string; icon: typeof LayoutDashboard; desc: string }[] = [
  { id: "visao",    label: "Visão geral",           curto: "Início",   icon: LayoutDashboard, desc: "Como a plataforma está agora" },
  { id: "lojas",    label: "Lojas",                 curto: "Lojas",    icon: Building2,       desc: "Cadastro, plano e assinatura de cada loja" },
  { id: "motoboys", label: "Motoboys",              curto: "Motoboys", icon: Bike,            desc: "Todos os entregadores da plataforma" },
  { id: "ranking",  label: "Ranking & Premiações",  curto: "Ranking",  icon: Trophy,          desc: "Quem mais vendeu e entregou — e premie" },
  { id: "avisos",   label: "Avisos",                curto: "Avisos",   icon: Megaphone,       desc: "Pop-ups para uma, várias ou todas as lojas" },
  { id: "banco",    label: "Uso de banco",          curto: "Banco",    icon: Database,        desc: "Quanto cada loja ocupa no banco e no storage" },
  { id: "explorar", label: "Explorar",              curto: "Explorar", icon: Compass,         desc: "Destaques, banners, categorias e flash sales" },
  { id: "config",   label: "Configurações",         curto: "Ajustes",  icon: Settings,        desc: "Tema, migrações e ações perigosas" },
];
const TAB_BAR: SecaoId[] = ["visao", "lojas", "motoboys", "ranking"];
const TEMA_KEY = "vellox-god-tema";

export default function GodClient({ empresas, error }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [secao, setSecao] = useState<SecaoId>("visao");
  const [modo, setModoState] = useState<"light" | "dark">("light");
  const [maisAberto, setMaisAberto] = useState(false);
  const [lojaId, setLojaId] = useState<string | null>(null);
  const [motoboyId, setMotoboyId] = useState<string | null>(null);
  const [alvoPremio, setAlvoPremio] = useState<AlvoPremiacao | null>(null);
  const [criando, setCriando] = useState(false);
  const [versaoPrem, setVersaoPrem] = useState(0);
  const [avisoAbrir, setAvisoAbrir] = useState<AbrirAviso | null>(null);
  const [versaoAvisos, setVersaoAvisos] = useState(0);
  const { show: toast, node: toastNode } = useToast();

  // Tema e seção lembrados por navegador (só conveniência)
  useEffect(() => {
    try {
      const t = localStorage.getItem(TEMA_KEY);
      if (t === "dark" || t === "light") setModoState(t);
      const s = sessionStorage.getItem("vellox-god-secao") as SecaoId | null;
      if (s && SECOES.some(x => x.id === s)) setSecao(s);
    } catch {}
  }, []);
  const setModo = (m: "light" | "dark") => {
    setModoState(m);
    try { localStorage.setItem(TEMA_KEY, m); } catch {}
  };
  const irPara = (s: SecaoId) => {
    setSecao(s); setMaisAberto(false);
    try { sessionStorage.setItem("vellox-god-secao", s); } catch {}
    window.scrollTo({ top: 0 });
  };

  const atualizar = useCallback(() => startTransition(() => router.refresh()), [router]);
  const abrirLoja = useCallback((id: string) => { setMotoboyId(null); setLojaId(id); }, []);
  const abrirMotoboy = useCallback((id: string) => setMotoboyId(id), []);

  async function sair() {
    const { createClient } = await import("@/lib/supabase/client");
    await createClient().auth.signOut();
    router.push("/login");
  }

  const atual = SECOES.find(s => s.id === secao)!;

  return (
    <div className="gd" data-mode={modo}>
      <style dangerouslySetInnerHTML={{ __html: GOD_CSS }} />

      {/* ── Barra lateral (desktop) ── */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-[248px] flex-col px-4 py-5 z-30"
        style={{ background: "var(--card)", borderRight: "1px solid var(--line)" }}>
        <div className="flex items-center gap-3 px-2 mb-7">
          <span className="flex items-center justify-center rounded-xl" style={{ width: 38, height: 38, background: "var(--ink)", color: "var(--card)" }}>
            <Crown size={18} />
          </span>
          <div>
            <p className="font-extrabold leading-tight" style={{ letterSpacing: "-0.03em", fontSize: 16 }}>Vellox <span style={{ color: "var(--red)" }}>God</span></p>
            <p className="text-[11px] gd-muted">Painel da plataforma</p>
          </div>
        </div>
        <nav className="space-y-1 flex-1">
          {SECOES.map(s => (
            <button key={s.id} className="gd-nav-item" data-on={secao === s.id} onClick={() => irPara(s.id)}>
              <s.icon size={17} /> {s.label}
            </button>
          ))}
        </nav>
        <div className="space-y-1 pt-4" style={{ borderTop: "1px solid var(--line)" }}>
          <button className="gd-nav-item" onClick={() => setModo(modo === "light" ? "dark" : "light")}>
            {modo === "light" ? <Moon size={17} /> : <Sun size={17} />} {modo === "light" ? "Tema escuro" : "Tema claro"}
          </button>
          <button className="gd-nav-item" onClick={sair}><LogOut size={17} /> Sair</button>
        </div>
      </aside>

      {/* ── Conteúdo ── */}
      <div className="lg:pl-[248px]">
        <header className="sticky top-0 z-20 px-4 md:px-8"
          style={{ background: "color-mix(in srgb, var(--bg) 88%, transparent)", backdropFilter: "saturate(1.4) blur(12px)", WebkitBackdropFilter: "blur(12px)", borderBottom: "1px solid var(--line)", paddingTop: "env(safe-area-inset-top)" }}>
          <div className="flex items-center gap-3 h-[60px] md:h-[72px] max-w-[1280px] mx-auto">
            <span className="lg:hidden flex items-center justify-center rounded-xl shrink-0" style={{ width: 34, height: 34, background: "var(--ink)", color: "var(--card)" }}>
              <Crown size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="gd-h1 truncate" style={{ fontSize: "clamp(19px, 4.8vw, 26px)" }}>{atual.label}</h1>
              <p className="hidden md:block text-xs gd-muted truncate">{atual.desc}</p>
            </div>
            <button className="gd-btn gd-btn-sm lg:hidden" style={{ width: 36, padding: 0 }} onClick={() => setModo(modo === "light" ? "dark" : "light")} aria-label="Alternar tema">
              {modo === "light" ? <Moon size={15} /> : <Sun size={15} />}
            </button>
            <button className="gd-btn gd-btn-sm" onClick={atualizar} disabled={isPending} aria-label="Atualizar dados">
              <RefreshCw size={14} className={isPending ? "animate-spin" : ""} /> <span className="hidden sm:inline">Atualizar</span>
            </button>
          </div>
        </header>

        <main className="px-4 md:px-8 pt-4 md:pt-6 max-w-[1280px] mx-auto"
          style={{ paddingBottom: "calc(96px + env(safe-area-inset-bottom))" }}>
          <div key={secao} className="gd-fade">
            {secao === "visao" && <VisaoGeral abrirLoja={abrirLoja} />}
            {secao === "lojas" && <Lojas empresas={empresas} error={error} abrirLoja={abrirLoja} onNova={() => setCriando(true)} />}
            {secao === "motoboys" && <Motoboys abrirMotoboy={abrirMotoboy} />}
            {secao === "ranking" && <Ranking abrirLoja={abrirLoja} abrirMotoboy={abrirMotoboy} premiar={setAlvoPremio} versao={versaoPrem} toast={toast} />}
            {secao === "avisos" && <AvisosSecao lojas={empresas} abrirAviso={setAvisoAbrir} abrirLoja={abrirLoja} versao={versaoAvisos} toast={toast} />}
            {secao === "banco" && <UsoBanco abrirLoja={abrirLoja} abrirAviso={setAvisoAbrir} />}
            {secao === "explorar" && <ExplorarPanel />}
            {secao === "config" && <Config empresas={empresas} modo={modo} setModo={setModo} sair={sair} onChanged={atualizar} toast={toast} abrirLoja={abrirLoja} />}
          </div>
          <p className="text-center text-xs gd-muted mt-10 lg:mb-0">Vellox · painel da plataforma · {empresas.length} lojas</p>
        </main>
      </div>

      {/* ── Barra inferior (celular/tablet) ── */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 flex"
        style={{ background: "color-mix(in srgb, var(--card) 94%, transparent)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", borderTop: "1px solid var(--line)", height: "calc(64px + env(safe-area-inset-bottom))", paddingBottom: "env(safe-area-inset-bottom)" }}>
        {TAB_BAR.map(id => {
          const s = SECOES.find(x => x.id === id)!;
          return (
            <button key={id} className="gd-tab-item" data-on={secao === id} onClick={() => irPara(id)}>
              <span className="gd-tab-ico"><s.icon size={19} /></span>{s.curto}
            </button>
          );
        })}
        <button className="gd-tab-item" data-on={!TAB_BAR.includes(secao)} onClick={() => setMaisAberto(true)}>
          <span className="gd-tab-ico"><MoreHorizontal size={19} /></span>Mais
        </button>
      </nav>

      {/* ── Folha "Mais" (celular) ── */}
      {maisAberto && (
        <div className="lg:hidden fixed inset-0 z-50 flex items-end" onClick={() => setMaisAberto(false)}>
          <div className="absolute inset-0" style={{ background: "var(--scrim)" }} />
          <div className="gd-sheet relative w-full rounded-t-[22px] p-3" onClick={e => e.stopPropagation()}
            style={{ background: "var(--card)", boxShadow: "var(--sh2)", paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}>
            <div className="flex items-center justify-between px-2 pt-1 pb-2">
              <p className="gd-h2">Mais seções</p>
              <button className="gd-btn gd-btn-ghost gd-btn-sm" style={{ width: 34, padding: 0 }} onClick={() => setMaisAberto(false)} aria-label="Fechar"><X size={18} /></button>
            </div>
            {SECOES.filter(s => !TAB_BAR.includes(s.id)).map(s => (
              <button key={s.id} className="gd-nav-item" style={{ height: "auto", padding: "12px" }} data-on={secao === s.id} onClick={() => irPara(s.id)}>
                <s.icon size={19} />
                <span className="min-w-0">
                  <span className="block font-bold">{s.label}</span>
                  <span className="block text-xs font-normal" style={{ opacity: 0.7 }}>{s.desc}</span>
                </span>
              </button>
            ))}
            <button className="gd-nav-item" style={{ height: "auto", padding: "12px" }} onClick={sair}><LogOut size={19} /> Sair</button>
          </div>
        </div>
      )}

      {/* ── Detalhes e modais ── */}
      {lojaId && (
        <LojaDetalhe key={lojaId} id={lojaId} onClose={() => setLojaId(null)} onChanged={atualizar}
          abrirMotoboy={abrirMotoboy} premiar={setAlvoPremio} toast={toast} versao={versaoPrem}
          abrirAviso={setAvisoAbrir} versaoAvisos={versaoAvisos} />
      )}
      {motoboyId && (
        <MotoboyDetalhe key={motoboyId} id={motoboyId} onClose={() => setMotoboyId(null)}
          abrirLoja={abrirLoja} premiar={setAlvoPremio} toast={toast} versao={versaoPrem} />
      )}
      {alvoPremio && (
        <PremiacaoModal alvo={alvoPremio} onClose={() => setAlvoPremio(null)} toast={toast}
          onSent={() => { setVersaoPrem(v => v + 1); atualizar(); }} />
      )}
      {avisoAbrir && (
        <AvisoModal lojas={empresas} inicial={avisoAbrir} onClose={() => setAvisoAbrir(null)} toast={toast}
          onSent={() => setVersaoAvisos(v => v + 1)} />
      )}
      {criando && <CriarEmpresaModal onClose={() => setCriando(false)} onCreated={atualizar} />}
      {toastNode}
    </div>
  );
}
