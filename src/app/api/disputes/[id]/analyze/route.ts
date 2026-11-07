import { json, rateLimit } from "@/lib/http";
import { enqueueAnalysis } from "@/lib/disputes/analyze";
import { getDispute } from "@/lib/disputes/store";

/** Retry / re-run analysis. */
export async function POST(req: Request, ctx: RouteContext<"/api/disputes/[id]/analyze">) {
  const limited = rateLimit(req, "analyze", 6);
  if (limited) return limited;
  const { id } = await ctx.params;
  const d = getDispute(id);
  if (!d) return json({ error: "Not found" }, 404);
  enqueueAnalysis(d.id);
  return json({ ok: true });
}
