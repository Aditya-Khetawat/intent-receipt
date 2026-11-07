// Read models shared by API routes and server components.
import { getDb } from "@/lib/db";
import { env } from "@/lib/env";
import { aiStatus, callsToday } from "@/lib/ai/provider";
import { detectInstructionLikeText } from "@/lib/ai/validator";
import { buildDisputeContext } from "@/lib/disputes/context";
import { healStuck } from "@/lib/disputes/analyze";
import { actionForRecommendation, buildActionRequest } from "@/lib/disputes/actions";
import { disputeMessages, getDispute, latestAnalysis, listActions, listDisputes } from "@/lib/disputes/store";
import { scenarioByKey } from "@/lib/disputes/scenarios";
import { resolvePointer } from "@/lib/ai/validator";
import { getIntent, confirmationCard } from "@/lib/intents";
import { getOrder, getOrderByIntent } from "@/lib/paypal/orders";
import { entriesForIntent, verifyLedger } from "@/lib/ledger";
import { publicKeyDocument } from "@/lib/ledger/keys";

export function appStatus() {
  const ai = aiStatus();
  return {
    demoMode: env.demoMode,
    paypal: { configured: env.paypalConfigured, env: env.paypalEnv, webhookConfigured: env.paypalWebhookId !== "" },
    ai: { ...ai, callsToday: callsToday(), dailyBudget: env.aiDailyBudgetCalls },
  };
}

export function disputeQueue() {
  healStuck();
  return listDisputes().map((d) => {
    const a = latestAnalysis(d.id);
    const order = d.order_id ? getOrder(d.order_id) : null;
    const intent = order ? getIntent(order.intent_id) : null;
    return {
      id: d.id,
      paypal_dispute_id: d.paypal_dispute_id,
      buyer: intent?.record.buyer.display_name ?? "Unknown",
      product: intent?.record.selection.product_name ?? "Unlinked order",
      amount: d.amount_cents / 100,
      currency: d.currency,
      reason: d.reason,
      status: d.status,
      simulated: d.simulated,
      scenario: d.scenario,
      classification: a?.output.classification ?? null,
      confidence: a?.output.confidence ?? null,
      agent_fault: a?.output.agent_fault ?? null,
      recommended_action: a?.output.recommended_seller_action ?? null,
      cached: a?.cached ?? false,
      verified: a ? a.validation.verified : null,
      evidence_total: a ? a.validation.verified + a.validation.failed : null,
      analysis_ms: a?.duration_ms ?? null,
      opened_at: d.created_at,
      error: d.error,
    };
  });
}

export type QueueRow = ReturnType<typeof disputeQueue>[number];

export function disputeDetail(id: string) {
  healStuck();
  const d = getDispute(id);
  if (!d) return null;
  const order = d.order_id ? getOrder(d.order_id) : null;
  const intent = order ? getIntent(order.intent_id) : null;
  const context = buildDisputeContext(d.id);
  const a = latestAnalysis(d.id);
  const verifiedIds = new Set(a?.validation.items.filter((i) => i.ok).map((i) => i.id) ?? []);
  const evidence =
    a?.output.evidence
      .filter((e) => verifiedIds.has(e.id))
      .map((e) => {
        const r = resolvePointer(context, e.pointer);
        return { ...e, source_value: r.found ? r.value : null };
      }) ?? [];
  // Citations the code rejected stay inspectable: the claim, where it pointed and why it failed.
  const failedReasons = new Map(a?.validation.items.filter((i) => !i.ok).map((i) => [i.id, i.reason ?? "did not match the source"]) ?? []);
  const rejected =
    a?.output.evidence
      .filter((e) => failedReasons.has(e.id))
      .map((e) => ({ id: e.id, claim: e.claim, pointer: e.pointer, reason: failedReasons.get(e.id)! })) ?? [];
  const recommendedAction = a ? actionForRecommendation(a.output.recommended_seller_action) : "PROVIDE_EVIDENCE";
  const previewFor = (type: ReturnType<typeof actionForRecommendation>) =>
    buildActionRequest(
      d.paypal_dispute_id,
      {
        type,
        seller_text: a?.output.seller_response_draft ?? "",
        buyer_text: a?.output.buyer_message_draft,
        offer_amount: (d.amount_cents / 200).toFixed(2),
      },
      d.currency,
    );
  const timeline = [
    ...entriesForIntent(intent?.id ?? "").map((e) => ({
      at: e.created_at,
      kind: "ledger",
      label: e.type,
      detail: `seq ${e.seq} · ${e.hash.slice(0, 12)}…`,
    })),
    ...context.fulfillment.events.map((f) => ({ at: f.occurred_at, kind: "fulfillment", label: f.status, detail: f.detail })),
    { at: d.created_at, kind: "dispute", label: "DISPUTE_OPENED", detail: d.reason },
  ].sort((x, y) => x.at.localeCompare(y.at));

  return {
    dispute: {
      id: d.id,
      paypal_dispute_id: d.paypal_dispute_id,
      reason: d.reason,
      status: d.status,
      amount: d.amount_cents / 100,
      currency: d.currency,
      simulated: d.simulated,
      scenario: d.scenario,
      scenarioInfo: d.scenario ? scenarioByKey(d.scenario) : null,
      error: d.error,
      opened_at: d.created_at,
    },
    messages: disputeMessages(d.id).map((m) => ({ ...m, instruction_like: detectInstructionLikeText(m.content) })),
    order: order && { ...order },
    intent: intent && {
      id: intent.id,
      record: intent.record,
      card:
        intent.record.confirmation?.presented_text ??
        confirmationCard(intent.record)
          .map((l) => l.text)
          .join("\n"),
    },
    ledgerOk: verifyLedger().ok,
    timeline,
    analysis: a && {
      id: a.id,
      provider: a.provider,
      model: a.model,
      prompt_version: a.prompt_version,
      input_sha256: a.input_sha256,
      cached: a.cached,
      cache_origin: a.cache_origin,
      created_at: a.created_at,
      duration_ms: a.duration_ms,
      output: { ...a.output, evidence },
      rejected,
      validation: a.validation,
    },
    recommendedAction,
    previews: {
      PROVIDE_EVIDENCE: previewFor("PROVIDE_EVIDENCE"),
      ACCEPT_CLAIM: previewFor("ACCEPT_CLAIM"),
      MAKE_OFFER: previewFor("MAKE_OFFER"),
      SEND_MESSAGE: previewFor("SEND_MESSAGE"),
    },
    actions: listActions(d.id),
  };
}

export type DisputeDetail = NonNullable<ReturnType<typeof disputeDetail>>;

export function receiptView(intentId: string) {
  const intent = getIntent(intentId);
  if (!intent) return null;
  const entries = entriesForIntent(intentId);
  return {
    intent,
    card: confirmationCard(intent.record),
    order: getOrderByIntent(intentId),
    entries,
    // The whole chain is verified (each receipt's integrity depends on its predecessors).
    chain: verifyLedger(),
    key: publicKeyDocument(),
  };
}

export function merchantMetrics() {
  const q = disputeQueue();
  const analyzed = q.filter((r) => r.classification);
  const sum = (f: (r: QueueRow) => number) => analyzed.reduce((s, r) => s + f(r), 0);
  const totalEv = sum((r) => r.evidence_total ?? 0);
  const byAction: Record<string, number> = {};
  for (const r of analyzed) byAction[r.recommended_action!] = (byAction[r.recommended_action!] ?? 0) + 1;
  const byClass: Record<string, number> = {};
  for (const r of analyzed) byClass[r.classification!] = (byClass[r.classification!] ?? 0) + 1;
  const timed = analyzed.filter((r) => r.analysis_ms !== null && !r.cached);
  return {
    open: q.filter((r) => !["RESOLVED", "SUBMITTED"].includes(r.status)).length,
    total: q.length,
    analyzed: analyzed.length,
    verifiedRatio: totalEv ? sum((r) => r.verified ?? 0) / totalEv : null,
    citationsKept: sum((r) => r.verified ?? 0),
    citationsTotal: totalEv,
    avgAnalysisMs: timed.length ? timed.reduce((s, r) => s + (r.analysis_ms ?? 0), 0) / timed.length : null,
    byAction,
    byClass,
    agentFault: analyzed.filter((r) => r.agent_fault === "LIKELY").length,
  };
}

export function ordersView() {
  return getDb()
    .prepare(
      `SELECT o.id, o.intent_id, o.paypal_order_id, o.paypal_capture_id, o.amount_cents, o.currency, o.status, o.simulated, o.created_at,
              i.scenario, i.record_json, b.display_name AS buyer,
              (SELECT d.id FROM disputes d WHERE d.order_id = o.id ORDER BY d.created_at DESC LIMIT 1) AS dispute_id
       FROM orders o JOIN intents i ON i.id = o.intent_id JOIN buyers b ON b.id = i.buyer_id ORDER BY o.created_at DESC`,
    )
    .all()
    .map((r) => {
      const row = r as Record<string, unknown> & { record_json: string };
      const rec = JSON.parse(row.record_json);
      const { record_json: _omit, ...rest } = row;
      void _omit;
      return {
        ...rest,
        simulated: row.simulated === 1,
        product: rec.selection.product_name as string,
        request: rec.request.verbatim as string,
      };
    }) as {
    id: string;
    intent_id: string;
    paypal_order_id: string;
    paypal_capture_id: string | null;
    amount_cents: number;
    currency: string;
    status: string;
    simulated: boolean;
    created_at: string;
    scenario: string | null;
    buyer: string;
    product: string;
    request: string;
    dispute_id: string | null;
  }[];
}
