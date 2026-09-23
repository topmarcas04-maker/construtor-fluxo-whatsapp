import { denyUnless } from "@/components/layout/guard";
import { ChatbotScreen } from "@/components/pages/ChatbotScreen";

export const dynamic = "force-dynamic";

export default async function Page() {
  const denied = await denyUnless("chatbot");
  if (denied) return denied;
  return <ChatbotScreen />;
}
