// Reduz uma foto no navegador antes de enviar para a leitura por IA.
// Foto de celular passa fácil de 5 MB (limite da API) e de 4,5 MB (limite
// de envio da Vercel); 2000 px no maior lado continua legível para cardápio.

const MAX_LADO = 2000;
const QUALIDADE = 0.85;
const LIMITE_SEM_MEXER = 1.5 * 1024 * 1024;

export async function comprimirImagem(
  file: File,
  opcoes: { maxLado?: number; qualidade?: number; limiteSemMexer?: number } = {},
): Promise<File> {
  const MAX = opcoes.maxLado ?? MAX_LADO;
  const QUAL = opcoes.qualidade ?? QUALIDADE;
  const LIMITE = opcoes.limiteSemMexer ?? LIMITE_SEM_MEXER;
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const escala = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
    if (escala === 1 && file.size <= LIMITE) { bitmap.close(); return file; }

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * escala);
    canvas.height = Math.round(bitmap.height * escala);
    const ctx = canvas.getContext("2d");
    if (!ctx) { bitmap.close(); return file; }
    ctx.fillStyle = "#fff"; // PNG transparente vira fundo branco no JPEG
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, "image/jpeg", QUAL));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file; // navegador sem suporte: envia a original
  }
}
