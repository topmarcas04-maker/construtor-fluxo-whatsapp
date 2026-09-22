import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/server";
import { MODULES, hasModule } from "@/lib/auth/modules";

export const dynamic = "force-dynamic";

/** Página inicial: leva para o primeiro módulo liberado do usuário */
export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const first = MODULES.find((m) => hasModule(user, m.key));
  redirect(first?.href || "/login");
}
