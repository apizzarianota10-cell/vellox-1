"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Zap, Package, Truck, MapPin, Bell, BarChart3, Store,
  Users, CheckCircle2, ArrowRight, Star, Navigation,
  Menu, X, Monitor, Shield, Clock, Smartphone,
  MessageCircle, ChevronRight, Headphones,
} from "lucide-react";

const WA_BASE = "https://wa.me/5581973014080?text=";

const QUICK_REPLIES = [
  { emoji: "💰", label: "Quero ver os planos e preços",   msg: "Olá! Vim pelo site do Vellox e quero saber sobre os planos e preços." },
  { emoji: "🚀", label: "Quero uma demonstração",         msg: "Olá! Vim pelo site do Vellox e gostaria de ver uma demonstração do sistema." },
  { emoji: "❓", label: "Tenho dúvidas sobre o sistema",  msg: "Olá! Vim pelo site do Vellox e tenho algumas dúvidas sobre o funcionamento." },
  { emoji: "💬", label: "Falar com um atendente",         msg: "Olá! Vim pelo site do Vellox e quero falar com um atendente agora." },
];

const CHECKOUT_BASIC    = process.env.NEXT_PUBLIC_KIRVANO_BASIC_URL    ?? process.env.NEXT_PUBLIC_KIRVANO_CHECKOUT_URL ?? "/register";
const CHECKOUT_PRO      = process.env.NEXT_PUBLIC_KIRVANO_PRO_URL      ?? process.env.NEXT_PUBLIC_KIRVANO_CHECKOUT_URL ?? "/register";
const CHECKOUT_BUSINESS = process.env.NEXT_PUBLIC_KIRVANO_BUSINESS_URL ?? process.env.NEXT_PUBLIC_KIRVANO_CHECKOUT_URL ?? "/register";

const NAMES  = ["João Silva", "Ana Costa", "Pedro Lima", "Carla Neves", "Marcos Alves", "Juliana Rocha"];
const ITEMS  = ["2x X-Burguer, 1x Coca-Cola", "1x Pizza GG Calabresa", "3x Frango Grelhado, 2x Suco", "2x Marmita, 1x Água", "1x Combo Família XXL"];
const ADDR   = ["Rua das Flores, 123", "Av. Principal, 456", "Travessa do Sol, 78", "Rua Nova, 321", "Av. Brasil, 999"];

const FAQ_ITEMS = [
  {
    q: "Preciso instalar algum aplicativo?",
    a: "Não. O Vellox funciona 100% pelo navegador, tanto no celular quanto no computador. Seus motoboys acessam pelo celular sem precisar baixar nada.",
  },
  {
    q: "Como meus clientes fazem pedidos?",
    a: "Você recebe um link personalizado (ex: appvellox.online/loja/suapizzaria) que pode compartilhar no WhatsApp, Instagram ou onde quiser. Os clientes acessam pelo celular e o pedido cai automaticamente no seu painel.",
  },
  {
    q: "O sistema funciona junto com iFood e Rappi?",
    a: "Sim! Você pode continuar usando os apps de terceiros e usar o Vellox para gerenciar suas entregas próprias e delivery direto pelo catálogo. Os planos são independentes.",
  },
  {
    q: "Quantos pedidos posso processar?",
    a: "Ilimitados em todos os planos. Não cobramos por pedido, apenas pela assinatura mensal.",
  },
  {
    q: "Posso cancelar quando quiser?",
    a: "Sim, sem multa e sem burocracia. Além disso, oferecemos garantia de 7 dias: se não gostar, devolvemos o valor pago.",
  },
  {
    q: "Quanto tempo leva para ativar?",
    a: "Menos de 5 minutos. Crie sua conta, cadastre seus motoboys e seu catálogo já está no ar. Sem configuração técnica necessária.",
  },
];

interface FakeOrder { id: number; nome: string; items: string; status: string; addr: string; isNew?: boolean; }

function rnd<T>(a: T[]): T { return a[Math.floor(Math.random() * a.length)]; }

const STEPS = [
  { icon: Smartphone,   color: "#3b82f6", title: "Pedido chega",     desc: "Via catálogo digital ou criado manualmente no painel" },
  { icon: Package,      color: "#8b5cf6", title: "Entra no painel",  desc: "Visível para toda a equipe em tempo real, sem atualizar" },
  { icon: Users,        color: "#E4002B", title: "Motoboy recebe",   desc: "Despacho automático ou manual com 1 clique" },
  { icon: Navigation,   color: "#E4002B", title: "Rota no Waze",     desc: "Endereço enviado direto para o app de navegação" },
  { icon: CheckCircle2, color: "#22c55e", title: "Entregue ✓",       desc: "Status atualizado. Relatório gerado automaticamente." },
];

const FEATURES = [
  { icon: Bell,       color: "#E4002B", bg: "#fef2f2", title: "Pedidos em tempo real",     desc: "Notificação instantânea de novos pedidos. Zero atraso, zero pedido perdido." },
  { icon: Truck,      color: "#3b82f6", bg: "#eff6ff", title: "Gestão de motoboys",        desc: "Fila inteligente, despacho automático e rastreamento GPS ao vivo." },
  { icon: Navigation, color: "#E4002B", bg: "#fff7ed", title: "Rotas inteligentes",        desc: "Múltiplas entregas por rota. Integração com Waze e Google Maps." },
  { icon: Monitor,    color: "#8b5cf6", bg: "#f5f3ff", title: "Monitor fast food",         desc: "Tela de cozinha com status em tempo real. Sem papel, sem grito." },
  { icon: Store,      color: "#22c55e", bg: "#f0fdf4", title: "Catálogo digital",          desc: "Link próprio da sua loja. Clientes pedem pelo celular. Pedidos caem no painel." },
  { icon: BarChart3,  color: "#0ea5e9", bg: "#f0f9ff", title: "Relatórios financeiros",    desc: "Receita diária, taxas de entrega e comissões. Tudo em um painel." },
];

const PLANS = [
  {
    name: "Básico", price: "R$ 79", period: "/mês",
    desc: "Receba pedidos e envie para o motoboy", url: CHECKOUT_BASIC, highlighted: false, badge: "",
    features: [
      "Catálogo digital com link próprio",
      "Clientes fazem pedidos pelo celular",
      "Criação manual de pedidos",
      "Envio do pedido para o motoboy",
      "Rota via Waze e Google Maps",
      "Relatórios financeiros",
      "Até 3 motoboys cadastrados",
      "Suporte por e-mail",
    ],
    missing: [
      "Monitor de pedidos (TV/balcão)",
      "Motoboys ilimitados",
      "Multi-loja",
    ],
  },
  {
    name: "Pro", price: "R$ 149", period: "/mês",
    desc: "Operação completa e profissional", url: CHECKOUT_PRO, highlighted: true, badge: "Mais usado",
    features: [
      "Tudo do Básico",
      "Monitor de pedidos em TV/balcão",
      "Despacho automático inteligente",
      "Múltiplos pedidos por motoboy",
      "Relatórios financeiros completos",
      "Motoboys ilimitados",
      "Suporte prioritário",
    ],
    missing: [
      "Multi-loja (franquias)",
    ],
  },
  {
    name: "Business", price: "R$ 299", period: "/mês",
    desc: "Escale com múltiplas lojas", url: CHECKOUT_BUSINESS, highlighted: false, badge: "Multi-loja",
    features: [
      "Tudo do Pro",
      "Multi-loja — lojas independentes",
      "Catálogo e pedidos por loja",
      "Relatórios globais e por unidade",
      "Ranking de motoboys",
      "Gerente de conta dedicado",
      "Suporte 24h",
    ],
    missing: [],
  },
];

const TESTIMONIALS = [
  { name: "Pizzaria Boca do Forno", city: "Recife, PE",       text: "Reduzimos o tempo de despacho em 60%. O sistema é rápido e os motoboys adoraram o app.", avatar: "P", stars: 5 },
  { name: "Hamburgeria Central",    city: "São Paulo, SP",     text: "Nunca mais perdemos um pedido. O painel em tempo real mudou completamente nossa operação.", avatar: "H", stars: 5 },
  { name: "Açaí & Cia",            city: "Fortaleza, CE",     text: "O catálogo digital aumentou nossos pedidos em 40%. Vale muito o investimento.", avatar: "A", stars: 5 },
];

const STATUS_MAP: Record<string, { bg: string; dot: string; label: string }> = {
  em_fila:            { bg: "#fef3c7", dot: "#f59e0b", label: "Em fila" },
  em_preparo:         { bg: "#dbeafe", dot: "#3b82f6", label: "Em preparo" },
  em_rota_de_entrega: { bg: "#dcfce7", dot: "#22c55e", label: "Em rota" },
};

export default function LandingPage() {
  const [scrolled,   setScrolled]   = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [demoOpen,   setDemoOpen]   = useState(false);
  const [demoStep,   setDemoStep]   = useState(0);
  const [faqOpen,    setFaqOpen]    = useState<number | null>(null);
  const [chatOpen,   setChatOpen]   = useState(false);
  const [liveOrders, setLiveOrders] = useState<FakeOrder[]>([
    { id: 1, nome: "Maria Andrade",  items: "1x Pizza GG Calabresa", addr: "Av. Principal, 456", status: "em_rota_de_entrega" },
    { id: 2, nome: "Carlos Pereira", items: "3x Frango Grelhado",    addr: "Rua das Flores, 123", status: "em_preparo" },
    { id: 3, nome: "Juliana Rocha",  items: "2x Marmita, 1x Água",  addr: "Travessa do Sol, 78", status: "em_fila" },
  ]);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 30);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      setLiveOrders(prev => [{
        id: Date.now(), nome: rnd(NAMES), items: rnd(ITEMS),
        addr: rnd(ADDR), status: "em_fila", isNew: true,
      }, ...prev.slice(0, 2)]);
    }, 4000);
    return () => clearInterval(t);
  }, []);

  const DEMO_STEPS = [
    {
      title: "📱 Pedido chega pelo catálogo",
      content: (
        <div style={{ background: "#f8fafc", borderRadius: 16, padding: 20, border: "1px solid #e2e8f0" }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: "#0f172a", marginBottom: 4 }}>🔔 Novo pedido recebido!</div>
          <div style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>João Silva · Rua das Flores, 123</div>
          <div style={{ background: "#fff", borderRadius: 10, padding: "10px 14px", border: "1px solid #e2e8f0", fontSize: 13, color: "#374151", marginBottom: 8 }}>2x X-Burguer · 1x Coca-Cola</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 700, color: "#E4002B", fontSize: 18 }}>R$ 58,00</span>
            <span style={{ fontSize: 11, background: "#fef3c7", color: "#92400e", padding: "3px 10px", borderRadius: 999, fontWeight: 600 }}>Em fila</span>
          </div>
        </div>
      ),
    },
    {
      title: "⚡ Despachar com 1 clique",
      content: (
        <div style={{ background: "#f8fafc", borderRadius: 16, padding: 20, border: "1px solid #e2e8f0" }}>
          <div style={{ fontSize: 13, color: "#64748b", marginBottom: 12 }}>Motoboys disponíveis agora:</div>
          {["★ Lucas (1º da fila)", "Bruno", "Rafael"].map((mb, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: i === 0 ? "rgba(228,0,43,0.06)" : "#fff", border: `1px solid ${i === 0 ? "rgba(228,0,43,0.2)" : "#e2e8f0"}`, borderRadius: 10, marginBottom: 8 }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#E4002B", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>{mb.charAt(mb.includes("★") ? 2 : 0)}</div>
              <span style={{ fontSize: 13, fontWeight: i === 0 ? 700 : 400, color: i === 0 ? "#E4002B" : "#374151" }}>{mb}</span>
              {i === 0 && <span style={{ marginLeft: "auto", fontSize: 10, background: "#dcfce7", color: "#166534", padding: "2px 8px", borderRadius: 999, fontWeight: 600 }}>Disponível</span>}
            </div>
          ))}
          <div style={{ marginTop: 4, padding: "10px 16px", background: "linear-gradient(135deg,#E4002B,#A80021)", borderRadius: 10, textAlign: "center", color: "#fff", fontWeight: 700, fontSize: 14 }}>Despachar para Lucas →</div>
        </div>
      ),
    },
    {
      title: "🗺️ Rota aberta no Waze",
      content: (
        <div style={{ background: "#f8fafc", borderRadius: 16, padding: 20, border: "1px solid #e2e8f0" }}>
          <div style={{ fontSize: 13, color: "#64748b", marginBottom: 12 }}>Lucas recebeu a entrega no app:</div>
          <div style={{ background: "#fff", borderRadius: 12, padding: "14px 16px", border: "1px solid #e2e8f0", marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: "#0f172a", marginBottom: 4 }}>João Silva</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#64748b" }}>
              <MapPin size={12} style={{ color: "#E4002B" }} /> Rua das Flores, 123 · 2,4 km
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1, padding: "10px", background: "#4285f4", borderRadius: 10, textAlign: "center", color: "#fff", fontWeight: 700, fontSize: 13 }}>📍 Google Maps</div>
            <div style={{ flex: 1, padding: "10px", background: "#33ccff", borderRadius: 10, textAlign: "center", color: "#fff", fontWeight: 700, fontSize: 13 }}>🔵 Waze</div>
          </div>
        </div>
      ),
    },
    {
      title: "✅ Pedido entregue",
      content: (
        <div style={{ background: "#f0fdf4", borderRadius: 16, padding: 24, border: "1px solid #bbf7d0", textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
          <div style={{ fontWeight: 800, fontSize: 18, color: "#15803d", marginBottom: 4 }}>Entregue com sucesso!</div>
          <div style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>João Silva · 28 minutos</div>
          <div style={{ display: "flex", justifyContent: "center", gap: 16 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontWeight: 800, fontSize: 22, color: "#0f172a" }}>R$ 58</div>
              <div style={{ fontSize: 11, color: "#64748b" }}>Pedido</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontWeight: 800, fontSize: 22, color: "#f59e0b" }}>R$ 8</div>
              <div style={{ fontSize: 11, color: "#64748b" }}>Taxa</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontWeight: 800, fontSize: 22, color: "#22c55e" }}>R$ 66</div>
              <div style={{ fontSize: 11, color: "#64748b" }}>Total</div>
            </div>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div style={{ background: "#fff", fontFamily: "'Inter', system-ui, sans-serif", color: "#0f172a", overflowX: "hidden" }}>
      <style>{`
        @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }
        @keyframes pulse2 { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(.85)} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
        @keyframes newCard { from{opacity:0;transform:translateY(-16px) scale(.97)} to{opacity:1;transform:translateY(0) scale(1)} }
        @keyframes shimmer { 0%{transform:translateX(-100%)} 100%{transform:translateX(100%)} }
        @keyframes ping { 0%{transform:scale(1);opacity:.8} 75%,100%{transform:scale(2.2);opacity:0} }
        @keyframes waPulse { 0%{box-shadow:0 8px 28px rgba(37,211,102,0.45),0 0 0 0 rgba(37,211,102,0.4)} 70%{box-shadow:0 8px 28px rgba(37,211,102,0.45),0 0 0 12px rgba(37,211,102,0)} 100%{box-shadow:0 8px 28px rgba(37,211,102,0.45),0 0 0 0 rgba(37,211,102,0)} }
        .land-float { animation: float 4s ease-in-out infinite; }
        .land-fade-up { animation: fadeUp .6s cubic-bezier(.16,1,.3,1) both; }
        .land-new-card { animation: newCard .4s cubic-bezier(.16,1,.3,1) both; }
        .land-ping { animation: ping 1.4s cubic-bezier(0,0,.2,1) infinite; }
        .land-pulse { animation: pulse2 2s ease-in-out infinite; }
        .btn-red {
          position:relative; overflow:hidden;
          background:linear-gradient(135deg,#E4002B,#A80021);
          color:#fff; border:none; cursor:pointer;
          transition:transform .2s,box-shadow .2s;
          box-shadow:0 4px 24px rgba(228,0,43,.4);
        }
        .btn-red::after {
          content:''; position:absolute; inset:0;
          background:linear-gradient(105deg,transparent 30%,rgba(255,255,255,.18) 50%,transparent 70%);
          animation:shimmer 3s ease-in-out infinite;
        }
        .btn-red:hover { transform:translateY(-2px); box-shadow:0 8px 32px rgba(228,0,43,.5); }
        .btn-ghost { transition:background .15s,color .15s; cursor:pointer; }
        .btn-ghost:hover { background:rgba(228,0,43,.06) !important; color:#E4002B !important; }
        .feat-card { transition:transform .2s,box-shadow .2s; cursor:default; }
        .feat-card:hover { transform:translateY(-4px); box-shadow:0 12px 40px rgba(0,0,0,.1) !important; }
        .plan-card { transition:transform .2s,box-shadow .2s; }
        .plan-card:hover { transform:translateY(-6px); }
        .nav-link { transition:color .15s; cursor:pointer; }
        .nav-link:hover { color:#E4002B !important; }
        @media(max-width:768px){
          .hero-grid { flex-direction:column !important; }
          .hero-text { text-align:center !important; }
          .hero-cta { justify-content:center !important; }
          .hero-stats { justify-content:center !important; }
          .steps-row { flex-direction:column !important; gap:0 !important; }
          .step-line { display:none !important; }
          .plans-grid { flex-direction:column !important; align-items:center !important; }
          .plan-card { max-width:380px !important; width:100% !important; }
          .feat-grid { grid-template-columns:1fr !important; }
          .testi-grid { flex-direction:column !important; }
          .footer-row { flex-direction:column !important; gap:16px !important; text-align:center !important; }
          .nav-links-desktop { display:none !important; }
          .nav-cta-desktop { display:none !important; }
          .nav-hamburger { display:flex !important; }
        }
      `}</style>

      {/* ══ NAVBAR ══════════════════════════════════════════════════ */}
      <nav style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        background: scrolled || mobileOpen ? "rgba(255,255,255,.97)" : "transparent",
        backdropFilter: scrolled || mobileOpen ? "blur(20px)" : "none",
        borderBottom: scrolled || mobileOpen ? "1px solid rgba(0,0,0,.07)" : "none",
        transition: "background .3s,border-color .3s,backdrop-filter .3s",
        padding: "0 24px",
      }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center" }}>
            <Image src="/vllx.png" alt="Vellox" width={120} height={40} style={{ objectFit: "contain" }} priority />
          </div>

          {/* Desktop links */}
          <div className="nav-links-desktop" style={{ display: "flex", alignItems: "center", gap: 32 }}>
            {[["#como-funciona","Como funciona"],["#recursos","Recursos"],["#planos","Planos"],["#faq","FAQ"]].map(([href, label]) => (
              <a key={href} href={href} className="nav-link" style={{ fontSize: 14, fontWeight: 500, color: "#475569", textDecoration: "none" }}>{label}</a>
            ))}
          </div>

          {/* CTA (desktop) */}
          <div className="nav-cta-desktop" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Link href="/login" style={{ fontSize: 14, fontWeight: 600, color: "#475569", textDecoration: "none", padding: "8px 16px" }} className="nav-link btn-ghost">
              Entrar
            </Link>
            <Link href="/register" className="btn-red" style={{ fontSize: 14, fontWeight: 700, textDecoration: "none", padding: "9px 20px", borderRadius: 10, display: "flex", alignItems: "center", gap: 6 }}>
              Começar grátis <ArrowRight size={14} />
            </Link>
          </div>

          {/* Hamburger (mobile) */}
          <button
            onClick={() => setMobileOpen(o => !o)}
            className="nav-hamburger"
            style={{ width: 40, height: 40, borderRadius: 10, border: "1.5px solid #e2e8f0", background: "#fff", cursor: "pointer", display: "none", alignItems: "center", justifyContent: "center" }}
          >
            {mobileOpen ? <X size={18} color="#374151" /> : <Menu size={18} color="#374151" />}
          </button>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div style={{ borderTop: "1px solid #f1f5f9", padding: "16px 0 20px", display: "flex", flexDirection: "column", gap: 4 }}>
            {[["#como-funciona","Como funciona"],["#recursos","Recursos"],["#planos","Planos"],["#faq","FAQ"]].map(([href, label]) => (
              <a key={href} href={href} onClick={() => setMobileOpen(false)}
                style={{ fontSize: 15, fontWeight: 600, color: "#374151", textDecoration: "none", padding: "10px 8px", borderRadius: 8, transition: "background .15s" }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(228,0,43,.06)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                {label}
              </a>
            ))}
            <div style={{ height: 1, background: "#f1f5f9", margin: "8px 0" }} />
            <Link href="/login" onClick={() => setMobileOpen(false)} style={{ fontSize: 15, fontWeight: 600, color: "#475569", textDecoration: "none", padding: "10px 8px", borderRadius: 8 }}>
              Entrar
            </Link>
            <Link href="/register" onClick={() => setMobileOpen(false)} className="btn-red" style={{ fontSize: 15, fontWeight: 700, textDecoration: "none", padding: "13px 20px", borderRadius: 12, textAlign: "center", marginTop: 4, display: "block" }}>
              Começar grátis →
            </Link>
          </div>
        )}
      </nav>

      {/* ══ HERO ══════════════════════════════════════════════════════ */}
      <section style={{ paddingTop: 100, paddingBottom: 80, background: "linear-gradient(180deg,#fff9f9 0%,#fff 60%)", position: "relative", overflow: "hidden" }}>
        {/* BG orbs */}
        <div style={{ position: "absolute", top: -120, right: -120, width: 600, height: 600, borderRadius: "50%", background: "radial-gradient(circle,rgba(228,0,43,.06),transparent 70%)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: -80, left: -80, width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle,rgba(228,0,43,.04),transparent 70%)", pointerEvents: "none" }} />

        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px" }}>
          <div className="hero-grid" style={{ display: "flex", alignItems: "center", gap: 64 }}>

            {/* Left: Text */}
            <div className="hero-text" style={{ flex: 1, minWidth: 0 }}>
              {/* Badge */}
              <div className="land-fade-up" style={{ animationDelay: "0ms", display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(228,0,43,.08)", border: "1px solid rgba(228,0,43,.2)", borderRadius: 999, padding: "6px 14px", marginBottom: 24 }}>
                <span className="land-pulse" style={{ width: 7, height: 7, borderRadius: "50%", background: "#E4002B", display: "inline-block" }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: "#E4002B" }}>Sistema de delivery profissional</span>
              </div>

              {/* Headline */}
              <h1 className="land-fade-up" style={{ animationDelay: "80ms", fontSize: "clamp(34px,4.5vw,56px)", fontWeight: 900, lineHeight: 1.08, letterSpacing: "-0.04em", color: "#0f172a", margin: "0 0 20px" }}>
                Pare de perder pedidos.{" "}
                <span style={{ background: "linear-gradient(135deg,#E4002B,#A80021)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                  Controle seu delivery em tempo real.
                </span>
              </h1>

              {/* Sub */}
              <p className="land-fade-up" style={{ animationDelay: "140ms", fontSize: 18, color: "#64748b", lineHeight: 1.65, margin: "0 0 36px", maxWidth: 520 }}>
                Pedidos, motoboys, rotas e catálogo digital em uma única plataforma. Ative em minutos, sem complicação.
              </p>

              {/* CTAs */}
              <div className="hero-cta land-fade-up" style={{ animationDelay: "200ms", display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 40 }}>
                <Link href="/register" className="btn-red" style={{ textDecoration: "none", padding: "14px 28px", borderRadius: 12, fontWeight: 800, fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}>
                  Começar agora <ArrowRight size={16} />
                </Link>
                <button
                  onClick={() => { setDemoOpen(true); setDemoStep(0); }}
                  className="btn-ghost"
                  style={{ padding: "14px 24px", borderRadius: 12, fontWeight: 700, fontSize: 15, color: "#475569", background: "transparent", border: "1.5px solid #e2e8f0", display: "flex", alignItems: "center", gap: 8 }}
                >
                  ▶ Ver como funciona
                </button>
              </div>

              {/* Quick stats */}
              <div className="hero-stats land-fade-up" style={{ animationDelay: "260ms", display: "flex", flexWrap: "wrap", gap: 28 }}>
                {[["500+","pedidos/dia processados"],["50+","empresas ativas"],["98%","satisfação"]].map(([n,l]) => (
                  <div key={n}>
                    <div style={{ fontWeight: 900, fontSize: 22, color: "#0f172a", letterSpacing: "-0.04em" }}>{n}</div>
                    <div style={{ fontSize: 12, color: "#94a3b8", fontWeight: 500 }}>{l}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Dashboard mockup */}
            <div className="land-float" style={{ flex: 1, minWidth: 0, maxWidth: 520 }}>
              <div style={{ background: "#0f0f0f", borderRadius: 16, overflow: "hidden", boxShadow: "0 32px 80px rgba(0,0,0,.35), 0 0 0 1px rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.06)" }}>
                {/* Chrome */}
                <div style={{ background: "#1a1a1a", padding: "10px 16px", display: "flex", alignItems: "center", gap: 16, borderBottom: "1px solid rgba(255,255,255,.07)" }}>
                  <div style={{ display: "flex", gap: 5 }}>
                    {["#ff5f57","#ffbd2e","#28ca42"].map(c => <div key={c} style={{ width: 10, height: 10, borderRadius: "50%", background: c }} />)}
                  </div>
                  <div style={{ flex: 1, background: "rgba(255,255,255,.06)", borderRadius: 6, padding: "3px 12px", fontSize: 11, color: "#4b5563", textAlign: "center" }}>
                    appvellox.online/pedidos
                  </div>
                </div>

                {/* Dashboard header */}
                <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,.06)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontWeight: 800, fontSize: 14, color: "#fff" }}>📦 Pedidos</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(34,197,94,.1)", border: "1px solid rgba(34,197,94,.2)", borderRadius: 999, padding: "3px 10px" }}>
                    <span className="land-pulse" style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#22c55e" }}>Despacho automático: ON</span>
                  </div>
                </div>

                {/* Stats strip */}
                <div style={{ display: "flex", gap: 1, background: "rgba(255,255,255,.04)", padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,.06)" }}>
                  {[["3","em fila","#f59e0b"],["1","em preparo","#3b82f6"],["1","em rota","#22c55e"]].map(([n,l,c]) => (
                    <div key={l} style={{ flex: 1, textAlign: "center" }}>
                      <div style={{ fontWeight: 900, fontSize: 18, color: c }}>{n}</div>
                      <div style={{ fontSize: 10, color: "#6b7280", fontWeight: 500 }}>{l}</div>
                    </div>
                  ))}
                </div>

                {/* Live orders */}
                <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8, maxHeight: 260, overflow: "hidden" }}>
                  {liveOrders.map((o, i) => {
                    const st = STATUS_MAP[o.status] ?? STATUS_MAP.em_fila;
                    return (
                      <div key={o.id} className={o.isNew && i === 0 ? "land-new-card" : ""}
                        style={{ background: "rgba(255,255,255,.05)", border: `1px solid ${o.isNew && i === 0 ? "rgba(228,0,43,.35)" : "rgba(255,255,255,.07)"}`, borderRadius: 10, padding: "10px 12px", transition: "border-color .4s" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ fontWeight: 700, fontSize: 13, color: "#f1f5f9" }}>{o.nome}</span>
                          <div style={{ display: "flex", alignItems: "center", gap: 5, background: st.bg, borderRadius: 999, padding: "2px 8px" }}>
                            <span style={{ width: 5, height: 5, borderRadius: "50%", background: st.dot, display: "inline-block" }} />
                            <span style={{ fontSize: 10, fontWeight: 700, color: "#374151" }}>{st.label}</span>
                          </div>
                        </div>
                        <div style={{ fontSize: 12, color: "#6b7280" }}>{o.items}</div>
                        <div style={{ fontSize: 11, color: "#4b5563", marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}>
                          <MapPin size={10} /> {o.addr}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══ STATS BAR ═══════════════════════════════════════════════ */}
      <section style={{ background: "#0f172a", padding: "28px 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 48 }}>
          {[
            { n: "< 30s",  l: "Para despachar um motoboy" },
            { n: "1 link", l: "Catálogo digital próprio" },
            { n: "100%",   l: "Sem papel, sem ligação" },
            { n: "24/7",   l: "Sistema sempre online" },
          ].map(({ n, l }) => (
            <div key={n} style={{ textAlign: "center" }}>
              <div style={{ fontWeight: 900, fontSize: 28, color: "#E4002B", letterSpacing: "-0.04em" }}>{n}</div>
              <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>{l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ══ HOW IT WORKS ════════════════════════════════════════════ */}
      <section id="como-funciona" style={{ padding: "96px 24px", background: "#f8fafc" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 64 }}>
            <div style={{ display: "inline-block", background: "rgba(228,0,43,.08)", border: "1px solid rgba(228,0,43,.15)", borderRadius: 999, padding: "5px 16px", marginBottom: 16 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#E4002B" }}>Como funciona</span>
            </div>
            <h2 style={{ fontSize: "clamp(28px,3.5vw,42px)", fontWeight: 900, letterSpacing: "-0.04em", margin: "0 0 12px", color: "#0f172a" }}>
              Do pedido à entrega em minutos
            </h2>
            <p style={{ fontSize: 17, color: "#64748b", maxWidth: 480, margin: "0 auto", lineHeight: 1.6 }}>
              Fluxo completo, sem falhas. Cada passo automatizado para você focar no que importa.
            </p>
          </div>

          <div className="steps-row" style={{ display: "flex", alignItems: "flex-start", gap: 0, position: "relative" }}>
            {STEPS.map((s, i) => (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", position: "relative" }}>
                {/* connector line */}
                {i < STEPS.length - 1 && (
                  <div className="step-line" style={{ position: "absolute", top: 28, left: "50%", right: "-50%", height: 2, background: "linear-gradient(90deg,#E4002B,rgba(228,0,43,.1))", zIndex: 0 }} />
                )}
                {/* Icon */}
                <div style={{ width: 56, height: 56, borderRadius: 16, background: s.color, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1, boxShadow: `0 8px 24px ${s.color}40`, marginBottom: 16 }}>
                  <s.icon size={24} color="#fff" strokeWidth={2} />
                </div>
                <div style={{ fontWeight: 800, fontSize: 15, color: "#0f172a", marginBottom: 6, textAlign: "center" }}>{s.title}</div>
                <div style={{ fontSize: 13, color: "#64748b", textAlign: "center", lineHeight: 1.5, padding: "0 8px" }}>{s.desc}</div>
              </div>
            ))}
          </div>

          {/* CTA */}
          <div style={{ textAlign: "center", marginTop: 56 }}>
            <Link href="/register" className="btn-red" style={{ textDecoration: "none", padding: "14px 28px", borderRadius: 12, fontWeight: 800, fontSize: 15, display: "inline-flex", alignItems: "center", gap: 8 }}>
              Ativar sistema agora <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* ══ FEATURES ════════════════════════════════════════════════ */}
      <section id="recursos" style={{ padding: "96px 24px", background: "#fff" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 64 }}>
            <div style={{ display: "inline-block", background: "rgba(228,0,43,.08)", border: "1px solid rgba(228,0,43,.15)", borderRadius: 999, padding: "5px 16px", marginBottom: 16 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#E4002B" }}>Recursos</span>
            </div>
            <h2 style={{ fontSize: "clamp(28px,3.5vw,42px)", fontWeight: 900, letterSpacing: "-0.04em", margin: "0 0 12px", color: "#0f172a" }}>
              Tudo que você precisa para escalar
            </h2>
            <p style={{ fontSize: 17, color: "#64748b", maxWidth: 480, margin: "0 auto", lineHeight: 1.6 }}>
              Ferramentas profissionais que antes eram exclusivas de grandes redes — agora acessíveis para qualquer delivery.
            </p>
          </div>

          <div className="feat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
            {FEATURES.map((f, i) => (
              <div key={i} className="feat-card" style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 20, padding: 28, boxShadow: "0 2px 12px rgba(0,0,0,.05)" }}>
                <div style={{ width: 52, height: 52, borderRadius: 14, background: f.bg, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18 }}>
                  <f.icon size={24} color={f.color} strokeWidth={2} />
                </div>
                <h3 style={{ fontWeight: 800, fontSize: 17, color: "#0f172a", margin: "0 0 8px", letterSpacing: "-0.02em" }}>{f.title}</h3>
                <p style={{ fontSize: 14, color: "#64748b", lineHeight: 1.6, margin: 0 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ CATÁLOGO DIGITAL ════════════════════════════════════════ */}
      <section style={{ padding: "96px 24px", background: "#f8fafc" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 64 }}>
          {/* Text */}
          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={{ display: "inline-block", background: "rgba(34,197,94,.1)", border: "1px solid rgba(34,197,94,.2)", borderRadius: 999, padding: "5px 16px", marginBottom: 20 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#16a34a" }}>Catálogo Digital</span>
            </div>
            <h2 style={{ fontSize: "clamp(26px,3vw,38px)", fontWeight: 900, letterSpacing: "-0.04em", margin: "0 0 16px", color: "#0f172a", lineHeight: 1.15 }}>
              Seu cardápio online,{" "}
              <span style={{ color: "#E4002B" }}>em segundos</span>
            </h2>
            <p style={{ fontSize: 16, color: "#64748b", lineHeight: 1.7, marginBottom: 28 }}>
              Crie um catálogo com sua logo, banner e cores. Compartilhe o link e seus clientes já podem pedir direto pelo celular — os pedidos chegam automaticamente no seu painel.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 32 }}>
              {[
                ["🔗","Link próprio da sua loja — ex: appvellox.online/loja/pizzaria"],
                ["📱","Funciona em qualquer celular, sem baixar app"],
                ["⚡","Pedidos caem em tempo real no seu painel"],
                ["🎨","Personalizado com logo, banner e cor da marca"],
              ].map(([e, t]) => (
                <div key={t} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <span style={{ fontSize: 18, flexShrink: 0 }}>{e}</span>
                  <span style={{ fontSize: 14, color: "#374151", lineHeight: 1.5 }}>{t}</span>
                </div>
              ))}
            </div>
            <Link href="/register" className="btn-red" style={{ textDecoration: "none", padding: "13px 24px", borderRadius: 12, fontWeight: 700, fontSize: 15, display: "inline-flex", alignItems: "center", gap: 8 }}>
              Criar meu catálogo <ArrowRight size={15} />
            </Link>
          </div>

          {/* Mockup */}
          <div style={{ flex: 1, minWidth: 280, display: "flex", justifyContent: "center" }}>
            <div style={{ width: 300, background: "#fff", borderRadius: 24, overflow: "hidden", boxShadow: "0 24px 60px rgba(0,0,0,.15)", border: "1px solid #e2e8f0" }}>
              {/* Banner */}
              <div style={{ height: 100, background: "linear-gradient(135deg,#E4002B,#a84400)", position: "relative", display: "flex", alignItems: "flex-end", padding: "0 16px 12px" }}>
                <div style={{ fontWeight: 900, fontSize: 18, color: "#fff", letterSpacing: "-0.03em" }}>Pizzaria Nota 10</div>
                <div style={{ position: "absolute", top: 12, right: 12, background: "rgba(0,0,0,.4)", borderRadius: 999, padding: "2px 10px", fontSize: 11, fontWeight: 700, color: "#fff" }}>⭐ 4.9</div>
              </div>
              {/* Info */}
              <div style={{ padding: "12px 16px", borderBottom: "1px solid #f1f5f9", display: "flex", gap: 8, flexWrap: "wrap" }}>
                {["🛵 Entrega","📍 Bairro central","⏱ 25-40 min"].map(t => (
                  <span key={t} style={{ fontSize: 11, color: "#64748b", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 999, padding: "3px 8px" }}>{t}</span>
                ))}
              </div>
              {/* Products */}
              {[["Pizza GG Calabresa","R$ 58,00"],["X-Burguer Duplo","R$ 32,00"],["Combo Família","R$ 89,00"]].map(([n, p]) => (
                <div key={n} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid #f8fafc" }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: "#0f172a" }}>{n}</div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "#E4002B", marginTop: 2 }}>{p}</div>
                  </div>
                  <div style={{ width: 30, height: 30, borderRadius: 8, background: "#E4002B", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 900, fontSize: 18, flexShrink: 0 }}>+</div>
                </div>
              ))}
              <div style={{ padding: "12px 16px", background: "#f8fafc", textAlign: "center", fontSize: 11, color: "#94a3b8" }}>appvellox.online/loja/pizzaria</div>
            </div>
          </div>
        </div>
      </section>

      {/* ══ PRICING ══════════════════════════════════════════════════ */}
      <section id="planos" style={{ padding: "96px 24px", background: "#fff" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 64 }}>
            <div style={{ display: "inline-block", background: "rgba(228,0,43,.08)", border: "1px solid rgba(228,0,43,.15)", borderRadius: 999, padding: "5px 16px", marginBottom: 16 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#E4002B" }}>Planos e preços</span>
            </div>
            <h2 style={{ fontSize: "clamp(28px,3.5vw,42px)", fontWeight: 900, letterSpacing: "-0.04em", margin: "0 0 12px", color: "#0f172a" }}>
              Escolha o plano certo para o seu delivery
            </h2>
            <p style={{ fontSize: 17, color: "#64748b", maxWidth: 440, margin: "0 auto", lineHeight: 1.6 }}>
              Comece hoje, cancele quando quiser. Sem taxa de adesão, sem contrato longo.
            </p>
          </div>

          <div className="plans-grid" style={{ display: "flex", gap: 24, alignItems: "stretch", justifyContent: "center" }}>
            {PLANS.map((plan) => (
              <div key={plan.name} className="plan-card" style={{
                flex: 1, maxWidth: 360, background: plan.highlighted ? "#0f172a" : "#fff",
                border: plan.highlighted ? "2px solid #E4002B" : "1.5px solid #e2e8f0",
                borderRadius: 24, padding: 32, position: "relative",
                boxShadow: plan.highlighted ? "0 24px 60px rgba(228,0,43,.2), 0 0 0 1px rgba(228,0,43,.3)" : "0 2px 12px rgba(0,0,0,.05)",
                display: "flex", flexDirection: "column",
              }}>
                {plan.badge && (
                  <div style={{
                    position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)",
                    background: plan.name === "Business"
                      ? "linear-gradient(135deg,#d97706,#b45309)"
                      : "linear-gradient(135deg,#E4002B,#A80021)",
                    color: "#fff", fontWeight: 800, fontSize: 12, padding: "4px 16px",
                    borderRadius: 999, whiteSpace: "nowrap",
                    boxShadow: plan.name === "Business"
                      ? "0 4px 12px rgba(217,119,6,.4)"
                      : "0 4px 12px rgba(228,0,43,.35)",
                  }}>
                    ✦ {plan.badge}
                  </div>
                )}
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontWeight: 800, fontSize: 18, color: plan.highlighted ? "#fff" : "#0f172a", marginBottom: 4 }}>{plan.name}</div>
                  <div style={{ fontSize: 13, color: plan.highlighted ? "#94a3b8" : "#64748b" }}>{plan.desc}</div>
                </div>
                <div style={{ marginBottom: 28 }}>
                  <span style={{ fontWeight: 900, fontSize: 42, color: plan.highlighted ? "#fff" : "#0f172a", letterSpacing: "-0.04em" }}>{plan.price}</span>
                  <span style={{ fontSize: 14, color: plan.highlighted ? "#94a3b8" : "#64748b", fontWeight: 500 }}>{plan.period}</span>
                </div>
                <div style={{ flex: 1, marginBottom: 28 }}>
                  {plan.features.map(f => (
                    <div key={f} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                      <CheckCircle2 size={16} style={{ color: plan.highlighted ? "#22c55e" : "#E4002B", flexShrink: 0 }} />
                      <span style={{ fontSize: 14, color: plan.highlighted ? "#e2e8f0" : "#374151" }}>{f}</span>
                    </div>
                  ))}
                  {plan.missing.map(f => (
                    <div key={f} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, opacity: .35 }}>
                      <X size={16} style={{ color: plan.highlighted ? "#94a3b8" : "#94a3b8", flexShrink: 0 }} />
                      <span style={{ fontSize: 14, color: plan.highlighted ? "#94a3b8" : "#94a3b8" }}>{f}</span>
                    </div>
                  ))}
                </div>
                <a href={plan.url} target="_blank" rel="noopener noreferrer"
                  className={plan.highlighted ? "btn-red" : ""}
                  style={{
                    textDecoration: "none", padding: "14px", borderRadius: 12,
                    fontWeight: 800, fontSize: 15, textAlign: "center", display: "block",
                    background: plan.highlighted ? undefined : "transparent",
                    border: plan.highlighted ? "none" : "1.5px solid #e2e8f0",
                    color: plan.highlighted ? "#fff" : "#0f172a",
                    transition: "background .15s,border-color .15s",
                  }}
                  onMouseEnter={e => { if (!plan.highlighted) { (e.currentTarget as HTMLElement).style.background = "rgba(228,0,43,.05)"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(228,0,43,.3)"; (e.currentTarget as HTMLElement).style.color = "#E4002B"; } }}
                  onMouseLeave={e => { if (!plan.highlighted) { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.borderColor = "#e2e8f0"; (e.currentTarget as HTMLElement).style.color = "#0f172a"; } }}
                >
                  Assinar {plan.name} →
                </a>
              </div>
            ))}
          </div>

          {/* Garantia + segurança */}
          <div style={{ textAlign: "center", marginTop: 36, display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(34,197,94,.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Shield size={18} color="#16a34a" />
              </div>
              <div style={{ textAlign: "left" }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a" }}>Garantia de 7 dias</div>
                <div style={{ fontSize: 12, color: "#64748b" }}>Reembolso total se não gostar</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(228,0,43,.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Zap size={18} color="#E4002B" />
              </div>
              <div style={{ textAlign: "left" }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a" }}>Ative em 5 minutos</div>
                <div style={{ fontSize: 12, color: "#64748b" }}>Sem instalação, sem contrato</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(59,130,246,.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <CheckCircle2 size={18} color="#3b82f6" />
              </div>
              <div style={{ textAlign: "left" }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a" }}>Pagamento seguro</div>
                <div style={{ fontSize: 12, color: "#64748b" }}>Processado pela Kirvano</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══ TESTIMONIALS ════════════════════════════════════════════ */}
      <section style={{ padding: "80px 24px", background: "#f8fafc" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <h2 style={{ fontSize: "clamp(24px,3vw,36px)", fontWeight: 900, letterSpacing: "-0.04em", textAlign: "center", margin: "0 0 48px", color: "#0f172a" }}>
            O que dizem quem já usa
          </h2>
          <div className="testi-grid" style={{ display: "flex", gap: 24 }}>
            {TESTIMONIALS.map((t, i) => (
              <div key={i} style={{ flex: 1, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 20, padding: 28, boxShadow: "0 2px 12px rgba(0,0,0,.05)" }}>
                <div style={{ display: "flex", gap: 3, marginBottom: 16 }}>
                  {Array.from({ length: t.stars }).map((_, j) => <Star key={j} size={14} fill="#f59e0b" color="#f59e0b" />)}
                </div>
                <p style={{ fontSize: 15, color: "#374151", lineHeight: 1.7, margin: "0 0 20px" }}>"{t.text}"</p>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: "50%", background: "linear-gradient(135deg,#E4002B,#A80021)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 16, color: "#fff" }}>
                    {t.avatar}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "#0f172a" }}>{t.name}</div>
                    <div style={{ fontSize: 12, color: "#94a3b8" }}>{t.city}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ FAQ ═════════════════════════════════════════════════════ */}
      <section id="faq" style={{ padding: "96px 24px", background: "#fff" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <div style={{ display: "inline-block", background: "rgba(228,0,43,.08)", border: "1px solid rgba(228,0,43,.15)", borderRadius: 999, padding: "5px 16px", marginBottom: 16 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#E4002B" }}>Dúvidas frequentes</span>
            </div>
            <h2 style={{ fontSize: "clamp(28px,3.5vw,40px)", fontWeight: 900, letterSpacing: "-0.04em", margin: "0 0 12px", color: "#0f172a" }}>
              Perguntas frequentes
            </h2>
            <p style={{ fontSize: 16, color: "#64748b", margin: 0, lineHeight: 1.6 }}>
              Tudo o que você precisa saber antes de começar.
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {FAQ_ITEMS.map((item, i) => (
              <div key={i} style={{ border: "1.5px solid", borderColor: faqOpen === i ? "rgba(228,0,43,.3)" : "#e2e8f0", borderRadius: 16, overflow: "hidden", transition: "border-color .2s", background: faqOpen === i ? "rgba(228,0,43,.02)" : "#fff" }}>
                <button
                  onClick={() => setFaqOpen(faqOpen === i ? null : i)}
                  style={{ width: "100%", padding: "18px 20px", background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, textAlign: "left" }}
                >
                  <span style={{ fontWeight: 700, fontSize: 15, color: "#0f172a", lineHeight: 1.4 }}>{item.q}</span>
                  <span style={{ fontSize: 18, color: faqOpen === i ? "#E4002B" : "#94a3b8", flexShrink: 0, fontWeight: 300, transform: faqOpen === i ? "rotate(45deg)" : "none", transition: "transform .2s,color .2s", display: "inline-block" }}>+</span>
                </button>
                {faqOpen === i && (
                  <div style={{ padding: "0 20px 18px" }}>
                    <p style={{ fontSize: 14, color: "#64748b", lineHeight: 1.7, margin: 0 }}>{item.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ FINAL CTA ═══════════════════════════════════════════════ */}
      <section style={{ padding: "96px 24px", background: "linear-gradient(135deg,#0f172a 0%,#1e1b4b 100%)", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 70% 70% at 50% 50%,rgba(228,0,43,.12),transparent)", pointerEvents: "none" }} />
        <div style={{ maxWidth: 700, margin: "0 auto", textAlign: "center", position: "relative", zIndex: 1 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(228,0,43,.15)", border: "1px solid rgba(228,0,43,.25)", borderRadius: 999, padding: "6px 16px", marginBottom: 24 }}>
            <Clock size={13} color="#E4002B" />
            <span style={{ fontSize: 13, fontWeight: 700, color: "#E4002B" }}>Ative em menos de 5 minutos</span>
          </div>
          <h2 style={{ fontSize: "clamp(30px,4vw,50px)", fontWeight: 900, letterSpacing: "-0.04em", color: "#fff", margin: "0 0 16px", lineHeight: 1.1 }}>
            Pronto para profissionalizar seu delivery?
          </h2>
          <p style={{ fontSize: 18, color: "#94a3b8", lineHeight: 1.65, marginBottom: 40, maxWidth: 500, margin: "0 auto 40px" }}>
            Comece hoje. Sem complicação, sem contrato longo. Cancele quando quiser.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center" }}>
            <Link href="/register" className="btn-red" style={{ textDecoration: "none", padding: "16px 36px", borderRadius: 14, fontWeight: 900, fontSize: 17, display: "inline-flex", alignItems: "center", gap: 10 }}>
              Começar agora <ArrowRight size={18} />
            </Link>
            <Link href="/login" style={{ textDecoration: "none", padding: "16px 24px", borderRadius: 14, fontWeight: 700, fontSize: 15, color: "#94a3b8", border: "1.5px solid rgba(255,255,255,.1)", display: "inline-flex", alignItems: "center", gap: 8, transition: "border-color .15s,color .15s" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,.25)"; (e.currentTarget as HTMLElement).style.color = "#fff"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,.1)"; (e.currentTarget as HTMLElement).style.color = "#94a3b8"; }}>
              Já tenho conta →
            </Link>
          </div>
        </div>
      </section>

      {/* ══ FOOTER ══════════════════════════════════════════════════ */}
      <footer style={{ background: "#0a0a0a", padding: "40px 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div className="footer-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28, paddingBottom: 28, borderBottom: "1px solid rgba(255,255,255,.06)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 9, background: "linear-gradient(135deg,#E4002B,#A80021)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Zap size={16} color="#fff" strokeWidth={2.5} />
              </div>
              <span style={{ fontWeight: 900, fontSize: 18, letterSpacing: "-0.04em", color: "#fff" }}>Vellox</span>
            </div>
            <div style={{ display: "flex", gap: 28 }}>
              {[["#como-funciona","Como funciona"],["#recursos","Recursos"],["#planos","Planos"],["#faq","FAQ"],["/login","Entrar"],["/register","Cadastrar"]].map(([h, l]) => (
                <a key={h} href={h} style={{ fontSize: 13, color: "#6b7280", textDecoration: "none", transition: "color .15s" }}
                  onMouseEnter={e => (e.currentTarget.style.color = "#d1d5db")}
                  onMouseLeave={e => (e.currentTarget.style.color = "#6b7280")}>
                  {l}
                </a>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8 }}>
            <p style={{ fontSize: 12, color: "#6b7280", margin: 0 }}>© 2025 Vellox · Todos os direitos reservados</p>
            <p style={{ fontSize: 12, color: "#6b7280", margin: 0 }}>Sistema de gestão de delivery</p>
          </div>
        </div>
      </footer>

      {/* ══ WHATSAPP ASSISTANT ══════════════════════════════════════ */}
      <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 300, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 12, pointerEvents: "none" }}>

        {/* Widget */}
        <div style={{
          width: 340,
          borderRadius: 20,
          overflow: "hidden",
          background: "#0f172a",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04)",
          transformOrigin: "bottom right",
          transform: chatOpen ? "scale(1) translateY(0)" : "scale(0.92) translateY(12px)",
          opacity: chatOpen ? 1 : 0,
          pointerEvents: chatOpen ? "auto" : "none",
          transition: "transform 0.25s cubic-bezier(0.16,1,0.3,1), opacity 0.2s ease",
        }}>
          {/* Header */}
          <div style={{
            padding: "16px 18px",
            background: "linear-gradient(135deg, #075e54 0%, #128c7e 100%)",
            display: "flex", alignItems: "center", gap: 12,
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: "50%", flexShrink: 0,
              background: "linear-gradient(135deg,#E4002B,#A80021)",
              display: "flex", alignItems: "center", justifyContent: "center",
              border: "2px solid rgba(255,255,255,0.25)",
              boxShadow: "0 0 16px rgba(228,0,43,0.4)",
            }}>
              <Zap size={20} color="#fff" strokeWidth={2.5} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: "#fff", letterSpacing: "-0.02em" }}>Suporte Vellox</div>
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 6px #4ade80" }} />
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.75)" }}>Online agora</span>
              </div>
            </div>
            <button onClick={() => setChatOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "rgba(255,255,255,0.6)", lineHeight: 0 }}>
              <X size={18} />
            </button>
          </div>

          {/* Messages */}
          <div style={{ padding: "20px 16px 14px", background: "#0a0a0a" }}>
            {/* Bot message */}
            <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                background: "linear-gradient(135deg,#E4002B,#a84400)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Zap size={14} color="#fff" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{
                  background: "#1a1a1a",
                  borderRadius: "4px 16px 16px 16px",
                  padding: "10px 14px",
                  border: "1px solid #222",
                }}>
                  <p style={{ fontSize: 13.5, color: "#e5e7eb", lineHeight: 1.6, margin: 0 }}>
                    Olá! 👋 Sou o assistente virtual do <strong style={{ color: "#E4002B" }}>Vellox</strong>. Em que posso te ajudar hoje?
                  </p>
                </div>
                <div style={{ fontSize: 10, color: "#374151", marginTop: 4, paddingLeft: 4 }}>Agora mesmo</div>
              </div>
            </div>

            {/* Second message */}
            <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
              <div style={{ width: 32, flexShrink: 0 }} />
              <div style={{
                background: "#1a1a1a",
                borderRadius: "4px 16px 16px 16px",
                padding: "10px 14px",
                border: "1px solid #222",
                flex: 1,
              }}>
                <p style={{ fontSize: 13.5, color: "#e5e7eb", lineHeight: 1.6, margin: 0 }}>
                  Escolha uma opção abaixo ou clique em <strong style={{ color: "#4ade80" }}>qualquer botão</strong> para ir direto ao WhatsApp 🚀
                </p>
              </div>
            </div>

            {/* Quick replies */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {QUICK_REPLIES.map(({ emoji, label, msg }) => (
                <a
                  key={label}
                  href={WA_BASE + encodeURIComponent(msg)}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 14px",
                    background: "#111",
                    border: "1px solid rgba(34,197,94,0.2)",
                    borderRadius: 12,
                    textDecoration: "none",
                    transition: "background 0.15s, border-color 0.15s",
                    cursor: "pointer",
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(34,197,94,0.08)"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(34,197,94,0.4)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "#111"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(34,197,94,0.2)"; }}
                >
                  <span style={{ fontSize: 16, flexShrink: 0 }}>{emoji}</span>
                  <span style={{ fontSize: 13, color: "#d1d5db", flex: 1, fontWeight: 500 }}>{label}</span>
                  <ChevronRight size={14} color="#374151" />
                </a>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div style={{
            padding: "10px 16px",
            background: "#070707",
            borderTop: "1px solid #111",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}>
            <Headphones size={12} color="#374151" />
            <span style={{ fontSize: 11, color: "#374151" }}>Atendimento via WhatsApp · (81) 97301-4080</span>
          </div>
        </div>

        {/* Floating button */}
        <button
          onClick={() => setChatOpen(o => !o)}
          style={{
            width: 56, height: 56,
            borderRadius: "50%",
            background: chatOpen ? "#1a1a1a" : "linear-gradient(135deg,#25d366,#128c7e)",
            border: chatOpen ? "1.5px solid #2a2a2a" : "none",
            cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: chatOpen ? "none" : "0 8px 28px rgba(37,211,102,0.45), 0 0 0 0 rgba(37,211,102,0.4)",
            animation: chatOpen ? "none" : "waPulse 2.5s infinite",
            transition: "background 0.2s, box-shadow 0.2s",
            position: "relative",
            pointerEvents: "auto",
          }}
        >
          {chatOpen
            ? <X size={22} color="#9ca3af" />
            : <MessageCircle size={26} color="#fff" strokeWidth={2} />}
          {!chatOpen && (
            <div style={{
              position: "absolute", top: -2, right: -2,
              width: 14, height: 14, borderRadius: "50%",
              background: "#E4002B",
              border: "2px solid #fff",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#fff" }} />
            </div>
          )}
        </button>
      </div>

      {/* ══ DEMO MODAL ══════════════════════════════════════════════ */}
      {demoOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,.75)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={e => e.target === e.currentTarget && setDemoOpen(false)}>
          <div style={{ background: "#fff", borderRadius: 24, width: "100%", maxWidth: 480, overflow: "hidden", boxShadow: "0 32px 80px rgba(0,0,0,.4)" }}>
            {/* Header */}
            <div style={{ padding: "20px 24px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 17, color: "#0f172a" }}>Demo interativa</div>
                <div style={{ fontSize: 13, color: "#64748b" }}>Veja como funciona na prática</div>
              </div>
              <button onClick={() => setDemoOpen(false)} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid #e2e8f0", background: "#f8fafc", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <X size={15} color="#64748b" />
              </button>
            </div>

            {/* Steps nav */}
            <div style={{ display: "flex", padding: "12px 24px 0", gap: 6 }}>
              {DEMO_STEPS.map((_, i) => (
                <button key={i} onClick={() => setDemoStep(i)} style={{ flex: 1, height: 3, borderRadius: 999, border: "none", cursor: "pointer", background: i === demoStep ? "#E4002B" : i < demoStep ? "rgba(228,0,43,.3)" : "#e2e8f0", transition: "background .2s" }} />
              ))}
            </div>

            {/* Content */}
            <div style={{ padding: 24 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: "#0f172a", marginBottom: 16 }}>
                Passo {demoStep + 1}/{DEMO_STEPS.length} — {DEMO_STEPS[demoStep].title}
              </div>
              {DEMO_STEPS[demoStep].content}
            </div>

            {/* Footer */}
            <div style={{ padding: "0 24px 24px", display: "flex", gap: 10 }}>
              <button onClick={() => setDemoStep(s => Math.max(0, s - 1))} disabled={demoStep === 0}
                style={{ flex: 1, padding: "11px", border: "1.5px solid #e2e8f0", borderRadius: 10, background: "#fff", fontWeight: 700, fontSize: 14, cursor: demoStep === 0 ? "default" : "pointer", color: demoStep === 0 ? "#cbd5e1" : "#374151", transition: "border-color .15s" }}>
                ← Anterior
              </button>
              {demoStep < DEMO_STEPS.length - 1
                ? <button onClick={() => setDemoStep(s => s + 1)} className="btn-red" style={{ flex: 2, padding: "11px", borderRadius: 10, fontWeight: 700, fontSize: 14, border: "none", cursor: "pointer" }}>
                    Próximo →
                  </button>
                : <Link href="/register" onClick={() => setDemoOpen(false)} className="btn-red" style={{ flex: 2, padding: "11px", borderRadius: 10, fontWeight: 700, fontSize: 14, textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                    Começar agora <ArrowRight size={14} />
                  </Link>
              }
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
