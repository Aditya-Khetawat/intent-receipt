"use client";

import { useRef, useState, type DragEvent } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { EASE } from "./motion";
import { CheckIcon, CrossIcon, SourceBadge, Spinner } from "./ui";
import { verifyEvidenceBundle } from "@/lib/evidence/verify";
import type { BundleVerification, Check } from "@/lib/evidence/types";

// PayPal's own per-file limit for evidence; anything larger is not a pack we produced.
const MAX_BYTES = 10 * 1024 * 1024;

type State =
  | { state: "idle" }
  | { state: "reading"; name: string }
  | { state: "done"; name: string; result: BundleVerification }
  | { state: "error"; name: string; message: string };

async function readPack(file: File): Promise<unknown> {
  if (file.size > MAX_BYTES) throw new Error("This file is over 10 MB, so it is not an IntentReceipt evidence pack.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-") {
    const { extractBundleFromPdf } = await import("@/lib/evidence/extract");
    const bundle = await extractBundleFromPdf(bytes);
    if (bundle === null) throw new Error("This PDF has no IntentReceipt evidence inside it.");
    return bundle;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error("This file is neither an evidence PDF nor its JSON.");
  }
}

async function publishedKey() {
  try {
    const res = await fetch("/.well-known/intent-receipt-key.json", { cache: "no-store" });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

const VERDICT = {
  verified: {
    tone: "bg-success-soft text-success",
    title: "Verified",
    body: "This pack is exactly what IntentReceipt signed. Every hash and signature was checked in this browser against the published key.",
  },
  partial: {
    tone: "bg-warning-soft text-warning",
    title: "Partly verified",
    body: "Nothing failed, but some checks could not run here. See which below.",
  },
  failed: {
    tone: "bg-danger-soft text-danger",
    title: "Failed",
    body: "This pack was altered after signing, or IntentReceipt did not sign it.",
  },
} as const;

export function PackVerifier({ sampleHref }: { sampleHref: string }) {
  const [s, setS] = useState<State>({ state: "idle" });
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function check(file: File | undefined) {
    if (!file) return;
    setS({ state: "reading", name: file.name });
    try {
      const [bundle, trustedKey] = await Promise.all([readPack(file), publishedKey()]);
      setS({ state: "done", name: file.name, result: await verifyEvidenceBundle(bundle, { trustedKey }) });
    } catch (e) {
      setS({ state: "error", name: file.name, message: (e as Error).message });
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setOver(false);
    void check(e.dataTransfer.files[0]);
  }

  return (
    <div className="space-y-5">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={`card block cursor-pointer border-2 border-dashed p-8 text-center transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent ${
          over ? "border-accent bg-accent-soft" : "border-line-strong hover:border-accent"
        }`}
      >
        <input
          ref={input}
          type="file"
          accept=".pdf,.json,application/pdf,application/json"
          className="sr-only"
          onChange={(e) => void check(e.target.files?.[0])}
        />
        <span className="block font-semibold">Drop an evidence pack here, or choose a file</span>
        <span className="block text-sm text-ink-3 mt-1">The PDF from a receipt or a PayPal dispute, or its JSON. Nothing is uploaded.</span>
      </label>
      <p className="text-sm text-ink-3">
        No file to hand?{" "}
        <a href={sampleHref} download className="underline decoration-line-strong hover:text-ink">
          Download the S1 receipt&apos;s pack
        </a>{" "}
        and drop it above, or edit its JSON and watch the check fail.
      </p>

      <div aria-live="polite">
        {s.state === "reading" && (
          <p className="flex items-center gap-2 text-sm text-ink-2" role="status">
            <Spinner /> Checking {s.name}…
          </p>
        )}
        {s.state === "error" && (
          <p role="alert" className="rounded-lg bg-danger-soft text-danger p-3 text-sm">
            <CrossIcon className="inline -mt-0.5 mr-1.5" />
            <strong className="font-semibold">{s.name}:</strong> {s.message}
          </p>
        )}
        {s.state === "done" && <Result key={s.name + s.result.verdict} name={s.name} r={s.result} />}
      </div>
    </div>
  );
}

function Result({ name, r }: { name: string; r: BundleVerification }) {
  const v = VERDICT[r.verdict];
  const b = r.bundle;
  return (
    <motion.div
      className="space-y-5"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE }}
    >
      <div role="status" className={`rounded-lg p-4 ${v.tone}`}>
        <p className="font-semibold">
          {r.verdict === "failed" ? <CrossIcon className="inline -mt-0.5 mr-1.5" /> : <CheckIcon className="inline -mt-0.5 mr-1.5" />}
          {v.title}: <span className="font-mono text-sm break-all">{name}</span>
        </p>
        <p className="text-sm mt-1">{v.body}</p>
      </div>

      <section className="card p-5" aria-labelledby="checks-heading">
        <h2 id="checks-heading" className="font-semibold">
          What was checked
        </h2>
        <ul className="mt-3 divide-y divide-line">
          {r.checks.map((c) => (
            <CheckRow key={c.id} c={c} />
          ))}
        </ul>
      </section>

      {b && (
        <section className="card p-5" aria-labelledby="facts-heading">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="facts-heading" className="font-semibold">
              What the pack says
            </h2>
            <SourceBadge simulated={b.simulated} />
          </div>
          {r.verdict === "failed" && <p className="text-sm text-danger mt-1">Shown for inspection only: this pack did not verify.</p>}
          <dl className="mt-3 grid sm:grid-cols-[10rem_1fr] gap-x-4 gap-y-3 text-sm">
            <dt className="text-ink-3">Product</dt>
            <dd>{b.intent_record.selection?.product_name}</dd>
            <dt className="text-ink-3">Buyer asked</dt>
            <dd>&ldquo;{b.intent_record.request?.verbatim}&rdquo;</dd>
            <dt className="text-ink-3">Buyer confirmed</dt>
            <dd>
              <pre className="whitespace-pre-wrap font-sans rounded-lg bg-paper border border-line p-3">
                {b.intent_record.confirmation?.presented_text ?? "No confirmation"}
              </pre>
            </dd>
            {b.order && (
              <>
                <dt className="text-ink-3">PayPal order</dt>
                <dd className="font-mono break-all">
                  {b.order.paypal_order_id}
                  {b.order.paypal_capture_id && <span className="block text-ink-3">capture {b.order.paypal_capture_id}</span>}
                </dd>
              </>
            )}
            <dt className="text-ink-3">Receipt</dt>
            <dd>
              {/* Only this site's own path: URLs inside an uploaded file are not trusted. */}
              <Link
                href={`/receipt/${encodeURIComponent(b.intent_id)}`}
                className="font-mono underline decoration-line-strong hover:text-ink break-all"
              >
                /receipt/{b.intent_id}
              </Link>
            </dd>
          </dl>
        </section>
      )}
    </motion.div>
  );
}

function CheckRow({ c }: { c: Check }) {
  return (
    <li className="flex gap-3 py-2.5 text-sm">
      <span className="mt-0.5 flex-none w-4" aria-hidden>
        {c.ok === true ? (
          <CheckIcon className="text-success" />
        ) : c.ok === false ? (
          <CrossIcon className="text-danger" />
        ) : (
          <span className="text-ink-3">–</span>
        )}
      </span>
      <span className="min-w-0">
        <span className="font-medium">
          {c.label}
          <span className="sr-only">: {c.ok === true ? "passed" : c.ok === false ? "failed" : "not checked"}</span>
        </span>
        <span className={`block break-words ${c.ok === false ? "text-danger" : "text-ink-3"}`}>{c.detail}</span>
      </span>
    </li>
  );
}
