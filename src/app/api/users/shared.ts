import { ROLES, DEFAULT_PERMISSIONS, ALL_MODULE_KEYS, type RoleKey } from "@/lib/auth/modules";
import { hashPassword } from "@/lib/auth/password";

const ROLE_KEYS = ROLES.map((r) => r.key as string);

/** Monta os campos de usuário a partir do corpo da requisição */
export function userValues(body: Record<string, unknown>, partial = false) {
  const values: Record<string, unknown> = {};

  if (!partial || body.name !== undefined) {
    const name = String(body.name ?? "").trim();
    if (!name) return { error: "Informe o nome" } as const;
    values.name = name.slice(0, 150);
  }
  if (!partial || body.email !== undefined) {
    const email = String(body.email ?? "").trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) return { error: "E-mail inválido" } as const;
    values.email = email;
  }
  if (!partial || (body.password !== undefined && body.password !== "")) {
    const password = String(body.password ?? "");
    if (password.length < 6) return { error: "A senha precisa ter pelo menos 6 caracteres" } as const;
    values.passwordHash = hashPassword(password);
  }
  if (!partial || body.role !== undefined) {
    const role = String(body.role ?? "SELLER");
    if (!ROLE_KEYS.includes(role)) return { error: "Perfil inválido" } as const;
    values.role = role;
  }
  if (body.permissions !== undefined) {
    if (!Array.isArray(body.permissions)) return { error: "Permissões inválidas" } as const;
    values.permissions = body.permissions.filter((p) => (ALL_MODULE_KEYS as string[]).includes(String(p)));
  } else if (!partial) {
    values.permissions = DEFAULT_PERMISSIONS[(values.role as RoleKey) || "SELLER"];
  }
  if (body.sellerId !== undefined) values.sellerId = body.sellerId || null;
  if (body.active !== undefined) values.active = Boolean(body.active);
  return { values } as const;
}

export const publicUserColumns = {
  id: true,
  name: true,
  email: true,
  role: true,
  permissions: true,
  sellerId: true,
  accountId: true,
  active: true,
  lastLoginAt: true,
  createdAt: true,
} as const;
