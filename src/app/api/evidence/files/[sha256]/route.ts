import { json } from "@/lib/http";
import { getEvidenceFile } from "@/lib/evidence/store";

/** The exact evidence PDF an approved action attached, by its SHA-256. */
export async function GET(_req: Request, ctx: RouteContext<"/api/evidence/files/[sha256]">) {
  const { sha256 } = await ctx.params;
  const file = getEvidenceFile(sha256);
  if (!file) return json({ error: "Not found" }, 404);
  return new Response(new Uint8Array(file.pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${file.name}"`,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
