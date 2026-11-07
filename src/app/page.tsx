import Link from "next/link";
import { appStatus, receiptView } from "@/lib/views";
import { describeAttributes } from "@/lib/intents";
import { ArrowIcon, money } from "@/components/ui";

// The seeded "buyer changed their mind" receipt doubles as the hero, so its numbers are real.
const HERO_RECEIPT = "ir_seed_s1_ridge40";

export const dynamic = "force-dynamic";

export default function Home() {
  const s = appStatus();
  return (
    <div className="mx-auto max-w-6xl px-4">
      <section className="pt-14 pb-10 grid lg:grid-cols-[1.25fr_1fr] gap-10 items-center">
        <div>
          <h1 className="text-4xl sm:text-5xl lg:text-[3.5rem] font-semibold tracking-[-0.03em] leading-[1.05]">
            Receipts for what the AI <br className="hidden sm:block" />
            was asked to do.
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-ink-2 max-w-xl">
            When an AI agent buys something for you, nobody can prove what you asked for, what the agent understood or what you confirmed.
            IntentReceipt records all three, signs them into a tamper-evident ledger linked to the PayPal order, and uses AI to resolve
            disputes with evidence that is checked against the record, fairly for buyer and seller.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/demo" className="btn btn-primary">
              Run guided demo
              <ArrowIcon />
            </Link>
            <Link href="/shop" className="btn btn-secondary">
              Shop with the agent
            </Link>
            <Link href="/merchant" className="btn btn-secondary">
              Open merchant console
            </Link>
          </div>
          <dl className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <Status ok={s.paypal.configured} label="PayPal sandbox" okText="connected" offText="not configured (checkout is simulated)" />
            <Status ok={s.ai.available} label={`AI (${s.ai.provider})`} okText={s.ai.agentModel} offText="no key (cached analyses only)" />
          </dl>
        </div>
        <HeroReceipt />
      </section>

      <section aria-labelledby="how" className="pt-10 pb-8">
        <h2 id="how" className="text-2xl font-semibold tracking-tight mb-5">
          How it works
        </h2>
        <ol className="grid md:grid-cols-3 gap-4">
          {[
            {
              n: "1",
              t: "Your request is pinned down before you pay",
              d: "The agent turns your words into requirements, and code, not the model, checks each one on the confirmation card. The exact card you confirm is hashed, signed (Ed25519) and chained, so nobody can quietly change it later.",
            },
            {
              n: "2",
              t: "Tied to the PayPal order",
              d: "PayPal Orders v2 creates the order only after a signed confirmation exists, for exactly that item and amount. The order carries the receipt id (in custom_id), and the capture joins the same chain.",
            },
            {
              n: "3",
              t: "Disputes get evidence you can check",
              d: "When a dispute arrives, an AI analyst reads the receipt, order and shipping history. Each citation points at a field in the record, and code rejects any that do not match. If the agent was at fault, it recommends a refund. A human approves every action.",
            },
          ].map((s) => (
            <li key={s.n} className="card p-5">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-accent-soft text-accent text-sm font-semibold tabular-nums">
                {s.n}
              </span>
              <h3 className="font-semibold mt-3">{s.t}</h3>
              <p className="text-sm text-ink-2 mt-2 leading-relaxed">{s.d}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="py-6 grid md:grid-cols-2 gap-4">
        <div className="card p-5">
          <h2 className="font-semibold">Who it is for</h2>
          <ul className="mt-3 text-sm text-ink-2 space-y-2 list-disc pl-5">
            <li>
              <strong className="text-ink">Merchants</strong> accepting agent-initiated orders: contest the disputes you should win, refund
              the ones you should not fight, and stop over-blocking agent traffic.
            </li>
            <li>
              <strong className="text-ink">Dispute and risk teams</strong>: structured, verifiable evidence about intent instead of
              screenshots.
            </li>
            <li>
              <strong className="text-ink">Agent developers</strong>: a receipt format and a signal when the agent, not the buyer, got it
              wrong.
            </li>
          </ul>
        </div>
        <div className="card p-5">
          <h2 className="font-semibold">Honest scope</h2>
          <ul className="mt-3 text-sm text-ink-2 space-y-2 list-disc pl-5">
            <li>PayPal sandbox only. No real money, no production credentials.</li>
            <li>Seeded demo orders and demo disputes are labelled SIMULATED; precomputed analyses are labelled CACHED.</li>
            <li>
              The ledger is tamper-evident (hash chain + signature), not a blockchain. Inspired by agent payment mandates; not an AP2
              implementation.
            </li>
            <li>The analyst recommends; it does not adjudicate liability. A human approves every action.</li>
          </ul>
        </div>
      </section>
    </div>
  );
}

function Status({ ok, label, okText, offText }: { ok: boolean; label: string; okText: string; offText: string }) {
  return (
    <div className="flex items-center gap-2">
      <span aria-hidden className={`h-2 w-2 rounded-full ${ok ? "live-dot bg-success" : "bg-warning"}`} />
      <dt className="text-ink-2">{label}:</dt>
      <dd className="text-ink">{ok ? okText : offText}</dd>
    </div>
  );
}

function HeroReceipt() {
  const v = receiptView(HERO_RECEIPT);
  if (!v) return null;
  const { record: r } = v.intent;
  const s = r.selection;
  const results = r.constraint_check.results;
  const met = results.filter((x) => x.status === "MET").length;
  const hash = r.confirmation?.presented_text_sha256;
  const rows: [string, string][] = [
    ["You asked", r.request.verbatim],
    ["Agent chose", `${s.product_name} · ${describeAttributes(s.variant_attributes)} · ${money(s.price_cents / 100, s.currency)}`],
    ["Checker", `${met} of ${results.length} requirements met`],
    ["You confirmed", hash ? `sha256 ${hash.slice(0, 4)}…${hash.slice(-4)}` : "not confirmed"],
    ["PayPal", v.order ? `order ${v.order.status.toLowerCase()} · ${v.order.simulated ? "simulated" : "sandbox"}` : "no order"],
  ];
  return (
    <Link
      href={`/receipt/${HERO_RECEIPT}`}
      className="group card block p-6 rotate-[0.4deg] border-transparent shadow-[0_18px_40px_-20px_rgb(20_24_31/0.28)] transition-[rotate,box-shadow] duration-300 hover:rotate-0 hover:shadow-[0_24px_48px_-22px_rgb(20_24_31/0.34)] dark:border-line dark:shadow-none"
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">Intent receipt</span>
        <span
          className={`stamp text-[11px] font-semibold uppercase tracking-wide rounded-md px-1.5 py-0.5 ${
            v.chain.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"
          }`}
        >
          {v.chain.ok ? "Chain intact" : "Chain broken"}
        </span>
      </div>
      <dl className="print-in mt-4 divide-y divide-line">
        {rows.map(([k, val]) => (
          <div key={k} className="py-2.5 grid grid-cols-[110px_1fr] gap-3 text-sm">
            <dt className="text-ink-3">{k}</dt>
            <dd className={k === "You confirmed" ? "font-mono text-[13px]" : ""}>{val}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 border-t border-dashed border-line pt-3 flex items-center justify-between gap-3 font-mono text-[11px] text-ink-3 leading-5">
        <span>
          seq {v.entries.map((e) => e.seq).join(" → ")} · Ed25519 · {v.chain.key_id}
        </span>
        <span className="font-sans text-xs font-semibold text-accent inline-flex items-center gap-1">
          Open
          <ArrowIcon />
        </span>
      </div>
    </Link>
  );
}
