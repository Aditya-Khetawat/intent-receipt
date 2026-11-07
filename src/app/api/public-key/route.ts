import { json } from "@/lib/http";
import { publicKeyDocument } from "@/lib/ledger/keys";

export const dynamic = "force-dynamic";

/** Also served at /.well-known/intent-receipt-key.json (rewrite in next.config.ts). */
export function GET() {
  return json(publicKeyDocument());
}
