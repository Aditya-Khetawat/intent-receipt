import { describe, expect, it, beforeEach } from "vitest";
import { resetTestDb } from "@/lib/db";
import {
  appendLedger,
  allEntries,
  canonicalize,
  chainForIntent,
  verifyLedger,
  GENESIS_HASH,
  sha256Hex,
  entryBodyInput,
  entryHashInput,
} from "@/lib/ledger";

describe("canonicalize", () => {
  it("sorts keys recursively and strips whitespace", () => {
    expect(canonicalize({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: "x" } })).toBe('{"a":{"c":"x","d":[3,{"y":2,"z":1}]},"b":1}');
  });
  it("matches fixed vectors", () => {
    expect(canonicalize(null)).toBe("null");
    expect(canonicalize([true, false, 1.5, -0.25, "é\n\""])).toBe('[true,false,1.5,-0.25,"é\\n\\""]');
    expect(canonicalize({ u: undefined, k: 1 })).toBe('{"k":1}');
    expect(sha256Hex(canonicalize({ a: 1 }))).toBe("015abd7f5cc57a2dd94b7590f04ad8084273905ee33ec5cebeae62276a97f862");
  });
  it("rejects non-finite numbers", () => {
    expect(() => canonicalize(NaN)).toThrow();
    expect(() => canonicalize({ x: Infinity })).toThrow();
  });
});

describe("ledger", () => {
  beforeEach(() => {
    resetTestDb(false);
  });

  it("chains and signs entries", () => {
    const a = appendLedger("INTENT_CONFIRMED", "ir_1", { n: 1 });
    const b = appendLedger("ORDER_CREATED", "ir_1", { n: 2 });
    expect(a.prev_hash).toBe(GENESIS_HASH);
    expect(b.prev_hash).toBe(a.hash);
    expect(a.hash).toBe(sha256Hex(entryHashInput({ ...a, body_sha256: sha256Hex(entryBodyInput(a)) })));
    expect(verifyLedger()).toMatchObject({ ok: true, count: 2, first_bad_seq: null });
  });

  it("shares other receipts only as verifiable headers", () => {
    appendLedger("INTENT_CONFIRMED", "ir_other", { request: "someone else's private request" });
    appendLedger("INTENT_CONFIRMED", "ir_mine", { request: "mine" });
    appendLedger("ORDER_CREATED", "ir_other", { amount: 5 });
    appendLedger("ORDER_CREATED", "ir_mine", { amount: 79 });
    appendLedger("CAPTURE_COMPLETED", "ir_other", { amount: 5 });
    const chain = chainForIntent("ir_mine");
    // Up to my last entry only, and nothing from the other receipt but headers.
    expect(chain.map((e) => e.seq)).toEqual([1, 2, 3, 4]);
    expect(JSON.stringify(chain)).not.toMatch(/private request|ir_other/);
    // Same algorithm as the browser Verify.
    let prev = GENESIS_HASH;
    for (const e of chain) {
      const body = "redacted" in e ? e.body_sha256 : sha256Hex(entryBodyInput(e));
      expect(e.prev_hash).toBe(prev);
      expect(sha256Hex(entryHashInput({ seq: e.seq, type: e.type, prev_hash: e.prev_hash, body_sha256: body }))).toBe(e.hash);
      prev = e.hash;
    }
  });

  it("is append-only at the database level", () => {
    const db = resetTestDb(false);
    appendLedger("INTENT_CONFIRMED", "ir_1", { n: 1 });
    expect(() => db.prepare("UPDATE ledger SET payload_json = '{}'").run()).toThrow(/append-only/);
  });

  it("detects tampering with a payload (first bad seq reported)", () => {
    const db = resetTestDb(false);
    appendLedger("INTENT_CONFIRMED", "ir_1", { amount: 79 });
    appendLedger("ORDER_CREATED", "ir_1", { amount: 79 });
    appendLedger("CAPTURE_COMPLETED", "ir_1", { amount: 79 });
    // Simulate an attacker with raw DB access who bypasses the trigger.
    db.exec("DROP TRIGGER ledger_no_update");
    db.prepare("UPDATE ledger SET payload_json = ? WHERE seq = 2").run(JSON.stringify({ amount: 7 }));
    const v = verifyLedger(allEntries());
    expect(v.ok).toBe(false);
    expect(v.first_bad_seq).toBe(2);
  });

  it("detects a forged signature and a broken link", () => {
    const db = resetTestDb(false);
    appendLedger("INTENT_CONFIRMED", "ir_1", { a: 1 });
    appendLedger("ORDER_CREATED", "ir_1", { a: 2 });
    db.exec("DROP TRIGGER ledger_no_update");
    db.prepare("UPDATE ledger SET signature = ? WHERE seq = 1").run(Buffer.alloc(64).toString("base64"));
    expect(verifyLedger()).toMatchObject({ ok: false, first_bad_seq: 1, reason: "signature invalid" });
  });
});
