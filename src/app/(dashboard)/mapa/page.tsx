import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TrackingMapClient from "@/components/map/TrackingMapClient";
import type { Motoboy, Pedido } from "@/types";
import { MapPin, Users, Bike, AlertTriangle } from "lucide-react";

type EmpresaLoc = { lat: number | null; lng: number | null; raio_geofence?: number | null };

export default async function MapaPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [motoboysRes, pedidosRes, empresaRes] = await Promise.all([
    supabase.from("motoboys").select("*").eq("empresa_id", user.id),
    supabase.from("pedidos").select("*, motoboy:motoboys(*)").eq("empresa_id", user.id).in("status", ["em_rota_de_entrega", "em_fila"]),
    supabase.from("empresas").select("lat, lng, raio_geofence").eq("id", user.id).maybeSingle(),
  ]);

  // Se o embed falhar (ex.: PGRST200/201), busca sem o embed para o mapa não ficar vazio
  let pedidosData = pedidosRes.data as Pedido[] | null;
  if (pedidosRes.error) {
    console.error("[mapa] pedidos com embed falhou:", pedidosRes.error.message);
    const retry = await supabase.from("pedidos").select("*").eq("empresa_id", user.id).in("status", ["em_rota_de_entrega", "em_fila"]);
    pedidosData = (retry.data as Pedido[] | null) ?? null;
  }

  // Se raio_geofence não existir no banco, cai para lat/lng apenas
  let empresa = empresaRes.data as EmpresaLoc | null;
  if (empresaRes.error) {
    const retry = await supabase.from("empresas").select("lat, lng").eq("id", user.id).maybeSingle();
    empresa = (retry.data as EmpresaLoc | null) ?? null;
  }

  if (motoboysRes.error) console.error("[mapa] motoboys falhou:", motoboysRes.error.message);

  const motoboys = (motoboysRes.data ?? []) as Motoboy[];
  const pedidos  = (pedidosData ?? []) as Pedido[];
  const motoboyById = new Map(motoboys.map((m) => [m.id, m]));

  const emRota      = motoboys.filter((m) => m.status === "em_entrega");
  const disponiveis = motoboys.filter((m) => m.status === "disponivel");
  const online      = motoboys.filter((m) => m.status !== "offline");
  const comGPS      = online.filter((m) => m.latitude != null && m.longitude != null);
  const semGPS      = online.filter((m) => m.latitude == null || m.longitude == null);
  const entregas    = pedidos.filter((p) => p.status === "em_rota_de_entrega");
  const erroDados   = Boolean(motoboysRes.error);

  return (
    <div className="flex flex-col h-full min-h-[calc(100dvh-130px)] md:min-h-0" style={{ background: "#0a0a0a" }}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 md:px-6 py-3 md:py-4 shrink-0"
        style={{ borderBottom: "1px solid #1a1a1a" }}>
        <div>
          <h1 className="text-xl font-bold text-white">Rastreamento ao vivo</h1>
          <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>
            {motoboys.length === 0
              ? "Nenhum motoboy cadastrado"
              : `${comGPS.length} de ${online.length} motoboy${online.length === 1 ? "" : "s"} online com GPS ativo`}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {[
            { icon: Bike,    value: emRota.length,      label: "Em rota",  color: "#fbbf24" },
            { icon: Users,   value: disponiveis.length, label: "Livres",   color: "#22c55e" },
            { icon: MapPin,  value: entregas.length,    label: "Entregas", color: "#E4002B" },
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

      {erroDados && (
        <div className="mx-4 md:mx-6 mt-3 flex items-center gap-2 px-3 py-2 rounded-xl text-xs"
          style={{ background: "rgba(228,0,43,0.08)", border: "1px solid rgba(228,0,43,0.25)", color: "#fca5a5" }}>
          <AlertTriangle size={14} />
          Não foi possível carregar os motoboys agora. O mapa tentará atualizar automaticamente.
        </div>
      )}

      <div className="flex flex-col md:flex-row flex-1 min-h-0">
        {/* Mapa */}
        <div className="flex-1 min-h-[55dvh] md:min-h-0 p-2 md:p-4">
          <TrackingMapClient
            motoboys={motoboys}
            pedidos={pedidos}
            empresaId={user.id}
            empresaLat={empresa?.lat ?? null}
            empresaLng={empresa?.lng ?? null}
            empresaRaio={empresa?.raio_geofence ?? null}
            height="100%"
          />
        </div>

        {/* Lista — entregas ativas (abaixo do mapa no celular, lateral no desktop) */}
        <div className="w-full md:w-72 shrink-0 overflow-y-auto p-4 space-y-3 border-t md:border-t-0 md:border-l"
          style={{ borderColor: "#1a1a1a" }}>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#E4002B" }}>
            Entregas ativas
          </p>

          {entregas.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 md:py-12 gap-3">
              <MapPin size={28} style={{ color: "#1f1f1f" }} />
              <p className="text-xs text-center" style={{ color: "#374151" }}>
                Nenhuma entrega em andamento
              </p>
            </div>
          )}

          {entregas.map((p) => {
            const mb = p.motoboy ?? (p.motoboy_id ? motoboyById.get(p.motoboy_id) : undefined);
            return (
              <div key={p.id} className="p-3 rounded-xl space-y-2"
                style={{ background: "#0f0f0f", border: "1px solid #1a1a1a" }}>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-500 shrink-0 animate-pulse" />
                  <p className="text-sm font-semibold text-white truncate">{p.cliente_nome}</p>
                </div>
                <p className="text-xs truncate" style={{ color: "#475569" }}>{p.endereco_entrega}</p>
                {p.endereco_lat == null && (
                  <p className="text-[11px]" style={{ color: "#64748b" }}>Endereço sem coordenadas — não aparece no mapa</p>
                )}
                {mb && (
                  <div className="flex items-center gap-1.5 pt-1" style={{ borderTop: "1px solid #1a1a1a" }}>
                    <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{ background: "rgba(251,191,36,0.15)", color: "#fbbf24" }}>
                      {(mb.nome || "?").charAt(0)}
                    </div>
                    <span className="text-xs" style={{ color: "#fbbf24" }}>{mb.nome}</span>
                  </div>
                )}
              </div>
            );
          })}

          {/* Motoboys online sem GPS */}
          {semGPS.length > 0 && (
            <>
              <p className="text-xs font-semibold uppercase tracking-wider pt-2" style={{ color: "#374151" }}>
                Sem GPS
              </p>
              {semGPS.map((m) => (
                <div key={m.id} className="flex items-center gap-2 p-3 rounded-xl"
                  style={{ background: "#0a0a0a", border: "1px solid #111" }}>
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{ background: "#1a1a1a", color: "#374151" }}>
                    {(m.nome || "?").charAt(0)}
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
