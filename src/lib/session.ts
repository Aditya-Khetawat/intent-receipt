import type { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getIntent } from "@/lib/intents";

// Demo buyer session (no accounts): an httpOnly cookie holding the agent session id.
// Intents created in a session can only be confirmed, cancelled, ordered and
// captured from the browser holding that cookie.

export const SESSION_COOKIE = "ir_sid";

export class OwnershipError extends Error {
  status = 403;
  constructor() {
    super("This purchase belongs to a different browser session.");
  }
}

export function sessionIdFrom(req: Request): string | null {
  const cookie = req.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === SESSION_COOKIE) return decodeURIComponent(v.join("=")) || null;
  }
  return null;
}

export function setSessionCookie(res: NextResponse, sessionId: string): NextResponse {
  res.cookies.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.nodeEnv === "production",
    path: "/",
    maxAge: 60 * 60 * 24,
  });
  return res;
}

/** Throws unless the intent was created in the requesting browser's session. */
export function assertOwnsIntent(req: Request, intentId: string): void {
  const intent = getIntent(intentId);
  if (!intent) return; // let the caller produce its own "not found"
  const sid = sessionIdFrom(req);
  if (!intent.session_id || !sid || intent.session_id !== sid) throw new OwnershipError();
}
