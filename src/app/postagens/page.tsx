import { denyUnless } from "@/components/layout/guard";
import { PostsScreen } from "@/components/pages/PostsScreen";

export const dynamic = "force-dynamic";

export default async function Page() {
  const denied = await denyUnless("postagens");
  if (denied) return denied;
  return <PostsScreen />;
}
