import { json } from "@/lib/http";
import { disputeDetail } from "@/lib/views";

export async function GET(_req: Request, ctx: RouteContext<"/api/disputes/[id]">) {
  const { id } = await ctx.params;
  const d = disputeDetail(id);
  return d ? json(d) : json({ error: "Not found" }, 404);
}
