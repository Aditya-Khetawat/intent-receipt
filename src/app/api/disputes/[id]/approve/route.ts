import { json, errorResponse } from "@/lib/http";
import { approveAction, approveInputSchema } from "@/lib/disputes/actions";

/** Invariant I4: only reachable from an explicit human click in the console. */
export async function POST(req: Request, ctx: RouteContext<"/api/disputes/[id]/approve">) {
  try {
    const { id } = await ctx.params;
    const input = approveInputSchema.parse(await req.json());
    return json(await approveAction(id, input));
  } catch (e) {
    return errorResponse(e, 502);
  }
}
