import { denyUnless } from "@/components/layout/guard";
import { CallsScreen } from "@/components/pages/CallsScreen";

export const dynamic = "force-dynamic";

export default async function Page() {
  const denied = await denyUnless("calls");
  if (denied) return denied;
  return <CallsScreen />;
}
