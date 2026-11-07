import { json } from "@/lib/http";
import { receiptView } from "@/lib/views";
import { allEntries } from "@/lib/ledger";

/** Raw ledger data for in-browser verification: the whole chain up to this receipt's last entry. */
export async function GET(_req: Request, ctx: RouteContext<"/api/ledger/[intentId]">) {
  const { intentId } = await ctx.params;
  const v = receiptView(intentId);
  if (!v) return json({ error: "Not found" }, 404);
  const last = v.entries.at(-1)?.seq ?? 0;
  return json({ intent_id: intentId, entries: allEntries().filter((e) => e.seq <= last), server_verification: v.chain, key: v.key });
}
