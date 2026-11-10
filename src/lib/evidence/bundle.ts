import { getDb, nowIso } from "@/lib/db";
import { env } from "@/lib/env";
import { chainForIntent, entriesForIntent } from "@/lib/ledger";
import { publicKeyDocument } from "@/lib/ledger/keys";
import type { IntentRecord } from "@/lib/intents";
import { getOrderByIntent } from "@/lib/paypal/orders";
import { EVIDENCE_SCHEMA, type EvidenceBundle } from "./types";

/** Everything a third party needs to check one receipt. Null until the buyer has confirmed. */
export function buildEvidenceBundle(intentId: string, opts: { now?: string } = {}): EvidenceBundle | null {
  const own = entriesForIntent(intentId);
  const confirmed = own.find((e) => e.type === "INTENT_CONFIRMED");
  if (!confirmed) return null;
  const record = (confirmed.payload as { intent_record: IntentRecord }).intent_record;
  const created = own.find((e) => e.type === "ORDER_CREATED")?.payload as
    { paypal_order_id: string; custom_id: string; amount: { value: string; currency_code: string }; simulated: boolean } | undefined;
  const order = getOrderByIntent(intentId);
  const fulfillment = order
    ? (getDb()
        .prepare(
          "SELECT status, detail, carrier, tracking_no, occurred_at FROM fulfillment_events WHERE order_id = ? ORDER BY occurred_at, rowid",
        )
        .all(order.id) as EvidenceBundle["fulfillment"])
    : [];
  const key = publicKeyDocument();
  const base = env.appBaseUrl.replace(/\/$/, "");
  return {
    schema: EVIDENCE_SCHEMA,
    generated_at: opts.now ?? nowIso(),
    intent_id: intentId,
    simulated: order?.simulated ?? created?.simulated ?? true,
    receipt_url: `${base}/receipt/${intentId}`,
    verify_url: `${base}/verify`,
    intent_record: record,
    order: created
      ? {
          paypal_order_id: created.paypal_order_id,
          paypal_capture_id: order?.paypal_capture_id ?? null,
          custom_id: created.custom_id,
          amount: { value: created.amount.value, currency_code: created.amount.currency_code },
        }
      : null,
    fulfillment,
    ledger: {
      entries: chainForIntent(intentId),
      key: { key_id: key.key_id, algorithm: "Ed25519", jwk: key.jwk },
    },
  };
}
