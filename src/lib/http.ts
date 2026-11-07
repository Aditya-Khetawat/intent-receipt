import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { env } from "@/lib/env";

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });

export function errorResponse(e: unknown, fallbackStatus = 500) {
  if (e instanceof ZodError) return json({ error: "Invalid request", issues: e.issues.slice(0, 5) }, 400);
  const err = e as Error & { status?: number };
  const name = err?.constructor?.name;
  const status = name === "GuardError" || name === "IntentError" ? 409 : (err.status ?? fallbackStatus);
  if (status >= 500) console.error("[intentreceipt]", err);
  return json({ error: err?.message ?? "Unexpected error" }, status >= 400 && status < 600 ? status : 500);
}

/**
 * Client IP for rate limiting, taken only from values a client cannot forge:
 * TRUSTED_CLIENT_IP_HEADER if the host is known to set it (e.g. cf-connecting-ip),
 * otherwise the RIGHTMOST X-Forwarded-For entry, which the closest proxy appends.
 * The leftmost entry is client-controlled when proxies append rather than replace.
 */
export function clientIp(headers: Headers): string {
  const trusted = process.env.TRUSTED_CLIENT_IP_HEADER?.trim().toLowerCase();
  if (trusted) {
    const v = headers.get(trusted)?.trim();
    if (v) return v;
  }
  const hops = headers
    .get("x-forwarded-for")
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return hops?.at(-1) || "local";
}

// In-memory fixed-window rate limiter. Fine for a single instance.
const hits = new Map<string, { n: number; reset: number }>();

function hit(key: string, limit: number, windowMs: number, now: number): boolean {
  const h = hits.get(key);
  if (!h || h.reset < now) {
    hits.set(key, { n: 1, reset: now + windowMs });
    return true;
  }
  h.n++;
  return h.n <= limit;
}

/** Per-IP limit plus a global cap per bucket (10x), so a spoofed or shared IP cannot exceed it. */
export function rateLimit(req: Request, bucket: string, limit: number, windowMs = 60_000): NextResponse | null {
  const now = Date.now();
  const okIp = hit(`${bucket}:ip:${clientIp(req.headers)}`, limit, windowMs, now);
  const okGlobal = hit(`${bucket}:global`, limit * 10, windowMs, now);
  if (!okIp || !okGlobal) return json({ error: "Too many requests. Please wait a minute." }, 429);
  return null;
}

/** Test helper. */
export function resetRateLimits() {
  hits.clear();
}

/** dev/* routes exist only in demo mode. */
export function requireDemoMode(): NextResponse | null {
  return env.demoMode ? null : json({ error: "Not found" }, 404);
}
