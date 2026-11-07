"use client";

import { useState } from "react";

export function CopyHash({ value, chars = 12, label }: { value: string; chars?: number; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="inline-flex items-center gap-1 font-mono text-[12px] text-ink-2">
      <span title={value}>{value.length > chars ? `${value.slice(0, chars)}…` : value}</span>
      <button
        type="button"
        className="rounded px-1 text-ink-3 hover:text-ink hover:bg-neutral-soft"
        aria-label={`Copy ${label ?? "value"}`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          } catch {
            /* clipboard unavailable */
          }
        }}
      >
        {copied ? "copied" : "copy"}
      </button>
    </span>
  );
}
