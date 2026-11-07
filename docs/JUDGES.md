# Judges: the 5-minute path

No account needed. Everything simulated or cached is labelled on screen.

1. **Open https://intentreceipt.onrender.com**. The landing page explains the problem; click **Run guided demo**.
2. **Buyer** (`/shop`): the S1 request is prefilled. The agent searches the fictional catalog and proposes one item. The confirmation card shows a constraint check computed by code. Click **Confirm**, then pay with the PayPal sandbox button (sandbox buyer login is in the README). You land on a button to the **Intent Receipt**.
3. **Receipt** (`/receipt/...`): press **Verify**. Your browser recomputes every SHA-256 hash and checks the Ed25519 signatures. Download the receipt JSON if you like.
4. **Dispute** (`/demo`, step 2): trigger **S1**. A PayPal-shaped dispute event goes through the same ingest as a real webhook. The analyst runs.
5. **Merchant console** (`/merchant`): the AG Grid queue shows classification, confidence, agent fault and recommendation. Open S1: the verdict strip shows the recommendation and how many citations the code kept (any rejected ones are listed with the reason), what the buyer asked next to the card they confirmed, buyer and seller views, editable drafts, **Review request** shows the exact PayPal API call, **Approve (simulated send)**.
6. **S2**: the analyst recommends **Accept and refund** because the (legacy) agent broke two constraints and the card hid it. **S4**: the buyer's message tries to instruct the AI; it is flagged and ignored.

## Where each criterion lives in the code

| Criterion | Look at |
|---|---|
| Technological implementation | `src/lib/paypal/orders.ts` (Orders v2 + guard I1), `src/lib/paypal/webhooks.ts` (signature verification), `src/lib/paypal/toolkit.ts` (Agent Toolkit), `src/lib/ledger/` (signed hash chain), `src/lib/ai/validator.ts` + `src/lib/disputes/analyze.ts` (verified citations), `tests/` (47 unit/integration tests) and `e2e/` (Playwright + axe) |
| Design | `src/app/*` pages, `src/components/*`, tokens in `src/app/globals.css` |
| Potential impact | Scenarios in `src/lib/disputes/scenarios.ts`; merchant metrics in `src/lib/views.ts` |
| Innovation | Confirmation-text hashing (`src/lib/intents`), balanced analyst prompt (`prompts/dispute-analyst.md`), in-browser verify (`src/components/VerifyPanel.tsx`) |
| Presentation | `docs/VIDEO_SCRIPT.md`, `/demo` |

## Running locally instead

See README "Quick start". `npm ci && npm run dev` works with no keys at all (checkout and disputes are then simulated, analyses cached, all labelled).
