import { z } from "zod";
import { json, errorResponse, rateLimit } from "@/lib/http";
import { createOrderForIntent } from "@/lib/paypal/orders";

const body = z.object({ intentId: z.string().min(3).max(64) });

/** Called by the PayPal button's createOrder. Enforces invariant I1. */
export async function POST(req: Request) {
  const limited = rateLimit(req, "orders", 20);
  if (limited) return limited;
  try {
    const { intentId } = body.parse(await req.json());
    const order = await createOrderForIntent(intentId);
    return json({ id: order.paypal_order_id, simulated: order.simulated });
  } catch (e) {
    return errorResponse(e);
  }
}
