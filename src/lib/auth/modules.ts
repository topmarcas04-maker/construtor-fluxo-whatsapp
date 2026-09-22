/** Módulos do painel — usados no menu lateral e nas permissões. Seguro para o navegador. */
export const MODULES = [
  { key: "whatsapp", label: "WhatsApp", href: "/whatsapp" },
  { key: "leads", label: "Leads", href: "/leads" },
  { key: "configuracoes", label: "Configurações", href: "/configuracoes" },
  { key: "parceiros", label: "Parceiros", href: "/parceiros" },
  { key: "permissoes", label: "Permissões", href: "/permissoes" },
  { key: "plataforma", label: "Plataforma", href: "/plataforma" },
] as const;

export type ModuleKey = (typeof MODULES)[number]["key"];

export const ROLES = [
  { key: "MASTER", label: "Administrador Master" },
  { key: "ADMIN", label: "Administrador" },
  { key: "SELLER", label: "Vendedor" },
  { key: "PARTNER", label: "Parceiro" },
] as const;

export type RoleKey = (typeof ROLES)[number]["key"];

/** Módulos padrão ao criar um usuário de cada perfil */
export const DEFAULT_PERMISSIONS: Record<RoleKey, ModuleKey[]> = {
  MASTER: MODULES.map((m) => m.key),
  ADMIN: ["whatsapp", "leads", "configuracoes", "parceiros"],
  SELLER: ["leads"],
  PARTNER: ["leads"],
};

export function roleLabel(role: string) {
  return ROLES.find((r) => r.key === role)?.label || role;
}

export function hasModule(user: { role: string; permissions: string[] } | null, module: ModuleKey) {
  if (!user) return false;
  if (user.role === "MASTER") return true;
  return user.permissions.includes(module);
}
