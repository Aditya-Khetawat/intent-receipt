import Link from "next/link";
import { appStatus } from "@/lib/views";

export const dynamic = "force-dynamic";

export default function Home() {
  const s = appStatus();
  return (
    <div className="mx-auto max-w-6xl px-4">
      <section className="pt-14 pb-10 grid lg:grid-cols-[1.25fr_1fr] gap-10 items-center">
        <div>
          <h1 className="text-4xl sm:text-5xl lg:text-[3.5rem] font-semibold tracking-[-0.03em] leading-[1.05]">
            Receipts for what the AI
            <br className="hidden sm:block" />
            was asked to do.
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-ink-2 max-w-xl">
            When an AI agent buys something for you, nobody can prove what you asked for, what the agent understood or what you confirmed.
            IntentReceipt records all three, signs them into a tamper-evident ledger linked to the PayPal order, and uses AI to resolve disputes
            with evidence that is checked against the record, fairly for buyer and seller.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/demo" className="btn btn-primary">
              Run guided demo
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
        <ReceiptIllustration />
      </section>

      <section aria-labelledby="how" className="pt-10 pb-8">
        <h2 id="how" className="text-2xl font-semibold tracking-tight mb-5">
          How it works
        </h2>
        <ol className="grid md:grid-cols-3 gap-4">
          {[
            {
              n: "1",
              t: "Intent is captured before payment",
              d: "The shopping agent extracts your constraints. A deterministic checker (code, not the model) marks each one met or unmet on the confirmation card. Your confirmation and the exact card text are hashed, signed with Ed25519 and chained.",
            },
            {
              n: "2",
              t: "Linked to the PayPal order",
              d: "The order is created with PayPal Orders v2 only after a signed confirmation exists, and only for the confirmed amount and item. The order carries the receipt id in custom_id. Capture is appended to the same chain.",
            },
            {
              n: "3",
              t: "Disputes get verified evidence",
              d: "When a dispute arrives, an AI analyst reads the receipt, order and shipping history. Every citation it makes is a JSON path that code checks against the source. It recommends a refund when the agent was at fault. A human approves every action.",
            },
          ].map((s) => (
            <li key={s.n} className="card p-5">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-accent-soft text-accent text-sm font-semibold tabular-nums">{s.n}</span>
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
              <strong className="text-ink">Merchants</strong> accepting agent-initiated orders: contest the disputes you should win, refund the ones you
              should not fight, and stop over-blocking agent traffic.
            </li>
            <li>
              <strong className="text-ink">Dispute and risk teams</strong>: structured, verifiable evidence about intent instead of screenshots.
            </li>
            <li>
              <strong className="text-ink">Agent developers</strong>: a receipt format and a signal when the agent, not the buyer, got it wrong.
            </li>
          </ul>
        </div>
        <div className="card p-5">
          <h2 className="font-semibold">Honest scope</h2>
          <ul className="mt-3 text-sm text-ink-2 space-y-2 list-disc pl-5">
            <li>PayPal sandbox only. No real money, no production credentials.</li>
            <li>Seeded demo orders and demo disputes are labelled SIMULATED; precomputed analyses are labelled CACHED.</li>
            <li>The ledger is tamper-evident (hash chain + signature), not a blockchain. Inspired by agent payment mandates; not an AP2 implementation.</li>
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
      <span aria-hidden className={`h-2 w-2 rounded-full ${ok ? "bg-success" : "bg-warning"}`} />
      <dt className="text-ink-2">{label}:</dt>
      <dd className="text-ink">{ok ? okText : offText}</dd>
    </div>
  );
}

function ReceiptIllustration() {
  const rows = [
    ["You asked", "waterproof 40L backpack, black, under $85"],
    ["Agent chose", "Brightpine Ridge Pack · 40L · black · $79"],
    ["Checker", "4 of 4 requirements met"],
    ["You confirmed", "sha256 3f9a…c21e"],
    ["PayPal", "order · capture COMPLETED"],
  ];
  return (
    <div className="card p-6 rotate-[0.4deg] border-transparent shadow-[0_18px_40px_-20px_rgb(20_24_31/0.28)] dark:border-line dark:shadow-none" aria-hidden="true">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">Intent receipt</span>
        <span className="text-[11px] font-semibold uppercase tracking-wide bg-success-soft text-success rounded-md px-1.5 py-0.5">Chain intact</span>
      </div>
      <dl className="print-in mt-4 divide-y divide-line">
        {rows.map(([k, v]) => (
          <div key={k} className="py-2.5 grid grid-cols-[110px_1fr] gap-3 text-sm">
            <dt className="text-ink-3">{k}</dt>
            <dd className={k === "You confirmed" ? "font-mono text-[13px]" : ""}>{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 border-t border-dashed border-line pt-3 font-mono text-[11px] text-ink-3 leading-5">
        seq 41 → 42 → 43 · Ed25519 · ir-key-1
      </div>
    </div>
  );
}
