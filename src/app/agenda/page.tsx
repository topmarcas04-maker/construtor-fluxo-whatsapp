import { denyUnless } from "@/components/layout/guard";
import { AgendaScreen } from "@/components/pages/AgendaScreen";

export const dynamic = "force-dynamic";

export default async function Page() {
  const denied = await denyUnless("agenda");
  if (denied) return denied;
  return <AgendaScreen />;
}
