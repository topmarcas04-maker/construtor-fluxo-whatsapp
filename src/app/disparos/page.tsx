import { denyUnless } from "@/components/layout/guard";
import { BroadcastsScreen } from "@/components/pages/BroadcastsScreen";

export const dynamic = "force-dynamic";

export default async function Page() {
  const denied = await denyUnless("disparos");
  if (denied) return denied;
  return <BroadcastsScreen />;
}
