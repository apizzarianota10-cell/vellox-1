"use client";

import { useEffect, useState } from "react";
import { Check, MessageCircle } from "lucide-react";
import type { Pedido } from "@/types";

// Aviso ao cliente pelo WhatsApp sem API paga: abre o WhatsApp (wa.me) com a
// mensagem do status atual já escrita — o atendente só aperta enviar.

function telefoneWa(raw: string | null | undefined): string | null {
  const d = (raw ?? "").replace(/\D/g, "");
  if (d.length < 10) return null;
  return d.startsWith("55") && d.length >= 12 ? d : "55" + d;
}

function mensagem(pedido: Pedido, loja: string): string {
  const nome = pedido.cliente_nome?.split(" ")[0] || "tudo bem";
  const link = pedido.tracking_token && typeof window !== "undefined"
    ? `\n\nAcompanhe aqui: ${window.location.origin}/pedido/${pedido.tracking_token}`
    : "";
  const retirada = pedido.tipo_pedido === "retirada";
  switch (pedido.status) {
    case "em_preparo":
      return `Olá, ${nome}! 👨‍🍳 Seu pedido na ${loja} já está sendo preparado.${link}`;
    case "finalizado":
      return retirada
        ? `Olá, ${nome}! ✅ Seu pedido na ${loja} está pronto para retirada. Pode vir buscar!${link}`
        : `Olá, ${nome}! ✅ Seu pedido na ${loja} está pronto e logo sai para entrega.${link}`;
    case "em_coleta":
    case "em_rota_de_entrega": {
      const mb = pedido.motoboy?.nome ? ` com ${pedido.motoboy.nome}` : "";
      return `Olá, ${nome}! 🛵 Seu pedido da ${loja} saiu para entrega${mb} e já está a caminho.${link}`;
    }
    case "entregue":
      return retirada
        ? `Olá, ${nome}! Obrigado por retirar seu pedido na ${loja}. Bom apetite! 😋`
        : `Olá, ${nome}! Seu pedido da ${loja} foi entregue. Bom apetite e obrigado pela preferência! 😋`;
    case "cancelado":
      return `Olá, ${nome}. Seu pedido na ${loja} foi cancelado. Se tiver qualquer dúvida, é só responder esta mensagem.`;
    default:
      return `Olá, ${nome}! ✅ Recebemos seu pedido na ${loja} e ele já está na fila.${link}`;
  }
}

const chave = (p: Pedido) => `vellox-wa-avisado:${p.id}:${p.status}`;

export default function AvisarWhatsApp({ pedido, loja }: { pedido: Pedido; loja: string }) {
  const tel = telefoneWa(pedido.cliente_telefone);
  const [avisado, setAvisado] = useState(false);

  useEffect(() => {
    try { setAvisado(localStorage.getItem(chave(pedido)) === "1"); } catch { setAvisado(false); }
  }, [pedido.id, pedido.status]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!tel) return null;

  function abrir() {
    const url = `https://wa.me/${tel}?text=${encodeURIComponent(mensagem(pedido, loja || "loja"))}`;
    window.open(url, "_blank", "noopener,noreferrer");
    try { localStorage.setItem(chave(pedido), "1"); } catch { /* sem storage: só não marca */ }
    setAvisado(true);
  }

  return (
    <button type="button" onClick={abrir}
      title={avisado ? "Cliente já avisado deste status — clique para enviar de novo" : "Avisar o cliente no WhatsApp sobre o status atual"}
      className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full transition-all"
      style={avisado
        ? { background: "rgba(34,197,94,0.08)", color: "#16a34a", border: "1px solid rgba(34,197,94,0.25)", cursor: "pointer" }
        : { background: "#22c55e", color: "#fff", border: "1px solid #22c55e", cursor: "pointer" }}>
      {avisado ? <Check size={11} /> : <MessageCircle size={11} />}
      {avisado ? "Avisado" : "Avisar"}
    </button>
  );
}
