import Link from "next/link";
import { notFound } from "next/navigation";
import { receiptView } from "@/lib/views";
import { describeAttributes } from "@/lib/intents";
import { Badge, CopyHash, SourceBadge, money, shortDate } from "@/components/ui";
import { VerifyPanel } from "@/components/VerifyPanel";

export const dynamic = "force-dynamic";

export default async function ReceiptPage({ params }: PageProps<"/receipt/[intentId]">) {
  const { intentId } = await params;
  const v = receiptView(intentId);
  if (!v) notFound();
  const { intent, order, entries, chain } = v;
  const r = intent.record;
  const s = r.selection;
  const results = r.constraint_check.results;
  const met = results.filter((x) => x.status === "MET").length;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 space-y-5">
      {!chain.ok && (
        <div role="alert" className="rounded-lg bg-danger text-on-strong p-4 font-semibold">
          Ledger verification failed at seq {chain.first_bad_seq}: {chain.reason}. This receipt may have been tampered with.
        </div>
      )}
      <header className="card p-6">
        <div className="flex flex-wrap gap-2">
          {order && <SourceBadge simulated={order.simulated} />}
          <Badge tone={intent.status === "CAPTURED" ? "success" : "neutral"}>{intent.status}</Badge>
        </div>
        <h1 className="text-2xl sm:text-[1.75rem] font-semibold tracking-tight mt-3">{s.product_name}</h1>
        <p className="text-ink-2">
          {describeAttributes(s.variant_attributes)} · qty {s.quantity} · {money((s.price_cents * s.quantity) / 100, s.currency)} · bought for {r.buyer.display_name}
        </p>
        <p className="mt-3 text-sm text-ink-3 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>
            Intent receipt <CopyHash value={r.id} chars={32} label="receipt id" />
          </span>
          <span aria-hidden>·</span>
          <span className="font-mono text-[12px]">{r.schema_version}</span>
        </p>
      </header>

      <VerifyPanel intentId={intent.id} serverOk={chain.ok} count={chain.count} keyId={chain.key_id} />

      <Section title="What you asked">
        <blockquote className="border-l-4 border-accent pl-4 text-lg">&ldquo;{r.request.verbatim}&rdquo;</blockquote>
        <p className="eyebrow mt-4 mb-2">Constraints the agent extracted</p>
        <div className="flex flex-wrap gap-2">
          {r.extracted_constraints.map((c, i) => (
            <span key={i} className="rounded-md border border-line px-2 py-1 text-sm font-mono">
              {c.key} = {String(c.value)}
              {c.unit ? ` ${c.unit}` : ""}
            </span>
          ))}
          {r.extracted_constraints.length === 0 && <span className="text-sm text-ink-3">None stated.</span>}
        </div>
      </Section>

      <Section title="What the agent chose and why">
        <p>{s.rationale}</p>
        {s.assumptions.length > 0 && (
          <ul className="mt-2 text-sm text-ink-2 list-disc pl-5">
            {s.assumptions.map((a, i) => (
              <li key={i}>Assumption: {a}</li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-sm text-ink-3">
          Agent: {r.agent.name} · {r.agent.provider}/{r.agent.model} · prompt {r.agent.prompt_version}
        </p>
      </Section>

      <Section title={`Constraint check · ${met} of ${results.length} met`} subtitle={`Computed deterministically by ${r.constraint_check.checker_version}, not by the model.`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-3 border-b border-line">
                <th className="py-2 pr-3 font-medium">Requirement</th>
                <th className="py-2 pr-3 font-medium">Expected</th>
                <th className="py-2 pr-3 font-medium">Actual</th>
                <th className="py-2 font-medium">Result</th>
              </tr>
            </thead>
            <tbody>
              {results.map((x, i) => (
                <tr key={i} className="border-b border-line last:border-0">
                  <td className="py-2 pr-3 font-mono">{x.key}</td>
                  <td className="py-2 pr-3">{String(x.expected)}</td>
                  <td className="py-2 pr-3">{x.actual === null ? "unknown" : String(x.actual)}</td>
                  <td className="py-2">
                    <Badge tone={x.status === "MET" ? "success" : x.status === "UNMET" ? "warning" : "neutral"}>{x.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="What you confirmed" subtitle="The exact text shown on the confirmation card, and its SHA-256.">
        {r.confirmation ? (
          <>
            <pre className="whitespace-pre-wrap rounded-lg bg-paper border border-line p-4 text-sm font-mono leading-6">{r.confirmation.presented_text}</pre>
            <dl className="mt-3 grid sm:grid-cols-2 gap-2 text-sm">
              <div>
                <dt className="text-ink-3">Text SHA-256</dt>
                <dd>
                  <CopyHash value={r.confirmation.presented_text_sha256} chars={24} label="text hash" />
                </dd>
              </div>
              <div>
                <dt className="text-ink-3">Confirmed</dt>
                <dd>
                  {shortDate(r.confirmation.confirmed_at)} via {r.confirmation.method}
                </dd>
              </div>
            </dl>
          </>
        ) : (
          <p className="text-sm text-ink-3">Not confirmed yet.</p>
        )}
      </Section>

      <Section title="Payment">
        {order ? (
          <dl className="grid sm:grid-cols-3 gap-3 text-sm">
            <div>
              <dt className="text-ink-3">PayPal order id</dt>
              <dd>
                <CopyHash value={order.paypal_order_id} chars={24} label="order id" />
              </dd>
            </div>
            <div>
              <dt className="text-ink-3">Capture id</dt>
              <dd>{order.paypal_capture_id ? <CopyHash value={order.paypal_capture_id} chars={24} label="capture id" /> : "not captured"}</dd>
            </div>
            <div>
              <dt className="text-ink-3">Status</dt>
              <dd>
                {order.status} <SourceBadge simulated={order.simulated} />
              </dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-ink-3">No order yet.</p>
        )}
      </Section>

      <Section title="Ledger entries" subtitle="Append-only. Each hash covers the entry and the previous hash; each is signed with Ed25519.">
        <ol className="space-y-2">
          {entries.map((e) => (
            <li key={e.seq} className="grid sm:grid-cols-[60px_190px_1fr] gap-2 text-sm items-center border-b border-line last:border-0 pb-2">
              <span className="font-mono text-ink-3">#{e.seq}</span>
              <span className="font-medium">{e.type}</span>
              <span className="flex flex-wrap gap-3">
                <CopyHash value={e.hash} label="entry hash" /> <span className="text-ink-3">prev</span> <CopyHash value={e.prev_hash} label="previous hash" />
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
          <Link className="btn btn-ghost" href="/orders">
            Back to orders
          </Link>
        </div>
      </Section>
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="card p-6">
      <h2 className="font-semibold">{title}</h2>
      {subtitle && <p className="text-sm text-ink-3 mt-0.5">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}
