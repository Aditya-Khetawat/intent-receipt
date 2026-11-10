import type { Metadata } from "next";
import { PackVerifier } from "@/components/PackVerifier";

export const metadata: Metadata = { title: "Verify a pack" };

export default function VerifyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Verify an evidence pack</h1>
      <p className="text-ink-2 mt-1 mb-6 max-w-[65ch]">
        Every receipt exports as a PDF with the signed receipt embedded inside. This page reads that file in your browser, recomputes every
        hash, checks every Ed25519 signature against IntentReceipt&apos;s published key, and tells you whether anything was changed after
        signing.
      </p>
      <PackVerifier sampleHref="/api/evidence/ir_seed_s1_ridge40" />
    </div>
  );
}
