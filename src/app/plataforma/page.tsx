import { denyUnless } from "@/components/layout/guard";
import { PlatformScreen } from "@/components/pages/PlatformScreen";

export const dynamic = "force-dynamic";

export default async function Page() {
  const denied = await denyUnless("plataforma");
  if (denied) return denied;
  return <PlatformScreen />;
}
