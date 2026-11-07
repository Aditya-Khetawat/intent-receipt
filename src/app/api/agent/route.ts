import { z } from "zod";
import { json, errorResponse, rateLimit } from "@/lib/http";
import { agentTurn } from "@/lib/ai/agent";
import { AiUnavailableError } from "@/lib/ai/provider";
import { getIntent, confirmationCard } from "@/lib/intents";

const body = z.object({ sessionId: z.string().max(64).nullable().optional(), message: z.string().min(1).max(600) });

export async function POST(req: Request) {
  const limited = rateLimit(req, "agent", 12);
  if (limited) return limited;
  try {
    const { sessionId, message } = body.parse(await req.json());
    const r = await agentTurn(sessionId ?? null, message);
    const intent = r.intentId ? getIntent(r.intentId) : null;
    return json({
      sessionId: r.sessionId,
      reply: r.reply,
      intent: intent && { id: intent.id, status: intent.status, card: confirmationCard(intent.record), record: intent.record },
    });
  } catch (e) {
    if (e instanceof AiUnavailableError) return json({ error: e.message, code: e.code }, 503);
    if (e instanceof Error && e.message.startsWith("AI_UNAVAILABLE")) {
      return json({ error: "The shopping agent's AI model is not configured on this server. Try the guided demo instead.", code: "NO_KEY" }, 503);
    }
    return errorResponse(e);
  }
}
