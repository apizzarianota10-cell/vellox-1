"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "./ui";

export interface UsoTabela { tabela: string; linhas: number; bytes: number; estimado_bytes: number }
export interface UsoEmpresa {
  id: string; nome: string; plano: string; ativa: boolean;
  linhas: number; db_bytes: number; db_estimado_bytes: number;
  storage_bytes: number; storage_arquivos: number; imagens_bytes: number; imagens_arquivos: number;
  total_bytes: number; tabelas: UsoTabela[];
}
export interface UsoBanco {
  migracao_pendente: boolean;
  erro: string | null;
  gerado_em: string;
  db: { total_bytes: number; atribuido_bytes: number; tabelas: { tabela: string; total_bytes: number; linhas_estimadas: number }[] } | null;
  storage_principal: { total_bytes: number | null; buckets: { bucket: string; objetos: number; bytes: number }[]; nao_atribuido_bytes: number } | null;
  storage_imagens: {
    configurado: boolean; total_bytes: number; arquivos: number; nao_atribuido_bytes: number;
    nao_atribuido_arquivos: number; plataforma_bytes: number; truncado: boolean; erro: string | null;
  };
  empresas: UsoEmpresa[];
}

// Cache compartilhado entre a tela "Uso de banco" e o detalhe da loja
let promessa: Promise<UsoBanco> | null = null;

export function useUsoBanco(ativo = true) {
  const [data, setData] = useState<UsoBanco | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const carregar = useCallback(async (refresh = false) => {
    setLoading(true); setError(null);
    try {
      if (refresh || !promessa) promessa = api<UsoBanco>(`/api/god/uso-banco${refresh ? "?refresh=1" : ""}`);
      setData(await promessa);
    } catch (e) {
      promessa = null;
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (ativo) carregar(false); }, [ativo, carregar]);
  return { data, loading, error, recarregar: () => carregar(true) };
}
