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

// In-memory fixed-window rate limiter (per IP + bucket). Fine for a single instance.
const hits = new Map<string, { n: number; reset: number }>();

export function rateLimit(req: Request, bucket: string, limit: number, windowMs = 60_000): NextResponse | null {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const h = hits.get(key);
  if (!h || h.reset < now) {
    hits.set(key, { n: 1, reset: now + windowMs });
    return null;
  }
  h.n++;
  if (h.n > limit) return json({ error: "Too many requests. Please wait a minute." }, 429);
  return null;
}

/** dev/* routes exist only in demo mode. */
export function requireDemoMode(): NextResponse | null {
  return env.demoMode ? null : json({ error: "Not found" }, 404);
}
