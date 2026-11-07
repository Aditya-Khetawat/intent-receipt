# PayPal and AI integration notes

Every fact below says how it was verified and when. "Spec" means PayPal's published OpenAPI document downloaded on 2026-11-07 from `https://developer.paypal.com/api/<api>/schema.json`. Items marked **PENDING SANDBOX** need the owner's sandbox credentials to confirm with a live call (`npm run smoke`).

## Auth and environment

| Fact | Source | Date |
|---|---|---|
| Sandbox base URL `https://api-m.sandbox.paypal.com`; OAuth2 client credentials at `POST /v1/oauth2/token` | code + PayPal docs | 2026-11-07 |
| App refuses to run if `PAYPAL_ENV` is not `sandbox` (unless `ALLOW_PRODUCTION=true`, which we never set) | `src/lib/env.ts` | 2026-11-07 |
| Live OAuth call succeeds; Disputes API reachable with the app's credentials | live sandbox (`npm run doctor`) | 2026-11-07 |

## Orders v2

| Fact | Source | Date |
|---|---|---|
| `purchase_units[].custom_id` max length **255** (brief guessed 127) | Spec `purchase_unit_request` | 2026-11-07 |
| `invoice_id` max 127, `reference_id` max 256, `description` max 3000 | Spec | 2026-11-07 |
| Capture: `POST /v2/checkout/orders/{id}/capture`; capture id at `purchase_units[].payments.captures[].id` | Spec + docs page | 2026-11-07 |
| Idempotency via `PayPal-Request-Id` header (`ir-create-<intent>`, `ir-capture-<order>`) | code | 2026-11-07 |
| We set `custom_id = "<intent_id>:<first 16 hex of INTENT_CONFIRMED hash>"` and `reference_id = <intent_id>` | `src/lib/paypal/orders.ts` | 2026-11-07 |
| custom_id round-trips on GET order (REST and Agent Toolkit `get_order`) | live sandbox (`npm run smoke`) | 2026-11-07 |
| Buyer approval then capture: order `APPROVED` → capture `COMPLETED` | live sandbox (`npm run smoke -- --capture <id>`) | 2026-11-07 |
| Hosted checkout with no `return_url` reloads the same page after "Continue to Review Order" (the order is approved anyway); the smoke order now sets `return_url` and `user_action: PAY_NOW` | live sandbox | 2026-11-07 |

## PayPal Agent Toolkit (`@paypal/agent-toolkit@1.11.0`)

Verified by loading the package locally and dumping tool schemas (2026-11-07):

- Entry points: `@paypal/agent-toolkit/ai-sdk`, `/mcp`, `/langchain`, `/openai`, `/bedrock`.
- Tool names include `create_order`, `get_order`, `pay_order`, `list_disputes`, `get_dispute`, `accept_dispute_claim`, `create_shipment_tracking`, invoices, subscriptions, refunds.
- The `ai-sdk` export targets **AI SDK v4** (`{ description, parameters, execute }`, bundles `ai@4.3`). This app uses AI SDK v7, so `src/lib/paypal/toolkit.ts` calls the toolkit tools' `execute` directly and re-exposes them as v7 tools.
- `create_order` takes `{ currencyCode, items[], discount, shippingCost, shippingAddress, ... }` and has **no `custom_id`**. Order creation therefore goes through our own REST call, wrapped by invariant I1, so the order carries the intent link.
- `accept_dispute_claim.note` has pattern `^[A-Za-z0-9_-]{1,255}$` (no spaces), which makes it unusable for a human note; accept-claim uses REST.
- **Used in the product:** `get_order` (the shopping agent's `check_order_status` tool, enabled when PayPal is configured) and `get_dispute` (dispute ingest fetches the full dispute for real webhooks, REST fallback). Toolkit actions enabled: `orders.get`, `disputes.get`, `disputes.list` only.

## Webhooks

| Fact | Source | Date |
|---|---|---|
| `POST /v1/notifications/verify-webhook-signature` body: `auth_algo, cert_url, transmission_id, transmission_sig, transmission_time, webhook_id, webhook_event` (all required); response `verification_status: SUCCESS|FAILURE` | Spec `verify_webhook_signature` | 2026-11-07 |
| Headers used: `paypal-auth-algo`, `paypal-cert-url`, `paypal-transmission-id`, `paypal-transmission-sig`, `paypal-transmission-time` | PayPal docs + code | 2026-11-07 |
| `POST /v1/notifications/simulate-event` exists. Simulated events are not signed for a real webhook id, so they cannot pass verification; our simulated disputes bypass the HTTP endpoint and enter at the same `processWebhookEvent` function | Webhooks docs page | 2026-11-07 |
| Events handled: `PAYMENT.CAPTURE.COMPLETED`, `CUSTOMER.DISPUTE.CREATED`, `CUSTOMER.DISPUTE.UPDATED`, `CUSTOMER.DISPUTE.RESOLVED`; deduped on event `id` | code + tests | 2026-11-07 |

## Disputes v1

| Fact | Source | Date |
|---|---|---|
| `dispute_reason` enum: `MERCHANDISE_OR_SERVICE_NOT_RECEIVED, MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED, UNAUTHORISED, CREDIT_NOT_PROCESSED, DUPLICATE_TRANSACTION, INCORRECT_AMOUNT, PAYMENT_BY_OTHER_MEANS, CANCELED_RECURRING_BILLING, PROBLEM_WITH_REMITTANCE, OTHER` | Spec | 2026-11-07 |
| `status` enum: `OPEN, WAITING_FOR_BUYER_RESPONSE, WAITING_FOR_SELLER_RESPONSE, UNDER_REVIEW, RESOLVED, OTHER`; `dispute_state`: `OPEN_INQUIRIES, REQUIRED_ACTION, REQUIRED_OTHER_PARTY_ACTION, UNDER_PAYPAL_REVIEW, APPEALABLE, RESOLVED`; lifecycle stage `INQUIRY, CHARGEBACK, PRE_ARBITRATION, ARBITRATION` | Spec | 2026-11-07 |
| Link back to our order: `disputed_transactions[].seller_transaction_id` (= our capture id) and `.custom` | Spec `transaction_info` | 2026-11-07 |
| Actions: `send-message`, `accept-claim` (`accept_claim_type`: `REFUND, REFUND_WITH_RETURN, PARTIAL_REFUND, REFUND_WITH_RETURN_SHIPMENT_LABEL`), `make-offer` (`offer_type`: `REFUND, REFUND_WITH_RETURN, REFUND_WITH_REPLACEMENT, REPLACEMENT_WITHOUT_REFUND`), `provide-evidence` (multipart, `evidence_type` e.g. `PROOF_OF_FULFILLMENT`) | Spec | 2026-11-07 |
| The spec lists `multipart/form-data` for `accept-claim` and `send-message`; we send JSON bodies (as PayPal's examples do). | **PENDING SANDBOX** | |
| Sandbox-only endpoints exist: `POST .../adjudicate` and `POST .../require-evidence`. There is **no API to create a dispute**. | Spec + docs page | 2026-11-07 |

## Dispute mode decision (§9.4)

**Current mode: C (simulated channel), with Mode B code paths ready.**

- No API creates disputes, so a real dispute needs the sandbox buyer to open one in the sandbox Resolution Center after a real capture. That needs the owner's sandbox accounts.
- All four demo scenarios use payloads shaped like PayPal's `CUSTOMER.DISPUTE.CREATED` resource (field names from the spec), flagged `simulated`, passing through the identical `processWebhookEvent` ingest, context builder, analyst and validator. Actions on simulated disputes are recorded with the exact request but not sent.
- Real webhooks are verified and ingested by the same code; a real dispute shows a REAL SANDBOX badge and its approved actions are actually sent.
- **To upgrade to Mode A/B** (owner, ~10 minutes): complete one real checkout in `/shop` with the sandbox buyer, then in the sandbox site log in as that buyer, open Resolution Center, report a problem on that payment ("item not as described"). With the webhook registered, it appears in `/merchant` with a REAL SANDBOX badge. Record the outcome here.

## Runtime AI

| Fact | Source | Date |
|---|---|---|
| AI SDK `ai@7.0.164`: `generateText` with `tools` + `stopWhen: isStepCount(n)`, structured output via `output: Output.object({ schema })`, `timeout`, `maxRetries` | package docs in `node_modules/ai/docs` | 2026-11-07 |
| `@ai-sdk/google@4` exports `createGoogle`; its model id list includes `gemini-3.5-flash`, `gemini-flash-latest` | package type definitions | 2026-11-07 |
| Tool loop and structured output verified against AI SDK v7 with `MockLanguageModelV4` | `tests/ai-wiring.test.ts` | 2026-11-07 |
| Free-tier limits and live tool-calling with `gemini-3.5-flash` | **PENDING KEY** (`npm run doctor`, `npm run ai-eval`) | |
