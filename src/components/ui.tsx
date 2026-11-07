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

export function money(amount: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
}

export function shortDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";
}

export function humanize(s: string | null | undefined) {
  if (!s) return "";
  return s
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());
}

export const ACTION_TONE: Record<string, BadgeTone> = {
  CONTEST: "accent",
  ACCEPT_AND_REFUND: "warning",
  OFFER_PARTIAL: "info",
  REQUEST_MORE_INFO: "neutral",
};

export const FAULT_TONE: Record<string, BadgeTone> = { NONE: "success", POSSIBLE: "warning", LIKELY: "danger" };
