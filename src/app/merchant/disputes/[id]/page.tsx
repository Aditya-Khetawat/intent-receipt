import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { reasonLabel } from "@/components/ui";
import { disputeDetail } from "@/lib/views";
import { DisputeDetailClient } from "@/components/DisputeDetailClient";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/merchant/disputes/[id]">): Promise<Metadata> {
  const { id } = await params;
  const d = disputeDetail(id);
  return { title: d ? `${reasonLabel(d.dispute.reason)} · ${d.intent?.record.buyer.display_name ?? "Dispute"}` : "Dispute not found" };
}

export default async function DisputePage({ params }: PageProps<"/merchant/disputes/[id]">) {
  const { id } = await params;
  const d = disputeDetail(id);
  if (!d) notFound();
  return <DisputeDetailClient initial={d} />;
}
