import { ulid } from "ulid";
import { getDb, nowIso } from "@/lib/db";
import { getOrder, getOrderByIntent } from "@/lib/paypal/orders";
import { getIntent } from "@/lib/intents";
import { processWebhookEvent, recordWebhookEvent, type WebhookEvent } from "./ingest";
import { scenarioByKey, type ScenarioKey } from "./scenarios";

const addDays = (iso: string, d: number) => new Date(new Date(iso).getTime() + d * 86_400_000).toISOString();

/**
 * Builds a CUSTOMER.DISPUTE.CREATED event shaped like PayPal's (field names from the
 * Disputes v1 / Webhooks v1 specs) and feeds it through the same ingest as real
 * webhooks, flagged simulated.
 */
export function buildSimulatedDisputeEvent(opts: {
  orderId: string;
  reason: string;
  messages: string[];
  createTime: string;
}): WebhookEvent {
  const order = getOrder(opts.orderId);
  if (!order) throw new Error("order not found");
  const intent = getIntent(order.intent_id)!;
  const disputeId = `PP-D-SIM-${ulid().slice(-10)}`;
  return {
    id: `WH-SIM-${ulid()}`,
    event_type: "CUSTOMER.DISPUTE.CREATED",
    create_time: opts.createTime,
    resource_type: "dispute",
    summary: "A new dispute was opened (simulated)",
    resource: {
      dispute_id: disputeId,
      create_time: opts.createTime,
      update_time: opts.createTime,
      reason: opts.reason,
      status: "WAITING_FOR_SELLER_RESPONSE",
      dispute_state: "REQUIRED_ACTION",
      dispute_life_cycle_stage: "INQUIRY",
      dispute_channel: "INTERNAL",
      dispute_amount: { currency_code: order.currency, value: (order.amount_cents / 100).toFixed(2) },
      disputed_transactions: [
        {
          seller_transaction_id: order.paypal_capture_id ?? undefined,
          custom: `${intent.id}:`,
          gross_amount: { currency_code: order.currency, value: (order.amount_cents / 100).toFixed(2) },
        },
      ],
      messages: opts.messages.map((content, i) => ({
        posted_by: "BUYER",
        time_posted: addDays(opts.createTime, i * 0.01),
        content,
      })),
    },
  };
}

export async function simulateScenarioDispute(key: ScenarioKey) {
  const s = scenarioByKey(key);
  if (!s) throw new Error("unknown scenario");
  const order = getOrderByIntent(s.intentId);
  if (!order) throw new Error("scenario order not seeded; reset demo data");
  const open = getDb().prepare("SELECT id FROM disputes WHERE order_id = ? AND status != 'RESOLVED'").get(order.id) as { id: string } | undefined;
  if (open) return open.id;
  const event = buildSimulatedDisputeEvent({
    orderId: order.id,
    reason: s.dispute.reason,
    messages: s.dispute.messages,
    createTime: addDays(s.createdAt, s.dispute.offsetDays),
  });
  recordWebhookEvent(event, false, true);
  return processWebhookEvent(event, { simulated: true, scenario: s.key });
}

/** Generic simulated dispute for any captured order (e.g. a real sandbox order made in /shop). */
export async function simulateDisputeForOrder(orderId: string, claim: string, reason = "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED") {
  const order = getOrder(orderId);
  if (!order?.paypal_capture_id) throw new Error("Only captured orders can be disputed");
  const event = buildSimulatedDisputeEvent({ orderId, reason, messages: [claim.slice(0, 1000)], createTime: nowIso() });
  recordWebhookEvent(event, false, true);
  return processWebhookEvent(event, { simulated: true, scenario: null });
}
