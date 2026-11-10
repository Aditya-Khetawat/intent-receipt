import { z } from "zod";
import { json, errorResponse, rateLimit } from "@/lib/http";
import { sessionIdFrom } from "@/lib/session";
import { registrationOptions, verifyRegistration } from "@/lib/passkey/server";

const body = z.union([z.object({ step: z.literal("options") }), z.object({ step: z.literal("verify"), response: z.any() })]);

/** Creates a passkey for this browser session: { step: "options" }, then { step: "verify", response }. */
export async function POST(req: Request) {
  const limited = rateLimit(req, "passkey", 20);
  if (limited) return limited;
  try {
    const sid = sessionIdFrom(req);
    if (!sid) return json({ error: "Start a purchase in this browser first." }, 400);
    const b = body.parse(await req.json());
    return json(b.step === "options" ? await registrationOptions(sid) : await verifyRegistration(sid, b.response));
  } catch (e) {
    return errorResponse(e);
  }
}
