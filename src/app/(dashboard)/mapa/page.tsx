import { createClient } from "@/lib/supabase/server";
import TrackingMapClient from "@/components/map/TrackingMapClient";
import type { Motoboy, Pedido } from "@/types";
import { MapPin, Users, Bike } from "lucide-react";


export default async function MapaPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [motoboysRes, pedidosRes] = await Promise.all([
    supabase.from("motoboys").select("*").eq("empresa_id", user!.id),
    supabase.from("pedidos").select("*, motoboy:motoboys(*)").eq("empresa_id", user!.id).in("status", ["em_rota_de_entrega", "em_fila"]),
  ]);

  const motoboys = (motoboysRes.data ?? []) as Motoboy[];
  const pedidos  = (pedidosRes.data ?? []) as Pedido[];

  const emRota      = motoboys.filter((m) => m.status === "em_entrega");
  const disponiveis = motoboys.filter((m) => m.status === "disponivel");
  const comGPS      = motoboys.filter((m) => m.latitude != null);

  return (
    <div className="flex flex-col h-full" style={{ background: "#0a0a0a" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4 shrink-0"
        style={{ borderBottom: "1px solid #1a1a1a" }}>
        <div>
          <h1 className="text-xl font-bold text-white">Rastreamento ao vivo</h1>
          <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>
            {comGPS.length} de {motoboys.length} motoboys com GPS ativo
          </p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          {[
            { icon: Bike,    value: emRota.length,      label: "Em rota",    color: "#fbbf24" },
            { icon: Users,   value: disponiveis.length,  label: "Livres",     color: "#22c55e" },
            { icon: MapPin,  value: pedidos.filter(p => p.status === "em_rota_de_entrega").length, label: "Entregas", color: "#E4002B" },
          ].map(({ icon: Icon, value, label, color }) => (
            <div key={label} className="flex items-center gap-2 px-3 py-2 rounded-xl"
              style={{ background: "#0f0f0f", border: "1px solid #1a1a1a" }}>
              <Icon size={14} style={{ color }} />
              <span className="text-sm font-bold text-white">{value}</span>
              <span className="text-xs" style={{ color: "#475569" }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Mapa — ocupa tudo */}
        <div className="flex-1 p-2 md:p-4">
          <TrackingMapClient
            motoboys={motoboys}
            pedidos={pedidos}
            empresaId={user!.id}
            height="100%"
          />
        </div>

        {/* Sidebar — entregas ativas (hidden on mobile) */}
        <div className="hidden md:block w-72 shrink-0 overflow-y-auto p-4 space-y-3"
          style={{ borderLeft: "1px solid #1a1a1a" }}>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#E4002B" }}>
            Entregas ativas
          </p>

          {pedidos.filter((p) => p.status === "em_rota_de_entrega").length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <MapPin size={28} style={{ color: "#1f1f1f" }} />
              <p className="text-xs text-center" style={{ color: "#374151" }}>
                Nenhuma entrega em andamento
              </p>
            </div>
          )}

          {pedidos
            .filter((p) => p.status === "em_rota_de_entrega")
            .map((p) => (
              <div key={p.id} className="p-3 rounded-xl space-y-2"
                style={{ background: "#0f0f0f", border: "1px solid #1a1a1a" }}>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-500 shrink-0 animate-pulse" />
                  <p className="text-sm font-semibold text-white truncate">{p.cliente_nome}</p>
                </div>
                <p className="text-xs truncate" style={{ color: "#475569" }}>{p.endereco_entrega}</p>
                {p.motoboy && (
                  <div className="flex items-center gap-1.5 pt-1" style={{ borderTop: "1px solid #1a1a1a" }}>
                    <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{ background: "rgba(251,191,36,0.15)", color: "#fbbf24" }}>
                      {p.motoboy.nome.charAt(0)}
                    </div>
                    <span className="text-xs" style={{ color: "#fbbf24" }}>{p.motoboy.nome}</span>
                  </div>
                )}
              </div>
            ))}

          {/* Motoboys sem GPS */}
          {motoboys.filter((m) => !m.latitude && m.status !== "offline").length > 0 && (
            <>
              <p className="text-xs font-semibold uppercase tracking-wider pt-2" style={{ color: "#374151" }}>
                Sem GPS
              </p>
              {motoboys
                .filter((m) => !m.latitude && m.status !== "offline")
                .map((m) => (
                  <div key={m.id} className="flex items-center gap-2 p-3 rounded-xl"
                    style={{ background: "#0a0a0a", border: "1px solid #111" }}>
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{ background: "#1a1a1a", color: "#374151" }}>
                      {m.nome.charAt(0)}
                    </div>
                    <span className="text-xs" style={{ color: "#374151" }}>{m.nome}</span>
                  </div>
                ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
