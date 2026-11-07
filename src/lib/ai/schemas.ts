import { z } from "zod";

export const CLASSIFICATIONS = [
  "AGENT_MISINTERPRETATION",
  "BUYER_CHANGED_MIND",
  "ITEM_NOT_RECEIVED",
  "ITEM_NOT_AS_DESCRIBED",
  "UNAUTHORIZED_USE_SUSPECTED",
  "MERCHANT_ERROR",
  "UNCLEAR",
] as const;

export const SELLER_ACTIONS = ["CONTEST", "ACCEPT_AND_REFUND", "OFFER_PARTIAL", "REQUEST_MORE_INFO"] as const;

export const evidenceSchema = z.object({
  id: z.string().describe("short id like e1, e2"),
  claim: z.string().describe("what this evidence shows, one sentence"),
  supports: z.enum(["BUYER", "SELLER", "NEUTRAL"]),
  pointer: z.string().describe("RFC 6901 JSON Pointer into CONTEXT, e.g. /intent/request/verbatim"),
  quoted_value: z.union([z.string(), z.number(), z.boolean()]).describe("exact value at the pointer"),
});

export const analysisSchema = z.object({
  classification: z.enum(CLASSIFICATIONS),
  confidence: z.number().min(0).max(1),
  agent_fault: z.enum(["NONE", "POSSIBLE", "LIKELY"]),
  recommended_seller_action: z.enum(SELLER_ACTIONS),
  summary: z.string(),
  evidence: z.array(evidenceSchema).min(1).max(10),
  buyer_view: z.string(),
  seller_view: z.string(),
  seller_response_draft: z.string(),
  buyer_message_draft: z.string(),
  uncertainties: z.array(z.string()),
});

export type Analysis = z.infer<typeof analysisSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;
