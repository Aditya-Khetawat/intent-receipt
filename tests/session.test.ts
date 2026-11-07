import { beforeEach, describe, expect, it } from "vitest";
import { resetTestDb } from "@/lib/db";
import { ensureSession } from "@/lib/ai/agent";
import { cardText, confirmationCard, createDraftIntent } from "@/lib/intents";
import { resetRateLimits } from "@/lib/http";
import { POST as confirm } from "@/app/api/intents/[id]/confirm/route";
import { POST as createOrder } from "@/app/api/orders/route";

const mkDraft = (sessionId: string | null) =>
  createDraftIntent({
    sessionId,
    buyer: { id: "buyer_demo_1", display_name: "Maya Rao" },
    agent: { name: "t", provider: "t", model: "t", prompt_version: "shop-agent@1" },
    turns: [{ role: "user", text: "40L black pack", at: "2026-11-07T00:00:00.000Z" }],
    product_id: "p_ridge_pack",
    variant_id: "v_ridge_40_black",
    quantity: 1,
    rationale: "fits",
    extracted_constraints: [],
    assumptions: [],
  });

const post = (url: string, body: unknown, sid?: string) =>
  new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(sid ? { cookie: `ir_sid=${sid}` } : {}) },
    body: JSON.stringify(body),
  });

describe("intents are bound to the buyer's session cookie", () => {
  beforeEach(() => {
    resetTestDb();
    resetRateLimits();
  });

  it("rejects confirm and order creation from another browser", async () => {
    const mine = ensureSession(null);
    const theirs = ensureSession(null);
    const d = mkDraft(mine);
    const presented = cardText(confirmationCard(d.record));
    const params = { params: Promise.resolve({ id: d.id }) } as RouteContext<"/api/intents/[id]/confirm">;

    const noCookie = await confirm(post(`http://x/api/intents/${d.id}/confirm`, { presented_text: presented, client_nonce: "nonce-123" }), params);
    expect(noCookie.status).toBe(403);
    const other = await confirm(post(`http://x/api/intents/${d.id}/confirm`, { presented_text: presented, client_nonce: "nonce-123" }, theirs), params);
    expect(other.status).toBe(403);
    const ok = await confirm(post(`http://x/api/intents/${d.id}/confirm`, { presented_text: presented, client_nonce: "nonce-123" }, mine), params);
    expect(ok.status).toBe(200);

    expect((await createOrder(post("http://x/api/orders", { intentId: d.id }, theirs))).status).toBe(403);
    const created = await createOrder(post("http://x/api/orders", { intentId: d.id }, mine));
    expect(created.status).toBe(200);
  });

  it("never lets anyone confirm intents that have no session (seeded history)", async () => {
    const d = mkDraft(null);
    const params = { params: Promise.resolve({ id: d.id }) } as RouteContext<"/api/intents/[id]/confirm">;
    const res = await confirm(post(`http://x/api/intents/${d.id}/confirm`, { presented_text: "x", client_nonce: "nonce-123" }, "anything"), params);
    expect(res.status).toBe(403);
  });
});
