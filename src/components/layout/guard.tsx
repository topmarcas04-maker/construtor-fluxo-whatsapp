import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/server";
import { hasModule, type ModuleKey } from "@/lib/auth/modules";

/**
 * Usado no topo de cada página (componente de servidor).
 * Retorna um aviso de "sem permissão" ou null quando o acesso está liberado.
 */
export async function denyUnless(module: ModuleKey) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (hasModule(user, module)) return null;
  return (
    <div className="flex h-full items-center justify-center p-10">
      <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <ShieldAlert className="mx-auto mb-3 text-amber-500" size={36} />
        <p className="text-lg font-semibold text-slate-800">Sem permissão</p>
        <p className="mt-1 text-sm text-slate-500">
          Seu usuário não tem acesso a esta área. Peça ao administrador para liberar em Permissões.
        </p>
      </div>
    </div>
  );
}
