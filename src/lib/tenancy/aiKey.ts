/**
 * Descobre qual chave de IA uma conta usa, seguindo a regra de herança:
 *  OWN    → chave cadastrada na própria conta (o Master também pode usar ANTHROPIC_API_KEY)
 *  PARENT → a chave que a conta mãe usa (subindo até achar)
 *  NONE   → sem IA
 * Sem imports "@/": usado também pelo motor.
 */
import { decryptSecret } from "./secret";

export interface AccountAiRow {
  id: string;
  parentId: string | null;
  type: string;
  name: string;
  aiSource: string;
  aiApiKeyEnc: string | null;
}

export interface AiKeyResolution {
  apiKey: string | null;
  /** Conta dona da chave usada */
  providerAccountId: string | null;
  providerAccountName: string | null;
  /** Motivo quando não há chave */
  reason: "OK" | "NONE" | "MISSING_KEY";
}

export async function resolveAiKey(
  accountId: string,
  loadAccount: (id: string) => Promise<AccountAiRow | null | undefined>,
  envKey = process.env.ANTHROPIC_API_KEY || ""
): Promise<AiKeyResolution> {
  let current = await loadAccount(accountId);
  for (let depth = 0; current && depth < 6; depth++) {
    if (current.aiSource === "NONE") {
      return { apiKey: null, providerAccountId: null, providerAccountName: null, reason: "NONE" };
    }
    if (current.aiSource === "OWN" || !current.parentId) {
      const own = decryptSecret(current.aiApiKeyEnc) || (current.type === "MASTER" ? envKey : "");
      return own
        ? { apiKey: own, providerAccountId: current.id, providerAccountName: current.name, reason: "OK" }
        : { apiKey: null, providerAccountId: current.id, providerAccountName: current.name, reason: "MISSING_KEY" };
    }
    current = await loadAccount(current.parentId);
  }
  return { apiKey: null, providerAccountId: null, providerAccountName: null, reason: "MISSING_KEY" };
}
