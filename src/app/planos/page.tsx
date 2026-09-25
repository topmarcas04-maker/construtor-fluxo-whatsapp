import { denyUnless } from "@/components/layout/guard";
import { PlansScreen } from "@/components/pages/PlansScreen";

export const dynamic = "force-dynamic";

export default async function Page() {
  const denied = await denyUnless("planos");
  if (denied) return denied;
  return <PlansScreen />;
}
