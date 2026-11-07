import { json, rateLimit, requireDemoMode } from "@/lib/http";
import { getDb } from "@/lib/db";
import { resetDemoData } from "@/lib/seed";

export async function POST(req: Request) {
  const off = requireDemoMode();
  if (off) return off;
  const limited = rateLimit(req, "reset", 5);
  if (limited) return limited;
  resetDemoData(getDb());
  return json({ ok: true });
}
