import { denyUnless } from "@/components/layout/guard";
import { PermissionsScreen } from "@/components/pages/PermissionsScreen";

export const dynamic = "force-dynamic";

export default async function Page() {
  const denied = await denyUnless("permissoes");
  if (denied) return denied;
  return <PermissionsScreen />;
}
