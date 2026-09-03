"use client";

import { useState, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/client";
import { MapPin, Search, CheckCircle, Loader2 } from "lucide-react";
import type { LocationMapPickerInnerProps } from "@/components/map/LocationMapPickerInner";

/* ── Dynamic map (no SSR — Leaflet requires window) ─────────────────── */
const LocationMapPickerInner = dynamic<LocationMapPickerInnerProps>(
  () => import("@/components/map/LocationMapPickerInner"),
  {
    ssr: false,
    loading: () => (
      <div style={{
        height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
        background: "#0f0f0f", borderRadius: 16,
      }}>
        <Loader2 size={20} style={{ color: "#374151", animation: "spin 1s linear infinite" }} />
      </div>
    ),
  }
);

const RADII = [30, 50, 100] as const;

interface GeoFeature {
  place_name: string;
  center: [number, number];
  context?: { id: string; text: string }[];
  distanceKm?: number;
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    name?: string; street?: string; housenumber?: string;
    district?: string; suburb?: string;
    city?: string; town?: string; village?: string; county?: string;
    state?: string;
  };
}

const geoSearchCache = new Map<string, GeoFeature[]>();

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

function formatDist(km: number) {
  return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`;
}

function photonToFeature(f: PhotonFeature): GeoFeature {
  const p = f.properties;
  const [lng, lat] = f.geometry.coordinates;
  const road = [p.street, p.housenumber].filter(Boolean).join(", ");
  const bairro = p.district || p.suburb || "";
  const cidade = p.city || p.town || p.village || p.county || "";
  const estado = p.state || "";
  const nome = road || p.name || "";
  return {
    place_name: [nome, p.name && road && p.name !== road ? null : null, bairro, cidade, estado].filter(Boolean).join(", "),
    center: [lng, lat],
    context: [
      bairro ? { id: "neighborhood.photon", text: bairro } : null,
      cidade ? { id: "place.photon", text: cidade } : null,
      estado ? { id: "region.photon", text: estado } : null,
    ].filter(Boolean) as { id: string; text: string }[],
  };
}

function dedup(feats: GeoFeature[]): GeoFeature[] {
  const out: GeoFeature[] = [];
  for (const f of feats) {
    const dup = out.some(o =>
      Math.abs(o.center[1] - f.center[1]) < 0.0015 &&
      Math.abs(o.center[0] - f.center[0]) < 0.0015
    );
    if (!dup) out.push(f);
  }
  return out;
}

async function photonSearch(q: string, refLat: number | null, refLng: number | null): Promise<GeoFeature[]> {
  const bias = refLat != null && refLng != null ? `&lat=${refLat}&lon=${refLng}` : "";
  try {
    const res = await fetch(
      `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&lang=pt&limit=10&countrycodes=BR${bias}`,
      { signal: AbortSignal.timeout(6000) }
    );
    const json = await res.json();
    return ((json.features ?? []) as PhotonFeature[]).map(photonToFeature);
  } catch { return []; }
}

async function reverseGeocode(lat: number, lng: number): Promise<GeoFeature | null> {
  try {
    const res = await fetch(
      `https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}&lang=pt`,
      { signal: AbortSignal.timeout(6000) }
    );
    const json = await res.json();
    const feat: PhotonFeature | undefined = (json.features ?? [])[0];
    if (!feat) return null;
    return photonToFeature(feat);
  } catch { return null; }
}

interface Location {
  endereco: string;
  lat: number;
  lng: number;
  cidade: string;
  estado: string;
  pais: string;
}

function parseContext(feat: GeoFeature) {
  const ctx = feat.context ?? [];
  return {
    cidade: ctx.find(c => c.id.startsWith("place"))?.text ?? "",
    estado: ctx.find(c => c.id.startsWith("region"))?.text ?? "",
    pais: "Brasil",
  };
}

export interface Props {
  empresaId: string;
  initialEndereco?: string;
  initialLat?: number | null;
  initialLng?: number | null;
  initialRaio?: number | null;
}

export default function CompanyLocationPicker({
  empresaId,
  initialEndereco = "",
  initialLat,
  initialLng,
  initialRaio,
}: Props) {
  const supabase = createClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const raioRef = useRef(initialRaio ?? 50);

  /* Search */
  const [query, setQuery] = useState(initialEndereco);
  const [suggestions, setSuggestions] = useState<GeoFeature[]>([]);
  const [showSugg, setShowSugg] = useState(false);
  const [searching, setSearching] = useState(false);
  const [noResults, setNoResults] = useState(false);
  const [dropPos, setDropPos] = useState<{ top: number; left: number; width: number } | null>(null);

  /* Location */
  const [location, setLocation] = useState<Location | null>(
    initialLat && initialLng
      ? { endereco: initialEndereco, lat: initialLat, lng: initialLng, cidade: "", estado: "", pais: "Brasil" }
      : null
  );
  const [geocoding, setGeocoding] = useState(false);
  const [raio, setRaio] = useState(initialRaio ?? 50);
  const [flyTarget, setFlyTarget] = useState<[number, number] | null>(null);

  /* Save */
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [saveError, setSaveError] = useState("");

  /* ── Map click handler (stable via useCallback) ── */
  const handleMapClick = useCallback(async (lat: number, lng: number) => {
    setLocation({ endereco: `${lat.toFixed(6)}, ${lng.toFixed(6)}`, lat, lng, cidade: "", estado: "", pais: "Brasil" });
    setGeocoding(true);
    try {
      const feat = await reverseGeocode(lat, lng);
      if (feat) {
        const { cidade, estado, pais } = parseContext(feat);
        setLocation({ endereco: feat.place_name, lat, lng, cidade, estado, pais });
        setQuery(feat.place_name);
      }
    } catch { /* keep coord-based address */ }
    setGeocoding(false);
  }, []);

  /* ── Autocomplete ── */
  function handleQueryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setQuery(v);
    setNoResults(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (v.trim().length < 3) { setSuggestions([]); setShowSugg(false); return; }
    debounceRef.current = setTimeout(() => fetchSuggestions(v, false), 400);
  }

  async function fetchSuggestions(q: string, autoSelect: boolean) {
    if (!q.trim()) return;
    setSearching(true);
    setNoResults(false);
    try {
      const refLat = location?.lat ?? initialLat ?? null;
      const refLng = location?.lng ?? initialLng ?? null;

      const cacheKey = `${q}|${refLng?.toFixed(2)}|${refLat?.toFixed(2)}`;
      if (geoSearchCache.has(cacheKey)) {
        const cached = geoSearchCache.get(cacheKey)!;
        if (cached.length === 0) { setSuggestions([]); setShowSugg(false); setNoResults(true); }
        else if (autoSelect) { selectFeature(cached[0]); }
        else {
          const rect = inputRef.current?.getBoundingClientRect();
          if (rect) setDropPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
          setSuggestions(cached); setShowSugg(true);
        }
        setSearching(false);
        return;
      }

      let feats = await photonSearch(q, refLat, refLng);

      if (refLat != null && refLng != null) {
        feats.forEach(f => {
          f.distanceKm = haversineKm(refLat, refLng, f.center[1], f.center[0]);
        });
        feats.sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999));
      }
      feats = dedup(feats).slice(0, 6);
      geoSearchCache.set(cacheKey, feats);

      if (feats.length === 0) { setSuggestions([]); setShowSugg(false); setNoResults(true); }
      else if (autoSelect) { selectFeature(feats[0]); }
      else {
        const rect = inputRef.current?.getBoundingClientRect();
        if (rect) setDropPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
        setSuggestions(feats); setShowSugg(true);
      }
    } catch { setSuggestions([]); }
    setSearching(false);
  }

  function selectFeature(feature: GeoFeature) {
    const [lng, lat] = feature.center;
    const { cidade, estado, pais } = parseContext(feature);
    setQuery(feature.place_name);
    setSuggestions([]); setShowSugg(false); setNoResults(false);
    setLocation({ endereco: feature.place_name, lat, lng, cidade, estado, pais });
    setFlyTarget([lat, lng]);
  }

  /* ── Save ── */
  async function confirmarLocalizacao() {
    if (!location || saving) return;
    setSaving(true); setSaveError("");
    try {
      const { error } = await supabase.rpc("update_empresa_localizacao", {
        p_endereco: location.endereco,
        p_lat: location.lat,
        p_lng: location.lng,
        p_raio: raio,
        p_cidade: location.cidade || null,
        p_estado: location.estado || null,
        p_pais: location.pais || "Brasil",
      });
      if (error) throw error;
      localStorage.setItem("empresa_lat", String(location.lat));
      localStorage.setItem("empresa_lng", String(location.lng));
      localStorage.setItem("empresa_raio", String(raio));
      raioRef.current = raio;
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 3000);
    } catch (err) {
      setSaveError("Erro ao salvar localização. Tente novamente.");
      console.error(err);
    }
    setSaving(false);
  }

  const IS = {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    height: 48,
  };

  return (
    <div className="space-y-4">

      {/* ── Search ── */}
      <div>
        <label className="block text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: "#4b5563" }}>
          Endereço
        </label>
        <div className="flex gap-2">
          <div style={{ flex: 1, position: "relative" }}>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={handleQueryChange}
              onKeyDown={e => e.key === "Enter" && fetchSuggestions(query, true)}
              placeholder="Ex: Rua das Flores, 123, Recife - PE"
              className="w-full px-4 rounded-xl text-sm text-white placeholder-gray-700 outline-none transition-all"
              style={IS}
              onFocus={e => {
                e.target.style.borderColor = "rgba(228,0,43,0.5)";
                if (suggestions.length > 0) {
                  const rect = inputRef.current?.getBoundingClientRect();
                  if (rect) setDropPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
                  setShowSugg(true);
                }
              }}
              onBlur={e => {
                e.target.style.borderColor = "rgba(255,255,255,0.08)";
                setTimeout(() => setShowSugg(false), 150);
              }}
            />

            {showSugg && suggestions.length > 0 && dropPos && (
              <div style={{
                position: "fixed", top: dropPos.top, left: dropPos.left, width: dropPos.width,
                zIndex: 9999, background: "#141414",
                border: "1px solid rgba(228,0,43,0.2)", borderRadius: 12,
                overflow: "hidden", boxShadow: "0 12px 36px rgba(0,0,0,0.7)",
              }}>
                {suggestions.map((f, i) => {
                  const parts = f.place_name.split(",");
                  const nome = parts[0]?.trim() ?? f.place_name;
                  const sub = parts.slice(1).join(",").trim();
                  const dist = f.distanceKm;
                  const distColor = dist == null ? "#475569" : dist < 2 ? "#22c55e" : dist < 10 ? "#fbbf24" : "#64748b";
                  return (
                    <button key={i} onMouseDown={() => selectFeature(f)}
                      className="flex items-center gap-3 w-full px-4 py-3 text-left"
                      style={{ borderBottom: i < suggestions.length - 1 ? "1px solid #1f1f1f" : "none" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "rgba(228,0,43,0.07)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    >
                      <MapPin size={13} style={{ color: "#E4002B", flexShrink: 0, marginTop: 1 }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate leading-snug">{nome}</p>
                        {sub && <p className="text-xs truncate mt-0.5" style={{ color: "#475569" }}>{sub}</p>}
                      </div>
                      {dist != null && (
                        <span className="text-xs font-bold tabular-nums shrink-0 ml-2" style={{ color: distColor }}>
                          {formatDist(dist)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <button onClick={() => fetchSuggestions(query, true)}
            disabled={searching || !query.trim()}
            className="shrink-0 flex items-center gap-2 px-4 rounded-xl text-sm font-bold"
            style={{ height: 48, background: "linear-gradient(135deg,#A80021,#a84400)", color: "white", opacity: !query.trim() ? 0.5 : 1 }}>
            {searching ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
            Localizar
          </button>
        </div>

        {noResults && (
          <p className="text-xs mt-2 px-3 py-2 rounded-lg"
            style={{ background: "rgba(228,0,43,0.08)", color: "#FFC72C", border: "1px solid rgba(228,0,43,0.2)" }}>
            ⚠ Endereço não encontrado. Tente ser mais específico ou clique no mapa.
          </p>
        )}
      </div>

      {/* ── Map ── */}
      <div>
        <p className="text-xs mb-2" style={{ color: "#374151" }}>
          Clique no mapa para posicionar · Arraste o marcador para ajustar
        </p>
        <div style={{ height: 280, borderRadius: 16, overflow: "hidden", border: "1px solid rgba(228,0,43,0.2)" }}>
          <LocationMapPickerInner
            lat={location?.lat ?? null}
            lng={location?.lng ?? null}
            raio={raio}
            initialLat={initialLat}
            initialLng={initialLng}
            onMapClick={handleMapClick}
            flyTarget={flyTarget}
          />
        </div>
      </div>

      {/* ── Location info ── */}
      <div style={{ background: "#111", border: "1px solid #1f1f1f", borderRadius: 12, padding: "12px 14px", minHeight: 56 }}>
        {geocoding ? (
          <div className="flex items-center gap-2" style={{ color: "#475569" }}>
            <Loader2 size={13} className="animate-spin" />
            <span className="text-xs">Identificando endereço...</span>
          </div>
        ) : location ? (
          <div className="flex items-start gap-2.5">
            <MapPin size={13} style={{ color: "#E4002B", marginTop: 1, flexShrink: 0 }} />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white leading-snug">{location.endereco}</p>
              {location.cidade && (
                <p className="text-xs mt-0.5" style={{ color: "#475569" }}>
                  {[location.cidade, location.estado, location.pais].filter(Boolean).join(", ")}
                </p>
              )}
              <div className="flex gap-4 mt-1.5">
                <span className="text-xs font-mono" style={{ color: "#4b5563" }}>
                  <span style={{ color: "#374151" }}>Lat </span>{location.lat.toFixed(6)}
                </span>
                <span className="text-xs font-mono" style={{ color: "#4b5563" }}>
                  <span style={{ color: "#374151" }}>Lng </span>{location.lng.toFixed(6)}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-xs" style={{ color: "#374151" }}>
            Clique no mapa ou busque um endereço para começar
          </p>
        )}
      </div>

      {/* ── Geofence radius ── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#4b5563" }}>Raio de geofence</label>
          <span className="text-xs font-mono font-bold" style={{ color: "#E4002B" }}>{raio}m</span>
        </div>
        <div className="flex gap-2">
          {RADII.map(r => (
            <button key={r} onClick={() => setRaio(r)}
              className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all"
              style={{
                background: raio === r ? "rgba(228,0,43,0.15)" : "rgba(255,255,255,0.03)",
                color: raio === r ? "#E4002B" : "#475569",
                border: `1px solid ${raio === r ? "rgba(228,0,43,0.4)" : "rgba(255,255,255,0.06)"}`,
              }}>
              {r}m
            </button>
          ))}
        </div>
        <p className="text-xs mt-1.5" style={{ color: "#374151" }}>
          Detecta entrada e saída dos motoboys na área da empresa
        </p>
      </div>

      {/* ── Error ── */}
      {saveError && (
        <p className="text-xs px-3 py-2 rounded-lg"
          style={{ background: "rgba(228,0,43,0.08)", color: "#FFC72C", border: "1px solid rgba(228,0,43,0.2)" }}>
          ⚠ {saveError}
        </p>
      )}

      {/* ── Confirm ── */}
      <button onClick={confirmarLocalizacao}
        disabled={!location || saving || geocoding}
        className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-bold transition-all"
        style={{
          background: savedOk ? "rgba(34,197,94,0.12)" : location ? "linear-gradient(135deg,#A80021,#a84400)" : "rgba(255,255,255,0.04)",
          color: savedOk ? "#4ade80" : "white",
          border: savedOk ? "1px solid rgba(34,197,94,0.3)" : "none",
          opacity: (!location || geocoding) ? 0.5 : 1,
        }}>
        {saving ? <><Loader2 size={15} className="animate-spin" /> Salvando...</>
          : savedOk ? <><CheckCircle size={15} /> Localização salva!</>
          : <><MapPin size={15} /> Confirmar localização</>}
      </button>
    </div>
  );
}
