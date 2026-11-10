"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { BusyLabel, CheckIcon, CrossIcon } from "./ui";
import { EASE } from "./motion";
import type { LedgerEntry, RedactedLedgerEntry } from "@/lib/ledger/canonical";
import { verifyChain, type ChainLink as Link } from "@/lib/evidence/verify";
import { verifyPasskeyProof } from "@/lib/passkey/verify";
import type { IntentRecord } from "@/lib/intents";

type Result =
  | { state: "idle" }
  | { state: "running" }
  | { state: "ok"; links: Link[]; keyId: string; sigMode: "browser" | "server"; passkey: { ok: boolean | null; detail: string } }
  | { state: "fail"; links: Link[]; seq: number; reason: string };

const ownCount = (links: Link[]) => links.filter((l) => l.own).length;

// The trail replays the check in order; long chains compress so it never takes over a second.
const STEP = 0.045;
const MAX_TRAIL = 0.9;
const delayFor = (i: number, n: number) => Math.min(i * STEP, (MAX_TRAIL * i) / Math.max(n, 1));

/** Recomputes every hash with Web Crypto and checks Ed25519 signatures in the browser where supported. */
export function VerifyPanel({ intentId, serverOk, count, keyId }: { intentId: string; serverOk: boolean; count: number; keyId: string }) {
  const [result, setResult] = useState<Result>({ state: "idle" });
  const [run, setRun] = useState(0);

  async function verify() {
    setResult({ state: "running" });
    setRun((r) => r + 1);
    try {
      const res = await fetch(`/api/ledger/${intentId}`, { cache: "no-store" });
      const data = (await res.json()) as {
        entries: (LedgerEntry | RedactedLedgerEntry)[];
        server_verification: { ok: boolean };
        key: { key_id: string; jwk: JsonWebKey };
      };
      const c = await verifyChain(data.entries, data.key.jwk);
      if (!c.ok) return setResult({ state: "fail", links: c.links, seq: c.failSeq ?? 0, reason: c.reason ?? "verification failed" });
      // A browser without Ed25519 in Web Crypto falls back to the server's signature check.
      if (c.sigMode === "none" && !data.server_verification.ok) {
        return setResult({ state: "fail", links: c.links, seq: 0, reason: "server signature check failed" });
      }
      // The buyer's passkey signature, re-checked from the signed confirmation entry.
      const confirmed = data.entries.find((e): e is LedgerEntry => !("redacted" in e) && e.type === "INTENT_CONFIRMED");
      const record = (confirmed?.payload as { intent_record?: IntentRecord } | undefined)?.intent_record;
      const passkey = record ? await verifyPasskeyProof(record) : { ok: null, detail: "Not confirmed yet." };
      if (passkey.ok === false)
        return setResult({ state: "fail", links: c.links, seq: confirmed!.seq, reason: `buyer passkey: ${passkey.detail}` });
      setResult({ state: "ok", links: c.links, keyId: data.key.key_id, sigMode: c.sigMode === "browser" ? "browser" : "server", passkey });
    } catch (e) {
      setResult({ state: "fail", links: [], seq: 0, reason: (e as Error).message });
    }
  }

  const done = result.state === "ok" || result.state === "fail";
  const trailEnd = done ? delayFor(result.links.length, result.links.length) + 0.2 : 0;

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div>
          <h2 className="font-semibold">Verify this receipt</h2>
          <p className="text-sm text-ink-3">
            Server check: {serverOk ? `whole ledger intact (${count} entries, key ${keyId})` : "FAILED"}. Re-check this receipt&apos;s chain
            yourself, in this browser:
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={verify}
          disabled={result.state === "running"}
          aria-busy={result.state === "running"}
        >
          <BusyLabel busy={result.state === "running"} busyText="Verifying…">
            {done ? "Verify again" : "Verify"}
          </BusyLabel>
        </button>
      </div>

      {done && result.links.length > 0 && <ChainTrail key={run} links={result.links} />}

      {/* Only the outcome is announced; the trail above is visual replay. */}
      <div aria-live="polite">
        {result.state === "ok" && (
          <motion.div
            key={`ok-${run}`}
            className="mt-4 rounded-lg bg-success-soft text-success p-3 font-semibold"
            role="status"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32, ease: EASE, delay: trailEnd }}
          >
            <CheckIcon className="inline -mt-0.5 mr-1.5" />
            Chain intact, {result.links.length} entries, signed by {result.keyId}.
            <span className="block font-normal text-sm mt-1">
              Checked every entry from #1 up to this receipt&apos;s last ({ownCount(result.links)} of them belong to this receipt). SHA-256
              recomputed in your browser.{" "}
              {result.sigMode === "browser"
                ? "Ed25519 signatures verified in your browser."
                : "Your browser lacks Ed25519 in Web Crypto, so signatures were verified on the server."}
            </span>
            <span className="block font-normal text-sm mt-1">
              {result.passkey.ok === true
                ? `Buyer passkey verified in your browser. ${result.passkey.detail}`
                : `Buyer passkey: ${result.passkey.detail}`}
            </span>
          </motion.div>
        )}
        {result.state === "fail" && (
          <motion.div
            key={`fail-${run}`}
            className="mt-4 rounded-lg bg-danger-soft text-danger p-3 font-semibold"
            role="alert"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32, ease: EASE, delay: trailEnd }}
          >
            <CrossIcon className="inline -mt-0.5 mr-1.5" />
            Verification failed{result.seq ? ` at seq ${result.seq}` : ""}: {result.reason}
          </motion.div>
        )}
      </div>
    </section>
  );
}

/**
 * The verified chain, replayed link by link: solid dots are this receipt's entries (content
 * recomputed here), rings are other receipts' entries (hash only). A red dot marks the break.
 */
function ChainTrail({ links }: { links: Link[] }) {
  const n = links.length;
  return (
    <div className="mt-4">
      <ol className="flex flex-wrap items-center gap-y-2" aria-hidden="true">
        {links.map((l, i) => (
          <li key={l.seq} className="flex items-center">
            {i > 0 && (
              <motion.span
                className={`h-px w-4 origin-left ${l.ok ? "bg-success" : "bg-danger"}`}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.12, delay: delayFor(i, n) - 0.04 }}
                aria-hidden
              />
            )}
            <motion.span
              title={`seq ${l.seq} · ${l.own ? l.type : "another receipt (hash only)"}${l.ok ? "" : " · failed"}`}
              className={`block rounded-full ${l.own ? "h-3 w-3" : "h-2 w-2 border-[1.5px]"} ${
                l.ok ? (l.own ? "bg-success" : "border-success") : "bg-danger ring-4 ring-danger-soft"
              }`}
              initial={{ scale: 0.3, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 600, damping: 28, delay: delayFor(i, n) }}
            ></motion.span>
          </li>
        ))}
      </ol>
      <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-3">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-success" aria-hidden /> this receipt, recomputed here
        </span>
        {links.some((l) => !l.own) && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full border-[1.5px] border-success" aria-hidden /> other receipts, hash only
          </span>
        )}
      </p>
    </div>
  );
}
