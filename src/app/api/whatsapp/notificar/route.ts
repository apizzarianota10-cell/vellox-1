import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("55")) return digits;
  return "55" + digits;
}

export async function POST(req: NextRequest) {
  try {
    const { pedido_id, tipo } = await req.json() as { pedido_id?: string; tipo?: "confirmacao" | "saiu_entrega" };
    if (!pedido_id) return NextResponse.json({ ok: false, error: "pedido_id required" }, { status: 400 });

    // Busca pedido
    const { data: pedido, error: errP } = await supabaseAdmin
      .from("pedidos")
      .select("id, empresa_id, cliente_nome, cliente_telefone, endereco_entrega, tipo_pedido, tracking_token")
      .eq("id", pedido_id)
      .single();

    if (errP || !pedido) return NextResponse.json({ ok: false, error: "pedido not found" }, { status: 404 });

    // Busca credenciais Z-API da empresa
    const { data: config } = await supabaseAdmin
      .from("configuracao_loja")
      .select("whatsapp_instance_id, whatsapp_token")
      .eq("empresa_id", pedido.empresa_id)
      .single();

    if (!config?.whatsapp_instance_id || !config?.whatsapp_token) {
      return NextResponse.json({ ok: false, error: "whatsapp not configured" });
    }

    const phone = normalizePhone(pedido.cliente_telefone);

    let message: string;
    if (tipo === "confirmacao") {
      const { data: empresa } = await supabaseAdmin
        .from("empresas")
        .select("nome")
        .eq("id", pedido.empresa_id)
        .single();
      const link = pedido.tracking_token
        ? `\n\nAcompanhe seu pedido em tempo real: https://www.appvellox.online/pedido/${pedido.tracking_token}`
        : "";
      message =
        `Olá ${pedido.cliente_nome}! ✅\n` +
        `Recebemos seu pedido na ${empresa?.nome ?? "loja"}!${link}\n\n` +
        `Obrigado pela preferência! 😊`;
    } else {
      const tipoMsg = pedido.tipo_pedido === "retirada"
        ? "está pronto para retirada"
        : "saiu para entrega e está a caminho";
      message =
        `Olá ${pedido.cliente_nome}! 🚀\n` +
        `Seu pedido ${tipoMsg}. Em breve chegará até você!\n\n` +
        `Obrigado pela preferência! 😊`;
    }

    const zApiUrl = `https://api.z-api.io/instances/${config.whatsapp_instance_id}/token/${config.whatsapp_token}/send-text`;
    const resp = await fetch(zApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, message }),
    });

    const zResult = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      return NextResponse.json({ ok: false, error: "z-api error", detail: zResult }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[whatsapp/notificar]", err);
    return NextResponse.json({ ok: false, error: "internal" }, { status: 500 });
  }
}
