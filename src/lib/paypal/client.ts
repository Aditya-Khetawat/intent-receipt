import { env, assertSandbox } from "@/lib/env";

export const PAYPAL_BASE = "https://api-m.sandbox.paypal.com";

const g = globalThis as unknown as { __ppToken?: { token: string; expiresAt: number } };

export class PayPalError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: unknown,
    public debugId?: string,
  ) {
    super(message);
  }
}

export class PayPalNotConfiguredError extends Error {
  constructor() {
    super("PayPal sandbox credentials are not configured (PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET).");
  }
}

export async function getAccessToken(): Promise<string> {
  assertSandbox();
  if (!env.paypalConfigured) throw new PayPalNotConfiguredError();
  const cached = g.__ppToken;
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const basic = Buffer.from(`${env.paypalClientId}:${env.paypalClientSecret}`).toString("base64");
  const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
  if (!res.ok || !body.access_token) {
    throw new PayPalError(`PayPal OAuth failed (${res.status})`, res.status, redact(body));
  }
  g.__ppToken = { token: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 300) * 1000 };
  return body.access_token;
}

function redact(body: unknown): unknown {
  if (body && typeof body === "object" && "access_token" in body) return { ...body, access_token: "[redacted]" };
  return body;
}

export async function paypalFetch<T = unknown>(
  path: string,
  init: { method?: string; body?: unknown; requestId?: string; headers?: Record<string, string> } = {},
): Promise<T> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
    ...init.headers,
  };
  if (init.requestId) headers["PayPal-Request-Id"] = init.requestId;
  let attempt = 0;
  for (;;) {
    const res = await fetch(`${PAYPAL_BASE}${path}`, {
      method: init.method ?? "GET",
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const text = await res.text();
    const body = text ? (JSON.parse(text) as unknown) : {};
    if (res.ok) return body as T;
    // Retry transient errors once; idempotency comes from PayPal-Request-Id.
    if ((res.status >= 500 || res.status === 429) && attempt < 1) {
      attempt++;
      await new Promise((r) => setTimeout(r, 800));
      continue;
    }
    const b = body as { message?: string; name?: string; details?: { issue?: string; description?: string }[]; debug_id?: string };
    const detail = b.details?.[0];
    throw new PayPalError(
      `PayPal ${init.method ?? "GET"} ${path} failed (${res.status}): ${detail?.issue ?? b.name ?? ""} ${detail?.description ?? b.message ?? ""}`.trim(),
      res.status,
      body,
      b.debug_id ?? res.headers.get("paypal-debug-id") ?? undefined,
    );
  }
}
