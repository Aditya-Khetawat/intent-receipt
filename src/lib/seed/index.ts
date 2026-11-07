import type Database from "better-sqlite3";
import { markSeeded } from "@/lib/db";
import { BUYERS, CATALOG, MERCHANT } from "@/lib/catalog/data";
import { SCENARIOS } from "@/lib/disputes/scenarios";
import { cardText, confirmIntent, createDraftIntent, confirmationCard } from "@/lib/intents";
import { assertOrderMatchesIntent, buildOrderRequest, recordCapture, recordOrder, simulatedAmount } from "@/lib/paypal/orders";

const addHours = (iso: string, h: number) => new Date(new Date(iso).getTime() + h * 3_600_000).toISOString();

function seedReference(db: Database.Database) {
  db.prepare("INSERT OR IGNORE INTO merchants (id, name) VALUES (?, ?)").run(MERCHANT.id, MERCHANT.name);
  const buyer = db.prepare("INSERT OR IGNORE INTO buyers (id, display_name, email_demo) VALUES (?, ?, ?)");
  for (const b of BUYERS) buyer.run(b.id, b.display_name, b.email_demo);
  const prod = db.prepare(
    "INSERT OR IGNORE INTO products (id, merchant_id, name, brand, category, description, base_price_cents, currency) VALUES (?, ?, ?, ?, ?, ?, ?, 'USD')",
  );
  const variant = db.prepare(
    "INSERT OR IGNORE INTO variants (id, product_id, sku, attributes_json, price_cents, stock, est_delivery_days) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  for (const p of CATALOG) {
    prod.run(p.id, MERCHANT.id, p.name, p.brand, p.category, p.description, Math.min(...p.variants.map((v) => v.price_cents)));
    for (const v of p.variants) {
      variant.run(v.id, p.id, v.sku, JSON.stringify(v.attributes), v.price_cents, v.stock, v.est_delivery_days);
    }
  }
}

/** Seeded scenario history goes through the real intent, ledger and order code. */
function seedScenarios(db: Database.Database) {
  for (const s of SCENARIOS) {
    if (db.prepare("SELECT 1 FROM intents WHERE id = ?").get(s.intentId)) continue;
    const intent = createDraftIntent({
      idOverride: s.intentId,
      scenario: s.key,
      sessionId: null,
      buyer: s.buyer,
      agent: { name: "IntentReceipt Shopping Agent", provider: "seed", model: "seeded-history", prompt_version: s.promptVersion },
      turns: s.turns.map((t, i) => ({ ...t, at: addHours(s.createdAt, i * 0.01) })),
      product_id: s.product_id,
      variant_id: s.variant_id,
      quantity: 1,
      rationale: s.rationale,
      extracted_constraints: s.constraints,
      assumptions: s.assumptions,
      createdAt: s.createdAt,
    });
    const confirmedAt = addHours(s.createdAt, 0.05);
    const text = s.legacyCardText ? s.legacyCardText.join("\n") : cardText(confirmationCard(intent.record));
    confirmIntent(intent.id, text, `seed-${s.key}`, {
      confirmedAt,
      presentedTextOverride: s.legacyCardText ? text : undefined,
    });
    const req = buildOrderRequest(intent.record);
    const record = assertOrderMatchesIntent(intent.id, req);
    const order = recordOrder(intent.id, record, req, `SIM-${s.key}-${s.intentId.slice(-6).toUpperCase()}`, "CREATED", true, addHours(s.createdAt, 0.06));
    recordCapture(intent.id, order, `SIMCAP-${s.key}-0001`, "COMPLETED", simulatedAmount(order), addHours(s.createdAt, 0.08));
    // Replace the generic label event with the scenario's deterministic fulfillment history.
    db.prepare("DELETE FROM fulfillment_events WHERE order_id = ?").run(order.id);
    const ins = db.prepare(
      "INSERT INTO fulfillment_events (id, order_id, status, detail, carrier, tracking_no, occurred_at, simulated) VALUES (?, ?, ?, ?, 'Northwind Parcel', ?, ?, 1)",
    );
    s.fulfillment.forEach((f, i) =>
      ins.run(`ful_${s.key}_${i}`, order.id, f.status, f.detail, `NWP-${s.key}-0042`, addHours(s.createdAt, f.offsetHours)),
    );
  }
}

/** Idempotent and synchronous. Scenario seeding never calls PayPal (orders are labelled simulated). */
export function ensureSeeded(db: Database.Database): void {
  markSeeded();
  seedReference(db);
  seedScenarios(db);
}

/** Wipe all demo data and re-seed. */
export function resetDemoData(db: Database.Database): void {
  db.exec(`
    DELETE FROM actions; DELETE FROM analyses; DELETE FROM dispute_messages; DELETE FROM disputes;
    DELETE FROM webhook_events; DELETE FROM fulfillment_events; DELETE FROM orders;
    DELETE FROM ledger; DELETE FROM sqlite_sequence WHERE name = 'ledger';
    DELETE FROM agent_messages; DELETE FROM intents; DELETE FROM agent_sessions;
  `);
  ensureSeeded(db);
}
