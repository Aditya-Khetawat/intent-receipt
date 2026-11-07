import type { Metadata } from "next";
import { appStatus, ordersView } from "@/lib/views";
import { SCENARIOS } from "@/lib/disputes/scenarios";
import { DemoRunner } from "@/components/DemoRunner";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Guided demo" };

export default function DemoPage() {
  const s = appStatus();
  const orders = ordersView();
  return (
    <DemoRunner
      demoMode={s.demoMode}
      paypalConfigured={s.paypal.configured}
      aiAvailable={s.ai.available}
      scenarios={SCENARIOS.map((x) => ({
        key: x.key,
        title: x.title,
        lookFor: x.lookFor,
        intentId: x.intentId,
        disputeId: orders.find((o) => o.intent_id === x.intentId)?.dispute_id ?? null,
      }))}
    />
  );
}
