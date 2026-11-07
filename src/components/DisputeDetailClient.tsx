"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { EASE } from "./motion";
import type { DisputeDetail } from "@/lib/views";
import {
  AlertIcon,
  Badge,
  BusyLabel,
  CheckIcon,
  CopyHash,
  CrossIcon,
  FAULT_TONE,
  SourceBadge,
  humanize,
  money,
  reasonLabel,
  shortDate,
} from "./ui";

type ActionType = "PROVIDE_EVIDENCE" | "ACCEPT_CLAIM" | "MAKE_OFFER" | "SEND_MESSAGE";

const ACTION_LABEL: Record<ActionType, string> = {
  PROVIDE_EVIDENCE: "Contest: provide evidence",
  ACCEPT_CLAIM: "Accept claim and refund",
  MAKE_OFFER: "Offer partial refund",
  SEND_MESSAGE: "Message buyer (request info)",
};

const FAULT_LABEL: Record<string, string> = { NONE: "No agent fault", POSSIBLE: "Possible agent fault", LIKELY: "Agent at fault" };

export function DisputeDetailClient({ initial }: { initial: DisputeDetail }) {
  const [d, setD] = useState(initial);
  const [elapsed, setElapsed] = useState(0);
  const analyzing = d.dispute.status === "ANALYZING" || d.dispute.status === "RECEIVED";
  // Animate the analysis in only when the visitor watched it being produced (page opened while
  // analyzing, or Retry). An analysis that is already there at load renders static.
  const [watched, setWatched] = useState(analyzing);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/disputes/${d.dispute.id}`, { cache: "no-store" });
    if (res.ok) setD(await res.json());
  }, [d.dispute.id]);

  useEffect(() => {
    if (!analyzing) return;
    const start = Date.now();
    const t = setInterval(() => {
      setElapsed(Math.round((Date.now() - start) / 1000));
      void refresh();
    }, 1500);
    return () => clearInterval(t);
  }, [analyzing, refresh]);

  async function retry() {
    await fetch(`/api/disputes/${d.dispute.id}/analyze`, { method: "POST" });
    setWatched(true);
    setD({ ...d, dispute: { ...d.dispute, status: "ANALYZING", error: null } });
  }

  const a = d.analysis;
  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <nav className="text-sm text-ink-3 mb-3">
        <Link href="/merchant" className="hover:text-ink">
          ← Dispute queue
        </Link>
      </nav>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold">{reasonLabel(d.dispute.reason)}</h1>
            <SourceBadge simulated={d.dispute.simulated} cached={a?.cached} />
            {d.dispute.scenario && <Badge tone="neutral">Scenario {d.dispute.scenario}</Badge>}
          </div>
          <p className="text-sm text-ink-2 mt-1">
            {d.intent?.record.buyer.display_name ?? "Buyer"} · {money(d.dispute.amount, d.dispute.currency)} · opened{" "}
            {shortDate(d.dispute.opened_at)} · <span className="font-mono text-[12px]">{d.dispute.paypal_dispute_id}</span>
          </p>
        </div>
        {d.intent && (
          <Link href={`/receipt/${d.intent.id}`} className="btn btn-secondary">
            Open intent receipt
          </Link>
        )}
      </header>

      <div aria-live="polite" className="mt-5">
        {analyzing ? (
          <div className="card p-5 space-y-3" role="status">
            <p className="text-sm text-ink-2">Analyst is reading the receipt, order and shipping history… {elapsed}s</p>
            <div className="skeleton h-7 w-1/2" />
            <div className="skeleton h-12" />
          </div>
        ) : d.dispute.status === "ERROR" ? (
          <div role="alert" className="card p-5 text-sm">
            <p className="font-semibold text-danger">Analysis failed: {d.dispute.error}</p>
            <p className="text-ink-2 mt-1">The record below is complete; only the AI recommendation is missing.</p>
            <button type="button" className="btn btn-secondary mt-3" onClick={retry}>
              Retry analysis
            </button>
          </div>
        ) : a ? (
          <Verdict d={d} fresh={watched} />
        ) : null}
      </div>

      <div className="grid lg:grid-cols-[1.35fr_1fr] gap-4 mt-4 items-start">
        <div className="space-y-4 min-w-0">
          <AskedVsConfirmed d={d} />
          <EvidenceSection d={d} analyzing={analyzing} fresh={watched} />
          <ThreadSection d={d} />
        </div>
        <div className="lg:sticky lg:top-20">
          <DecisionPanel key={a?.id ?? "none"} d={d} analyzing={analyzing} onDone={refresh} />
        </div>
      </div>
    </div>
  );
}

function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="card p-5" aria-label={title}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">{title}</h2>
        {aside}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** The AI's call, its confidence, and how much of its evidence survived the code check, in one place. */
function Verdict({ d, fresh }: { d: DisputeDetail; fresh: boolean }) {
  const a = d.analysis!;
  const o = a.output;
  const v = a.validation;
  const total = v.verified + v.failed;
  const pct = Math.round(o.confidence * 100);
  return (
    <motion.section
      className="card p-5 sm:p-6"
      aria-label="AI recommendation"
      initial={fresh ? { opacity: 0, y: 8 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE }}
    >
      <div className="grid md:grid-cols-[1fr_auto] gap-x-8 gap-y-4">
        <div className="min-w-0">
          <p className="text-sm text-ink-3">AI recommends · {a.cached ? "cached analysis" : `live, ${a.model}`}</p>
          <p className="mt-1 flex flex-wrap items-center gap-2">
            <span className="text-2xl font-semibold tracking-tight">{humanize(o.recommended_seller_action)}</span>
            <Badge tone="neutral">{humanize(o.classification)}</Badge>
            <Badge tone={FAULT_TONE[o.agent_fault]}>{FAULT_LABEL[o.agent_fault] ?? o.agent_fault}</Badge>
          </p>
          <p className="mt-3 text-ink-2 leading-relaxed max-w-[68ch]">{o.summary}</p>
        </div>
        <dl className="grid grid-cols-2 md:grid-cols-1 gap-x-6 gap-y-3 text-sm md:min-w-52 md:border-l md:border-line md:pl-6">
          <div>
            <dt className="text-ink-3">Confidence</dt>
            <dd className="mt-1 flex items-center gap-2">
              <span
                role="meter"
                aria-label="Confidence"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pct}
                className="h-1.5 w-20 rounded-full bg-neutral-soft overflow-hidden"
              >
                <span className="block h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
              </span>
              <span className="font-semibold tabular-nums">{pct}%</span>
            </dd>
          </div>
          <div>
            <dt className="text-ink-3">Citations checked by code</dt>
            <dd className="mt-1">
              <span className={`font-semibold tabular-nums ${v.failed === 0 ? "text-success" : "text-ink"}`}>
                {v.verified} of {total} kept
              </span>
              {v.failed > 0 && (
                <a href="#rejected" className="block text-ink-3 underline decoration-line-strong hover:text-ink">
                  {v.failed} rejected, see why
                </a>
              )}
            </dd>
          </div>
        </dl>
      </div>
      {v.needs_human_review && (
        <p className="mt-4 flex gap-2 rounded-lg bg-warning-soft text-warning p-3 text-sm">
          <AlertIcon className="mt-0.5 flex-none" />
          <span>
            <strong className="font-semibold">Check before acting.</strong> {v.verified === 0 ? "None of" : "Several of"} the analyst&apos;s
            citations failed verification on both passes, so this recommendation rests on less evidence than usual.
          </span>
        </p>
      )}
      <a href="#respond" className="btn btn-primary mt-4 lg:hidden">
        Review response
      </a>
    </motion.section>
  );
}

/** The gap only this product can show: the buyer's words next to the card they confirmed. */
function AskedVsConfirmed({ d }: { d: DisputeDetail }) {
  if (!d.intent) return null;
  const r = d.intent.record;
  return (
    <Section title="What the buyer asked vs what they confirmed">
      <div className="grid sm:grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg bg-neutral-soft p-3">
          <p className="text-ink-3 text-xs font-medium">Buyer asked the agent</p>
          <p className="mt-1.5 text-base leading-snug">&ldquo;{r.request.verbatim}&rdquo;</p>
        </div>
        <div className="rounded-lg border border-line p-3">
          <p className="text-ink-3 text-xs font-medium">Card they confirmed (signed)</p>
          <ul className="mt-1.5 space-y-0.5">
            {d.intent.card.split("\n").map((line, i) => (
              <CardLine key={i} line={line} />
            ))}
          </ul>
        </div>
      </div>
    </Section>
  );
}

function CardLine({ line }: { line: string }) {
  const status = line.startsWith("MET ·") ? "met" : line.startsWith("UNMET ·") ? "unmet" : null;
  const text = status ? line.replace(/^(UN)?MET · /, "") : line;
  return (
    <li className={`flex gap-1.5 ${status === "unmet" ? "text-danger" : ""}`}>
      {status === "met" && <CheckIcon className="mt-0.5 h-3.5 w-3.5 flex-none text-success" />}
      {status === "unmet" && <CrossIcon className="mt-0.5 h-3.5 w-3.5 flex-none" />}
      <span>{text}</span>
    </li>
  );
}

function EvidenceSection({ d, analyzing, fresh }: { d: DisputeDetail; analyzing: boolean; fresh: boolean }) {
  const a = d.analysis;
  return (
    <Section title="Verified evidence">
      {analyzing ? (
        <div className="space-y-2">
          <div className="skeleton h-16" />
          <div className="skeleton h-16" />
        </div>
      ) : a ? (
        <>
          <p className="text-sm text-ink-2 mb-3">
            Each item below cites a field in the record, and code confirmed the quoted value matches it.
          </p>
          <ul className="space-y-2">
            {a.output.evidence.map((e, i) => (
              <motion.li
                key={e.id}
                className="rounded-lg border border-line p-3 text-sm"
                initial={fresh ? { opacity: 0, y: 8 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: EASE, delay: 0.15 + Math.min(i, 8) * 0.06 }}
              >
                <div className="flex items-start gap-2">
                  <CheckIcon className="mt-0.5 flex-none text-success" />
                  <p className="flex-1">{e.claim}</p>
                  <Badge tone={e.supports === "BUYER" ? "warning" : e.supports === "SELLER" ? "accent" : "neutral"}>
                    {e.supports === "NEUTRAL" ? "Neutral" : `Supports ${e.supports.toLowerCase()}`}
                  </Badge>
                </div>
                <details className="mt-1.5 ml-6 text-xs">
                  <summary className="cursor-pointer text-ink-3 hover:text-ink">
                    Source <span className="font-mono">{e.pointer}</span>
                  </summary>
                  <pre className="mt-1 whitespace-pre-wrap font-mono bg-paper border border-line rounded p-2 break-all">
                    {JSON.stringify(e.source_value, null, 2)}
                  </pre>
                </details>
              </motion.li>
            ))}
          </ul>

          {a.rejected.length > 0 && (
            <div id="rejected" className="mt-5 scroll-mt-24">
              <h3 className="text-sm font-semibold">Rejected by code ({a.rejected.length})</h3>
              <p className="text-xs text-ink-3 mt-0.5">
                The analyst cited these, but the quoted value did not match the record. They were left out of the recommendation.
              </p>
              <ul className="mt-2 space-y-2">
                {a.rejected.map((e) => (
                  <li key={e.id} className="rounded-lg border border-dashed border-line-strong p-3 text-sm text-ink-2">
                    <div className="flex items-start gap-2">
                      <CrossIcon className="mt-0.5 flex-none text-danger" />
                      <p className="line-through decoration-ink-3/40">{e.claim}</p>
                    </div>
                    <p className="mt-1 ml-6 text-xs text-ink-3">
                      <span className="font-mono">{e.pointer}</span>: {e.reason}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-2 mt-5">
            <div className="rounded-lg bg-warning-soft p-3 text-sm">
              <p className="text-xs font-semibold text-warning mb-1">Buyer&apos;s view</p>
              {a.output.buyer_view}
            </div>
            <div className="rounded-lg bg-accent-soft p-3 text-sm">
              <p className="text-xs font-semibold text-accent mb-1">Seller&apos;s view</p>
              {a.output.seller_view}
            </div>
          </div>
          {a.output.uncertainties.length > 0 && (
            <>
              <h3 className="text-sm font-semibold mt-5 mb-1">What the analyst is unsure about</h3>
              <ul className="list-disc pl-5 text-sm text-ink-2 space-y-1">
                {a.output.uncertainties.map((u, i) => (
                  <li key={i}>{u}</li>
                ))}
              </ul>
            </>
          )}
        </>
      ) : (
        <p className="text-sm text-ink-3">No analysis yet.</p>
      )}
    </Section>
  );
}

function ThreadSection({ d }: { d: DisputeDetail }) {
  const flagged = d.messages.some((m) => m.instruction_like);
  return (
    <details className="card group" open={flagged}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5 [&::-webkit-details-marker]:hidden">
        <span>
          <span className="font-semibold">Messages and timeline</span>
          <span className="block text-sm text-ink-3">
            {d.messages.length} message{d.messages.length === 1 ? "" : "s"}, {d.timeline.length} events
            {flagged ? " · one message tried to instruct the analyst" : ""}
          </span>
        </span>
        <svg
          className="flex-none text-ink-3 transition-transform duration-200 group-open:rotate-180"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <div className="px-5 pb-5 grid md:grid-cols-2 gap-6">
        <div>
          <h3 className="text-sm font-semibold">Messages</h3>
          <p className="text-xs text-ink-3 mb-2">Passed to the analyst as untrusted data, never as instructions.</p>
          <ul className="space-y-3">
            {d.messages.map((m) => (
              <li key={m.id} className={`rounded-lg p-3 text-sm ${m.instruction_like ? "bg-danger-soft" : "bg-neutral-soft"}`}>
                <div className="flex justify-between text-xs text-ink-3 mb-1">
                  <span>{humanize(m.author_role)}</span>
                  <span>{shortDate(m.posted_at)}</span>
                </div>
                <p className="whitespace-pre-wrap">{m.content}</p>
                {m.instruction_like && (
                  <p className="mt-2 flex gap-1.5 text-xs font-semibold text-danger">
                    <AlertIcon className="h-3.5 w-3.5 mt-px flex-none" />
                    This message contains instruction-like text. The analyst treated it as data and ignored it as an instruction.
                  </p>
                )}
              </li>
            ))}
            {d.messages.length === 0 && <li className="text-sm text-ink-3">No messages.</li>}
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-semibold mb-2">Timeline</h3>
          <ol className="relative border-l border-line ml-1.5 space-y-2.5">
            {d.timeline.map((t, i) => (
              <li key={i} className="pl-4 text-sm relative">
                <span
                  aria-hidden
                  className={`absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full ${t.kind === "dispute" ? "bg-danger" : t.label === "DELIVERY_EXCEPTION" ? "bg-warning" : t.kind === "ledger" ? "bg-accent" : "bg-ink-3"}`}
                />
                <span className="font-medium">{humanize(t.label)}</span> <span className="text-ink-3 text-xs">{shortDate(t.at)}</span>
                <div className="text-xs text-ink-2">{t.kind === "dispute" ? reasonLabel(t.detail) : t.detail}</div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </details>
  );
}

function DecisionPanel({ d, analyzing, onDone }: { d: DisputeDetail; analyzing: boolean; onDone: () => Promise<void> }) {
  const a = d.analysis;
  const [type, setType] = useState<ActionType>(d.recommendedAction as ActionType);
  const [sellerText, setSellerText] = useState(a?.output.seller_response_draft ?? "");
  const [buyerText, setBuyerText] = useState(a?.output.buyer_message_draft ?? "");
  const [offer, setOffer] = useState((d.dispute.amount / 2).toFixed(2));
  const [previewOpen, setPreviewOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitted = d.dispute.status === "SUBMITTED";

  if (analyzing || !a) {
    return (
      <section id="respond" className="card p-5 scroll-mt-20" aria-label="Respond">
        <h2 className="font-semibold">Respond</h2>
        {analyzing ? (
          <div className="mt-4 space-y-2">
            <div className="skeleton h-9" />
            <div className="skeleton h-28" />
            <div className="skeleton h-20" />
          </div>
        ) : (
          <p className="mt-2 text-sm text-ink-3">Drafts appear once the analysis finishes.</p>
        )}
      </section>
    );
  }
  const base = d.previews[type];
  const preview = {
    ...base,
    body:
      type === "SEND_MESSAGE"
        ? { message: buyerText || sellerText }
        : type === "ACCEPT_CLAIM"
          ? { note: sellerText, accept_claim_type: "REFUND" }
          : type === "MAKE_OFFER"
            ? { note: sellerText, offer_type: "REFUND", offer_amount: { currency_code: d.dispute.currency, value: offer } }
            : { evidences: [{ evidence_type: "PROOF_OF_FULFILLMENT", notes: sellerText }] },
  };

  async function approve() {
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/disputes/${d.dispute.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          seller_text: sellerText,
          buyer_text: type === "SEND_MESSAGE" ? undefined : buyerText || undefined,
          offer_amount: type === "MAKE_OFFER" ? offer : undefined,
          approved_by: "merchant-demo",
          human_confirmed: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Send failed");
      setPreviewOpen(false);
      await onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <section id="respond" className="card p-5 scroll-mt-20" aria-label="Respond">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">Respond</h2>
        <span className="text-xs text-ink-3">You approve every action</span>
      </div>

      {submitted && (
        <p className="mt-3 flex gap-2 rounded-lg bg-success-soft text-success p-3 text-sm">
          <CheckIcon className="mt-0.5 flex-none" />
          Action submitted. The drafts are locked; the log below records exactly what was sent.
        </p>
      )}

      <fieldset disabled={submitted} className="mt-4 space-y-3 disabled:opacity-70">
        <label className="block text-sm">
          <span className="font-medium">Action</span>
          <select className="field mt-1 w-full px-3 py-2" value={type} onChange={(e) => setType(e.target.value as ActionType)}>
            {(Object.keys(ACTION_LABEL) as ActionType[]).map((k) => (
              <option key={k} value={k}>
                {ACTION_LABEL[k]}
                {k === d.recommendedAction ? " (recommended)" : ""}
              </option>
            ))}
          </select>
        </label>
        <AnimatePresence initial={false}>
          {type === "MAKE_OFFER" && (
            <motion.label
              key="offer"
              className="block text-sm overflow-hidden"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0, transition: { duration: 0.15 } }}
            >
              <span className="font-medium">Offer amount ({d.dispute.currency})</span>
              <input
                className="field mt-1 w-full px-3 py-2 tabular-nums"
                value={offer}
                onChange={(e) => setOffer(e.target.value)}
                inputMode="decimal"
              />
            </motion.label>
          )}
        </AnimatePresence>
        <label className="block text-sm">
          <span className="font-medium">Response to PayPal</span> <span className="text-ink-3">· AI draft, editable</span>
          <textarea
            className="field mt-1 w-full px-3 py-2 min-h-28 text-sm"
            value={sellerText}
            onChange={(e) => setSellerText(e.target.value)}
            maxLength={2000}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Message to buyer</span> <span className="text-ink-3">· AI draft, editable</span>
          <textarea
            className="field mt-1 w-full px-3 py-2 min-h-20 text-sm"
            value={buyerText}
            onChange={(e) => setBuyerText(e.target.value)}
            maxLength={2000}
          />
        </label>
        {/* The review step unfolds in place, so the request you approve stays next to the drafts it came from. */}
        {!submitted && (
          <AnimatePresence mode="wait" initial={false}>
            {!previewOpen ? (
              <motion.button
                key="review"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.1 } }}
                type="button"
                className="btn btn-primary w-full"
                onClick={() => setPreviewOpen(true)}
                disabled={!sellerText.trim()}
              >
                Review request…
              </motion.button>
            ) : (
              <motion.div
                key="preview"
                className="rounded-lg border border-line bg-paper p-3 overflow-hidden"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0, transition: { duration: 0.15 } }}
                transition={{ duration: 0.32, ease: EASE }}
              >
                <p className="text-sm font-semibold">Exact PayPal request</p>
                <pre className="mt-2 text-[11px] font-mono whitespace-pre-wrap break-all max-h-56 overflow-auto">
                  {`${preview.method} ${preview.path}\n${JSON.stringify(preview.body, null, 2)}`}
                </pre>
                {d.dispute.simulated && (
                  <p className="text-xs text-warning mt-2">This dispute is simulated: the request will be recorded but not sent.</p>
                )}
                <div className="flex gap-2 mt-3">
                  <button type="button" className="btn btn-primary flex-1" onClick={approve} disabled={sending} aria-busy={sending}>
                    <BusyLabel busy={sending} busyText="Sending…">
                      {d.dispute.simulated ? "Approve (simulated send)" : "Approve & send"}
                    </BusyLabel>
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => setPreviewOpen(false)}>
                    Cancel
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </fieldset>

      {d.actions.length > 0 && (
        <>
          <h3 className="text-sm font-semibold mt-5 mb-2">Action log</h3>
          <ul className="space-y-2">
            <AnimatePresence initial={false}>
              {d.actions.map((x) => (
                <motion.li
                  key={x.id}
                  className="text-sm border border-line rounded-lg p-2"
                  initial={{ opacity: 0, y: -6, backgroundColor: "var(--success-soft)" }}
                  animate={{ opacity: 1, y: 0, backgroundColor: "var(--surface)" }}
                  transition={{ duration: 0.35, ease: EASE, backgroundColor: { duration: 1.6, ease: "easeOut" } }}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{humanize(x.type)}</span>
                    <SourceBadge simulated={x.simulated} />
                    <span className="text-xs text-ink-3">
                      by {x.approved_by} · {shortDate(x.created_at)}
                    </span>
                  </div>
                  <div className="text-xs font-mono text-ink-3 mt-1 break-all">
                    {x.request_preview.method} {x.request_preview.path}
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </>
      )}

      <p className="mt-5 text-xs text-ink-3">
        {a.cached
          ? `Cached analysis: ${a.cache_origin}`
          : `Live analysis by ${a.provider}/${a.model} in ${((a.duration_ms ?? 0) / 1000).toFixed(1)} s`}{" "}
        · prompt {a.prompt_version} · input <CopyHash value={a.input_sha256} chars={10} label="input hash" />
      </p>
    </section>
  );
}
