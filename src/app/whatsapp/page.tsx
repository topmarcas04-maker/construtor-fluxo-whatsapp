import { denyUnless } from "@/components/layout/guard";
import { WhatsAppScreen } from "@/components/pages/WhatsAppScreen";

export const dynamic = "force-dynamic";

export default async function Page() {
  const denied = await denyUnless("whatsapp");
  if (denied) return denied;
  return <WhatsAppScreen />;
}
