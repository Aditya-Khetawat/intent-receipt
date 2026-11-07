# Operations: keeping the demo alive through Dec 15, 2026

## Hosting (Render)

- `render.yaml` defines one Node web service, `plan: starter` (paid, no sleep) so judges never hit a ~50 s free-tier cold start. Fund it with the Render hackathon credits (claim via the hackathon's Render sponsor page). **Owner: confirm the credit balance covers Nov 8 to Dec 15** (about 5.5 weeks of a starter instance) and record it here.
- If credits are not available, switch to `plan: free` and add an external uptime ping every 10 minutes to `/api/health`; document the decision here.
- Health check: `GET /api/health` returns ledger status and whether PayPal/AI are configured.
- **Disk is ephemeral.** The SQLite database is re-created and re-seeded (deterministically) on every deploy/restart. Orders made by judges may disappear after a restart; that is acceptable and expected. The signing key is in env, so receipts stay verifiable across restarts of the seeded history.
- **Reset demo data** (public button on `/demo`) only removes simulated disputes, unconfirmed drafts and chats. Signed ledger entries, orders and real sandbox disputes are never deleted. A full wipe is CLI-only: `npm run seed -- --all`.
- **Do not redeploy between Dec 1 and Dec 15** except for rules-compliant fixes.

## Secrets (Render dashboard, never in git)

`PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `NEXT_PUBLIC_PAYPAL_CLIENT_ID`, `PAYPAL_WEBHOOK_ID`, `GOOGLE_GENERATIVE_AI_API_KEY`, `INTENT_SIGNING_KEY` (from `npm run gen-keys`), `APP_BASE_URL`.

## Cost control

- `AI_DAILY_BUDGET_CALLS` (default 300) caps model calls per UTC day across the app; beyond it the agent shows a friendly message and disputes fall back to CACHED analyses.
- Per-IP rate limits: agent 12/min, orders 20/min, simulate 20/min, analyze 6/min, reset 5/min, plus a global cap of 10x each limit per minute.
- The client IP comes from the **rightmost** `X-Forwarded-For` hop (added by the closest proxy; the leftmost entry can be forged because Render appends rather than replaces). If Render's proxy hop turns out to be shared by all visitors, per-IP limits become coarse but cannot be bypassed. **Owner, after deploy:** check the headers Render forwards (e.g. log them once); if `cf-connecting-ip` or `true-client-ip` carries the real client IP, set `TRUSTED_CLIENT_IP_HEADER` to it.
- Agent: max 8 tool steps per turn, 1200 output tokens, 24 messages per session. Analyst: one call per dispute (plus at most one schema retry and one corrective re-run), 4000 output tokens, cached by input hash.
- Free Google AI Studio tier: no billing. Free-tier inputs may be used by Google to improve products; the app only ever sends fictional demo data.
- If a paid key is ever used, set a monthly spend limit in the provider console.

## After Dec 21, 2026

Rotate: the PayPal sandbox secret, the AI provider key, and `INTENT_SIGNING_KEY` (new key id). Old receipts then show as signed by an unknown key, which is expected.
