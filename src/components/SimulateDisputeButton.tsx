"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BusyLabel } from "./ui";

export async function simulateDispute(body: Record<string, string>): Promise<string> {
  const res = await fetch("/api/dev/simulate-dispute", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Could not simulate dispute");
  return data.disputeId as string;
}

export function SimulateDisputeButton({ scenario, orderId }: { scenario: string | null; orderId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        className="btn btn-ghost"
        disabled={busy}
        aria-busy={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const id = await simulateDispute(
              scenario ? { scenario } : { orderId, claim: "This is not what I asked for.", reason: "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED" },
            );
            router.push(`/merchant/disputes/${id}`);
          } catch (e) {
            setError((e as Error).message);
            setBusy(false);
          }
        }}
      >
        <BusyLabel busy={busy} busyText="Opening…">
          Simulate dispute
        </BusyLabel>
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  );
}
