import { z } from "zod";
import { json, errorResponse } from "@/lib/http";
import { confirmIntent } from "@/lib/intents";
import { assertOwnsIntent, sessionIdFrom } from "@/lib/session";
import { verifyConfirmation } from "@/lib/passkey/server";

// passkey: the WebAuthn assertion (AuthenticationResponseJSON); checked by verifyConfirmation.
const body = z.object({ presented_text: z.string().min(1).max(5000), client_nonce: z.string().min(8).max(64), passkey: z.any().optional() });

export async function POST(req: Request, ctx: RouteContext<"/api/intents/[id]/confirm">) {
  try {
    const { id } = await ctx.params;
    assertOwnsIntent(req, id);
    const { presented_text, client_nonce, passkey } = body.parse(await req.json());
    const proof = passkey ? await verifyConfirmation(sessionIdFrom(req)!, id, presented_text, passkey) : undefined;
    const intent = confirmIntent(id, presented_text, client_nonce, { passkey: proof });
    const c = intent.record.confirmation;
    return json({ id: intent.id, status: intent.status, method: c?.method, presented_text_sha256: c?.presented_text_sha256 });
  } catch (e) {
    return errorResponse(e);
  }
}
