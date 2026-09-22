import { denyUnless } from "@/components/layout/guard";
import { AccountsScreen } from "@/components/pages/AccountsScreen";

export const dynamic = "force-dynamic";

export default async function Page() {
  const denied = await denyUnless("parceiros");
  if (denied) return denied;
  return <AccountsScreen />;
}
