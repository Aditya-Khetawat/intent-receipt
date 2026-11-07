import { getDb } from "@/lib/db";
import { entriesForIntent, verifyLedger } from "@/lib/ledger";
import { getIntent, confirmedRecord } from "@/lib/intents";
import { getOrder } from "@/lib/paypal/orders";
import { MERCHANT } from "@/lib/catalog/data";
import { disputeMessages, getDispute } from "./store";

/**
 * Assembles the single context object the analyst sees (invariant I3: the analyst
 * has no tools; this object is all it knows). Evidence pointers resolve into it.
 */
export function buildDisputeContext(disputeId: string) {
  const d = getDispute(disputeId);
  if (!d) throw new Error("dispute not found");
  const order = d.order_id ? getOrder(d.order_id) : null;
  const intentRow = order ? getIntent(order.intent_id) : null;
  const intent = intentRow ? (confirmedRecord(intentRow.id) ?? intentRow.record) : null;
  const ledgerEntries = intentRow ? entriesForIntent(intentRow.id) : [];
  const chain = verifyLedger();
  const fulfillment = order
    ? (getDb()
        .prepare("SELECT status, detail, occurred_at FROM fulfillment_events WHERE order_id = ? ORDER BY occurred_at, rowid")
        .all(order.id) as { status: string; detail: string; occurred_at: string }[])
    : [];
  const messages = disputeMessages(d.id);
  const payload = d.payload as { create_time?: string; messages?: unknown; reason?: string };
  const s = intent?.selection;

  return {
    dispute: {
      paypal_dispute_id: d.paypal_dispute_id,
      reason: d.reason,
      status: String((d.payload as { status?: string }).status ?? "OPEN"),
      amount: { value: (d.amount_cents / 100).toFixed(2), currency: d.currency },
      opened_at: payload.create_time ?? d.created_at,
      buyer_claim_text: messages.find((m) => m.author_role === "BUYER")?.content ?? "",
    },
    messages: messages.map((m) => ({ author_role: m.author_role, content: m.content, posted_at: m.posted_at })),
    order: order
      ? {
          paypal_order_id: order.paypal_order_id,
          paypal_capture_id: order.paypal_capture_id,
          status: order.status,
          items: s ? [{ name: s.product_name, sku: s.sku, quantity: s.quantity, unit_price: (s.price_cents / 100).toFixed(2) }] : [],
          amount: { value: (order.amount_cents / 100).toFixed(2), currency: order.currency },
          captured_at: ledgerEntries.find((e) => e.type === "CAPTURE_COMPLETED")?.created_at ?? null,
          simulated: order.simulated,
        }
      : null,
    intent,
    ledger: {
      verified: chain.ok,
      entries: ledgerEntries.map((e) => ({ seq: e.seq, type: e.type, hash: e.hash })),
    },
    fulfillment: { events: fulfillment },
    policy: { return_window_days: 30, seller_name: MERCHANT.name },
  };
}

export type DisputeContext = ReturnType<typeof buildDisputeContext>;
