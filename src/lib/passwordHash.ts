import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

// Hash server-side only (API routes) — sem dependência nova, usa o scrypt
// nativo do Node. Formato guardado: "salt:hashHex".
export function hashPassword(senha: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(senha, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(senha: string, stored: string): boolean {
  const [salt, hashHex] = stored.split(":");
  if (!salt || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(senha, salt, 64);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}
