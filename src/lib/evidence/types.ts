import type { IntentRecord } from "@/lib/intents";
import type { LedgerEntry, RedactedLedgerEntry } from "@/lib/ledger/canonical";

// Evidence pack (§9.7): the signed facts behind one receipt, packaged so anyone can
// check them without trusting our server. No AI output and no dispute messages.

export const EVIDENCE_SCHEMA = "intentreceipt-evidence/0.1";

export interface EvidenceBundle {
  schema: typeof EVIDENCE_SCHEMA;
  generated_at: string;
  intent_id: string;
  simulated: boolean;
  receipt_url: string;
  verify_url: string;
  /** The copy signed in this receipt's INTENT_CONFIRMED entry. */
  intent_record: IntentRecord;
  order: {
    paypal_order_id: string;
    paypal_capture_id: string | null;
    custom_id: string;
    amount: { value: string; currency_code: string };
  } | null;
  /** Merchant shipping records. Not in the ledger, so not signed. */
  fulfillment: { status: string; detail: string; carrier: string | null; tracking_no: string | null; occurred_at: string }[];
  ledger: {
    entries: (LedgerEntry | RedactedLedgerEntry)[];
    key: { key_id: string; algorithm: "Ed25519"; jwk: { kty: string; crv: string; x: string } };
  };
}

export type CheckId = "schema" | "chain" | "signatures" | "key" | "record" | "card" | "passkey" | "order" | "fulfillment";

/** ok: true passed, false failed, null not checkable here. */
export interface Check {
  id: CheckId;
  ok: boolean | null;
  label: string;
  detail: string;
}

export interface BundleVerification {
  verdict: "verified" | "partial" | "failed";
  checks: Check[];
  bundle: EvidenceBundle | null;
}
