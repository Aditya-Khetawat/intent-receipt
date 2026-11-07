import { json } from "@/lib/http";
import { appStatus } from "@/lib/views";
import { verifyLedger } from "@/lib/ledger";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export function GET() {
  getDb();
  const s = appStatus();
  return json({ ok: true, ledger: verifyLedger().ok, demoMode: s.demoMode, paypalConfigured: s.paypal.configured, aiAvailable: s.ai.available });
}
