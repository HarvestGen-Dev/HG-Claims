import { redirect } from "next/navigation";

// Keep old bookmarks working after removal of the per-claim Print feature.
export default async function FormerPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/claims/${encodeURIComponent(id)}`);
}
