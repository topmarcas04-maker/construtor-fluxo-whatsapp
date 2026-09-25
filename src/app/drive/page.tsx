import { denyUnless } from "@/components/layout/guard";
import { DriveScreen } from "@/components/pages/DriveScreen";

export const dynamic = "force-dynamic";

export default async function Page() {
  const denied = await denyUnless("drive");
  if (denied) return denied;
  return <DriveScreen />;
}
