# Demo video script (target 2:40, hard max 3:00)

Before recording: `/demo` → **Reset demo data**. Desktop browser, 1080p. No music. Keep SIMULATED / REAL SANDBOX / CACHED badges visible. Add captions. Upload to YouTube as **Public**. An AI voiceover is allowed (per the organisers' video-tips update).

| Time | On screen | Narration |
|---|---|---|
| 0:00–0:20 | Landing page headline | "AI agents are starting to buy things for us. When a purchase goes wrong, nobody can prove what we actually asked for. IntentReceipt fixes that, on PayPal." |
| 0:20–1:00 | `/shop`: send the S1 request; agent proposes; confirmation card with the constraint check; Confirm; PayPal sandbox approval; success | "The agent turns my request into constraints and finds one item. A deterministic checker, code not the model, verifies each requirement on the card. When I confirm, the exact text I saw is hashed and signed. Payment runs through PayPal's sandbox, and the order can only be created for exactly what I confirmed." |
| 1:00–1:20 | Receipt page; press Verify (green) | "Here's the receipt: what I asked, what the agent chose and why, and what I confirmed, linked to the PayPal order and capture in a tamper-evident chain. My browser verifies every hash and signature itself." |
| 1:20–1:55 | `/demo` trigger S1 → merchant console (AG Grid) → open S1; "6 of 6 citations kept"; buyer vs seller views; edit draft; Review request; Approve (simulated send) | "A dispute arrives. The AI analyst reads the receipt, order and tracking. Every citation is a path into the source data, and code verifies each one; anything unverified is dropped. The buyer asked for 40 litres and confirmed 40 litres, so it recommends contesting. I edit the draft and approve. Nothing goes to PayPal without me." |
| 1:55–2:15 | Open S2: AGENT FAULT, Accept and refund | "It is not a rubber stamp for the seller. Here an older agent bought a 1-metre black cable for a '2-metre white' request and hid it. The analyst says: refund." |
| 2:15–2:30 | Open S4: flagged message | "Buyer messages are untrusted. This one tries to hijack the analyst. It's flagged and ignored." |
| 2:30–2:50 | Architecture diagram (from README) with the honesty line | "Real PayPal sandbox orders, capture, verified webhooks and the PayPal Agent Toolkit. The demo disputes are simulated, because the sandbox can't create disputes by API, and they're labelled everywhere. PayPal could attach receipts like this to agent orders to strengthen dispute evidence and seller protection." |
| 2:50–3:00 | End card: repo + demo URL | "IntentReceipt: receipts for what the AI was asked to do." |

If a real sandbox dispute was achieved (Mode A/B), say "This dispute is a real PayPal sandbox dispute" on that segment instead and keep the S2/S4 lines as simulated.
If AI analyses show CACHED during recording, say so, or re-record once the live key works.
