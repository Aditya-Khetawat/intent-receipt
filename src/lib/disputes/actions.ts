import { ulid } from "ulid";
import { z } from "zod";
import { getDb, nowIso } from "@/lib/db";
import { env } from "@/lib/env";
import { getAccessToken, PAYPAL_BASE, paypalFetch } from "@/lib/paypal/client";
import { getDispute, setDisputeStatus } from "./store";
import { getOrder } from "@/lib/paypal/orders";
import { buildEvidenceBundle } from "@/lib/evidence/bundle";
import { evidenceFileName, renderEvidencePdf } from "@/lib/evidence/pdf";
import { getEvidenceFile, storeEvidencePdf } from "@/lib/evidence/store";

// Merchant actions (§9.6). Invariant I4: nothing is sent to PayPal without an
// explicit human click; every request is stored as a preview BEFORE it is sent.

export const ACTION_TYPES = ["SEND_MESSAGE", "ACCEPT_CLAIM", "MAKE_OFFER", "PROVIDE_EVIDENCE"] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export const approveInputSchema = z.object({
  type: z.enum(ACTION_TYPES),
  seller_text: z.string().min(1).max(2000),
  buyer_text: z.string().max(2000).optional(),
  offer_amount: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  approved_by: z.string().min(1).max(80),
  human_confirmed: z.literal(true),
});

export type ApproveInput = z.infer<typeof approveInputSchema>;

export function actionForRecommendation(rec: string): ActionType {
  switch (rec) {
    case "ACCEPT_AND_REFUND":
      return "ACCEPT_CLAIM";
    case "OFFER_PARTIAL":
      return "MAKE_OFFER";
    case "REQUEST_MORE_INFO":
      return "SEND_MESSAGE";
    default:
      return "PROVIDE_EVIDENCE";
  }
}

/** A file sent as its own multipart part; the bytes live in evidence_files under sha256. */
export interface ActionAttachment {
  part: "evidence-file";
  name: string;
  content_type: "application/pdf";
  bytes: number;
  sha256: string;
}

export interface ActionRequest {
  method: string;
  path: string;
  contentType?: string;
  body: unknown;
  attachments?: ActionAttachment[];
}

export function buildActionRequest(
  paypalDisputeId: string,
  input: Omit<ApproveInput, "approved_by" | "human_confirmed">,
  currency: string,
  attachment?: { name: string; bytes: number; sha256: string },
): ActionRequest {
  const base = `/v1/customer/disputes/${encodeURIComponent(paypalDisputeId)}`;
  switch (input.type) {
    case "SEND_MESSAGE":
      return { method: "POST", path: `${base}/send-message`, body: { message: input.buyer_text || input.seller_text } };
    case "ACCEPT_CLAIM":
      return { method: "POST", path: `${base}/accept-claim`, body: { note: input.seller_text, accept_claim_type: "REFUND" } };
    case "MAKE_OFFER":
      return {
        method: "POST",
        path: `${base}/make-offer`,
        body: { note: input.seller_text, offer_type: "REFUND", offer_amount: { currency_code: currency, value: input.offer_amount ?? "0.00" } },
      };
    case "PROVIDE_EVIDENCE": {
      // PROOF_OF_FULFILLMENT expects carrier tracking; documents and notes go with the other types.
      const notes = input.seller_text.slice(0, 2000);
      if (!attachment) {
        return {
          method: "POST",
          path: `${base}/provide-evidence`,
          contentType: "multipart/form-data (part 'input' = JSON)",
          body: { evidences: [{ evidence_type: "PROOF_OF_RECEIPT_COPY", notes }] },
        };
      }
      return {
        method: "POST",
        path: `${base}/provide-evidence`,
        contentType: "multipart/form-data (part 'input' = JSON, part 'evidence-file' = PDF)",
        body: { evidences: [{ evidence_type: "PROOF_OF_RECEIPT_COPY", documents: [{ name: attachment.name }], notes }] },
        attachments: [{ part: "evidence-file", content_type: "application/pdf", ...attachment }],
      };
    }
  }
}

async function sendReal(req: ActionRequest): Promise<unknown> {
  if (req.path.endsWith("/provide-evidence")) {
    const token = await getAccessToken();
    const form = new FormData();
    form.append("input", new Blob([JSON.stringify(req.body)], { type: "application/json" }));
    for (const a of req.attachments ?? []) {
      const file = getEvidenceFile(a.sha256);
      if (!file) throw new Error(`Evidence file ${a.sha256} is missing`);
      form.append(a.part, new Blob([new Uint8Array(file.pdf)], { type: a.content_type }), a.name);
    }
    const res = await fetch(`${PAYPAL_BASE}${req.path}`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
    const text = await res.text();
    const body = text ? JSON.parse(text) : {};
    if (!res.ok) throw Object.assign(new Error(`PayPal provide-evidence failed (${res.status})`), { body });
    return body;
  }
  return paypalFetch(req.path, { method: req.method, body: req.body, requestId: `ir-act-${ulid()}` });
}

/** Renders and stores the pack for the disputed order's receipt; undefined when there is no signed receipt. */
async function evidenceFor(orderId: string | null) {
  const intentId = orderId ? getOrder(orderId)?.intent_id : null;
  const bundle = intentId ? buildEvidenceBundle(intentId) : null;
  if (!intentId || !bundle) return undefined;
  const name = evidenceFileName(intentId);
  return { name, ...storeEvidencePdf(intentId, name, await renderEvidencePdf(bundle)) };
}

export async function approveAction(disputeId: string, input: ApproveInput) {
  const d = getDispute(disputeId);
  if (!d) throw new Error("dispute not found");
  const req = buildActionRequest(
    d.paypal_dispute_id,
    input,
    d.currency,
    input.type === "PROVIDE_EVIDENCE" ? await evidenceFor(d.order_id) : undefined,
  );
  const simulated = d.simulated || !env.paypalConfigured;
  const id = `act_${ulid()}`;
  const db = getDb();
  // Store the exact request BEFORE sending.
  db.prepare(
    "INSERT INTO actions (id, dispute_id, type, request_preview_json, response_json, simulated, approved_by, created_at) VALUES (?, ?, ?, ?, NULL, ?, ?, ?)",
  ).run(id, d.id, input.type, JSON.stringify(req), simulated ? 1 : 0, input.approved_by, nowIso());

  let response: unknown;
  if (simulated) {
    response = { simulated: true, note: "Not sent: this dispute is simulated. This is the exact request that would be sent to PayPal." };
  } else {
    try {
      response = await sendReal(req);
    } catch (e) {
      response = { error: (e as Error).message, body: (e as { body?: unknown }).body ?? null };
      db.prepare("UPDATE actions SET response_json = ? WHERE id = ?").run(JSON.stringify(response), id);
      throw e;
    }
  }
  db.prepare("UPDATE actions SET response_json = ? WHERE id = ?").run(JSON.stringify(response), id);

  // Optional courtesy message to the buyer (also human-approved by the same click).
  if (input.buyer_text && input.type !== "SEND_MESSAGE") {
    const msgReq = buildActionRequest(d.paypal_dispute_id, { type: "SEND_MESSAGE", seller_text: input.buyer_text, buyer_text: input.buyer_text }, d.currency);
    const msgId = `act_${ulid()}`;
    db.prepare(
      "INSERT INTO actions (id, dispute_id, type, request_preview_json, response_json, simulated, approved_by, created_at) VALUES (?, ?, 'SEND_MESSAGE', ?, NULL, ?, ?, ?)",
    ).run(msgId, d.id, JSON.stringify(msgReq), simulated ? 1 : 0, input.approved_by, nowIso());
    let msgRes: unknown = { simulated: true, note: "Not sent: simulated dispute." };
    if (!simulated) {
      try {
        msgRes = await sendReal(msgReq);
      } catch (e) {
        msgRes = { error: (e as Error).message };
      }
    }
    db.prepare("UPDATE actions SET response_json = ? WHERE id = ?").run(JSON.stringify(msgRes), msgId);
  }
  setDisputeStatus(d.id, "SUBMITTED");
  return { id, simulated, request: req, response };
}
