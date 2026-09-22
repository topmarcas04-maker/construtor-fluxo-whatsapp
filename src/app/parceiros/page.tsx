import { denyUnless } from "@/components/layout/guard";
import { PartnersScreen } from "@/components/pages/PartnersScreen";

export const dynamic = "force-dynamic";

export default async function Page() {
  const denied = await denyUnless("parceiros");
  if (denied) return denied;
  return <PartnersScreen />;
}
