import { json } from "@/lib/http";
import { disputeQueue, merchantMetrics } from "@/lib/views";

export const dynamic = "force-dynamic";

export function GET() {
  return json({ rows: disputeQueue(), metrics: merchantMetrics() });
}
