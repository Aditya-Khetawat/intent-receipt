import { json, errorResponse, rateLimit } from "@/lib/http";
import { assertOwnsIntent, sessionIdFrom } from "@/lib/session";
import { confirmOptions } from "@/lib/passkey/server";

/** Passkey request options whose challenge commits to this purchase's card text. */
export async function POST(req: Request, ctx: RouteContext<"/api/intents/[id]/passkey">) {
  const limited = rateLimit(req, "passkey", 20);
  if (limited) return limited;
  try {
    const { id } = await ctx.params;
    assertOwnsIntent(req, id);
    return json(await confirmOptions(sessionIdFrom(req)!, id));
  } catch (e) {
    return errorResponse(e);
  }
}
