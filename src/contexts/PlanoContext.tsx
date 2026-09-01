"use client";

import { createContext, useContext } from "react";
import type { Plano } from "@/types";

interface PlanoCtx {
  plano: Plano;
  assinaturaAtiva: boolean;
}

const PlanoContext = createContext<PlanoCtx>({ plano: "basic", assinaturaAtiva: false });

export function PlanoProvider({
  children,
  plano,
  assinaturaAtiva,
}: {
  children: React.ReactNode;
  plano: Plano;
  assinaturaAtiva: boolean;
}) {
  return (
    <PlanoContext.Provider value={{ plano, assinaturaAtiva }}>
      {children}
    </PlanoContext.Provider>
  );
}

export function usePlano() {
  return useContext(PlanoContext);
}

export const PLANO_LABEL: Record<Plano, string> = {
  basic:      "Básico",
  pro:        "Pro",
  enterprise: "Business",
  ktl:        "KTL",
};

export const PLANO_COLOR: Record<Plano, { bg: string; text: string; border: string }> = {
  basic:      { bg: "#f1f5f9",         text: "#475569", border: "#e2e8f0" },
  pro:        { bg: "#f5f3ff",         text: "#7c3aed", border: "#ddd6fe" },
  enterprise: { bg: "#fffbeb",         text: "#d97706", border: "#fde68a" },
  ktl:        { bg: "rgba(6,182,212,0.12)", text: "#0891b2", border: "rgba(6,182,212,0.3)" },
};

// KTL: apenas pedidos, financeiro e catálogo
export const KTL_ROUTES = ["/pedidos", "/financeiro", "/catalogo", "/motoboys", "/configuracoes", "/automacoes"];

export function isKtl(plano: Plano)              { return plano === "ktl"; }
export function canUseCatalogo(_plano: Plano)    { return true; }
export function canUseMonitor(plano: Plano)      { return plano !== "basic" && plano !== "ktl"; }
export function canUseMultiLoja(plano: Plano)    { return plano === "enterprise"; }
export function canUseRelatorios(_plano: Plano)  { return true; }
export function canUseAutoDispatch(plano: Plano) { return plano !== "basic" && plano !== "ktl"; }
export function motoboysLimit(plano: Plano)      { return plano === "basic" ? 3 : 9999; }
