import Link from "next/link";
import { ordersView } from "@/lib/views";
import { env } from "@/lib/env";
import { SourceBadge, money, shortDate, Badge } from "@/components/ui";
import { SimulateDisputeButton } from "@/components/SimulateDisputeButton";

export const dynamic = "force-dynamic";

export default function OrdersPage() {
  const orders = ordersView();
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Orders</h1>
      <p className="text-ink-2 mt-1">Every order links to an Intent Receipt. Seeded history is labelled SIMULATED.</p>
      {orders.length === 0 ? (
        <div className="card p-8 mt-6 text-center text-ink-2">
          No orders yet. <Link href="/shop" className="text-accent underline">Ask the agent to buy something</Link>.
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {orders.map((o) => (
            <li key={o.id} className="card p-4 grid md:grid-cols-[1fr_auto] gap-3 items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{o.product}</span>
                  <SourceBadge simulated={o.simulated} />
                  {o.scenario && <Badge tone="neutral">Scenario {o.scenario}</Badge>}
                  <Badge tone={o.status === "CAPTURED" ? "success" : "neutral"}>{o.status}</Badge>
                </div>
                <p className="text-sm text-ink-2 mt-1 truncate">
                  {o.buyer} asked: &ldquo;{o.request}&rdquo;
                </p>
                <p className="text-xs text-ink-3 mt-1">
                  {money(o.amount_cents / 100, o.currency)} · {shortDate(o.created_at)} · <span className="font-mono">{o.paypal_order_id}</span>
                </p>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Link href={`/receipt/${o.intent_id}`} className="btn btn-secondary">
                  Open receipt
                </Link>
                {o.dispute_id ? (
                  <Link href={`/merchant/disputes/${o.dispute_id}`} className="btn btn-ghost">
                    View dispute
                  </Link>
                ) : (
                  env.demoMode &&
                  o.paypal_capture_id && <SimulateDisputeButton scenario={o.scenario} orderId={o.id} />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
