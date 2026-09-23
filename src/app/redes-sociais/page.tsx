import { Suspense } from "react";
import { denyUnless } from "@/components/layout/guard";
import { SocialScreen } from "@/components/pages/SocialScreen";

export const dynamic = "force-dynamic";

export default async function Page() {
  const denied = await denyUnless("redes-sociais");
  if (denied) return denied;
  return (
    <Suspense>
      <SocialScreen />
    </Suspense>
  );
}
