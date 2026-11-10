import { json } from "@/lib/http";
import { buildEvidenceBundle } from "@/lib/evidence/bundle";
import { evidenceFileName, renderEvidencePdf } from "@/lib/evidence/pdf";

/**
 * The evidence pack for one receipt, public like the receipt itself: ?format=pdf (default, with the
 * signed JSON embedded) or ?format=json. ?inline=1 opens the PDF in the browser instead of downloading.
 */
export async function GET(req: Request, ctx: RouteContext<"/api/evidence/[intentId]">) {
  const { intentId } = await ctx.params;
  const bundle = buildEvidenceBundle(intentId);
  if (!bundle) return json({ error: "No confirmed receipt with this id" }, 404);
  const q = new URL(req.url).searchParams;
  const name = evidenceFileName(intentId);
  if (q.get("format") === "json") {
    return new Response(JSON.stringify(bundle, null, 1), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${name.replace(/\.pdf$/, ".json")}"`,
        "Cache-Control": "no-store",
      },
    });
  }
  return new Response(Buffer.from(await renderEvidencePdf(bundle)), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${q.get("inline") === "1" ? "inline" : "attachment"}; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
