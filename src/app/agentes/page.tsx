import { denyUnless } from "@/components/layout/guard";
import { AgentsScreen } from "@/components/pages/AgentsScreen";

export const dynamic = "force-dynamic";

export default async function Page() {
  const denied = await denyUnless("agentes");
  if (denied) return denied;
  return <AgentsScreen />;
}
