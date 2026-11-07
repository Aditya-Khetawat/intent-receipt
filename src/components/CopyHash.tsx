"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";

export function CopyHash({ value, chars = 12, label }: { value: string; chars?: number; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="inline-flex items-center gap-1 font-mono text-[12px] text-ink-2">
      <span title={value}>{value.length > chars ? `${value.slice(0, chars)}…` : value}</span>
      <button
        type="button"
        className={`inline-grid rounded px-1 transition-colors hover:bg-neutral-soft ${copied ? "text-success" : "text-ink-3 hover:text-ink"}`}
        aria-label={`Copy ${label ?? "value"}`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1400);
          } catch {
            /* clipboard unavailable */
          }
        }}
      >
        {/* Both labels share one grid cell, so the swap never shifts the line. */}
        <AnimatePresence initial={false}>
          <motion.span
            key={copied ? "copied" : "copy"}
            className="[grid-area:1/1] inline-flex items-center gap-0.5"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4, transition: { duration: 0.1 } }}
            transition={{ duration: 0.18 }}
          >
            {copied ? (
              <>
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
                copied
              </>
            ) : (
              "copy"
            )}
          </motion.span>
        </AnimatePresence>
      </button>
    </span>
  );
}
