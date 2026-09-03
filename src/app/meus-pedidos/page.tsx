"use client";

import { useState } from "react";
import Link from "next/link";
import { Phone, Package, ChevronRight, Search, Zap, Clock, CheckCircle, XCircle, ArrowLeft } from "lucide-react";

type Status = "em_fila" | "em_preparo" | "finalizado" | "em_coleta" | "em_rota_de_entrega" | "aguardando_confirmacao" | "entregue" | "cancelado";

interface PedidoItem {
  id: string;
  tracking_token: string;
  status: Status;
  created_at: string;
  valor_pedido: number;
  valor_motoboy: number;
  tipo_pedido: string;
  empresa: { nome: string } | null;
}

const STATUS_LABEL: Record<Status, string> = {
  em_fila:                "Na fila",
  em_preparo:             "Em preparo",
  finalizado:             "Pronto",
  em_coleta:              "Coletando",
  em_rota_de_entrega:     "Em rota",
  aguardando_confirmacao: "Confirmando",
  entregue:               "Entregue",
  cancelado:              "Cancelado",
};

const STATUS_COLOR: Record<Status, { bg: string; text: string }> = {
  em_fila:                { bg: "#f1f5f9", text: "#64748b" },
  em_preparo:             { bg: "#fffbeb", text: "#d97706" },
  finalizado:             { bg: "#eff6ff", text: "#3b82f6" },
  em_coleta:              { bg: "#fff7ed", text: "#E4002B" },
  em_rota_de_entrega:     { bg: "#f5f3ff", text: "#8b5cf6" },
  aguardando_confirmacao: { bg: "#fffbeb", text: "#f59e0b" },
  entregue:               { bg: "#f0fdf4", text: "#16a34a" },
  cancelado:              { bg: "#fef2f2", text: "#dc2626" },
};

function maskPhone(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2)  return `(${d}`;
  if (d.length <= 7)  return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  return v;
}

export default function MeusPedidosPage() {
  const [tel,      setTel]      = useState("");
  const [pedidos,  setPedidos]  = useState<PedidoItem[] | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [searched, setSearched] = useState(false);

  async function buscar(e: React.FormEvent) {
    e.preventDefault();
    const digits = tel.replace(/\D/g, "");
    if (digits.length < 8) return;
    setLoading(true);
    setSearched(true);
    try {
      const res = await fetch(`/api/meus-pedidos?tel=${digits}`);
      const { pedidos: data } = await res.json();
      setPedidos(data ?? []);
    } catch {
      setPedidos([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f7f7f8", fontFamily: "system-ui,sans-serif" }}>
      <style>{`@keyframes slideUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}`}</style>

      {/* Header */}
      <div style={{ background: "linear-gradient(135deg,#FFC72C,#A80021)", padding: "24px 20px 40px" }}>
        <div style={{ maxWidth: 480, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <Link
              href="/explorar"
              style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
            >
              <ArrowLeft size={17} color="#fff" />
            </Link>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Zap size={17} color="#fff" />
            </div>
            <span style={{ fontSize: 15, fontWeight: 900, color: "#fff" }}>Vellox</span>
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 900, color: "#fff", margin: "0 0 6px", letterSpacing: "-0.03em" }}>Meus Pedidos</h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", margin: 0 }}>
            Digite seu telefone para ver seus pedidos
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 480, margin: "-20px auto 0", padding: "0 16px 40px" }}>

        {/* Search card */}
        <div style={{ background: "#fff", borderRadius: 20, boxShadow: "0 4px 24px rgba(0,0,0,0.1)", padding: 20, marginBottom: 20, animation: "slideUp 0.35s ease" }}>
          <form onSubmit={buscar}>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#64748b", display: "flex", alignItems: "center", gap: 5, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              <Phone size={12} /> Seu telefone
            </label>
            <div style={{ display: "flex", gap: 10 }}>
              <input
                type="tel"
                value={tel}
                onChange={e => setTel(maskPhone(e.target.value))}
                placeholder="(00) 00000-0000"
                style={{ flex: 1, padding: "13px 16px", borderRadius: 14, border: "1.5px solid #e2e8f0", fontSize: 16, color: "#0f172a", outline: "none", background: "#f8fafc", boxSizing: "border-box" }}
                onFocus={e => e.target.style.borderColor = "#E4002B"}
                onBlur={e  => e.target.style.borderColor = "#e2e8f0"}
              />
              <button
                type="submit"
                disabled={loading || tel.replace(/\D/g,"").length < 8}
                style={{ padding: "0 20px", borderRadius: 14, background: tel.replace(/\D/g,"").length >= 8 ? "#E4002B" : "#e2e8f0", color: tel.replace(/\D/g,"").length >= 8 ? "#fff" : "#94a3b8", border: "none", fontWeight: 700, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}
              >
                {loading ? <div style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.4)", borderTopColor: "#fff", animation: "spin 0.8s linear infinite" }} /> : <Search size={16} />}
                Buscar
              </button>
            </div>
          </form>
        </div>

        {/* Results */}
        {searched && !loading && pedidos !== null && (
          <div style={{ animation: "slideUp 0.3s ease" }}>
            {pedidos.length === 0 ? (
              <div style={{ background: "#fff", borderRadius: 20, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", padding: "32px 20px", textAlign: "center" }}>
                <Package size={36} style={{ color: "#e2e8f0", marginBottom: 12 }} />
                <p style={{ fontSize: 15, fontWeight: 700, color: "#64748b", margin: "0 0 6px" }}>Nenhum pedido encontrado</p>
                <p style={{ fontSize: 13, color: "#94a3b8", margin: 0 }}>Verifique o número ou faça um pedido primeiro</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <p style={{ fontSize: 12, color: "#94a3b8", fontWeight: 600, margin: "0 4px 4px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {pedidos.length} pedido{pedidos.length > 1 ? "s" : ""} encontrado{pedidos.length > 1 ? "s" : ""}
                </p>
                {pedidos.map(p => {
                  const total  = p.valor_pedido + p.valor_motoboy;
                  const sc     = STATUS_COLOR[p.status] ?? STATUS_COLOR.em_fila;
                  const active = !["entregue", "cancelado"].includes(p.status);
                  const cardStyle = { background: "#fff", borderRadius: 18, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", padding: "16px 18px", textDecoration: "none", display: "flex" as const, alignItems: "center" as const, gap: 14, border: active ? "1.5px solid rgba(228,0,43,0.15)" : "1.5px solid transparent" };
                  const inner = (
                    <>
                      {/* Status icon */}
                      <div style={{ width: 44, height: 44, borderRadius: 14, background: sc.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        {p.status === "entregue"
                          ? <CheckCircle size={20} style={{ color: sc.text }} />
                          : p.status === "cancelado"
                          ? <XCircle size={20} style={{ color: sc.text }} />
                          : p.status === "em_rota_de_entrega" || p.status === "em_coleta"
                          ? <Package size={20} style={{ color: sc.text }} />
                          : <Clock size={20} style={{ color: sc.text }} />}
                      </div>
                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                          <p style={{ fontSize: 13, fontWeight: 800, color: "#0f172a", margin: 0 }}>
                            {p.empresa?.nome ?? "Pedido"}
                          </p>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: sc.bg, color: sc.text }}>
                            {STATUS_LABEL[p.status]}
                          </span>
                        </div>
                        <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 1px" }}>
                          #{p.id.slice(0, 8).toUpperCase()} · {p.tipo_pedido === "entrega" ? "Delivery" : "Retirada"}
                        </p>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <p style={{ fontSize: 13, fontWeight: 700, color: "#E4002B", margin: 0 }}>
                            R$ {total.toFixed(2).replace(".", ",")}
                          </p>
                          <p style={{ fontSize: 11, color: "#94a3b8", margin: 0 }}>
                            {new Date(p.created_at).toLocaleDateString("pt-BR")}
                          </p>
                        </div>
                      </div>
                      {p.tracking_token && <ChevronRight size={16} style={{ color: "#cbd5e1", flexShrink: 0 }} />}
                    </>
                  );
                  return p.tracking_token ? (
                    <Link key={p.id} href={`/pedido/${p.tracking_token}`} style={cardStyle}>
                      {inner}
                    </Link>
                  ) : (
                    <div key={p.id} style={cardStyle}>
                      {inner}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
