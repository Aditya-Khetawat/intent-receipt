# Progress

_Last updated: 2026-11-10_

## Done
- **M0 bootstrap:** rules re-checked (`docs/RULES_CHECK.md`); Next.js 16 + TypeScript strict + Tailwind 4; MIT license; `.env.example`; `doctor`, `gen-keys`, `seed`, `smoke`, `gen-fixtures`, `ai-eval` scripts; `render.yaml`; `/api/health`. Public repo: github.com/Aditya-Khetawat/intent-receipt.
- **M1 spikes (offline part):** PayPal Orders, Disputes and Webhooks facts verified from PayPal's OpenAPI specs; Agent Toolkit tools verified locally; AI SDK v7 tool loop and structured output verified with a mock model. Dispute mode **C** for now (`docs/PAYPAL_NOTES.md`).
- **Hosted:** https://intentreceipt.onrender.com (Render starter). Verified 2026-11-07: health, all pages, smoke, live agent turn, live Groq dispute analysis (4.9 s, 5/5 citations verified), in-browser receipt Verify.
- **Live checks (2026-11-07):** PayPal sandbox OAuth, order + custom_id round-trip, Agent Toolkit get_order, buyer approval + capture; Groq gpt-oss-120b analyst (fixtures regenerated from live output, 24/24 citations verified; eval table in ARCHITECTURE).
- **M2 buyer flow and receipts:** signed hash-chained ledger with tamper tests; deterministic constraint checker; shopping agent; hashed confirmation card; guard I1; Orders create/capture; receipt page with in-browser Verify (other receipts shared as redacted headers only); receipt JSON download.
- **M3 disputes and analyst:** verified webhook endpoint with dedupe; one ingest path for real and simulated disputes; analyst with schema retry, citation validator, corrective re-run, CACHED fallback, ERROR + Retry.
- **M4 console and demo:** AG Grid queue; dispute detail with verified evidence, balanced views, editable drafts, exact request preview, human approve; `/demo`; S1–S4 seeds; metrics; budget caps.
- **Evidence pack (2026-11-10):** every receipt exports as a PDF with the signed receipt JSON embedded; contesting attaches it to PayPal `provide-evidence` as `PROOF_OF_RECEIPT_COPY` (stored by SHA-256 before sending); `/verify` checks a pack in the browser against the published key. Real sandbox send is pending a buyer-opened sandbox dispute.
- **Passkey confirmation (2026-11-11):** the buyer's passkey (WebAuthn) signs a challenge derived from the card hash; the proof is stored in the signed record and re-checked in the browser by Verify, `/verify` and the evidence pack. While the AI is unavailable, the shop offers the S1 example proposal (labelled). E2E uses a Chromium virtual authenticator.
- **Hardening:** purchases bound to the buyer's browser session; rate limits keyed on a non-forgeable client IP plus a global cap; public reset limited to demo state; AA contrast fixes.
- **Quality:** `npm run check` green (81 tests), `npm run build` green, `npm run e2e` green (guided-demo smoke, in-browser Verify, evidence pack verify and tamper, passkey confirm with a virtual authenticator, axe with no serious/critical violations on 7 pages).

## Next (owner, before Thu 2026-11-12 12:00 pm PT)
1. Confirm one purchase with a real passkey on the live `/shop` and press Verify on its receipt.
2. Record the video (`docs/VIDEO_SCRIPT.md`) and add the YouTube link to the README and `docs/DEVPOST_SUBMISSION.md`.
3. Submit on Devpost (tick AG Grid and Render); set the GitHub About description, website and topics; claim the Render credit.
4. After submitting, push nothing: a push redeploys Render and resets the demo data.

Optional, not needed for submission: re-run `npm run ai-eval 3 S1,S4` for `dispute-analyst@4` (spends the shared Groq budget); a real sandbox dispute to exercise `provide-evidence` with the PDF.

## Honest gaps
- Groq free tier is 8K tokens/minute and 200K tokens/day for gpt-oss-120b: concurrent visitors queue, a busy minute falls back to CACHED analyses, and once the daily budget is spent the shop offers the labelled example proposal.
- A passkey proves the holder approved the exact card, not who the holder is (no accounts).
- AI eval (2026-11-10, prompt dispute-analyst@3): 5 runs per scenario, all 17 returned runs chose the expected action with a self-consistent classification (on @2, 2 of 14 contradicted themselves); 2 runs were rate-limited by Groq and 1 failed the schema. Raw citation pass rate 100% (S1 was 71% on @1). Classification/action pairs are now checked in code against a decision policy.
- Agent replies are not streamed token-by-token.
- No login: merchant console and `/demo` are open by design for judges (sandbox + fictional data only).
