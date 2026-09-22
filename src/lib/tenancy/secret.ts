/**
 * Criptografia das chaves de IA guardadas no banco (AES-256-GCM).
 * A chave de criptografia vem de ENCRYPTION_KEY ou, se não existir, do DATABASE_URL
 * (os dois serviços — site e motor — usam o mesmo banco, então chegam na mesma chave).
 * Sem imports "@/": usado também pelo motor.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function key() {
  const base = process.env.ENCRYPTION_KEY || process.env.DATABASE_URL || "dev";
  return createHash("sha256").update("sdr-secret:" + base).digest();
}

export function encryptSecret(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

export function decryptSecret(stored: string | null | undefined): string | null {
  if (!stored) return null;
  try {
    const [v, iv, tag, data] = stored.split(":");
    if (v !== "v1") return null;
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** Mostra só o final da chave: "sk-ant-…a1b2" */
export function maskKey(k: string | null) {
  if (!k) return null;
  return `${k.slice(0, 7)}…${k.slice(-4)}`;
}
