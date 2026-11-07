import { z } from "zod";
import { json, errorResponse } from "@/lib/http";
import { confirmIntent } from "@/lib/intents";
import { assertOwnsIntent } from "@/lib/session";

const body = z.object({ presented_text: z.string().min(1).max(5000), client_nonce: z.string().min(8).max(64) });

export async function POST(req: Request, ctx: RouteContext<"/api/intents/[id]/confirm">) {
  try {
    const { id } = await ctx.params;
    assertOwnsIntent(req, id);
    const { presented_text, client_nonce } = body.parse(await req.json());
    const intent = confirmIntent(id, presented_text, client_nonce);
    return json({ id: intent.id, status: intent.status, presented_text_sha256: intent.record.confirmation?.presented_text_sha256 });
  } catch (e) {
    return errorResponse(e);
  }
}
