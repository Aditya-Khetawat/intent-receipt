import { z } from "zod";
import { json, errorResponse, rateLimit, requireDemoMode } from "@/lib/http";
import { simulateDisputeForOrder, simulateScenarioDispute } from "@/lib/disputes/simulate";

const body = z.union([
  z.object({ scenario: z.enum(["S1", "S2", "S3", "S4"]) }),
  z.object({ orderId: z.string().min(3).max(64), claim: z.string().min(3).max(1000), reason: z.string().max(64).optional() }),
]);

export async function POST(req: Request) {
  const off = requireDemoMode();
  if (off) return off;
  const limited = rateLimit(req, "simulate", 20);
  if (limited) return limited;
  try {
    const b = body.parse(await req.json());
    const id = "scenario" in b ? await simulateScenarioDispute(b.scenario) : await simulateDisputeForOrder(b.orderId, b.claim, b.reason);
    return json({ disputeId: id, simulated: true });
  } catch (e) {
    return errorResponse(e, 400);
  }
}
