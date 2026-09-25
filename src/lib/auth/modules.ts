/**
 * Menus (módulos) do painel. Seguro para o navegador.
 *
 * Como funciona a liberação:
 *  - A conta Master tem todos os menus (inclusive os que forem criados no futuro).
 *  - O Master escolhe quais menus cada Parceiro recebe.
 *  - O Parceiro escolhe, entre os dele, quais cada Cliente recebe.
 *  - Dentro de cada conta, o administrador escolhe o que cada usuário vê.
 * Para criar um menu novo basta adicioná-lo aqui: ele aparece na lista de liberação.
 */
export const MODULES = [
  { key: "visao-geral", label: "Visão Geral", href: "/visao-geral" },
  { key: "whatsapp", label: "WhatsApp", href: "/whatsapp" },
  { key: "redes-sociais", label: "Instagram e Facebook", href: "/redes-sociais" },
  { key: "leads", label: "Leads", href: "/leads" },
  { key: "agenda", label: "Agenda", href: "/agenda" },
  { key: "produtos", label: "Produtos", href: "/produtos" },
  { key: "chatbot", label: "Chatbot", href: "/chatbot" },
  { key: "disparos", label: "Disparos", href: "/disparos" },
  { key: "drive", label: "Drive", href: "/drive" },
  { key: "aulas", label: "Área de membros", href: "/aulas" },
  { key: "calls", label: "Calls", href: "/calls" },
  { key: "configuracoes", label: "Configurações", href: "/configuracoes" },
  { key: "parceiros", label: "Parceiros", href: "/parceiros" },
  { key: "planos", label: "Planos", href: "/planos" },
  { key: "permissoes", label: "Permissões", href: "/permissoes" },
  { key: "plataforma", label: "Plataforma", href: "/plataforma" },
] as const;

export type ModuleKey = (typeof MODULES)[number]["key"];
export const ALL_MODULE_KEYS: ModuleKey[] = MODULES.map((m) => m.key);

export type AccountType = "MASTER" | "PARTNER" | "CLIENT";

/** Rótulo do menu conforme o tipo de conta (Parceiro gerencia "Clientes") */
export function moduleLabel(key: string, accountType?: string) {
  if (key === "parceiros") return accountType === "PARTNER" ? "Clientes" : "Parceiros";
  return MODULES.find((m) => m.key === key)?.label || key;
}

/** Menus que fazem sentido para cada tipo de conta (Cliente não tem sub-clientes) */
export function modulesAllowedForType(type: AccountType): ModuleKey[] {
  // Cliente não cadastra outras contas: não tem Parceiros/Clientes nem Planos
  if (type === "CLIENT") return ALL_MODULE_KEYS.filter((k) => k !== "parceiros" && k !== "planos");
  return ALL_MODULE_KEYS;
}

export const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  MASTER: "Master",
  PARTNER: "Parceiro",
  CLIENT: "Cliente",
};

export const ROLES = [
  { key: "MASTER", label: "Administrador Master" },
  { key: "ADMIN", label: "Administrador" },
  { key: "SELLER", label: "Vendedor" },
] as const;

export type RoleKey = (typeof ROLES)[number]["key"];

/** Menus padrão ao criar um usuário de cada perfil */
export const DEFAULT_PERMISSIONS: Record<RoleKey, ModuleKey[]> = {
  MASTER: ALL_MODULE_KEYS,
  ADMIN: ALL_MODULE_KEYS,
  SELLER: ["leads", "agenda"],
};

export function roleLabel(role: string, accountType?: string) {
  if (role === "ADMIN" && accountType === "PARTNER") return "Administrador do Parceiro";
  if (role === "ADMIN" && accountType === "CLIENT") return "Administrador";
  return ROLES.find((r) => r.key === role)?.label || role;
}

/** O usuário (já com os menus efetivos calculados no servidor) tem acesso ao menu? */
export function hasModule(user: { modules: string[] } | null, module: ModuleKey) {
  return Boolean(user?.modules.includes(module));
}

export const AI_SOURCE_LABEL: Record<string, string> = {
  PARENT: "Usa a integração de IA de quem cadastrou",
  OWN: "Integração de IA própria (cadastra a chave)",
  NONE: "Sem IA",
};
