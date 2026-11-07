"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { PayPalButtons, PayPalScriptProvider, usePayPalScriptReducer } from "@paypal/react-paypal-js";
import type { CardLine, IntentRecord } from "@/lib/intents";
import { AnimatePresence, motion } from "motion/react";
import { AlertIcon, ArrowIcon, Badge, CheckIcon, Spinner, money } from "./ui";
import { EASE } from "./motion";

// Checkout steps hand off to each other: the old step leaves quickly, the new one settles in.
const step = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4, transition: { duration: 0.12 } },
  transition: { duration: 0.28, ease: EASE },
} as const;

interface Msg {
  role: "user" | "agent" | "system";
  text: string;
}

interface Proposal {
  id: string;
  status: string;
  card: CardLine[];
  record: IntentRecord;
}

type Phase = "chatting" | "proposed" | "confirming" | "pay" | "capturing" | "done";

const SUGGESTIONS = [
  "I need a waterproof 40L backpack in black, under $85, for a trip next month.",
  "USB-C fast-charge cable, 2 m, white, under $20",
  "A 20L waterproof dry bag in blue, under $30 please.",
];

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

export function ShopClient({
  initialPrompt,
  paypalClientId,
  aiAvailable,
  aiModel,
}: {
  initialPrompt: string;
  paypalClientId: string;
  aiAvailable: boolean;
  aiModel: string;
}) {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "agent",
      text: "Hi, I'm the Fernhill Outfitters shopping agent. Tell me what you need, including any must-haves like size, colour or budget, and I'll find one option for you to confirm.",
    },
  ]);
  const [input, setInput] = useState(initialPrompt);
  const [busy, setBusy] = useState(false);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [phase, setPhase] = useState<Phase>("chatting");
  const [error, setError] = useState<string | null>(null);
  const [aiDown, setAiDown] = useState(!aiAvailable);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    setError(null);
    setMessages((m) => [...m, { role: "user", text }]);
    setInput("");
    setBusy(true);
    try {
      const r = await postJson<{ reply: string; intent: Proposal | null }>("/api/agent", { message: text });
      setMessages((m) => [...m, { role: "agent", text: r.reply }]);
      if (r.intent) {
        setProposal(r.intent);
        setPhase("proposed");
      }
    } catch (e) {
      const msg = (e as Error).message;
      if (/not configured|budget|rate limit/i.test(msg)) setAiDown(true);
      setMessages((m) => [...m, { role: "system", text: msg }]);
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!proposal) return;
    setPhase("confirming");
    setError(null);
    try {
      // The exact text rendered on the card is what gets hashed and signed.
      const presented = proposal.card.map((l) => l.text).join("\n");
      await postJson(`/api/intents/${proposal.id}/confirm`, { presented_text: presented, client_nonce: crypto.randomUUID() });
      setPhase("pay");
    } catch (e) {
      setError((e as Error).message);
      setPhase("proposed");
    }
  }

  async function change() {
    if (proposal) await fetch(`/api/intents/${proposal.id}/cancel`, { method: "POST" }).catch(() => {});
    setProposal(null);
    setPhase("chatting");
    setMessages((m) => [...m, { role: "system", text: "Proposal discarded. Tell the agent what to change." }]);
  }

  async function createOrder(): Promise<string> {
    const r = await postJson<{ id: string }>("/api/orders", { intentId: proposal!.id });
    return r.id;
  }

  async function capture(orderId: string) {
    setPhase("capturing");
    try {
      await postJson("/api/orders/capture", { intentId: proposal!.id, paypalOrderId: orderId });
      setPhase("done");
    } catch (e) {
      setError(`Payment capture failed: ${(e as Error).message}. You were not charged twice; try again.`);
      setPhase("pay");
    }
  }

  async function simulatedCheckout() {
    setError(null);
    try {
      const id = await createOrder();
      await capture(id);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const unmet = proposal?.record.constraint_check.results.some((r) => r.status === "UNMET") ?? false;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 grid lg:grid-cols-[1fr_420px] gap-5">
      <section className="card flex flex-col h-[calc(100vh-180px)] min-h-[520px]" aria-label="Chat with the shopping agent">
        <div className="px-4 py-3 border-b border-line flex items-center justify-between gap-2">
          <div>
            <h1 className="font-semibold">Shopping agent</h1>
            <p className="text-xs text-ink-3">Runtime model: {aiModel}</p>
          </div>
          <Badge tone="info">PayPal sandbox</Badge>
        </div>
        <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3" aria-live="polite" aria-busy={busy}>
          {messages.map((m, i) => (
            <div key={i} className={`reveal flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap ${
                  m.role === "user"
                    ? "bg-ink text-on-strong"
                    : m.role === "system"
                      ? "bg-warning-soft text-warning text-sm"
                      : "bg-neutral-soft"
                }`}
              >
                {m.text}
              </div>
            </div>
          ))}
          {busy && (
            <div className="reveal flex items-center gap-3 text-sm text-ink-3" role="status">
              <span className="typing inline-flex items-center gap-1 rounded-xl bg-neutral-soft px-3.5 py-3" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
              Agent is searching the catalog…
            </div>
          )}
          {aiDown && (
            <div className="rounded-lg border border-line bg-paper p-3 text-sm">
              The live agent is unavailable right now. You can still follow the{" "}
              <Link href="/demo" className="text-accent underline">
                guided demo
              </Link>{" "}
              with seeded orders, receipts and disputes.
            </div>
          )}
        </div>
        <div className="border-t border-line p-3">
          {messages.length <= 1 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="text-left text-xs text-ink-2 rounded-full border border-line px-3 py-1.5 transition-colors hover:bg-neutral-soft hover:text-ink hover:border-line-strong"
                  onClick={() => setInput(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
          >
            <label htmlFor="chat-input" className="sr-only">
              Message the agent
            </label>
            <input
              id="chat-input"
              className="field flex-1 px-3 py-2 text-[15px] min-w-0"
              placeholder="e.g. a waterproof 40L backpack in black under $85"
              value={input}
              maxLength={600}
              onChange={(e) => setInput(e.target.value)}
              disabled={busy || phase === "done"}
            />
            <button type="submit" className="btn btn-primary" disabled={busy || !input.trim()} aria-busy={busy}>
              {busy ? <Spinner /> : null}
              Send
            </button>
          </form>
        </div>
      </section>

      <aside aria-label="Confirmation" className="space-y-4">
        <AnimatePresence mode="popLayout" initial={false}>
          {!proposal && (
            <motion.div key="placeholder" {...step} className="card p-5 text-sm text-ink-2">
              <p className="eyebrow mb-2">Confirmation card</p>
              <p>
                When the agent proposes an item, its confirmation card appears here with a constraint check computed by code, not by the
                model.
              </p>
              <p className="mt-2">
                Nothing is ordered until you confirm, and the order can only be created for exactly what you confirmed.
              </p>
            </motion.div>
          )}
          {proposal && (
            // Arrives from the conversation side, then its checks tick in order: the code-computed verdicts are the point.
            <motion.div
              key={proposal.id}
              initial={{ opacity: 0, x: -16, filter: "blur(4px)" }}
              animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, transition: { duration: 0.12 } }}
              transition={{ duration: 0.45, ease: EASE }}
            >
              <ConfirmationCard proposal={proposal} />
            </motion.div>
          )}
          {proposal && phase === "proposed" && (
            <motion.div key="actions" {...step} className="flex gap-2">
              <button type="button" className={`btn flex-1 ${unmet ? "btn-warning" : "btn-primary"}`} onClick={confirm}>
                {unmet ? "Confirm anyway" : "Confirm and sign"} ·{" "}
                {money(
                  (proposal.record.selection.price_cents * proposal.record.selection.quantity) / 100,
                  proposal.record.selection.currency,
                )}
              </button>
              <button type="button" className="btn btn-secondary" onClick={change}>
                Change
              </button>
            </motion.div>
          )}
          {phase === "confirming" && (
            <motion.p key="confirming" {...step} className="flex items-center gap-2 text-sm text-ink-3" role="status">
              <Spinner /> Signing your confirmation…
            </motion.p>
          )}
          {(phase === "pay" || phase === "capturing") && proposal && (
            <motion.div key="pay" {...step} className="card p-4 space-y-3">
              <p className="text-sm">
                <Badge tone="success">Confirmed</Badge> <span className="ml-1">Signed into the ledger. Pay with PayPal (sandbox):</span>
              </p>
              {paypalClientId ? (
                <PayPalScriptProvider options={{ clientId: paypalClientId, currency: "USD", intent: "capture" }}>
                  <PayPalLoading />
                  <PayPalButtons
                    style={{ layout: "vertical", label: "pay" }}
                    disabled={phase === "capturing"}
                    createOrder={createOrder}
                    onApprove={async (data) => capture(data.orderID)}
                    onCancel={() => setError("You cancelled the PayPal approval. Your confirmation is saved; you can pay when ready.")}
                    onError={(err) => setError(`PayPal error: ${String((err as { message?: string })?.message ?? err)}`)}
                  />
                </PayPalScriptProvider>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-ink-3">
                    PayPal sandbox credentials are not configured on this server, so checkout is simulated. The order is labelled SIMULATED
                    everywhere.
                  </p>
                  <button type="button" className="btn btn-secondary w-full" onClick={simulatedCheckout} disabled={phase === "capturing"}>
                    Simulated checkout <Badge tone="warning">Simulated</Badge>
                  </button>
                </div>
              )}
              {phase === "capturing" && (
                <p className="flex items-center gap-2 text-sm text-ink-3" role="status">
                  <Spinner /> Capturing payment…
                </p>
              )}
            </motion.div>
          )}
          {phase === "done" && proposal && (
            <motion.div key="done" {...step} className="card p-5 border-success/40" role="status">
              <p className="font-semibold text-success">Payment captured</p>
              <p className="text-sm text-ink-2 mt-1">
                Your request, the agent&apos;s choice and your confirmation are linked to the PayPal order.
              </p>
              <Link href={`/receipt/${proposal.id}`} className="btn btn-primary w-full mt-4">
                View your Intent Receipt
                <ArrowIcon />
              </Link>
            </motion.div>
          )}
        </AnimatePresence>
        {error && (
          <p role="alert" className="text-sm text-danger bg-danger-soft rounded-lg p-3">
            {error}
          </p>
        )}
      </aside>
    </div>
  );
}

/** Holds the space while PayPal's SDK loads, so the pay step never shows an empty card. */
function PayPalLoading() {
  const [{ isPending }] = usePayPalScriptReducer();
  if (!isPending) return null;
  return (
    <div className="space-y-2" role="status" aria-label="Loading PayPal checkout">
      <div className="skeleton h-11" />
      <div className="skeleton h-11" />
    </div>
  );
}

function ConfirmationCard({ proposal }: { proposal: Proposal }) {
  const s = proposal.record.selection;
  const [title, ...rest] = proposal.card;
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 bg-accent-soft px-5 py-2.5">
        <span className="text-sm font-semibold text-accent">Confirm this purchase</span>
        <span className="text-xs text-ink-3">proposed by the agent</span>
      </div>
      <div className="p-5">
        <h2 className="font-semibold text-lg">{title.text}</h2>
        <p className="text-2xl font-semibold mt-1">{money((s.price_cents * s.quantity) / 100, s.currency)}</p>
        <ul className="mt-3 space-y-1.5 text-sm">
          {rest.map((l, i) => (
            <CardRow key={i} line={l} delay={0.2 + Math.min(i, 12) * 0.045} />
          ))}
        </ul>
        <p className="mt-4 text-xs text-ink-3">The exact text above is hashed (SHA-256) and signed when you confirm.</p>
      </div>
    </div>
  );
}

function CardRow({ line, delay }: { line: CardLine; delay: number }) {
  const [className, content] = rowParts(line);
  return (
    <motion.li
      className={className}
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, ease: EASE, delay }}
    >
      {content}
    </motion.li>
  );
}

function rowParts(line: CardLine): [string, ReactNode] {
  switch (line.kind) {
    case "warning":
      return ["rounded-lg bg-warning-soft text-warning font-semibold px-3 py-2 my-2", line.text];
    case "heading":
      return ["eyebrow pt-3", line.text];
    case "met":
      return [
        "flex gap-2",
        <>
          <CheckIcon className="text-success mt-0.5 shrink-0" />
          <span>{line.text}</span>
        </>,
      ];
    case "unmet":
      return [
        "flex gap-2 text-warning font-medium",
        <>
          <AlertIcon className="mt-0.5 shrink-0" />
          <span>{line.text}</span>
        </>,
      ];
    case "unknown":
      return [
        "flex gap-2 text-ink-3",
        <>
          <span
            className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-current text-[10px] font-semibold"
            aria-hidden
          >
            ?
          </span>
          <span>{line.text}</span>
        </>,
      ];
    case "assumption":
      return ["text-ink-2 pl-4 border-l-2 border-line", line.text];
    default:
      return ["text-ink-2", line.text];
  }
}
