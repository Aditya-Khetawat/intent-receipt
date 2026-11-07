import { ulid } from "ulid";
import { z } from "zod";
import { getDb, nowIso } from "@/lib/db";
import { env } from "@/lib/env";
import { toolkitGetDispute } from "@/lib/paypal/toolkit";
import { paypalFetch } from "@/lib/paypal/client";
import { enqueueAnalysis } from "./analyze";
import { getDispute, setDisputeStatus } from "./store";

// Shape of PayPal webhook events we handle (validated with zod at the boundary).
export const webhookEventSchema = z
  .object({
    id: z.string(),
    event_type: z.string(),
    create_time: z.string().optional(),
    resource: z.record(z.string(), z.unknown()),
  })
  .passthrough();

export type WebhookEvent = z.infer<typeof webhookEventSchema>;

const disputeResourceSchema = z
  .object({
    dispute_id: z.string(),
    create_time: z.string().optional(),
    update_time: z.string().optional(),
    reason: z.string().default("OTHER"),
    status: z.string().optional(),
    dispute_amount: z.object({ currency_code: z.string(), value: z.string() }).optional(),
    disputed_transactions: z
      .array(z.object({ seller_transaction_id: z.string().optional(), custom: z.string().optional(), invoice_number: z.string().optional() }).passthrough())
      .optional(),
    messages: z.array(z.object({ posted_by: z.string().optional(), time_posted: z.string().optional(), content: z.string().optional() }).passthrough()).optional(),
  })
  .passthrough();

export const HANDLED_EVENTS = ["PAYMENT.CAPTURE.COMPLETED", "CUSTOMER.DISPUTE.CREATED", "CUSTOMER.DISPUTE.UPDATED", "CUSTOMER.DISPUTE.RESOLVED"];

// Rejected deliveries are never stored, so count them in memory (resets on restart).
export const rejectedWebhooks = { count: 0, lastAt: null as string | null };

/** Real (non-simulated) webhook deliveries, for /api/health. */
export function webhookStats() {
  const row = getDb()
    .prepare("SELECT COUNT(*) AS received, COALESCE(SUM(verified), 0) AS verified, MAX(received_at) AS lastAt FROM webhook_events WHERE simulated = 0")
    .get() as { received: number; verified: number; lastAt: string | null };
  return { ...row, rejected: rejectedWebhooks.count, lastRejectedAt: rejectedWebhooks.lastAt };
}

/** Records the event once (PayPal retries; dedupe on event id). Returns false for duplicates. */
export function recordWebhookEvent(event: WebhookEvent, verified: boolean, simulated: boolean): boolean {
  const res = getDb()
    .prepare(
      "INSERT OR IGNORE INTO webhook_events (id, paypal_event_id, event_type, verified, simulated, payload_json, received_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(`whe_${ulid()}`, event.id, event.event_type, verified ? 1 : 0, simulated ? 1 : 0, JSON.stringify(event), nowIso());
  return res.changes === 1;
}

function linkOrder(resource: z.infer<typeof disputeResourceSchema>): string | null {
  const db = getDb();
  for (const t of resource.disputed_transactions ?? []) {
    if (t.seller_transaction_id) {
      const o = db.prepare("SELECT id FROM orders WHERE paypal_capture_id = ?").get(t.seller_transaction_id) as { id: string } | undefined;
      if (o) return o.id;
    }
    const intentId = t.custom?.split(":")[0];
    if (intentId) {
      const o = db.prepare("SELECT id FROM orders WHERE intent_id = ? ORDER BY created_at DESC").get(intentId) as { id: string } | undefined;
      if (o) return o.id;
    }
  }
  return null;
}

async function fetchFullDispute(id: string): Promise<Record<string, unknown> | null> {
  if (!env.paypalConfigured) return null;
  try {
    return (await toolkitGetDispute(id)) as Record<string, unknown>;
  } catch {
    try {
      return await paypalFetch<Record<string, unknown>>(`/v1/customer/disputes/${encodeURIComponent(id)}`);
    } catch {
      return null;
    }
  }
}

/** The single ingest path used by real webhooks AND simulated disputes. */
export async function processWebhookEvent(event: WebhookEvent, opts: { simulated: boolean; scenario?: string | null }) {
  const db = getDb();
  if (event.event_type === "PAYMENT.CAPTURE.COMPLETED") {
    // Reconciliation only: captures are recorded synchronously by our capture route.
    db.prepare("UPDATE webhook_events SET processed_at = ? WHERE paypal_event_id = ?").run(nowIso(), event.id);
    return null;
  }
  if (!event.event_type.startsWith("CUSTOMER.DISPUTE.")) return null;

  let resource = disputeResourceSchema.parse(event.resource);
  if (!opts.simulated) {
    const full = await fetchFullDispute(resource.dispute_id);
    if (full) resource = disputeResourceSchema.parse({ ...resource, ...full });
  }
  const now = nowIso();
  const amountCents = Math.round(Number(resource.dispute_amount?.value ?? "0") * 100);
  const existing = getDispute(resource.dispute_id);
  let disputeId: string;
  if (existing) {
    disputeId = existing.id;
    db.prepare("UPDATE disputes SET payload_json = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(resource), now, disputeId);
  } else {
    disputeId = `dsp_${ulid()}`;
    db.prepare(
      `INSERT INTO disputes (id, paypal_dispute_id, order_id, status, reason, amount_cents, currency, payload_json, simulated, scenario, created_at, updated_at)
       VALUES (?, ?, ?, 'RECEIVED', ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      disputeId,
      resource.dispute_id,
      linkOrder(resource),
      resource.reason,
      amountCents,
      resource.dispute_amount?.currency_code ?? "USD",
      JSON.stringify(resource),
      opts.simulated ? 1 : 0,
      opts.scenario ?? null,
      resource.create_time ?? now,
      now,
    );
  }
  const has = db.prepare("SELECT 1 FROM dispute_messages WHERE dispute_id = ? AND content = ? AND posted_at = ?");
  const ins = db.prepare("INSERT INTO dispute_messages (id, dispute_id, author_role, content, posted_at) VALUES (?, ?, ?, ?, ?)");
  let newMessages = 0;
  for (const m of resource.messages ?? []) {
    if (!m.content) continue;
    const postedAt = m.time_posted ?? resource.create_time ?? now;
    if (has.get(disputeId, m.content, postedAt)) continue;
    ins.run(`dmsg_${ulid()}`, disputeId, (m.posted_by ?? "BUYER").toUpperCase(), m.content.slice(0, 4000), postedAt);
    newMessages++;
  }
  db.prepare("UPDATE webhook_events SET processed_at = ? WHERE paypal_event_id = ?").run(now, event.id);

  if (event.event_type === "CUSTOMER.DISPUTE.RESOLVED" || resource.status === "RESOLVED") {
    setDisputeStatus(disputeId, "RESOLVED");
  } else if (!existing || newMessages > 0) {
    enqueueAnalysis(disputeId);
  }
  return disputeId;
}
