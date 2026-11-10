import { describe, expect, it, beforeEach, vi } from "vitest";
import { resetTestDb, getDb } from "@/lib/db";
import { verifyLedger, entriesForIntent } from "@/lib/ledger";
import { cardText, confirmIntent, confirmationCard, createDraftIntent, getIntent } from "@/lib/intents";
import { assertOrderMatchesIntent, buildOrderRequest, captureOrderForIntent, createOrderForIntent, GuardError } from "@/lib/paypal/orders";
import { verifyWebhook } from "@/lib/paypal/webhooks";
import { processWebhookEvent, recordWebhookEvent } from "@/lib/disputes/ingest";
import { simulateScenarioDispute } from "@/lib/disputes/simulate";
import { analyzeDispute, loadFixture } from "@/lib/disputes/analyze";
import { buildDisputeContext } from "@/lib/disputes/context";
import { latestAnalysis, getDispute } from "@/lib/disputes/store";
import { validateEvidence } from "@/lib/ai/validator";
import { approveAction } from "@/lib/disputes/actions";
import { SCENARIOS } from "@/lib/disputes/scenarios";
import type { Analysis } from "@/lib/ai/schemas";
import { resetDemoData } from "@/lib/seed";
import type { Constraint } from "@/lib/catalog/constraints";

const draft = (constraints: Constraint[] = [{ key: "max_price", value: 85, source_turn: 0, confidence: 1 }]) =>
  createDraftIntent({
    sessionId: null,
    buyer: { id: "buyer_demo_1", display_name: "Maya Rao" },
    agent: { name: "test", provider: "test", model: "test", prompt_version: "shop-agent@1" },
    turns: [{ role: "user", text: "40L black backpack under $85", at: "2026-11-07T00:00:00.000Z" }],
    product_id: "p_ridge_pack",
    variant_id: "v_ridge_40_black",
    quantity: 1,
    rationale: "fits",
    extracted_constraints: constraints,
    assumptions: [],
  });

describe("seeding", () => {
  it("is idempotent and produces a verifiable ledger", () => {
    resetTestDb();
    const n = (getDb().prepare("SELECT COUNT(*) n FROM ledger").get() as { n: number }).n;
    expect(n).toBe(SCENARIOS.length * 3);
    expect(verifyLedger().ok).toBe(true);
  });
});

describe("demo reset", () => {
  it("removes only simulated demo state and keeps the ledger and orders intact", async () => {
    const db = resetTestDb();
    const d = draft();
    confirmIntent(d.id, cardText(confirmationCard(d.record)), "nonce-123");
    const real = await simulateScenarioDispute("S1");
    // Pretend one dispute is a real sandbox dispute: it must survive.
    db.prepare("UPDATE disputes SET simulated = 0 WHERE id = ?").run(real);
    await simulateScenarioDispute("S2");
    const leftDraft = draft();
    const before = (db.prepare("SELECT COUNT(*) n FROM ledger").get() as { n: number }).n;
    resetDemoData(db);
    const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
    expect(count("SELECT COUNT(*) n FROM ledger")).toBe(before);
    expect(count("SELECT COUNT(*) n FROM disputes")).toBe(1);
    expect(getIntent(leftDraft.id)).toBeNull();
    expect(getIntent(d.id)?.status).toBe("CONFIRMED");
    expect(verifyLedger().ok).toBe(true);
  });
});

describe("intent confirmation and invariant I1", () => {
  beforeEach(() => {
    resetTestDb();
  });

  it("refuses to create an order before confirmation", async () => {
    const d = draft();
    await expect(createOrderForIntent(d.id)).rejects.toBeInstanceOf(GuardError);
  });

  it("rejects a confirmation whose text differs from the server's card", () => {
    const d = draft();
    expect(() => confirmIntent(d.id, "something else", "n1")).toThrow(/does not match/);
  });

  it("signs the confirmation and hashes the presented text", () => {
    const d = draft();
    const text = cardText(confirmationCard(d.record));
    const c = confirmIntent(d.id, text, "nonce-1");
    expect(c.status).toBe("CONFIRMED");
    expect(c.record.confirmation?.presented_text).toBe(text);
    expect(entriesForIntent(d.id).map((e) => e.type)).toEqual(["INTENT_CONFIRMED"]);
  });

  it("rejects an order whose amount or items differ from the confirmed selection", () => {
    const d = draft();
    confirmIntent(d.id, cardText(confirmationCard(d.record)), "n");
    const req = buildOrderRequest(getIntent(d.id)!.record);
    req.purchase_units[0].amount.value = "1.00";
    expect(() => assertOrderMatchesIntent(d.id, req)).toThrow(/I1: amount/);
    const req2 = buildOrderRequest(getIntent(d.id)!.record);
    req2.purchase_units[0].items[0].sku = "OTHER";
    expect(() => assertOrderMatchesIntent(d.id, req2)).toThrow(/item sku/);
  });

  it("creates and captures a (simulated, labelled) order, chaining ledger entries", async () => {
    const d = draft();
    confirmIntent(d.id, cardText(confirmationCard(d.record)), "n");
    const o = await createOrderForIntent(d.id);
    expect(o.simulated).toBe(true);
    expect(o.paypal_order_id).toMatch(/^SIM-/);
    const cap = await captureOrderForIntent(d.id, o.paypal_order_id);
    const again = await captureOrderForIntent(d.id, o.paypal_order_id);
    expect(again.paypal_capture_id).toBe(cap.paypal_capture_id);
    expect(entriesForIntent(d.id).map((e) => e.type)).toEqual(["INTENT_CONFIRMED", "ORDER_CREATED", "CAPTURE_COMPLETED"]);
    expect(verifyLedger().ok).toBe(true);
  });

  it("shows UNMET constraints prominently on the card", () => {
    const d = draft([{ key: "color", value: "olive", source_turn: 0, confidence: 1 }]);
    const lines = confirmationCard(d.record);
    expect(lines.find((l) => l.kind === "warning")?.text).toMatch(/1 of your requirements is not met/);
    expect(lines.some((l) => l.kind === "unmet")).toBe(true);
  });
});

describe("webhooks", () => {
  beforeEach(() => {
    resetTestDb();
  });
  const headers = {
    "paypal-auth-algo": "SHA256withRSA",
    "paypal-cert-url": "https://api.sandbox.paypal.com/cert",
    "paypal-transmission-id": "t1",
    "paypal-transmission-sig": "sig",
    "paypal-transmission-time": "2026-11-07T00:00:00Z",
  };

  it("verifies via PayPal's API and rejects failures and missing headers", async () => {
    vi.stubEnv("PAYPAL_WEBHOOK_ID", "WH-123");
    let sent: Record<string, unknown> = {};
    const ok = await verifyWebhook(headers, { id: "e" }, async (b) => {
      sent = b as Record<string, unknown>;
      return { verification_status: "SUCCESS" };
    });
    expect(ok.verified).toBe(true);
    expect(sent).toMatchObject({ webhook_id: "WH-123", transmission_id: "t1", auth_algo: "SHA256withRSA" });
    expect((await verifyWebhook(headers, {}, async () => ({ verification_status: "FAILURE" }))).verified).toBe(false);
    expect((await verifyWebhook({ ...headers, "paypal-transmission-sig": null }, {}, async () => ({ verification_status: "SUCCESS" }))).verified).toBe(false);
    vi.unstubAllEnvs();
  });

  it("cannot be switched off outside development", async () => {
    vi.stubEnv("WEBHOOK_VERIFY", "off");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PAYPAL_WEBHOOK_ID", "");
    const r = await verifyWebhook(headers, {});
    expect(r.skipped).toBe(false);
    expect(r.verified).toBe(false);
    vi.stubEnv("NODE_ENV", "development");
    expect((await verifyWebhook(headers, {})).skipped).toBe(true);
    vi.unstubAllEnvs();
  });

  it("dedupes events by PayPal event id", () => {
    const ev = { id: "WH-1", event_type: "PAYMENT.CAPTURE.COMPLETED", resource: {} };
    expect(recordWebhookEvent(ev, true, false)).toBe(true);
    expect(recordWebhookEvent(ev, true, false)).toBe(false);
  });
});

describe("dispute pipeline", () => {
  beforeEach(() => {
    resetTestDb();
  });

  it("every seeded fallback fixture verifies 100% against its scenario context", async () => {
    for (const s of SCENARIOS) {
      const id = (await simulateScenarioDispute(s.key))!;
      const ctx = buildDisputeContext(id);
      const fx = loadFixture(s.key)!;
      const v = validateEvidence(ctx, fx.output.evidence);
      expect({ s: s.key, failed: v.items.filter((i) => !i.ok) }).toEqual({ s: s.key, failed: [] });
    }
  });

  it("links simulated disputes to orders and feeds them through the webhook ingest", async () => {
    const id = (await simulateScenarioDispute("S2"))!;
    const d = getDispute(id)!;
    expect(d.simulated).toBe(true);
    expect(d.order_id).not.toBeNull();
    const ctx = buildDisputeContext(id);
    expect(ctx.intent?.agent.prompt_version).toBe("shop-agent@0.9");
    expect(ctx.intent?.constraint_check.results.filter((r) => r.status === "UNMET").map((r) => r.key)).toEqual(["length_m", "color"]);
  });

  it("drops citations that fail verification after one corrective retry", async () => {
    const id = (await simulateScenarioDispute("S1"))!;
    // let the auto-enqueued run settle (falls back to fixture: no AI key in tests)
    await new Promise((r) => setTimeout(r, 50));
    const base = loadFixture("S1")!.output;
    const bad: Analysis = { ...base, evidence: [...base.evidence, { id: "bad", claim: "fake", supports: "BUYER", pointer: "/intent/selection/sku", quoted_value: "BP-RIDGE-30-BLK" }] };
    let calls = 0;
    await analyzeDispute(id, async (_sys, prompt) => {
      calls++;
      if (calls === 2) expect(prompt).toMatch(/FAILED MACHINE VERIFICATION/);
      return bad;
    });
    const a = latestAnalysis(id)!;
    expect(calls).toBe(2);
    expect(a.cached).toBe(false);
    expect(a.validation.verified).toBe(base.evidence.length);
    expect(a.validation.dropped).toBe(1);
    expect(getDispute(id)!.status).toBe("READY_FOR_REVIEW");
  });

  it("sends a self-contradicting answer back once, then flags it for review if it persists", async () => {
    const id = (await simulateScenarioDispute("S3"))!;
    await new Promise((r) => setTimeout(r, 50));
    const base = loadFixture("S3")!.output;
    const contested: Analysis = { ...base, recommended_seller_action: "CONTEST" };
    const prompts: string[] = [];
    await analyzeDispute(id, async (_sys, prompt) => {
      prompts.push(prompt);
      return prompts.length === 1 ? contested : base;
    });
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toMatch(/CONTRADICTED ITSELF:\n- ITEM_NOT_RECEIVED allows ACCEPT_AND_REFUND, but the action is CONTEST/);
    expect(prompts[1]).not.toMatch(/FAILED MACHINE VERIFICATION/);
    let a = latestAnalysis(id)!;
    expect(a.output.recommended_seller_action).toBe("ACCEPT_AND_REFUND");
    expect(a.validation.decision_conflicts).toEqual([]);
    expect(a.validation.needs_human_review).toBe(false);

    getDb().prepare("DELETE FROM analyses WHERE dispute_id = ?").run(id);
    await analyzeDispute(id, async () => contested);
    a = latestAnalysis(id)!;
    expect(a.output.recommended_seller_action).toBe("CONTEST");
    expect(a.validation.decision_conflicts).toHaveLength(1);
    expect(a.validation.needs_human_review).toBe(true);
  });

  it("falls back to the labelled CACHED fixture when the AI is unavailable", async () => {
    const id = (await simulateScenarioDispute("S4"))!;
    await analyzeDispute(id);
    const a = latestAnalysis(id)!;
    expect(a.cached).toBe(true);
    expect(a.cache_origin).toMatch(/hand-authored|generated/);
    expect(a.validation.injection_flagged).toBe(true);
    expect(a.output.recommended_seller_action).toBe("CONTEST");
  });

  it("marks the dispute ERROR (never stuck) when there is no fallback", async () => {
    const id = (await simulateScenarioDispute("S1"))!;
    getDb().prepare("UPDATE disputes SET scenario = NULL WHERE id = ?").run(id);
    await analyzeDispute(id, async () => {
      throw new Error("model exploded");
    });
    expect(getDispute(id)!.status).toBe("ERROR");
  });

  it("I4: approving stores the exact request preview and does not send simulated disputes", async () => {
    const id = (await simulateScenarioDispute("S2"))!;
    const r = await approveAction(id, {
      type: "ACCEPT_CLAIM",
      seller_text: "We accept.",
      buyer_text: "Sorry!",
      approved_by: "merchant-demo",
      human_confirmed: true,
    });
    expect(r.simulated).toBe(true);
    expect(r.request.path).toMatch(/\/v1\/customer\/disputes\/.+\/accept-claim$/);
    const rows = getDb().prepare("SELECT type, simulated FROM actions WHERE dispute_id = ?").all(id);
    expect(rows).toEqual([
      { type: "ACCEPT_CLAIM", simulated: 1 },
      { type: "SEND_MESSAGE", simulated: 1 },
    ]);
    expect(getDispute(id)!.status).toBe("SUBMITTED");
  });

  it("re-delivered dispute events do not duplicate messages", async () => {
    const id = (await simulateScenarioDispute("S3"))!;
    const d = getDispute(id)!;
    const ev = { id: "WH-X", event_type: "CUSTOMER.DISPUTE.UPDATED", resource: d.payload };
    await processWebhookEvent(ev, { simulated: true });
    const n = (getDb().prepare("SELECT COUNT(*) n FROM dispute_messages WHERE dispute_id = ?").get(id) as { n: number }).n;
    expect(n).toBe(1);
  });
});
