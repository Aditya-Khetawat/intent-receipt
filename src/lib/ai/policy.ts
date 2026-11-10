import type { Analysis, CLASSIFICATIONS, SELLER_ACTIONS } from "./schemas";

// Decision policy (§10.3). The model picks classification and action as two separate
// fields, so nothing made them agree; code now checks the pair, as it checks citations.
// The analyst prompt states the same table; a test keeps the two in step.

type Classification = (typeof CLASSIFICATIONS)[number];
type SellerAction = (typeof SELLER_ACTIONS)[number];

export const ALLOWED_ACTIONS: Record<Classification, readonly SellerAction[]> = {
  AGENT_MISINTERPRETATION: ["ACCEPT_AND_REFUND"],
  BUYER_CHANGED_MIND: ["CONTEST"],
  ITEM_NOT_RECEIVED: ["ACCEPT_AND_REFUND"],
  ITEM_NOT_AS_DESCRIBED: ["ACCEPT_AND_REFUND", "OFFER_PARTIAL"],
  UNAUTHORIZED_USE_SUSPECTED: ["REQUEST_MORE_INFO", "ACCEPT_AND_REFUND"],
  MERCHANT_ERROR: ["ACCEPT_AND_REFUND", "OFFER_PARTIAL"],
  UNCLEAR: ["REQUEST_MORE_INFO", "OFFER_PARTIAL"],
};

/** The table as prompt lines, e.g. "- ITEM_NOT_RECEIVED → ACCEPT_AND_REFUND". */
export const policyLines = (): string[] => Object.entries(ALLOWED_ACTIONS).map(([c, actions]) => `- ${c} → ${actions.join(" or ")}`);

/** Ways the classification, agent_fault and action contradict each other; empty when they agree. */
export function checkDecision(o: Pick<Analysis, "classification" | "agent_fault" | "recommended_seller_action">): string[] {
  const issues: string[] = [];
  const allowed = ALLOWED_ACTIONS[o.classification];
  if (!allowed.includes(o.recommended_seller_action)) {
    issues.push(`${o.classification} allows ${allowed.join(" or ")}, but the action is ${o.recommended_seller_action}`);
  }
  if (o.classification === "AGENT_MISINTERPRETATION" && o.agent_fault === "NONE") {
    issues.push("AGENT_MISINTERPRETATION means the agent was at fault, but agent_fault is NONE");
  }
  if (o.classification === "BUYER_CHANGED_MIND" && o.agent_fault !== "NONE") {
    issues.push(`BUYER_CHANGED_MIND means the item matched what the buyer confirmed, but agent_fault is ${o.agent_fault}`);
  }
  if (o.agent_fault === "LIKELY" && o.recommended_seller_action === "CONTEST") {
    issues.push("agent_fault is LIKELY, so the seller should not CONTEST");
  }
  return issues;
}
