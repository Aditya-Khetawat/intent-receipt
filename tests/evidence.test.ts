import { beforeEach, describe, expect, it } from "vitest";
import { resetTestDb } from "@/lib/db";
import { publicKeyDocument } from "@/lib/ledger/keys";
import { buildEvidenceBundle } from "@/lib/evidence/bundle";
import { verifyEvidenceBundle } from "@/lib/evidence/verify";
import type { EvidenceBundle } from "@/lib/evidence/types";
import { evidenceFileName, renderEvidencePdf, toWinAnsi } from "@/lib/evidence/pdf";
import { extractBundleFromPdf } from "@/lib/evidence/extract";
import { PDFDocument } from "pdf-lib";

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

  it("is only partly verified when the published key cannot be compared", async () => {
    const r = await verifyEvidenceBundle(buildEvidenceBundle(S1)!, { trustedKey: null });
    expect(check(r, "key").ok).toBeNull();
    expect(r.verdict).toBe("partial");
  });

  it("rejects a pack re-signed with a key of the forger's choosing", async () => {
    const b = clone(buildEvidenceBundle(S1)!);
    const forger = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
    const jwk = (await crypto.subtle.exportKey("jwk", (forger as CryptoKeyPair).publicKey)) as { kty: string; crv: string; x: string };
    for (const e of b.ledger.entries) {
      const sig = await crypto.subtle.sign({ name: "Ed25519" }, (forger as CryptoKeyPair).privateKey, Buffer.from(e.hash, "hex"));
      e.signature = Buffer.from(sig).toString("base64");
    }
    b.ledger.key.jwk = { kty: jwk.kty, crv: jwk.crv, x: jwk.x };
    const r = await verifyEvidenceBundle(b, { trustedKey: trusted() });
    expect(check(r, "signatures").ok).toBe(false);
    expect(check(r, "key").ok).toBe(false);
    expect(r.verdict).toBe("failed");
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

describe("evidence PDF", () => {
  beforeEach(() => {
    resetTestDb();
  });

  it("is a PDF under PayPal's 10 MB limit that carries the bundle inside", async () => {
    const b = buildEvidenceBundle(S1)!;
    const pdf = await renderEvidencePdf(b);
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe("%PDF-");
    expect(pdf.byteLength).toBeLessThan(10 * 1024 * 1024);
    expect(await extractBundleFromPdf(pdf)).toEqual(b);
  });

  it("names the file the way PayPal's documents[].name pattern allows", () => {
    const name = evidenceFileName(S1);
    expect(name).toBe("IntentReceipt-evidence-ir_seed_s1_ridge40.pdf");
    expect(name).toMatch(/^[A-Za-z0-9-_,\s]+[.]{1}[A-Za-z]+$/);
  });

  it("renders text its standard font cannot draw, and says so", async () => {
    const b = clone(buildEvidenceBundle(S1)!);
    b.intent_record.request.verbatim = "Need a 40L bag 🎒 बैग → black";
    const pdf = await renderEvidencePdf(b);
    expect(await extractBundleFromPdf(pdf)).toEqual(b);
    expect(toWinAnsi("a→b")).toEqual({ text: "a->b", substituted: true });
    expect(toWinAnsi("Größe · 40 L")).toEqual({ text: "Größe · 40 L", substituted: false });
  });

  it("finds nothing in a PDF without the embedded receipt", async () => {
    const blank = await PDFDocument.create();
    blank.addPage();
    expect(await extractBundleFromPdf(await blank.save())).toBeNull();
    expect(await extractBundleFromPdf(new TextEncoder().encode("not a pdf"))).toBeNull();
  });
});
