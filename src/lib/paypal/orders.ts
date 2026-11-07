import { ulid } from "ulid";
import { getDb, nowIso, bool } from "@/lib/db";
import { env } from "@/lib/env";
import { appendLedger, entriesForIntent } from "@/lib/ledger";
import { confirmedRecord, getIntent, setIntentStatus, type IntentRecord } from "@/lib/intents";
import { paypalFetch } from "./client";

export interface OrderRow {
  id: string;
  intent_id: string;
  paypal_order_id: string;
  paypal_capture_id: string | null;
  amount_cents: number;
  currency: string;
  status: string;
  simulated: boolean;
  created_at: string;
}

export class GuardError extends Error {}

const toValue = (cents: number) => (cents / 100).toFixed(2);
export const simulatedAmount = (o: OrderRow) => ({ value: toValue(o.amount_cents), currency_code: o.currency });

/** Builds the Orders v2 request body for a confirmed intent. */
export function buildOrderRequest(record: IntentRecord) {
  const s = record.selection;
  const total = s.price_cents * s.quantity;
  const hash16 = (entriesForIntent(record.id).find((e) => e.type === "INTENT_CONFIRMED")?.hash ?? "").slice(0, 16);
  return {
    intent: "CAPTURE",
    purchase_units: [
      {
        reference_id: record.id,
        // custom_id max length is 255 (verified in the Orders v2 OpenAPI spec).
        custom_id: `${record.id}:${hash16}`,
        invoice_id: `IR-${record.id.slice(3, 15)}-${Date.now().toString(36)}`,
        description: "IntentReceipt demo order",
        amount: {
          currency_code: s.currency,
          value: toValue(total),
          breakdown: { item_total: { currency_code: s.currency, value: toValue(total) } },
        },
        items: [
          {
            name: s.product_name.slice(0, 127),
            sku: s.sku,
            quantity: String(s.quantity),
            unit_amount: { currency_code: s.currency, value: toValue(s.price_cents) },
            category: "PHYSICAL_GOODS",
          },
        ],
      },
    ],
  };
}

export type OrderRequest = ReturnType<typeof buildOrderRequest>;

/**
 * Invariant I1: an order may only be created for an intent with an
 * INTENT_CONFIRMED ledger entry, and its amount, currency and items must equal
 * the confirmed selection.
 */
export function assertOrderMatchesIntent(intentId: string, req: OrderRequest): IntentRecord {
  const intent = getIntent(intentId);
  if (!intent) throw new GuardError("I1: intent not found");
  const record = confirmedRecord(intentId);
  if (!record || !record.confirmation) {
    throw new GuardError("I1: no INTENT_CONFIRMED ledger entry for this intent; the buyer has not confirmed.");
  }
  if (intent.status !== "CONFIRMED") throw new GuardError(`I1: intent is ${intent.status}, expected CONFIRMED`);
  const s = record.selection;
  const pu = req.purchase_units[0];
  const expectedTotal = toValue(s.price_cents * s.quantity);
  const problems: string[] = [];
  if (req.purchase_units.length !== 1) problems.push("exactly one purchase unit required");
  if (pu.amount.currency_code !== s.currency) problems.push("currency differs from confirmed selection");
  if (pu.amount.value !== expectedTotal) problems.push(`amount ${pu.amount.value} != confirmed ${expectedTotal}`);
  if (pu.items.length !== 1) problems.push("item count differs");
  const item = pu.items[0];
  if (item && (item.sku !== s.sku || item.quantity !== String(s.quantity) || item.unit_amount.value !== toValue(s.price_cents))) {
    problems.push("item sku/quantity/unit price differs from confirmed selection");
  }
  if (problems.length) throw new GuardError(`I1: ${problems.join("; ")}`);
  return record;
}

function rowToOrder(r: Omit<OrderRow, "simulated"> & { simulated: number }): OrderRow {
  return { ...r, simulated: bool(r.simulated) };
}

export function getOrderByIntent(intentId: string): OrderRow | null {
  const r = getDb().prepare("SELECT * FROM orders WHERE intent_id = ? ORDER BY created_at DESC LIMIT 1").get(intentId) as
    | (Omit<OrderRow, "simulated"> & { simulated: number })
    | undefined;
  return r ? rowToOrder(r) : null;
}

export function getOrder(id: string): OrderRow | null {
  const r = getDb().prepare("SELECT * FROM orders WHERE id = ?").get(id) as (Omit<OrderRow, "simulated"> & { simulated: number }) | undefined;
  return r ? rowToOrder(r) : null;
}

export function listOrders(): (OrderRow & { buyer_name: string; product_name: string; scenario: string | null })[] {
  const rows = getDb()
    .prepare(
      `SELECT o.*, i.record_json, i.scenario, b.display_name AS buyer_name FROM orders o
       JOIN intents i ON i.id = o.intent_id JOIN buyers b ON b.id = i.buyer_id ORDER BY o.created_at DESC`,
    )
    .all() as (Omit<OrderRow, "simulated"> & { simulated: number; record_json: string; buyer_name: string; scenario: string | null })[];
  return rows.map(({ record_json, ...r }) => ({
    ...rowToOrder(r),
    buyer_name: r.buyer_name,
    scenario: r.scenario,
    product_name: (JSON.parse(record_json) as IntentRecord).selection.product_name,
  }));
}

/** Create the PayPal order for a confirmed intent (real sandbox, or labelled simulation when PayPal is not configured in demo mode). */
export async function createOrderForIntent(intentId: string, opts: { forceSimulated?: boolean; createdAt?: string } = {}) {
  const existing = getOrderByIntent(intentId);
  if (existing && existing.status !== "VOIDED") return existing;
  const record = confirmedRecord(intentId);
  if (!record) throw new GuardError("I1: no INTENT_CONFIRMED ledger entry for this intent; the buyer has not confirmed.");
  const req = buildOrderRequest(record);
  assertOrderMatchesIntent(intentId, req);

  const simulated = opts.forceSimulated || !env.paypalConfigured;
  if (simulated && !env.demoMode) throw new Error("PayPal is not configured and DEMO_MODE is off.");
  let paypalOrderId: string;
  let status: string;
  if (simulated) {
    paypalOrderId = `SIM-${ulid()}`;
    status = "CREATED";
  } else {
    const res = await paypalFetch<{ id: string; status: string }>("/v2/checkout/orders", {
      method: "POST",
      body: req,
      requestId: `ir-create-${intentId}`,
    });
    paypalOrderId = res.id;
    status = res.status;
  }
  return recordOrder(intentId, record, req, paypalOrderId, status, simulated, opts.createdAt ?? nowIso());
}

/** Synchronous persistence of a created order + ORDER_CREATED ledger entry. */
export function recordOrder(
  intentId: string,
  record: IntentRecord,
  req: OrderRequest,
  paypalOrderId: string,
  status: string,
  simulated: boolean,
  createdAt: string,
): OrderRow {
  const s = record.selection;
  const id = `ord_${ulid()}`;
  const db = getDb();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO orders (id, intent_id, paypal_order_id, paypal_capture_id, amount_cents, currency, status, simulated, created_at)
       VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?)`,
    ).run(id, intentId, paypalOrderId, s.price_cents * s.quantity, s.currency, status, simulated ? 1 : 0, createdAt);
    appendLedger(
      "ORDER_CREATED",
      intentId,
      {
        intent_id: intentId,
        paypal_order_id: paypalOrderId,
        custom_id: req.purchase_units[0].custom_id,
        amount: req.purchase_units[0].amount,
        items: req.purchase_units[0].items,
        simulated,
      },
      { createdAt },
    );
    setIntentStatus(intentId, "ORDERED");
  })();
  return getOrder(id)!;
}

interface CaptureResponse {
  id: string;
  status: string;
  purchase_units: { payments?: { captures?: { id: string; status: string; amount: { value: string; currency_code: string } }[] } }[];
}

/** Capture an approved order. Idempotent: repeated calls return the stored capture. */
export async function captureOrderForIntent(intentId: string, paypalOrderId: string, opts: { createdAt?: string } = {}) {
  const order = getOrderByIntent(intentId);
  if (!order || order.paypal_order_id !== paypalOrderId) throw new GuardError("Order does not belong to this intent");
  if (order.paypal_capture_id) return order;

  let captureId: string;
  let status: string;
  let amount = simulatedAmount(order);
  if (order.simulated) {
    captureId = `SIMCAP-${ulid()}`;
    status = "COMPLETED";
  } else {
    const res = await paypalFetch<CaptureResponse>(`/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`, {
      method: "POST",
      requestId: `ir-capture-${paypalOrderId}`,
    });
    const cap = res.purchase_units?.[0]?.payments?.captures?.[0];
    if (!cap) throw new Error(`Capture returned no capture record (order status ${res.status})`);
    captureId = cap.id;
    status = cap.status;
    amount = cap.amount;
    if (status !== "COMPLETED" && status !== "PENDING") throw new Error(`Capture status ${status}`);
  }
  return recordCapture(intentId, order, captureId, status, amount, opts.createdAt ?? nowIso());
}

/** Synchronous persistence of a capture + CAPTURE_COMPLETED ledger entry. */
export function recordCapture(
  intentId: string,
  order: OrderRow,
  captureId: string,
  status: string,
  amount: { value: string; currency_code: string },
  createdAt: string,
): OrderRow {
  const paypalOrderId = order.paypal_order_id;
  const db = getDb();
  db.transaction(() => {
    db.prepare("UPDATE orders SET paypal_capture_id = ?, status = ? WHERE id = ?").run(captureId, status === "COMPLETED" ? "CAPTURED" : status, order.id);
    appendLedger(
      "CAPTURE_COMPLETED",
      intentId,
      { paypal_order_id: paypalOrderId, paypal_capture_id: captureId, status, amount, simulated: order.simulated },
      { createdAt },
    );
    setIntentStatus(intentId, "CAPTURED");
    db.prepare(
      "INSERT INTO fulfillment_events (id, order_id, status, detail, carrier, tracking_no, occurred_at, simulated) VALUES (?, ?, 'LABEL_CREATED', ?, 'Northwind Parcel', ?, ?, 1)",
    ).run(`ful_${ulid()}`, order.id, "Shipping label created at Fernhill Outfitters warehouse", `NWP${Date.now().toString().slice(-9)}`, createdAt);
  })();
  return getOrder(order.id)!;
}
