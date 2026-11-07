import { json } from "@/lib/http";
import { cancelIntent } from "@/lib/intents";

export async function POST(_req: Request, ctx: RouteContext<"/api/intents/[id]/cancel">) {
  const { id } = await ctx.params;
  cancelIntent(id);
  return json({ ok: true });
}
