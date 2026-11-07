"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "./ui";
import { simulateDispute } from "./SimulateDisputeButton";

interface ScenarioView {
  key: string;
  title: string;
  lookFor: string;
  intentId: string;
  disputeId: string | null;
}

const S1_PROMPT = "I need a waterproof 40L backpack in black, under $85, for a trip next month.";

export function DemoRunner({
  demoMode,
  paypalConfigured,
  aiAvailable,
  scenarios,
}: {
  demoMode: boolean;
  paypalConfigured: boolean;
  aiAvailable: boolean;
  scenarios: ScenarioView[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [disputes, setDisputes] = useState<Record<string, string | null>>(Object.fromEntries(scenarios.map((s) => [s.key, s.disputeId])));
  const [error, setError] = useState<string | null>(null);
  const [resetDone, setResetDone] = useState(false);

  async function trigger(key: string) {
    setBusy(key);
    setError(null);
    try {
      const id = await simulateDispute({ scenario: key });
      setDisputes((d) => ({ ...d, [key]: id }));
      router.push(`/merchant/disputes/${id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  async function reset() {
    setBusy("reset");
    setError(null);
    try {
      const res = await fetch("/api/dev/reset", { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Reset failed");
      setDisputes(Object.fromEntries(scenarios.map((s) => [s.key, null])));
      setResetDone(true);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (!demoMode) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-semibold">Guided demo is disabled</h1>
        <p className="text-ink-2 mt-2">This server runs with DEMO_MODE=false.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <p className="eyebrow">Five-minute judge path · no accounts needed</p>
      <h1 className="text-3xl font-semibold mt-1">Guided demo</h1>
      <p className="text-ink-2 mt-2">
        Payments run on the PayPal sandbox{paypalConfigured ? "" : " (not configured on this server, so checkout is simulated)"}. Seeded history and demo disputes are clearly
        labelled SIMULATED and travel through the same ingest code as real PayPal webhooks.
        {!aiAvailable && " The live AI key is not configured here, so analyses show as CACHED."}
      </p>

      <ol className="mt-8 space-y-4">
        <Step n={1} title="Meet the buyer and the agent">
          <p>Ask the shopping agent for a backpack. Watch the deterministic constraint check on the confirmation card, confirm, and pay in the PayPal sandbox.</p>
          {paypalConfigured && (
            <p className="text-sm mt-2 text-ink-3">PayPal will ask you to log in with a sandbox buyer account; the test credentials are in the README (sandbox only).</p>
          )}
          <Link href={`/shop?prompt=${encodeURIComponent(S1_PROMPT)}`} className="btn btn-primary mt-3">
            Open the shop with the S1 request
          </Link>
        </Step>

        <Step n={2} title="Open an Intent Receipt and press Verify">
          <p>Each order links to a receipt: what you asked, what the agent chose, the constraint check, the exact confirmation text and its hash, all signed and chained.</p>
          <div className="flex flex-wrap gap-2 mt-3">
            <Link href={`/receipt/${scenarios[0].intentId}`} className="btn btn-secondary">
              S1 receipt
            </Link>
            <Link href={`/receipt/${scenarios[1].intentId}`} className="btn btn-secondary">
              S2 receipt (agent fault)
            </Link>
            <Link href="/orders" className="btn btn-ghost">
              All orders
            </Link>
          </div>
        </Step>

        <Step n={3} title="Trigger a dispute and watch the analyst">
          <p>Each button builds a payload shaped like PayPal&apos;s CUSTOMER.DISPUTE.CREATED webhook and feeds it through the real ingest pipeline.</p>
          <ul className="mt-3 grid sm:grid-cols-2 gap-3">
            {scenarios.map((s) => (
              <li key={s.key} className="rounded-lg border border-line p-3 bg-surface">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm text-accent">{s.key}</span>
                  <span className="font-medium text-sm">{s.title}</span>
                </div>
                <p className="text-xs text-ink-3 mt-1">{s.lookFor}</p>
                {disputes[s.key] ? (
                  <Link href={`/merchant/disputes/${disputes[s.key]}`} className="btn btn-secondary mt-2 w-full">
                    Open dispute
                  </Link>
                ) : (
                  <button type="button" className="btn btn-primary mt-2 w-full" disabled={busy !== null} onClick={() => trigger(s.key)}>
                    {busy === s.key ? "Opening…" : `Trigger ${s.key}`} <Badge tone="warning">Simulated</Badge>
                  </button>
                )}
              </li>
            ))}
          </ul>
        </Step>

        <Step n={4} title="Review in the merchant console">
          <p>The AG Grid queue shows classification, confidence, agent fault and the recommendation. In a dispute, check the N/N verified evidence, the balanced buyer and seller views, edit the drafts and approve.</p>
          <Link href="/merchant" className="btn btn-secondary mt-3">
            Open merchant console
          </Link>
        </Step>

        <Step n={5} title="Reset demo data">
          <p>Restores the seeded orders and removes disputes and chats, so the next visitor starts clean.</p>
          <button type="button" className="btn btn-secondary mt-3" onClick={reset} disabled={busy !== null}>
            {busy === "reset" ? "Resetting…" : "Reset demo data"}
          </button>
          {resetDone && (
            <span className="ml-3 text-sm text-success" role="status">
              Demo data reset.
            </span>
          )}
        </Step>
      </ol>
      {error && (
        <p role="alert" className="mt-4 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="card p-5 grid grid-cols-[36px_1fr] gap-3">
      <span className="h-8 w-8 rounded-full bg-accent-soft text-accent font-semibold flex items-center justify-center">{n}</span>
      <div className="text-sm text-ink-2">
        <h2 className="font-semibold text-ink text-base mb-1">{title}</h2>
        {children}
      </div>
    </li>
  );
}
