import { denyUnless } from "@/components/layout/guard";
import { MembersScreen } from "@/components/pages/MembersScreen";

export const dynamic = "force-dynamic";

export default async function Page() {
  const denied = await denyUnless("aulas");
  if (denied) return denied;
  return <MembersScreen />;
}
