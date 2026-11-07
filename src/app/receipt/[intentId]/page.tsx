import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { receiptView } from "@/lib/views";
import { describeAttributes } from "@/lib/intents";
import type { CheckResult } from "@/lib/catalog/constraints";
import { AlertIcon, Badge, CheckIcon, CopyHash, CrossIcon, SourceBadge, money, shortDate } from "@/components/ui";
import { VerifyPanel } from "@/components/VerifyPanel";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/receipt/[intentId]">): Promise<Metadata> {
  const { intentId } = await params;
  const v = receiptView(intentId);
  return { title: v ? `Receipt · ${v.intent.record.selection.product_name}` : "Receipt not found" };
}

export default async function ReceiptPage({ params }: PageProps<"/receipt/[intentId]">) {
  const { intentId } = await params;
  const v = receiptView(intentId);
  if (!v) notFound();
  const { intent, order, entries, chain } = v;
  const r = intent.record;
  const s = r.selection;
  const results = r.constraint_check.results;
  const met = results.filter((x) => x.status === "MET").length;
  const unmet = results.filter((x) => x.status === "UNMET");
  // A card that listed its check shows "UNMET · …" lines; a legacy card that hid them does not.
  const cardHidMismatch = unmet.length > 0 && !!r.confirmation && !r.confirmation.presented_text.includes("UNMET");

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 space-y-5">
      {!chain.ok && (
        <div role="alert" className="rounded-lg bg-danger text-on-strong p-4 font-semibold">
          Ledger verification failed at seq {chain.first_bad_seq}: {chain.reason}. This receipt may have been tampered with.
        </div>
      )}

      <article className="card overflow-hidden">
        <header className="p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="font-semibold">Intent receipt</span>
            <span className="flex flex-wrap gap-1.5">
              {order && <SourceBadge simulated={order.simulated} />}
              <Badge tone={intent.status === "CAPTURED" ? "success" : "neutral"}>{intent.status}</Badge>
            </span>
          </div>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-[1.75rem] font-semibold tracking-tight">{s.product_name}</h1>
              <p className="text-ink-2 mt-0.5">
                {describeAttributes(s.variant_attributes)} · qty {s.quantity} · bought for {r.buyer.display_name}
              </p>
            </div>
            <p className="text-2xl font-semibold tabular-nums">{money((s.price_cents * s.quantity) / 100, s.currency)}</p>
          </div>
          <p className="mt-3 text-sm text-ink-3 flex flex-wrap items-center gap-x-2 gap-y-1">
            <CopyHash value={r.id} chars={32} label="receipt id" />
            <span aria-hidden>·</span>
            <span className="font-mono text-[12px]">{r.schema_version}</span>
            <span aria-hidden>·</span>
            <span>{shortDate(r.created_at)}</span>
          </p>
        </header>

        {unmet.length > 0 && (
          <div className="flex gap-3 bg-danger-soft text-danger px-6 sm:px-8 py-4">
            <AlertIcon className="mt-0.5 flex-none" />
            <p className="text-sm">
              <strong className="font-semibold">
                The agent&apos;s choice missed {unmet.length} of {results.length} requirements.
              </strong>{" "}
              {cardHidMismatch
                ? "The card the buyer confirmed did not show this, so the mismatch is the agent's, not the buyer's."
                : "The card showed the mismatch before the buyer confirmed."}
            </p>
          </div>
        )}

        <dl className="border-t border-dashed border-line-strong divide-y divide-line">
          <Row label="You asked">
            <p className="text-lg leading-snug">&ldquo;{r.request.verbatim}&rdquo;</p>
            {r.extracted_constraints.length > 0 ? (
              <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Requirements the agent extracted">
                {r.extracted_constraints.map((c, i) => (
                  <li key={i} className="rounded-md bg-neutral-soft px-2 py-0.5 text-sm">
                    <span className="text-ink-3">{label(c.key)}</span> {formatValue(c.key, c.value)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-ink-3">No requirements stated.</p>
            )}
          </Row>

          <Row label="Agent chose">
            <p className="font-medium">
              {s.product_name} · {describeAttributes(s.variant_attributes)} · {money(s.price_cents / 100, s.currency)}
            </p>
            <p className="mt-1 text-ink-2">{s.rationale}</p>
            {s.assumptions.length > 0 && (
              <ul className="mt-2 text-sm text-ink-2 list-disc pl-5">
                {s.assumptions.map((a, i) => (
                  <li key={i}>Assumed: {a}</li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-ink-3">
              {r.agent.name} · {r.agent.provider}/{r.agent.model} · prompt {r.agent.prompt_version}
            </p>
          </Row>

          <Row label="Checker">
            <p className="font-medium">
              {met} of {results.length} requirements met
            </p>
            <p className="text-xs text-ink-3 mt-0.5">Computed by code ({r.constraint_check.checker_version}), not by the model.</p>
            <ul className="mt-3 rounded-lg border border-line divide-y divide-line text-sm">
              {results.map((x, i) => (
                <CheckRow key={i} x={x} />
              ))}
            </ul>
          </Row>

          <Row label="You confirmed">
            {r.confirmation ? (
              <>
                <p className="text-sm text-ink-2">
                  This exact card text was shown, then hashed and signed when {r.buyer.display_name} pressed Confirm on{" "}
                  {shortDate(r.confirmation.confirmed_at)}.
                </p>
                <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-paper border border-line p-4 text-[13px] font-mono leading-6">
                  {r.confirmation.presented_text}
                </pre>
                <p className="mt-2 text-sm text-ink-3 flex flex-wrap items-center gap-x-2">
                  SHA-256 <CopyHash value={r.confirmation.presented_text_sha256} chars={24} label="card text hash" />
                </p>
              </>
            ) : (
              <p className="text-sm text-ink-3">Not confirmed yet.</p>
            )}
          </Row>

          <Row label="PayPal">
            {order ? (
              <div className="grid sm:grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-ink-3">Order</p>
                  <CopyHash value={order.paypal_order_id} chars={24} label="order id" />
                </div>
                <div>
                  <p className="text-ink-3">Capture</p>
                  {order.paypal_capture_id ? <CopyHash value={order.paypal_capture_id} chars={24} label="capture id" /> : "not captured"}
                </div>
                <div>
                  <p className="text-ink-3">Status</p>
                  <p>{order.status}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-ink-3">No order yet.</p>
            )}
          </Row>
        </dl>
      </article>

      <VerifyPanel intentId={intent.id} serverOk={chain.ok} count={chain.count} keyId={chain.key_id} />

      <details className="card group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5 [&::-webkit-details-marker]:hidden">
          <span>
            <span className="font-semibold">Ledger entries for this receipt</span>
            <span className="block text-sm text-ink-3">
              {entries.length} append-only entries. Each hash covers the entry and the previous hash, signed with Ed25519.
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
        <div className="px-5 pb-5">
          <ol className="space-y-2">
            {entries.map((e) => (
              <li
                key={e.seq}
                className="grid sm:grid-cols-[60px_190px_1fr] gap-2 text-sm items-center border-b border-line last:border-0 pb-2"
              >
                <span className="font-mono text-ink-3">#{e.seq}</span>
                <span className="font-medium">{e.type}</span>
                <span className="flex flex-wrap gap-3">
                  <CopyHash value={e.hash} label="entry hash" /> <span className="text-ink-3">prev</span>{" "}
                  <CopyHash value={e.prev_hash} label="previous hash" />
                </span>
              </li>
            ))}
          </ol>
          <div className="mt-4 flex flex-wrap gap-2">
            <a className="btn btn-secondary" href={`/api/ledger/${intent.id}`} download={`intent-receipt-${intent.id}.json`}>
              Download receipt JSON
            </a>
            <a className="btn btn-ghost" href="/.well-known/intent-receipt-key.json">
              Public signing key
            </a>
          </div>
        </div>
      </details>

      <Link className="btn btn-ghost" href="/orders">
        Back to orders
      </Link>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid sm:grid-cols-[120px_1fr] gap-x-6 gap-y-1.5 px-6 sm:px-8 py-5">
      <dt className="text-sm text-ink-3 sm:pt-0.5">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function CheckRow({ x }: { x: CheckResult }) {
  const tone = x.status === "MET" ? "text-success" : x.status === "UNMET" ? "text-danger" : "text-ink-3";
  return (
    <li className={`grid grid-cols-[20px_1fr_auto] items-start gap-x-2.5 px-3 py-2 ${x.status === "UNMET" ? "bg-danger-soft" : ""}`}>
      <span className={`mt-0.5 ${tone}`}>{x.status === "MET" ? <CheckIcon /> : x.status === "UNMET" ? <CrossIcon /> : <AlertIcon />}</span>
      <span className="min-w-0">
        <span className="font-medium">{label(x.key)}</span>
        <span className="text-ink-2">
          {" "}
          · asked {formatValue(x.key, x.expected)}, got {x.actual === null ? "unknown" : formatValue(x.key, x.actual)}
        </span>
        {x.note && <span className="block text-xs text-ink-3">{x.note}</span>}
      </span>
      <span className={`text-[11px] font-semibold uppercase tracking-wide ${tone}`}>{x.status}</span>
    </li>
  );
}

const LABELS: Record<string, string> = {
  max_price: "Max price",
  min_price: "Min price",
  capacity_liters: "Capacity",
  length_m: "Length",
  deliver_by: "Deliver by",
  brand_exclude: "Not brand",
};
const label = (key: string) => LABELS[key] ?? key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " ");

/** Display formatting only; the signed card text keeps the raw values it was hashed with. */
function formatValue(key: string, v: string | number): string {
  const n = typeof v === "number" ? v : Number(v);
  if ((key === "max_price" || key === "min_price") && Number.isFinite(n)) return money(n);
  if (key === "capacity_liters" && Number.isFinite(n)) return `${n} L`;
  if (key === "length_m" && Number.isFinite(n)) return `${n} m`;
  if (key === "deliver_by") {
    const d = new Date(String(v));
    if (!Number.isNaN(d.getTime()))
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  }
  return String(v);
}
