import { getDb, nowIso } from "@/lib/db";
import { sha256Hex } from "@/lib/ledger";

/** Keeps the exact PDF sent to PayPal, addressed by its SHA-256 (invariant I4). */
export function storeEvidencePdf(intentId: string, name: string, pdf: Uint8Array): { sha256: string; bytes: number } {
  const buf = Buffer.from(pdf);
  const sha256 = sha256Hex(buf);
  getDb()
    .prepare("INSERT OR IGNORE INTO evidence_files (sha256, intent_id, name, pdf, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(sha256, intentId, name, buf, nowIso());
  return { sha256, bytes: buf.byteLength };
}

export function getEvidenceFile(sha256: string): { name: string; intent_id: string; pdf: Buffer } | null {
  if (!/^[0-9a-f]{64}$/.test(sha256)) return null;
  return (
    (getDb().prepare("SELECT name, intent_id, pdf FROM evidence_files WHERE sha256 = ?").get(sha256) as
      { name: string; intent_id: string; pdf: Buffer } | undefined) ?? null
  );
}
