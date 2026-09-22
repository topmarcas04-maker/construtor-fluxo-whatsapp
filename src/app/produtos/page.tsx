import { denyUnless } from "@/components/layout/guard";
import { ProductsScreen } from "@/components/pages/ProductsScreen";

export const dynamic = "force-dynamic";

export default async function Page() {
  const denied = await denyUnless("produtos");
  if (denied) return denied;
  return <ProductsScreen />;
}
