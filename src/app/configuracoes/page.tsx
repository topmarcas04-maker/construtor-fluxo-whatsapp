import { denyUnless } from "@/components/layout/guard";
import { SettingsScreen } from "@/components/pages/SettingsScreen";

export const dynamic = "force-dynamic";

export default async function Page() {
  const denied = await denyUnless("configuracoes");
  if (denied) return denied;
  return <SettingsScreen />;
}
