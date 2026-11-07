import type { ReactNode } from "react";
export { CopyHash } from "./CopyHash";

export type BadgeTone = "info" | "warning" | "neutral" | "success" | "danger" | "accent";

const tones: Record<BadgeTone, string> = {
  info: "bg-info-soft text-info",
  warning: "bg-warning-soft text-warning",
  neutral: "bg-neutral-soft text-ink-2",
  success: "bg-success-soft text-success",
  danger: "bg-danger-soft text-danger",
  accent: "bg-accent-soft text-accent",
};

export function Badge({ tone, children, title }: { tone: BadgeTone; children: ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export const SourceBadge = ({ simulated, cached }: { simulated: boolean; cached?: boolean }) => (
  <span className="inline-flex gap-1">
    {simulated ? (
      <Badge tone="warning" title="Not a real PayPal sandbox object; created by the demo and labelled as such">
        Simulated
      </Badge>
    ) : (
      <Badge tone="info" title="Created through the real PayPal sandbox API">
        Real sandbox
      </Badge>
    )}
    {cached && (
      <Badge tone="neutral" title="Precomputed analysis shown because a live AI call was unavailable">
        Cached
      </Badge>
    )}
  </span>
);

/** Inline loader sized to the surrounding text; pair it with visible text that names the work. */
export const Spinner = () => <span className="spinner" aria-hidden="true" />;

/** Button label that swaps to a spinner plus progress text while `busy`. */
export function BusyLabel({ busy, busyText, children }: { busy: boolean; busyText: string; children: ReactNode }) {
  return busy ? (
    <>
      <Spinner />
      {busyText}
    </>
  ) : (
    <>{children}</>
  );
}

export function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

/** Arrow for buttons that move you forward; nudges toward the destination on hover (.nudge). */
export function ArrowIcon() {
  return (
    <svg
      className="nudge"
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
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function AlertIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
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
      <path d="M12 3.5 2.8 19.5h18.4L12 3.5Z" />
      <path d="M12 10v4M12 17v.01" />
    </svg>
  );
}

export function CrossIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
    </svg>
  );
}

export function money(amount: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
}

export function shortDate(iso: string) {
  return (
    new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC"
  );
}

export function humanize(s: string | null | undefined) {
  if (!s) return "";
  return s
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());
}

/** PayPal's reason codes, in the words a merchant uses. */
const REASON_LABEL: Record<string, string> = {
  MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED: "Item not as described",
  MERCHANDISE_OR_SERVICE_NOT_RECEIVED: "Item not received",
  UNAUTHORISED: "Unauthorized payment",
  CREDIT_NOT_PROCESSED: "Credit not processed",
  DUPLICATE_TRANSACTION: "Duplicate transaction",
  INCORRECT_AMOUNT: "Incorrect amount",
  PAYMENT_BY_OTHER_MEANS: "Paid by other means",
  CANCELED_RECURRING_BILLING: "Cancelled recurring billing",
  PROBLEM_WITH_REMITTANCE: "Problem with remittance",
  OTHER: "Other",
};
export const reasonLabel = (r: string) => REASON_LABEL[r] ?? humanize(r);

export const ACTION_TONE: Record<string, BadgeTone> = {
  CONTEST: "accent",
  ACCEPT_AND_REFUND: "warning",
  OFFER_PARTIAL: "info",
  REQUEST_MORE_INFO: "neutral",
};

export const FAULT_TONE: Record<string, BadgeTone> = { NONE: "success", POSSIBLE: "warning", LIKELY: "danger" };
