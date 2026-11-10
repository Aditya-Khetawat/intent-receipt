import { json, errorResponse, rateLimit, requireDemoMode } from "@/lib/http";
import { createExampleProposal, ensureSession } from "@/lib/ai/agent";
import { confirmationCard } from "@/lib/intents";
import { sessionIdFrom, setSessionCookie } from "@/lib/session";

/** The S1 proposal without the AI, so the purchase flow stays demoable while the live agent is unavailable. */
export async function POST(req: Request) {
  const off = requireDemoMode();
  if (off) return off;
  const limited = rateLimit(req, "agent", 12);
  if (limited) return limited;
  try {
    const sessionId = ensureSession(sessionIdFrom(req));
    const intent = createExampleProposal(sessionId);
    return setSessionCookie(
      json({
        reply:
          "The live agent is unavailable, so here is the example proposal for this request, prepared without the AI. Its receipt says so.",
        request: intent.record.request.verbatim,
        intent: { id: intent.id, status: intent.status, card: confirmationCard(intent.record), record: intent.record },
      }),
      sessionId,
    );
  } catch (e) {
    return errorResponse(e);
  }
}
