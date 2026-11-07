import { json, errorResponse } from "@/lib/http";
import { cancelIntent } from "@/lib/intents";
import { assertOwnsIntent } from "@/lib/session";

export async function POST(req: Request, ctx: RouteContext<"/api/intents/[id]/cancel">) {
  try {
    const { id } = await ctx.params;
    assertOwnsIntent(req, id);
    cancelIntent(id);
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
