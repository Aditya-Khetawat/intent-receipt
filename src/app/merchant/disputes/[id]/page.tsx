import { notFound } from "next/navigation";
import { disputeDetail } from "@/lib/views";
import { DisputeDetailClient } from "@/components/DisputeDetailClient";

export const dynamic = "force-dynamic";

export default async function DisputePage({ params }: PageProps<"/merchant/disputes/[id]">) {
  const { id } = await params;
  const d = disputeDetail(id);
  if (!d) notFound();
  return <DisputeDetailClient initial={d} />;
}
