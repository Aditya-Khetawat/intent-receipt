import { env } from "@/lib/env";
import { paypalFetch } from "./client";

export interface WebhookHeaders {
  "paypal-auth-algo": string | null;
  "paypal-cert-url": string | null;
  "paypal-transmission-id": string | null;
  "paypal-transmission-sig": string | null;
  "paypal-transmission-time": string | null;
}

export type VerifyFn = (body: unknown) => Promise<{ verification_status: string }>;

const defaultVerify: VerifyFn = (body) =>
  paypalFetch<{ verification_status: string }>("/v1/notifications/verify-webhook-signature", { method: "POST", body });

/**
 * Verifies a webhook with PayPal's verify-webhook-signature API (fields verified
 * against the Webhooks v1 OpenAPI spec). Returns false on any failure.
 * `WEBHOOK_VERIFY=off` is honoured only when NODE_ENV=development.
 */
export async function verifyWebhook(
  headers: WebhookHeaders,
  event: unknown,
  verify: VerifyFn = defaultVerify,
): Promise<{ verified: boolean; skipped: boolean; reason?: string }> {
  if (!env.webhookVerify) {
    console.warn("[intentreceipt] WARNING: webhook signature verification is OFF (development only)");
    return { verified: false, skipped: true, reason: "verification disabled in development" };
  }
  if (!env.paypalWebhookId) return { verified: false, skipped: false, reason: "PAYPAL_WEBHOOK_ID not configured" };
  const missing = Object.entries(headers).filter(([, v]) => !v);
  if (missing.length) return { verified: false, skipped: false, reason: `missing headers: ${missing.map(([k]) => k).join(", ")}` };
  try {
    const res = await verify({
      auth_algo: headers["paypal-auth-algo"],
      cert_url: headers["paypal-cert-url"],
      transmission_id: headers["paypal-transmission-id"],
      transmission_sig: headers["paypal-transmission-sig"],
      transmission_time: headers["paypal-transmission-time"],
      webhook_id: env.paypalWebhookId,
      webhook_event: event,
    });
    return res.verification_status === "SUCCESS"
      ? { verified: true, skipped: false }
      : { verified: false, skipped: false, reason: `verification_status=${res.verification_status}` };
  } catch (e) {
    return { verified: false, skipped: false, reason: (e as Error).message };
  }
}

export function pickWebhookHeaders(h: Headers): WebhookHeaders {
  return {
    "paypal-auth-algo": h.get("paypal-auth-algo"),
    "paypal-cert-url": h.get("paypal-cert-url"),
    "paypal-transmission-id": h.get("paypal-transmission-id"),
    "paypal-transmission-sig": h.get("paypal-transmission-sig"),
    "paypal-transmission-time": h.get("paypal-transmission-time"),
  };
}
