"use client";

// Estado da conta do cliente final no navegador (sessão do Supabase Auth).
//  - "carregando"   ainda verificando
//  - "indisponivel" schema_v73 não aplicada → a conta fica escondida
//  - "anonimo"      ninguém logado (pedido sem conta continua normal)
//  - "outra-conta"  logado como empresa/motoboy/god → NÃO é tratado como cliente
//  - "cliente"      cliente logado (linha em clientes garantida)

import { useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import {
  carregarOuCriarCliente, ehContaCliente, migrationClienteAusente, avisarMigrationAusente, type Cliente,
} from "@/lib/clienteConta";

export type EstadoConta = "carregando" | "indisponivel" | "anonimo" | "outra-conta" | "cliente";

// Uma sondagem por carregamento de página: a tabela clientes existe?
let sondagem: Promise<boolean> | null = null;
function contaDisponivel(sb: ReturnType<typeof createClient>): Promise<boolean> {
  if (!sondagem) {
    sondagem = Promise.resolve(sb.from("clientes").select("id").limit(1)).then(({ error }) => {
      if (error && migrationClienteAusente(error)) { avisarMigrationAusente(); return false; }
      return true; // sem erro, ou erro de permissão (tabela existe, anon não lê)
    }, () => true);
  }
  return sondagem;
}

// Enquanto o formulário de login confere o tipo da conta (e desloga se for
// empresa/motoboy), os eventos de auth são ignorados — senão a tela trocaria
// de estado no meio e a mensagem de erro sumiria. Ao retomar, reavalia.
let suspenso = false;
const EVENTO_RETOMAR = "vellox-conta-cliente";
export function suspenderEventosConta(v: boolean) {
  suspenso = v;
  if (!v && typeof window !== "undefined") window.dispatchEvent(new Event(EVENTO_RETOMAR));
}

export function useContaCliente() {
  const sb = useMemo(() => createClient(), []);
  const [estado, setEstado]   = useState<EstadoConta>("carregando");
  const [user, setUser]       = useState<User | null>(null);
  const [cliente, setCliente] = useState<Cliente | null>(null);

  const avaliar = useCallback(async (u: User | null) => {
    setUser(u);
    if (!u) {
      setCliente(null);
      setEstado((await contaDisponivel(sb)) ? "anonimo" : "indisponivel");
      return;
    }
    if (!ehContaCliente(u)) { setCliente(null); setEstado("outra-conta"); return; }
    const { cliente: c, semMigration } = await carregarOuCriarCliente(sb, u);
    if (semMigration) { setCliente(null); setEstado("indisponivel"); return; }
    // Falha pontual de rede: usa os dados do cadastro para não travar a tela
    setCliente(c ?? {
      id: u.id, nome: String(u.user_metadata?.nome ?? ""), telefone: String(u.user_metadata?.telefone ?? ""), email: u.email ?? null,
    });
    setEstado("cliente");
  }, [sb]);

  useEffect(() => {
    let vivo = true;
    sb.auth.getSession().then(({ data }) => { if (vivo) avaliar(data.session?.user ?? null); });
    const { data: sub } = sb.auth.onAuthStateChange((evento, sessao) => {
      if (!vivo || suspenso) return;
      if (evento === "SIGNED_IN" || evento === "SIGNED_OUT" || evento === "USER_UPDATED") {
        // fora do callback do Supabase (evita deadlock com chamadas ao banco)
        setTimeout(() => { if (vivo) avaliar(sessao?.user ?? null); }, 0);
      }
    });
    const retomar = () => { sb.auth.getSession().then(({ data }) => { if (vivo) avaliar(data.session?.user ?? null); }); };
    window.addEventListener(EVENTO_RETOMAR, retomar);
    return () => { vivo = false; sub.subscription.unsubscribe(); window.removeEventListener(EVENTO_RETOMAR, retomar); };
  }, [sb, avaliar]);

  const sair = useCallback(async () => {
    await sb.auth.signOut();
    await avaliar(null);
  }, [sb, avaliar]);

  return { sb, estado, user, cliente, setCliente, sair, recarregar: () => sb.auth.getSession().then(({ data }) => avaliar(data.session?.user ?? null)) };
}
