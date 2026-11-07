# Progress

_Last updated: 2026-11-07_

## Done
- **M0 bootstrap:** rules re-checked (`docs/RULES_CHECK.md`); Next.js 16 + TypeScript strict + Tailwind 4; MIT license; `.env.example`; `doctor`, `gen-keys`, `seed`, `smoke`, `gen-fixtures`, `ai-eval` scripts; `render.yaml`; `/api/health`. Public repo: github.com/Aditya-Khetawat/intent-receipt.
- **M1 spikes (offline part):** PayPal Orders, Disputes and Webhooks facts verified from PayPal's OpenAPI specs; Agent Toolkit tools verified locally; AI SDK v7 tool loop and structured output verified with a mock model. Dispute mode **C** for now (`docs/PAYPAL_NOTES.md`).
- **M2 buyer flow and receipts:** signed hash-chained ledger with tamper tests; deterministic constraint checker; shopping agent; hashed confirmation card; guard I1; Orders create/capture; receipt page with in-browser Verify (other receipts shared as redacted headers only); receipt JSON download.
- **M3 disputes and analyst:** verified webhook endpoint with dedupe; one ingest path for real and simulated disputes; analyst with schema retry, citation validator, corrective re-run, CACHED fallback, ERROR + Retry.
- **M4 console and demo:** AG Grid queue; dispute detail with verified evidence, balanced views, editable drafts, exact request preview, human approve; `/demo`; S1–S4 seeds; metrics; budget caps.
- **Hardening:** purchases bound to the buyer's browser session; rate limits keyed on a non-forgeable client IP plus a global cap; public reset limited to demo state; AA contrast fixes.
- **Quality:** `npm run check` green (47 tests), `npm run build` green, `npm run e2e` green (guided-demo smoke, in-browser Verify, axe with no serious/critical violations on 6 pages).

## Next (needs owner input; see "Blocked")
1. Keys → `npm run doctor`, `npm run smoke`, a real sandbox checkout in `/shop`.
2. `npm run gen-fixtures` (replace hand-authored CACHED fallbacks with real model output) and `npm run ai-eval` (paste table into `docs/ARCHITECTURE.md`).
3. Deploy to Render; register the webhook; run the 5-minute path on the hosted URL; set `TRUSTED_CLIENT_IP_HEADER` if Render provides a reliable one.
4. Optional: a real sandbox dispute (Mode B) for the video.
5. Fill README/Devpost placeholders (URLs, sandbox buyer login, eval numbers); record and upload the video; submit.

## Blocked / needs owner
- PayPal sandbox Client ID + Secret, sandbox buyer login, webhook ID (after deploy).
- Groq API key (console.groq.com, free).
- Render account + hackathon credits.

## Honest gaps
- No live PayPal call or live model call has been made yet (no credentials).
- CACHED fallback analyses are hand-authored until regenerated.
- Agent replies are not streamed token-by-token.
- No login: merchant console and `/demo` are open by design for judges (sandbox + fictional data only).
