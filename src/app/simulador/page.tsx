import { denyUnless } from "@/components/layout/guard";
import { SimuladorScreen } from "@/components/pages/SimuladorScreen";

export const dynamic = "force-dynamic";

export default async function Page() {
  const denied = await denyUnless("simulador");
  if (denied) return denied;
  return <SimuladorScreen />;
}
