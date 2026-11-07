import { json } from "@/lib/http";
import { getIntent, confirmationCard } from "@/lib/intents";

export async function GET(_req: Request, ctx: RouteContext<"/api/intents/[id]">) {
  const { id } = await ctx.params;
  const intent = getIntent(id);
  if (!intent) return json({ error: "Not found" }, 404);
  return json({ id: intent.id, status: intent.status, card: confirmationCard(intent.record), record: intent.record });
}
