import { ulid } from "ulid";
import { getDb, nowIso } from "@/lib/db";
import { appendLedger, entriesForIntent, sha256Hex } from "@/lib/ledger";
import { getVariant } from "@/lib/catalog";
import { checkConstraints, hasUnmet, type CheckResult, type Constraint } from "@/lib/catalog/constraints";
import type { VariantAttributes } from "@/lib/catalog/data";

export const INTENT_SCHEMA_VERSION = "intent-record/0.1";

export type IntentStatus = "DRAFT" | "CONFIRMED" | "ORDERED" | "CAPTURED" | "CANCELLED";

export interface IntentRecord {
  schema_version: string;
  id: string;
  created_at: string;
  buyer: { id: string; display_name: string };
  agent: { name: string; provider: string; model: string; prompt_version: string };
  request: { verbatim: string; turns: { role: "user" | "agent"; text: string; at: string }[] };
  extracted_constraints: Constraint[];
  options_presented: { product_id: string; variant_id: string; price_cents: number; violates: string[]; notes: string }[];
  selection: {
    product_id: string;
    product_name: string;
    variant_id: string;
    sku: string;
    variant_attributes: VariantAttributes;
    quantity: number;
    price_cents: number;
    currency: string;
    est_delivery_days: number;
    rationale: string;
    assumptions: string[];
  };
  constraint_check: { checker_version: string; results: CheckResult[] };
  confirmation?: {
    presented_text: string;
    presented_text_sha256: string;
    confirmed_at: string;
    method: "ui_button";
    client_nonce: string;
  };
}

export interface CardLine {
  kind: "title" | "detail" | "heading" | "met" | "unmet" | "unknown" | "assumption" | "warning";
  text: string;
}

export interface IntentRow {
  id: string;
  session_id: string | null;
  buyer_id: string;
  status: IntentStatus;
  record: IntentRecord;
  record_sha256: string | null;
  scenario: string | null;
  created_at: string;
}

const money = (cents: number, currency = "USD") => `$${(cents / 100).toFixed(2)} ${currency}`;

export function describeAttributes(a: VariantAttributes): string {
  const parts: string[] = [];
  if (a.color) parts.push(a.color);
  if (a.size) parts.push(a.size);
  else if (a.capacity_liters !== undefined) parts.push(`${a.capacity_liters} L`);
  if (a.length_m !== undefined) parts.push(`${a.length_m} m`);
  if (a.connector) parts.push(a.connector);
  if (a.capacity_mah) parts.push(`${a.capacity_mah.toLocaleString("en-US")} mAh`);
  if (a.tone) parts.push(`${a.tone} light`);
  return parts.join(", ");
}

/**
 * The exact card the buyer sees. Its joined text is hashed into
 * confirmation.presented_text_sha256, so the receipt proves what was shown.
 */
export function confirmationCard(record: IntentRecord): CardLine[] {
  const s = record.selection;
  const lines: CardLine[] = [
    { kind: "title", text: `${s.product_name} (${describeAttributes(s.variant_attributes)})` },
    { kind: "detail", text: `SKU ${s.sku} · Quantity ${s.quantity}` },
    { kind: "detail", text: `Total ${money(s.price_cents * s.quantity, s.currency)}` },
    { kind: "detail", text: `Estimated delivery in ${s.est_delivery_days} days` },
  ];
  const results = record.constraint_check.results;
  const unmet = results.filter((r) => r.status === "UNMET");
  if (unmet.length) {
    lines.push({
      kind: "warning",
      text: `${unmet.length} of your requirements ${unmet.length === 1 ? "is" : "are"} not met by this item.`,
    });
  }
  if (results.length) {
    lines.push({ kind: "heading", text: "Constraint check" });
    for (const r of results) {
      const label = r.key.replace(/_/g, " ");
      const actual = r.actual === null ? "unknown" : String(r.actual);
      const kind = r.status === "MET" ? "met" : r.status === "UNMET" ? "unmet" : "unknown";
      lines.push({ kind, text: `${r.status} · ${label}: you asked for ${r.expected}, this item is ${actual}` });
    }
  }
  if (s.assumptions.length) {
    lines.push({ kind: "heading", text: "Agent assumptions" });
    for (const a of s.assumptions) lines.push({ kind: "assumption", text: a });
  }
  return lines;
}

export const cardText = (lines: CardLine[]) => lines.map((l) => l.text).join("\n");

function rowToIntent(r: Omit<IntentRow, "record"> & { record_json: string }): IntentRow {
  const { record_json, ...rest } = r;
  return { ...rest, record: JSON.parse(record_json) as IntentRecord };
}

export function getIntent(id: string): IntentRow | null {
  const r = getDb().prepare("SELECT * FROM intents WHERE id = ?").get(id) as
    | (Omit<IntentRow, "record"> & { record_json: string })
    | undefined;
  return r ? rowToIntent(r) : null;
}

export function listIntentsForBuyer(buyerId?: string): IntentRow[] {
  const rows = (
    buyerId
      ? getDb().prepare("SELECT * FROM intents WHERE buyer_id = ? ORDER BY created_at DESC").all(buyerId)
      : getDb().prepare("SELECT * FROM intents ORDER BY created_at DESC").all()
  ) as (Omit<IntentRow, "record"> & { record_json: string })[];
  return rows.map(rowToIntent);
}

export interface DraftInput {
  sessionId: string | null;
  buyer: { id: string; display_name: string };
  agent: IntentRecord["agent"];
  turns: IntentRecord["request"]["turns"];
  product_id: string;
  variant_id: string;
  quantity: number;
  rationale: string;
  extracted_constraints: Constraint[];
  assumptions: string[];
  options_presented?: IntentRecord["options_presented"];
  createdAt?: string;
  /** Seeds use fixed ids so URLs and fixtures are deterministic. */
  idOverride?: string;
  scenario?: string;
}

export class IntentError extends Error {}

/** Builds a DRAFT intent and runs the deterministic constraint checker. */
export function createDraftIntent(input: DraftInput): IntentRow {
  const variant = getVariant(input.variant_id);
  if (!variant || variant.product_id !== input.product_id) {
    throw new IntentError(`Unknown variant ${input.variant_id} for product ${input.product_id}`);
  }
  if (variant.stock <= 0) throw new IntentError(`${variant.sku} is out of stock; choose another variant.`);
  const quantity = Math.max(1, Math.min(10, Math.floor(input.quantity || 1)));
  const createdAt = input.createdAt ?? nowIso();
  const check = checkConstraints(
    input.extracted_constraints,
    {
      brand: variant.product.brand,
      category: variant.product.category,
      attributes: variant.attributes,
      unit_price_cents: variant.price_cents,
      quantity,
      est_delivery_days: variant.est_delivery_days,
    },
    new Date(createdAt),
  );
  const id = input.idOverride ?? `ir_${ulid()}`;
  const record: IntentRecord = {
    schema_version: INTENT_SCHEMA_VERSION,
    id,
    created_at: createdAt,
    buyer: input.buyer,
    agent: input.agent,
    request: { verbatim: input.turns.find((t) => t.role === "user")?.text ?? "", turns: input.turns },
    extracted_constraints: input.extracted_constraints,
    options_presented: input.options_presented ?? [
      {
        product_id: input.product_id,
        variant_id: input.variant_id,
        price_cents: variant.price_cents,
        violates: check.results.filter((r) => r.status === "UNMET").map((r) => r.key),
        notes: "selected option",
      },
    ],
    selection: {
      product_id: input.product_id,
      product_name: variant.product.name,
      variant_id: variant.id,
      sku: variant.sku,
      variant_attributes: variant.attributes,
      quantity,
      price_cents: variant.price_cents,
      currency: variant.product.currency,
      est_delivery_days: variant.est_delivery_days,
      rationale: input.rationale,
      assumptions: input.assumptions,
    },
    constraint_check: check,
  };
  getDb()
    .prepare(
      "INSERT INTO intents (id, session_id, buyer_id, status, record_json, record_sha256, scenario, created_at) VALUES (?, ?, ?, 'DRAFT', ?, NULL, ?, ?)",
    )
    .run(id, input.sessionId, input.buyer.id, JSON.stringify(record), input.scenario ?? null, createdAt);
  return getIntent(id)!;
}

/**
 * Records the buyer's explicit confirmation. The client sends back the text it
 * rendered; it must equal the server's rendering of the stored draft.
 */
export function confirmIntent(
  intentId: string,
  presentedText: string,
  clientNonce: string,
  opts: { confirmedAt?: string; presentedTextOverride?: string } = {},
): IntentRow {
  const intent = getIntent(intentId);
  if (!intent) throw new IntentError("Intent not found");
  if (intent.status !== "DRAFT") throw new IntentError(`Intent is already ${intent.status}`);
  const expected = opts.presentedTextOverride ?? cardText(confirmationCard(intent.record));
  if (presentedText !== expected) {
    throw new IntentError("The confirmation text does not match what the server generated. Reload and try again.");
  }
  const record: IntentRecord = {
    ...intent.record,
    confirmation: {
      presented_text: expected,
      presented_text_sha256: sha256Hex(expected),
      confirmed_at: opts.confirmedAt ?? nowIso(),
      method: "ui_button",
      client_nonce: clientNonce.slice(0, 64),
    },
  };
  const recordSha = sha256Hex(JSON.stringify(record));
  const db = getDb();
  db.transaction(() => {
    appendLedger(
      "INTENT_CONFIRMED",
      intentId,
      { intent_record: record, intent_record_sha256: recordSha },
      { createdAt: record.confirmation!.confirmed_at },
    );
    db.prepare("UPDATE intents SET status = 'CONFIRMED', record_json = ?, record_sha256 = ? WHERE id = ?").run(
      JSON.stringify(record),
      recordSha,
      intentId,
    );
  })();
  return getIntent(intentId)!;
}

export function cancelIntent(intentId: string): void {
  getDb().prepare("UPDATE intents SET status = 'CANCELLED' WHERE id = ? AND status = 'DRAFT'").run(intentId);
}

export function setIntentStatus(intentId: string, status: IntentStatus): void {
  getDb().prepare("UPDATE intents SET status = ? WHERE id = ?").run(status, intentId);
}

/** The confirmed record as signed into the ledger (source of truth for I1). */
export function confirmedRecord(intentId: string): IntentRecord | null {
  const e = entriesForIntent(intentId).find((x) => x.type === "INTENT_CONFIRMED");
  return e ? (e.payload as { intent_record: IntentRecord }).intent_record : null;
}

export { hasUnmet };
