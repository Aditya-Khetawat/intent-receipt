# Progress

_Last updated: 2026-11-07 (IST afternoon)_

## Done
- **M0 bootstrap:** rules re-checked (`docs/RULES_CHECK.md`); Next.js 16 + TypeScript strict + Tailwind 4 scaffold; MIT license; `.env.example`; `npm run doctor`, `gen-keys`, `seed`, `smoke`, `gen-fixtures`, `ai-eval`; `render.yaml`; `/api/health`.
- **M1 spikes (offline part):** PayPal Orders, Disputes and Webhooks facts verified from PayPal's OpenAPI specs; Agent Toolkit tool list and schemas verified locally; AI SDK v7 tool loop and structured output verified with a mock model. Dispute mode **C** chosen for now (see `docs/PAYPAL_NOTES.md`).
- **M2 buyer flow and receipts:** ledger (canonical JSON, SHA-256 chain, Ed25519) with tamper tests; catalog + deterministic constraint checker; shopping agent with tools; confirmation card hashed into the record; guard I1; Orders create/capture (real when configured, labelled simulated otherwise); receipt page with in-browser Verify; receipt JSON download.
- **M3 disputes and analyst:** webhook endpoint with signature verification and dedupe; shared ingest for real and simulated disputes; context builder; analyst with schema retry, citation validator, corrective re-run, CACHED fallback, ERROR with Retry.
- **M4 console and demo:** AG Grid queue (themed, quick filter, saved sort, live polling); dispute detail (thread, evidence with "show source", balanced views, editable drafts, exact request preview, approve); `/demo` runner; S1–S4 seeds; metrics tab; budget caps and rate limits.
- `npm run check` green: typecheck, lint, 38 tests. `npm run build` green. Verified in the browser: landing, receipt Verify (Ed25519 in browser), S1–S4 triggered, console, S2 approve (simulated send), shop with no AI key.

## Next
1. Owner supplies keys (below). Then: `npm run doctor`, `npm run smoke`, a real checkout in `/shop`, `npm run gen-fixtures` (replace hand-authored fallbacks with real model output), `npm run ai-eval` (paste the table into `docs/ARCHITECTURE.md`).
2. Try a real sandbox dispute (Mode B) following `docs/PAYPAL_NOTES.md`.
3. Deploy to Render; set webhook URL; re-run the 5-minute path on the hosted URL.
4. Polish: axe check, Playwright smoke on `/demo`, screenshot/GIF for README.
5. Stretch: accountability tab; AG Studio dashboard (needs trial key) for the AG Grid prize.

## Blocked / needs owner
- PayPal sandbox Client ID + Secret, sandbox buyer email/password, webhook ID (after deploy).
- Google AI Studio API key.
- Render account + hackathon credits; public GitHub repo.

## Honest gaps right now
- No live PayPal call has been made yet (no credentials). Checkout and disputes have only run in labelled SIMULATED mode.
- No live model call has been made yet (no key). The CACHED fallback analyses in `db/fixtures/analyses/` are **hand-authored** and labelled as such until `npm run gen-fixtures` replaces them.
- Shopping agent replies are not streamed token-by-token; each turn returns when the tool loop finishes (with a visible "searching" state).
