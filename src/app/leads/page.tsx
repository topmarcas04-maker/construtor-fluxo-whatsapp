import { denyUnless } from "@/components/layout/guard";
import { LeadsScreen } from "@/components/pages/LeadsScreen";

export const dynamic = "force-dynamic";

export default async function Page() {
  const denied = await denyUnless("leads");
  if (denied) return denied;
  return <LeadsScreen />;
}
