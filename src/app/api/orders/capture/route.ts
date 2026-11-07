import { z } from "zod";
import { json, errorResponse } from "@/lib/http";
import { captureOrderForIntent } from "@/lib/paypal/orders";
import { assertOwnsIntent } from "@/lib/session";

const body = z.object({ intentId: z.string().min(3).max(64), paypalOrderId: z.string().min(3).max(64) });

/** Called by the PayPal button's onApprove. Idempotent. */
export async function POST(req: Request) {
  try {
    const { intentId, paypalOrderId } = body.parse(await req.json());
    assertOwnsIntent(req, intentId);
    const order = await captureOrderForIntent(intentId, paypalOrderId);
    return json({ status: order.status, captureId: order.paypal_capture_id, simulated: order.simulated, receiptUrl: `/receipt/${intentId}` });
  } catch (e) {
    return errorResponse(e, 502);
  }
}
