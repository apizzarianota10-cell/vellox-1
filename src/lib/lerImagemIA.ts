// Leitura de imagem (cardápio, lista de sabores, adicionais) pela IA, com
// resposta em JSON garantido por schema. Uso exclusivo no servidor.
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODELO = "claude-opus-5-5";
// Limite da API para imagem em base64 (~5 MB).
const MAX_BYTES = 5 * 1024 * 1024;
const TIPOS = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type TipoImagem = (typeof TIPOS)[number];

export class ErroLeitura extends Error {
  constructor(message: string, public status = 422) { super(message); }
}

/**
 * Envia a imagem com as instruções e devolve o objeto JSON validado pelo
 * schema. Erros viram ErroLeitura com mensagem pronta para o usuário.
 */
export async function lerImagemComIA<T>(file: File, instrucoes: string, schema: Record<string, unknown>): Promise<T> {
  if (!process.env.ANTHROPIC_API_KEY) throw new ErroLeitura("Leitura por imagem indisponível (chave da IA não configurada).", 503);

  const tipo = (TIPOS as readonly string[]).includes(file.type) ? (file.type as TipoImagem) : null;
  if (!tipo) throw new ErroLeitura("Formato de imagem não suportado. Use JPG, PNG ou WEBP.", 400);
  if (file.size > MAX_BYTES) throw new ErroLeitura("Imagem muito grande (máx. 5 MB). Tire um print ou uma foto menor.", 413);

  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");

  let message: Anthropic.Message;
  try {
    message = await anthropic.messages.create({
      model: MODELO,
      max_tokens: 16000,
      output_config: { effort: "low", format: { type: "json_schema", schema } },
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: tipo, data: base64 } },
          { type: "text", text: instrucoes },
        ],
      }],
    });
  } catch (err) {
    console.error("[lerImagemComIA] erro da API:", err);
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
      throw new ErroLeitura("A chave da IA foi recusada. Avise o suporte do Vellox.", 503);
    }
    if (err instanceof Anthropic.RateLimitError) throw new ErroLeitura("Muitas leituras ao mesmo tempo. Tente de novo em 1 minuto.", 429);
    if (err instanceof Anthropic.BadRequestError) {
      if (/credit balance/i.test(err.message)) throw new ErroLeitura("Leitura por imagem indisponível no momento (créditos da IA esgotados). Avise o suporte do Vellox.", 503);
      throw new ErroLeitura(`A imagem não pôde ser lida. Tente outra foto (JPG ou PNG). [${err.message.slice(0, 200)}]`, 400);
    }
    if (err instanceof Anthropic.APIError) throw new ErroLeitura("O serviço de leitura está instável. Tente de novo em instantes.", 502);
    throw new ErroLeitura("Não foi possível conectar ao serviço de leitura. Tente de novo.", 502);
  }

  if (message.stop_reason === "refusal") throw new ErroLeitura("A imagem não pôde ser processada. Tente outra foto.");
  if (message.stop_reason === "max_tokens") throw new ErroLeitura("Cardápio grande demais para uma foto só. Envie em partes (uma foto por seção).");

  const texto = message.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text ?? "";
  try {
    return JSON.parse(texto) as T;
  } catch {
    throw new ErroLeitura("Não foi possível ler a imagem. Tente uma foto mais nítida.");
  }
}
