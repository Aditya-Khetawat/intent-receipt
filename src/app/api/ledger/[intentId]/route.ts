import { json } from "@/lib/http";
import { receiptView } from "@/lib/views";
import { chainForIntent } from "@/lib/ledger";

/**
 * In-browser verification data: the chain up to this receipt's last entry. Entries
 * of other receipts are headers only (body digest, hashes, signature), never content.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/ledger/[intentId]">) {
  const { intentId } = await ctx.params;
  const v = receiptView(intentId);
  if (!v) return json({ error: "Not found" }, 404);
  return json({ intent_id: intentId, entries: chainForIntent(intentId), server_verification: v.chain, key: v.key });
}
