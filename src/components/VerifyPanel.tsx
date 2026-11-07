"use client";

import { useState } from "react";
import { BusyLabel, CheckIcon, CrossIcon } from "./ui";
import {
  bytesToHex,
  entryBodyInput,
  entryHashInput,
  GENESIS_HASH,
  hexToBytes,
  type LedgerEntry,
  type RedactedLedgerEntry,
} from "@/lib/ledger/canonical";

type Result =
  | { state: "idle" }
  | { state: "running" }
  | { state: "ok"; count: number; keyId: string; sigMode: "browser" | "server" }
  | { state: "fail"; seq: number; reason: string };

const b64ToBytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const sha256 = async (s: string) => bytesToHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));

/** Recomputes every hash with Web Crypto and checks Ed25519 signatures in the browser where supported. */
export function VerifyPanel({ intentId, serverOk, count, keyId }: { intentId: string; serverOk: boolean; count: number; keyId: string }) {
  const [result, setResult] = useState<Result>({ state: "idle" });

  async function verify() {
    setResult({ state: "running" });
    try {
      const res = await fetch(`/api/ledger/${intentId}`, { cache: "no-store" });
      const data = (await res.json()) as {
        entries: (LedgerEntry | RedactedLedgerEntry)[];
        server_verification: { ok: boolean };
        key: { key_id: string; jwk: JsonWebKey };
      };
      let key: CryptoKey | null = null;
      try {
        key = await crypto.subtle.importKey("jwk", { ...data.key.jwk, ext: true }, { name: "Ed25519" }, false, ["verify"]);
      } catch {
        key = null; // browser lacks Ed25519 in Web Crypto: fall back to server signature check
      }
      let prev = GENESIS_HASH;
      for (const e of data.entries) {
        if (e.prev_hash !== prev) return setResult({ state: "fail", seq: e.seq, reason: "chain link broken (prev_hash mismatch)" });
        // This receipt's entries: recompute the body digest from the content.
        // Other receipts' entries arrive redacted, with only their body digest.
        const bodySha = "redacted" in e ? e.body_sha256 : await sha256(entryBodyInput(e));
        const digest = await sha256(entryHashInput({ seq: e.seq, type: e.type, prev_hash: e.prev_hash, body_sha256: bodySha }));
        if (digest !== e.hash) return setResult({ state: "fail", seq: e.seq, reason: "hash does not match the entry contents" });
        if (key) {
          const ok = await crypto.subtle.verify({ name: "Ed25519" }, key, b64ToBytes(e.signature), hexToBytes(e.hash));
          if (!ok) return setResult({ state: "fail", seq: e.seq, reason: "signature invalid" });
        }
        prev = e.hash;
      }
      if (!key && !data.server_verification.ok) return setResult({ state: "fail", seq: 0, reason: "server signature check failed" });
      setResult({ state: "ok", count: data.entries.length, keyId: data.key.key_id, sigMode: key ? "browser" : "server" });
    } catch (e) {
      setResult({ state: "fail", seq: 0, reason: (e as Error).message });
    }
  }

  return (
    <section className="card p-5" aria-live="polite">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div>
          <h2 className="font-semibold">Verify this receipt</h2>
          <p className="text-sm text-ink-3">
            Server check: {serverOk ? `chain intact, ${count} entries, key ${keyId}` : "FAILED"}. Run the check yourself in this browser:
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={verify} disabled={result.state === "running"} aria-busy={result.state === "running"}>
          <BusyLabel busy={result.state === "running"} busyText="Verifying…">
            Verify
          </BusyLabel>
        </button>
      </div>
      {result.state === "ok" && (
        <div className="reveal mt-4 rounded-lg bg-success-soft text-success p-3 font-semibold" role="status">
          <CheckIcon className="inline -mt-0.5 mr-1.5" />
          Chain intact, {result.count} entries, signed by {result.keyId}.
          <span className="block font-normal text-sm mt-1">
            SHA-256 recomputed in your browser.{" "}
            {result.sigMode === "browser" ? "Ed25519 signatures verified in your browser." : "Your browser lacks Ed25519 in Web Crypto, so signatures were verified on the server."}
          </span>
        </div>
      )}
      {result.state === "fail" && (
        <div className="reveal mt-4 rounded-lg bg-danger-soft text-danger p-3 font-semibold" role="alert">
          <CrossIcon className="inline -mt-0.5 mr-1.5" />
          Verification failed{result.seq ? ` at seq ${result.seq}` : ""}: {result.reason}
        </div>
      )}
    </section>
  );
}
