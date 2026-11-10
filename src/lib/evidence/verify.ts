import {
  bytesToHex,
  canonicalize,
  entryBodyInput,
  entryHashInput,
  GENESIS_HASH,
  hexToBytes,
  type LedgerEntry,
  type RedactedLedgerEntry,
} from "@/lib/ledger/canonical";
import { verifyPasskeyProof } from "@/lib/passkey/verify";
import { EVIDENCE_SCHEMA, type BundleVerification, type Check, type EvidenceBundle } from "./types";

// Runs on Web Crypto only, so the receipt page, /verify and the tests share one code path.

type Entry = LedgerEntry | RedactedLedgerEntry;

export interface ChainLink {
  seq: number;
  type: string;
  own: boolean;
  ok: boolean;
}

export interface ChainResult {
  links: ChainLink[];
  ok: boolean;
  failSeq: number | null;
  reason: string | null;
  /** "none": this browser lacks Ed25519 in Web Crypto, so signatures were not checked. */
  sigMode: "browser" | "none";
}

const b64ToBytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const sha256 = async (subtle: SubtleCrypto, s: string) => bytesToHex(await subtle.digest("SHA-256", new TextEncoder().encode(s)));
const isOwn = (e: Entry): e is LedgerEntry => !("redacted" in e);

/**
 * Recomputes every hash and chain link from genesis. This receipt's entries are hashed from their
 * content; other receipts' arrive redacted, with only their body digest.
 */
export async function verifyChain(entries: Entry[], jwk: JsonWebKey, subtle: SubtleCrypto = crypto.subtle): Promise<ChainResult> {
  let key: CryptoKey | null = null;
  try {
    key = await subtle.importKey("jwk", { ...jwk, ext: true }, { name: "Ed25519" }, false, ["verify"]);
  } catch {
    key = null;
  }
  const sigMode = key ? "browser" : "none";
  const links: ChainLink[] = [];
  const fail = (e: Entry, reason: string): ChainResult => {
    links.push({ seq: e.seq, type: e.type, own: isOwn(e), ok: false });
    return { links, ok: false, failSeq: e.seq, reason, sigMode };
  };
  let prev = GENESIS_HASH;
  for (const e of entries) {
    if (e.prev_hash !== prev) return fail(e, "chain link broken (prev_hash mismatch)");
    const bodySha = isOwn(e) ? await sha256(subtle, entryBodyInput(e)) : e.body_sha256;
    const digest = await sha256(subtle, entryHashInput({ seq: e.seq, type: e.type, prev_hash: e.prev_hash, body_sha256: bodySha }));
    if (digest !== e.hash) return fail(e, "hash does not match the entry contents");
    if (key && !(await subtle.verify({ name: "Ed25519" }, key, b64ToBytes(e.signature), hexToBytes(e.hash)))) {
      return fail(e, "signature invalid");
    }
    links.push({ seq: e.seq, type: e.type, own: isOwn(e), ok: true });
    prev = e.hash;
  }
  return { links, ok: true, failSeq: null, reason: null, sigMode };
}

function isBundle(x: unknown): x is EvidenceBundle {
  const b = x as EvidenceBundle | null;
  return (
    typeof b === "object" &&
    b !== null &&
    b.schema === EVIDENCE_SCHEMA &&
    typeof b.intent_id === "string" &&
    typeof b.intent_record === "object" &&
    b.intent_record !== null &&
    Array.isArray(b.ledger?.entries) &&
    typeof b.ledger?.key?.jwk?.x === "string"
  );
}

/** Checks a pack on its own terms, then (if given) against the key IntentReceipt publishes. */
export async function verifyEvidenceBundle(
  input: unknown,
  opts: { trustedKey?: { key_id: string; jwk: { kty: string; crv: string; x: string } } | null; subtle?: SubtleCrypto } = {},
): Promise<BundleVerification> {
  const subtle = opts.subtle ?? crypto.subtle;
  if (!isBundle(input)) {
    return {
      verdict: "failed",
      bundle: null,
      checks: [
        { id: "schema", ok: false, label: "Evidence pack format", detail: `Not an IntentReceipt evidence pack (${EVIDENCE_SCHEMA}).` },
      ],
    };
  }
  const b = input;
  const checks: Check[] = [{ id: "schema", ok: true, label: "Evidence pack format", detail: EVIDENCE_SCHEMA }];
  const own = b.ledger.entries.filter(isOwn).filter((e) => e.intent_id === b.intent_id);
  const ownOf = (type: string) => own.find((e) => e.type === type);

  const t = opts.trustedKey;
  // Signatures are checked against the published key when we have it: a pack can name any key it likes.
  const chain = await verifyChain(b.ledger.entries, t?.jwk ?? b.ledger.key.jwk, subtle);
  const foreignKey = b.ledger.entries.find((e) => e.key_id !== b.ledger.key.key_id);
  checks.push({
    id: "chain",
    ok: chain.ok,
    label: "Tamper-evident ledger",
    detail: chain.ok
      ? `${chain.links.length} entries recomputed from #1 (${own.length} belong to this receipt).`
      : `Entry #${chain.failSeq}: ${chain.reason}.`,
  });
  const sig = (ok: boolean | null, detail: string): Check => ({ id: "signatures", ok, label: "Ed25519 signatures", detail });
  checks.push(
    chain.sigMode === "none"
      ? sig(null, "This browser cannot check Ed25519 signatures.")
      : foreignKey
        ? sig(false, `Entry #${foreignKey.seq} names key ${foreignKey.key_id}, not the pack's key.`)
        : chain.ok
          ? sig(true, `Every entry signed by ${b.ledger.key.key_id}.`)
          : chain.reason === "signature invalid"
            ? sig(false, `Entry #${chain.failSeq} has an invalid signature.`)
            : sig(null, "Not checked past the broken entry."),
  );

  checks.push(
    !t
      ? { id: "key", ok: null, label: "Published signing key", detail: "Not compared: the published key could not be fetched." }
      : t.key_id === b.ledger.key.key_id &&
          t.jwk.kty === b.ledger.key.jwk.kty &&
          t.jwk.crv === b.ledger.key.jwk.crv &&
          t.jwk.x === b.ledger.key.jwk.x
        ? { id: "key", ok: true, label: "Published signing key", detail: `Matches the key IntentReceipt publishes (${t.key_id}).` }
        : {
            id: "key",
            ok: false,
            label: "Published signing key",
            detail: `The pack's key ${b.ledger.key.key_id} is not the published key ${t.key_id}.`,
          },
  );

  const confirmed = ownOf("INTENT_CONFIRMED");
  const signedRecord = (confirmed?.payload as { intent_record?: unknown } | undefined)?.intent_record;
  checks.push(
    !confirmed
      ? { id: "record", ok: false, label: "Signed intent record", detail: "The pack has no confirmation entry for this receipt." }
      : canonicalize(signedRecord) === canonicalize(b.intent_record) && b.intent_record.id === b.intent_id
        ? {
            id: "record",
            ok: true,
            label: "Signed intent record",
            detail: `The readable record equals the one signed in entry #${confirmed.seq}.`,
          }
        : {
            id: "record",
            ok: false,
            label: "Signed intent record",
            detail: `The readable record differs from the one signed in entry #${confirmed.seq}.`,
          },
  );

  const c = b.intent_record.confirmation;
  const cardOk = c ? (await sha256(subtle, c.presented_text)) === c.presented_text_sha256 : false;
  checks.push({
    id: "card",
    ok: cardOk,
    label: "Card the buyer confirmed",
    detail: !c
      ? "No confirmation in the record."
      : cardOk
        ? `SHA-256 ${c.presented_text_sha256.slice(0, 16)}… matches the text shown.`
        : "The confirmed text does not match its SHA-256.",
  });

  const passkey = await verifyPasskeyProof(b.intent_record, subtle);
  checks.push({ id: "passkey", ok: passkey.ok, label: "Buyer's passkey", detail: passkey.detail });
  checks.push(orderCheck(b, ownOf, confirmed?.hash));
  checks.push({
    id: "fulfillment",
    ok: null,
    label: "Delivery events",
    detail: b.fulfillment.length
      ? `${b.fulfillment.length} events from the merchant's shipping records (not signed).`
      : "No delivery events.",
  });

  const ok = (id: string) => checks.find((x) => x.id === id)!.ok;
  const verdict = checks.some((x) => x.ok === false)
    ? "failed"
    : ["chain", "record", "card", "signatures", "key"].every((id) => ok(id) === true)
      ? "verified"
      : "partial";
  return { verdict, checks, bundle: b };
}

function orderCheck(b: EvidenceBundle, ownOf: (type: string) => LedgerEntry | undefined, confirmedHash?: string): Check {
  const label = "PayPal order binding";
  if (!b.order) return { id: "order", ok: null, label, detail: "No PayPal order for this receipt yet." };
  const created = ownOf("ORDER_CREATED")?.payload as
    { paypal_order_id?: string; custom_id?: string; amount?: { value: string; currency_code: string } } | undefined;
  const captured = ownOf("CAPTURE_COMPLETED")?.payload as { paypal_capture_id?: string } | undefined;
  const fail = (detail: string): Check => ({ id: "order", ok: false, label, detail });
  if (!created) return fail("The pack has no signed order entry.");
  if (created.paypal_order_id !== b.order.paypal_order_id) return fail("The order id differs from the signed order entry.");
  if (created.custom_id !== b.order.custom_id) return fail("custom_id differs from the signed order entry.");
  if (created.amount?.value !== b.order.amount.value || created.amount?.currency_code !== b.order.amount.currency_code) {
    return fail("The amount differs from the signed order entry.");
  }
  if (!confirmedHash || b.order.custom_id !== `${b.intent_id}:${confirmedHash.slice(0, 16)}`) {
    return fail("custom_id does not carry this receipt's confirmation hash.");
  }
  if (b.order.paypal_capture_id && captured?.paypal_capture_id !== b.order.paypal_capture_id)
    return fail("The capture id differs from the signed capture entry.");
  return {
    id: "order",
    ok: true,
    label,
    detail: `PayPal order ${b.order.paypal_order_id} carries custom_id ${b.order.custom_id}: this receipt's id and confirmation hash.`,
  };
}
