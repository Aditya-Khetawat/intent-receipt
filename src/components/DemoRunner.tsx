"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowIcon, Badge, BusyLabel } from "./ui";
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
  const [confirmReset, setConfirmReset] = useState(false);

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
    setConfirmReset(false);
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
      <h1 className="text-3xl font-semibold tracking-tight">Guided demo</h1>
      <p className="text-ink-2 mt-2 max-w-[70ch]">
        Steps 1 to 3 show the whole idea in about two minutes, with no accounts. Step 4 lets you shop and pay yourself on the PayPal sandbox
        {paypalConfigured ? "" : " (not configured on this server, so checkout is simulated)"}. Seeded history and demo disputes are
        labelled SIMULATED and travel through the same ingest code as real PayPal webhooks.
        {!aiAvailable && " The live AI key is not configured here, so analyses show as CACHED."}
      </p>

      <ol className="mt-8 space-y-4">
        <Step n={1} title="Open a receipt and press Verify">
          <p>
            A receipt records what the buyer asked, what the agent chose, the code&apos;s check, and the exact card the buyer confirmed, all
            signed and chained. Verify re-checks the chain in your browser. Then compare with S2, where the agent got it wrong. Each receipt
            also exports as an evidence pack: a PDF for PayPal disputes with the signed receipt inside, which anyone can check at /verify.
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            <Link href={`/receipt/${scenarios[0].intentId}`} className="btn btn-primary">
              S1 receipt
              <ArrowIcon />
            </Link>
            <Link href={`/receipt/${scenarios[1].intentId}`} className="btn btn-secondary">
              S2 receipt (agent at fault)
            </Link>
            <Link href="/verify" className="btn btn-ghost">
              Check an evidence pack
            </Link>
          </div>
        </Step>

        <Step n={2} title="Trigger a dispute and watch the analyst">
          <p>
            Each button builds a payload shaped like PayPal&apos;s dispute-created webhook and feeds it through the real ingest pipeline.
            The hint says what a correct analysis looks like.
          </p>
          <ul className="mt-3 grid sm:grid-cols-2 gap-3">
            {scenarios.map((s) => (
              <li key={s.key} className="rounded-lg border border-line p-3 bg-surface transition-colors hover:border-line-strong">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm text-accent">{s.key}</span>
                  <span className="font-medium text-sm">{s.title}</span>
                </div>
                <p className="text-xs text-ink-3 mt-1">{s.lookFor}</p>
                <AnimatePresence mode="wait" initial={false}>
                  {disputes[s.key] ? (
                    <motion.div key="open" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}>
                      <Link href={`/merchant/disputes/${disputes[s.key]}`} className="btn btn-secondary mt-2 w-full">
                        Open dispute
                      </Link>
                    </motion.div>
                  ) : (
                    <motion.button
                      key="trigger"
                      exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.12 } }}
                      type="button"
                      className="btn btn-primary mt-2 w-full"
                      disabled={busy !== null}
                      aria-busy={busy === s.key}
                      onClick={() => trigger(s.key)}
                    >
                      <BusyLabel busy={busy === s.key} busyText="Opening…">
                        Trigger {s.key} <Badge tone="warning">Simulated</Badge>
                      </BusyLabel>
                    </motion.button>
                  )}
                </AnimatePresence>
              </li>
            ))}
          </ul>
        </Step>

        <Step n={3} title="Decide in the merchant console">
          <p>
            The queue shows each dispute&apos;s analysis, confidence and recommendation. In a dispute, see which citations the code kept and
            which it rejected, read both sides, edit the drafts and approve the exact request.
          </p>
          <Link href="/merchant" className="btn btn-secondary mt-3">
            Open merchant console
          </Link>
        </Step>

        <Step n={4} title="Shop with the agent and pay (optional)">
          <p>
            Ask the agent for a backpack, watch the code check each requirement on the confirmation card, confirm, and pay in the PayPal
            sandbox. Your order gets its own receipt.
          </p>
          {paypalConfigured && (
            <p className="text-sm mt-2 text-ink-3">
              PayPal asks you to log in with a sandbox buyer account; the test credentials are in the README (sandbox only).
            </p>
          )}
          <Link href={`/shop?prompt=${encodeURIComponent(S1_PROMPT)}`} className="btn btn-secondary mt-3">
            Open the shop with the S1 request
          </Link>
        </Step>

        <Step n={5} title="Reset demo data">
          <p>
            Removes simulated disputes, unconfirmed drafts and chats so the next visitor starts clean. Signed receipts, real sandbox orders
            and real disputes are kept.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {confirmReset ? (
              <>
                <button type="button" className="btn btn-warning" onClick={reset}>
                  Yes, reset for everyone
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setConfirmReset(false)}>
                  Keep data
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setResetDone(false);
                  setConfirmReset(true);
                }}
                disabled={busy !== null}
                aria-busy={busy === "reset"}
              >
                <BusyLabel busy={busy === "reset"} busyText="Resetting…">
                  Reset demo data…
                </BusyLabel>
              </button>
            )}
            {resetDone && (
              <span className="reveal text-sm text-success" role="status">
                Demo data reset.
              </span>
            )}
          </div>
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
