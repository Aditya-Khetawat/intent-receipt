import crypto from "node:crypto";
import type Database from "better-sqlite3";
import { rawDb, nowIso } from "@/lib/db";
import { GENESIS_HASH, entryBodyInput, entryHashInput, type LedgerEntry, type LedgerType, type RedactedLedgerEntry } from "./canonical";
import { signingKey } from "./keys";

export * from "./canonical";

interface LedgerRow {
  seq: number;
  type: LedgerType;
  intent_id: string;
  payload_json: string;
  prev_hash: string;
  hash: string;
  signature: string;
  key_id: string;
  created_at: string;
}

function rowToEntry(r: LedgerRow): LedgerEntry {
  return {
    seq: r.seq,
    type: r.type,
    intent_id: r.intent_id,
    payload: JSON.parse(r.payload_json),
    prev_hash: r.prev_hash,
    hash: r.hash,
    signature: r.signature,
    key_id: r.key_id,
    created_at: r.created_at,
  };
}

export function sha256Hex(s: string | Buffer): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

/** Append a signed, hash-chained entry. Runs in a transaction so seq/prev_hash are consistent. */
export function appendLedger(
  type: LedgerType,
  intentId: string,
  payload: unknown,
  opts: { createdAt?: string; db?: Database.Database } = {},
): LedgerEntry {
  const db = opts.db ?? rawDb();
  const key = signingKey();
  const tx = db.transaction(() => {
    const last = db.prepare("SELECT seq, hash FROM ledger ORDER BY seq DESC LIMIT 1").get() as
      | { seq: number; hash: string }
      | undefined;
    const seq = (last?.seq ?? 0) + 1;
    const prev_hash = last?.hash ?? GENESIS_HASH;
    // Round-trip payload through JSON so what we hash is exactly what we store.
    const storedPayload = JSON.parse(JSON.stringify(payload));
    const body_sha256 = sha256Hex(entryBodyInput({ intent_id: intentId, payload: storedPayload }));
    const hash = sha256Hex(entryHashInput({ seq, type, prev_hash, body_sha256 }));
    const signature = crypto.sign(null, Buffer.from(hash, "hex"), key.privateKey).toString("base64");
    const created_at = opts.createdAt ?? nowIso();
    db.prepare(
      `INSERT INTO ledger (seq, type, intent_id, payload_json, prev_hash, hash, signature, key_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(seq, type, intentId, JSON.stringify(storedPayload), prev_hash, hash, signature, key.keyId, created_at);
    return { seq, type, intent_id: intentId, payload: storedPayload, prev_hash, hash, signature, key_id: key.keyId, created_at };
  });
  return tx();
}

export function allEntries(db: Database.Database = rawDb()): LedgerEntry[] {
  return (db.prepare("SELECT * FROM ledger ORDER BY seq ASC").all() as LedgerRow[]).map(rowToEntry);
}

export function entriesForIntent(intentId: string, db: Database.Database = rawDb()): LedgerEntry[] {
  return (db.prepare("SELECT * FROM ledger WHERE intent_id = ? ORDER BY seq ASC").all(intentId) as LedgerRow[]).map(
    rowToEntry,
  );
}

/**
 * Data for verifying one receipt: the chain up to its last entry, with every other
 * receipt's entries reduced to headers (no intent id, no payload).
 */
export function chainForIntent(intentId: string, db: Database.Database = rawDb()): (LedgerEntry | RedactedLedgerEntry)[] {
  const own = entriesForIntent(intentId, db);
  const last = own.at(-1)?.seq ?? 0;
  return allEntries(db)
    .filter((e) => e.seq <= last)
    .map((e) =>
      e.intent_id === intentId
        ? e
        : {
            seq: e.seq,
            type: e.type,
            redacted: true as const,
            body_sha256: sha256Hex(entryBodyInput(e)),
            prev_hash: e.prev_hash,
            hash: e.hash,
            signature: e.signature,
            key_id: e.key_id,
          },
    );
}

export interface LedgerVerification {
  ok: boolean;
  count: number;
  key_id: string;
  first_bad_seq: number | null;
  reason: string | null;
}

/** Recompute every hash, chain link and signature (invariant I2). */
export function verifyLedger(entries: LedgerEntry[] = allEntries()): LedgerVerification {
  const key = signingKey();
  let prev = GENESIS_HASH;
  let expectedSeq = entries[0]?.seq ?? 1;
  for (const e of entries) {
    const fail = (reason: string): LedgerVerification => ({
      ok: false,
      count: entries.length,
      key_id: key.keyId,
      first_bad_seq: e.seq,
      reason,
    });
    if (e.seq !== expectedSeq) return fail("sequence gap");
    if (e.prev_hash !== prev) return fail("prev_hash does not match previous entry");
    const recomputed = sha256Hex(entryHashInput({ ...e, body_sha256: sha256Hex(entryBodyInput(e)) }));
    if (recomputed !== e.hash) return fail("hash does not match entry contents");
    if (e.key_id !== key.keyId) return fail(`unknown key_id ${e.key_id}`);
    const sigOk = crypto.verify(null, Buffer.from(e.hash, "hex"), key.publicKey, Buffer.from(e.signature, "base64"));
    if (!sigOk) return fail("signature invalid");
    prev = e.hash;
    expectedSeq++;
  }
  return { ok: true, count: entries.length, key_id: key.keyId, first_bad_seq: null, reason: null };
}
