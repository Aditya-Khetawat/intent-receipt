"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { EASE } from "./motion";
import type { DisputeDetail } from "@/lib/views";
import { ACTION_TONE, Badge, BusyLabel, CheckIcon, CopyHash, FAULT_TONE, SourceBadge, humanize, money, shortDate } from "./ui";

type ActionType = "PROVIDE_EVIDENCE" | "ACCEPT_CLAIM" | "MAKE_OFFER" | "SEND_MESSAGE";

const ACTION_LABEL: Record<ActionType, string> = {
  PROVIDE_EVIDENCE: "Contest: provide evidence",
  ACCEPT_CLAIM: "Accept claim and refund",
  MAKE_OFFER: "Offer partial refund",
  SEND_MESSAGE: "Message buyer (request info)",
};

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
    <div className="mx-auto max-w-7xl px-4 py-6">
      <nav className="text-sm text-ink-3 mb-3">
        <Link href="/merchant" className="hover:text-ink">
          ← Dispute queue
        </Link>
      </nav>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold">{humanize(d.dispute.reason.replace("MERCHANDISE_OR_SERVICE_", "Item "))}</h1>
            <SourceBadge simulated={d.dispute.simulated} cached={a?.cached} />
            {d.dispute.scenario && <Badge tone="neutral">Scenario {d.dispute.scenario}</Badge>}
          </div>
          <p className="text-sm text-ink-2 mt-1">
            <span className="font-mono">{d.dispute.paypal_dispute_id}</span> · {money(d.dispute.amount, d.dispute.currency)} · opened{" "}
            {shortDate(d.dispute.opened_at)}
          </p>
          {d.dispute.scenarioInfo && <p className="text-sm text-ink-3 mt-1">What to look for: {d.dispute.scenarioInfo.lookFor}</p>}
        </div>
        {d.intent && (
          <Link href={`/receipt/${d.intent.id}`} className="btn btn-secondary">
            Open intent receipt
          </Link>
        )}
      </header>

      <div className="grid lg:grid-cols-[1fr_1.2fr_1.2fr] gap-4 mt-5 items-start">
        <ThreadColumn d={d} />
        <EvidenceColumn d={d} analyzing={analyzing} elapsed={elapsed} onRetry={retry} fresh={watched} />
        <DecisionColumn key={a?.id ?? "none"} d={d} analyzing={analyzing} onDone={refresh} />
      </div>
    </div>
  );
}

function Col({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
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

function ThreadColumn({ d }: { d: DisputeDetail }) {
  return (
    <Col title="Dispute and thread">
      <dl className="text-sm grid grid-cols-[100px_1fr] gap-y-2">
        <dt className="text-ink-3">PayPal reason</dt>
        <dd className="font-mono text-[12px] break-all">{d.dispute.reason}</dd>
        <dt className="text-ink-3">Amount</dt>
        <dd>{money(d.dispute.amount, d.dispute.currency)}</dd>
        <dt className="text-ink-3">Buyer asked</dt>
        <dd>&ldquo;{d.intent?.record.request.verbatim ?? "unknown"}&rdquo;</dd>
      </dl>
      <p className="eyebrow mt-5 mb-2">Messages (untrusted)</p>
      <ul className="space-y-3">
        {d.messages.map((m) => (
          <li
            key={m.id}
            className={`rounded-lg p-3 text-sm ${m.instruction_like ? "bg-danger-soft border border-danger/30" : "bg-neutral-soft"}`}
          >
            <div className="flex justify-between text-xs text-ink-3 mb-1">
              <span>{humanize(m.author_role)}</span>
              <span>{shortDate(m.posted_at)}</span>
            </div>
            <p className="whitespace-pre-wrap">{m.content}</p>
            {m.instruction_like && (
              <p className="mt-2 text-xs font-semibold text-danger">
                ⚠ This message contains instruction-like text. It was passed to the analyst as untrusted data and ignored as an instruction.
              </p>
            )}
          </li>
        ))}
        {d.messages.length === 0 && <li className="text-sm text-ink-3">No messages.</li>}
      </ul>
      {d.intent && (
        <>
          <p className="eyebrow mt-5 mb-2">Card the buyer confirmed</p>
          <pre className="whitespace-pre-wrap text-[12px] font-mono bg-paper border border-line rounded-lg p-3 leading-5">
            {d.intent.card}
          </pre>
        </>
      )}
    </Col>
  );
}

function EvidenceColumn({
  d,
  analyzing,
  elapsed,
  onRetry,
  fresh,
}: {
  d: DisputeDetail;
  analyzing: boolean;
  elapsed: number;
  onRetry: () => void;
  fresh: boolean;
}) {
  const a = d.analysis;
  const v = a?.validation;
  const total = v ? v.verified + v.failed : 0;
  return (
    <Col
      title="Evidence"
      aside={
        v && !analyzing ? (
          <Badge tone={v.failed === 0 ? "success" : "warning"}>
            {v.verified}/{total} verified
          </Badge>
        ) : null
      }
    >
      <p className="eyebrow mb-2">Timeline</p>
      <ol className="relative border-l border-line ml-1.5 space-y-2.5 mb-5">
        {d.timeline.map((t, i) => (
          <li key={i} className="pl-4 text-sm relative">
            <span
              aria-hidden
              className={`absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full ${t.kind === "dispute" ? "bg-danger" : t.label === "DELIVERY_EXCEPTION" ? "bg-warning" : t.kind === "ledger" ? "bg-accent" : "bg-ink-3"}`}
            />
            <span className="font-medium">{humanize(t.label)}</span> <span className="text-ink-3 text-xs">{shortDate(t.at)}</span>
            <div className="text-xs text-ink-2">{t.detail}</div>
          </li>
        ))}
      </ol>

      <div aria-live="polite">
        {analyzing && (
          <div className="space-y-2" role="status">
            <p className="text-sm text-ink-2">Analyst is reading the receipt, order and shipping history… {elapsed}s</p>
            <div className="skeleton h-16" />
            <div className="skeleton h-16" />
          </div>
        )}
        {d.dispute.status === "ERROR" && (
          <div role="alert" className="rounded-lg bg-danger-soft text-danger p-3 text-sm">
            Analysis failed: {d.dispute.error}
            <button type="button" className="btn btn-secondary ml-2 mt-2" onClick={onRetry}>
              Retry
            </button>
          </div>
        )}
        {a && !analyzing && (
          <>
            <p className="text-sm font-semibold text-success mb-3">
              {v!.verified}/{total} evidence items verified against source data
              {v!.dropped > 0 && <span className="text-warning font-normal"> · {v!.dropped} unverified citation(s) dropped</span>}
            </p>
            <ul className="space-y-2">
              {a.output.evidence.map((e, i) => (
                <motion.li
                  key={e.id}
                  className="rounded-lg border border-line p-3 text-sm"
                  initial={fresh ? { opacity: 0, y: 8 } : false}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, ease: EASE, delay: Math.min(i, 8) * 0.06 }}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge tone="success">
                      <CheckIcon className="h-3 w-3" />
                      Verified
                    </Badge>
                    <Badge tone={e.supports === "BUYER" ? "warning" : e.supports === "SELLER" ? "accent" : "neutral"}>
                      Supports {e.supports.toLowerCase()}
                    </Badge>
                  </div>
                  <p className="mt-1.5">{e.claim}</p>
                  <details className="mt-1.5 text-xs">
                    <summary className="cursor-pointer text-ink-3 hover:text-ink">
                      Show source <span className="font-mono">{e.pointer}</span>
                    </summary>
                    <pre className="mt-1 whitespace-pre-wrap font-mono bg-paper border border-line rounded p-2 break-all">
                      {JSON.stringify(e.source_value, null, 2)}
                    </pre>
                  </details>
                </motion.li>
              ))}
            </ul>
            {v!.needs_human_review && (
              <p className="mt-3 text-sm text-warning font-semibold">Needs human review: several citations failed verification twice.</p>
            )}
          </>
        )}
      </div>
    </Col>
  );
}

function DecisionColumn({ d, analyzing, onDone }: { d: DisputeDetail; analyzing: boolean; onDone: () => Promise<void> }) {
  const a = d.analysis;
  const [type, setType] = useState<ActionType>(d.recommendedAction as ActionType);
  const [sellerText, setSellerText] = useState(a?.output.seller_response_draft ?? "");
  const [buyerText, setBuyerText] = useState(a?.output.buyer_message_draft ?? "");
  const [offer, setOffer] = useState((d.dispute.amount / 2).toFixed(2));
  const [previewOpen, setPreviewOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (analyzing || !a) {
    return (
      <Col title="Decision">
        <div className="space-y-2">
          <div className="skeleton h-8 w-2/3" />
          <div className="skeleton h-24" />
          <div className="skeleton h-24" />
        </div>
      </Col>
    );
  }
  const o = a.output;
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
    <Col title="Decision" aside={a.cached ? <Badge tone="neutral">Cached</Badge> : <Badge tone="info">Live AI</Badge>}>
      <div className="flex flex-wrap gap-2">
        <Badge tone="neutral">{humanize(o.classification)}</Badge>
        <Badge tone={FAULT_TONE[o.agent_fault]}>
          {o.agent_fault === "LIKELY" ? "Agent fault" : `Agent fault: ${o.agent_fault.toLowerCase()}`}
        </Badge>
        <span className="text-xs text-ink-3 self-center">confidence {Math.round(o.confidence * 100)}%</span>
      </div>
      <p className="mt-3 text-sm">
        Recommended: <Badge tone={ACTION_TONE[o.recommended_seller_action]}>{humanize(o.recommended_seller_action)}</Badge>
      </p>
      <p className="mt-3 text-sm text-ink-2 leading-relaxed">{o.summary}</p>

      <div className="grid sm:grid-cols-2 gap-2 mt-4">
        <div className="rounded-lg bg-warning-soft/60 p-3 text-sm">
          <p className="eyebrow mb-1">Buyer&apos;s view</p>
          {o.buyer_view}
        </div>
        <div className="rounded-lg bg-accent-soft/70 p-3 text-sm">
          <p className="eyebrow mb-1">Seller&apos;s view</p>
          {o.seller_view}
        </div>
      </div>

      {o.uncertainties.length > 0 && (
        <>
          <p className="eyebrow mt-4 mb-1">Uncertainties</p>
          <ul className="list-disc pl-5 text-sm text-ink-2 space-y-1">
            {o.uncertainties.map((u, i) => (
              <li key={i}>{u}</li>
            ))}
          </ul>
        </>
      )}

      <div className="mt-5 space-y-3">
        <label className="block text-sm">
          <span className="eyebrow">Action</span>
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
              <span className="eyebrow">Offer amount ({d.dispute.currency})</span>
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
          <span className="eyebrow">Response to PayPal (editable draft)</span>
          <textarea
            className="field mt-1 w-full px-3 py-2 min-h-28 text-sm"
            value={sellerText}
            onChange={(e) => setSellerText(e.target.value)}
            maxLength={2000}
          />
        </label>
        <label className="block text-sm">
          <span className="eyebrow">Message to buyer (editable draft)</span>
          <textarea
            className="field mt-1 w-full px-3 py-2 min-h-20 text-sm"
            value={buyerText}
            onChange={(e) => setBuyerText(e.target.value)}
            maxLength={2000}
          />
        </label>
        {/* The review step unfolds in place, so the request you approve stays next to the drafts it came from. */}
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
              disabled={!sellerText.trim() || d.dispute.status === "SUBMITTED"}
            >
              {d.dispute.status === "SUBMITTED" ? "Action submitted" : "Review request…"}
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
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>

      {d.actions.length > 0 && (
        <>
          <p className="eyebrow mt-5 mb-2">Action log</p>
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
    </Col>
  );
}
