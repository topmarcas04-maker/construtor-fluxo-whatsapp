import { denyUnless } from "@/components/layout/guard";
import { OverviewScreen } from "@/components/pages/OverviewScreen";

export const dynamic = "force-dynamic";

export default async function Page() {
  const denied = await denyUnless("visao-geral");
  if (denied) return denied;
  return <OverviewScreen />;
}
