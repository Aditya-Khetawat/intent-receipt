import { beforeEach, describe, expect, it } from "vitest";
import { resetTestDb } from "@/lib/db";
import { publicKeyDocument } from "@/lib/ledger/keys";
import { buildEvidenceBundle } from "@/lib/evidence/bundle";
import { verifyEvidenceBundle } from "@/lib/evidence/verify";
import type { EvidenceBundle } from "@/lib/evidence/types";

const S1 = "ir_seed_s1_ridge40";
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const trusted = () => publicKeyDocument();
const check = (r: Awaited<ReturnType<typeof verifyEvidenceBundle>>, id: string) => r.checks.find((c) => c.id === id)!;

describe("evidence bundle", () => {
  beforeEach(() => {
    resetTestDb();
  });

  it("carries the signed receipt and verifies against the published key", async () => {
    const b = buildEvidenceBundle(S1)!;
    expect(b.schema).toBe("intentreceipt-evidence/0.1");
    expect(b.simulated).toBe(true);
    expect(b.order?.custom_id.startsWith(`${S1}:`)).toBe(true);
    expect(b.intent_record.confirmation?.presented_text).toBeTruthy();
    const r = await verifyEvidenceBundle(b, { trustedKey: trusted() });
    expect(r.checks.filter((c) => c.ok === false)).toEqual([]);
    expect(r.verdict).toBe("verified");
  });

  it("returns null for an unknown intent", () => {
    expect(buildEvidenceBundle("nope")).toBeNull();
  });

  it("fails the record check when the readable copy is edited", async () => {
    const b = clone(buildEvidenceBundle(S1)!);
    b.intent_record.selection.price_cents = 1;
    const r = await verifyEvidenceBundle(b, { trustedKey: trusted() });
    expect(r.verdict).toBe("failed");
    expect(check(r, "record").ok).toBe(false);
  });

  it("fails the chain at the edited entry when a signed payload is changed", async () => {
    const b = clone(buildEvidenceBundle(S1)!);
    const own = b.ledger.entries.find((e) => !("redacted" in e) && e.type === "ORDER_CREATED")!;
    (own as { payload: { paypal_order_id: string } }).payload.paypal_order_id = "SIM-FORGED";
    const r = await verifyEvidenceBundle(b, { trustedKey: trusted() });
    expect(check(r, "chain").ok).toBe(false);
    expect(check(r, "chain").detail).toContain(`#${own.seq}`);
  });

  it("fails the card check when the confirmed text no longer matches its hash", async () => {
    const b = clone(buildEvidenceBundle(S1)!);
    b.intent_record.confirmation!.presented_text += "\nFree returns forever";
    const r = await verifyEvidenceBundle(b, { trustedKey: trusted() });
    expect(check(r, "card").ok).toBe(false);
    expect(r.verdict).toBe("failed");
  });

  it("fails the key check against a different published key", async () => {
    const b = buildEvidenceBundle(S1)!;
    const other = { ...trusted(), jwk: { ...trusted().jwk, x: "A".repeat(43) } };
    const r = await verifyEvidenceBundle(b, { trustedKey: other });
    expect(check(r, "key").ok).toBe(false);
  });

  it("rejects input that is not a pack", async () => {
    const r = await verifyEvidenceBundle({ hello: 1 });
    expect(r.verdict).toBe("failed");
    expect(check(r, "schema").ok).toBe(false);
    expect(r.bundle).toBeNull();
  });

  it("reports partial, not verified, when the browser cannot check Ed25519", async () => {
    const b: EvidenceBundle = buildEvidenceBundle(S1)!;
    const noEd25519 = Object.assign(Object.create(crypto.subtle), {
      importKey: () => Promise.reject(new Error("Ed25519 unsupported")),
      digest: (alg: AlgorithmIdentifier, data: BufferSource) => crypto.subtle.digest(alg, data),
    }) as SubtleCrypto;
    const r = await verifyEvidenceBundle(b, { trustedKey: trusted(), subtle: noEd25519 });
    expect(check(r, "signatures").ok).toBeNull();
    expect(r.verdict).toBe("partial");
  });
});
