import { json } from "@/lib/http";
import { pickWebhookHeaders, verifyWebhook } from "@/lib/paypal/webhooks";
import { HANDLED_EVENTS, processWebhookEvent, recordWebhookEvent, rejectedWebhooks, webhookEventSchema } from "@/lib/disputes/ingest";
import { nowIso } from "@/lib/db";

export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }
  const parsed = webhookEventSchema.safeParse(raw);
  if (!parsed.success) return json({ error: "not a PayPal webhook event" }, 400);
  const v = await verifyWebhook(pickWebhookHeaders(req.headers), raw);
  if (!v.verified && !v.skipped) {
    console.warn(`[intentreceipt] rejected webhook ${parsed.data.id}: ${v.reason}`);
    rejectedWebhooks.count++;
    rejectedWebhooks.lastAt = nowIso();
    return json({ error: "signature verification failed" }, 400);
  }
  const fresh = recordWebhookEvent(parsed.data, v.verified, false);
  if (fresh && HANDLED_EVENTS.includes(parsed.data.event_type)) {
    // Respond fast; process asynchronously in-process.
    void processWebhookEvent(parsed.data, { simulated: false }).catch((e) => console.error("[intentreceipt] webhook processing failed", e));
  }
  return json({ ok: true, duplicate: !fresh });
}
