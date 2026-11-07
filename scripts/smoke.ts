import "./_env";
import { env } from "../src/lib/env";
import { paypalFetch } from "../src/lib/paypal/client";
import { toolkitGetOrder } from "../src/lib/paypal/toolkit";

// `npm run smoke`: live PayPal sandbox checks (needs sandbox credentials).
// Capture needs a buyer approval in the browser, so this verifies: OAuth, order
// creation with custom_id, reading it back via REST and via the Agent Toolkit.
// Optionally pass a hosted base URL to check /api/health: `npm run smoke -- https://x.onrender.com`

async function main() {
  const base = process.argv[2];
  if (base) {
    const h = await fetch(`${base.replace(/\/$/, "")}/api/health`).then((r) => r.json());
    console.log("health:", h);
  }
  if (!env.paypalConfigured) {
    console.log("PayPal sandbox credentials not set; skipping PayPal checks.");
    return;
  }
  const custom = `ir_smoke_${Date.now()}:0123456789abcdef`;
  const order = await paypalFetch<{ id: string; status: string; links: { rel: string; href: string }[] }>("/v2/checkout/orders", {
    method: "POST",
    requestId: `smoke-${Date.now()}`,
    body: {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: "smoke",
          custom_id: custom,
          description: "IntentReceipt smoke test",
          amount: { currency_code: "USD", value: "1.00", breakdown: { item_total: { currency_code: "USD", value: "1.00" } } },
          items: [{ name: "Smoke test", sku: "SMOKE-1", quantity: "1", unit_amount: { currency_code: "USD", value: "1.00" } }],
        },
      ],
    },
  });
  console.log(`created order ${order.id} (${order.status})`);
  const rest = await paypalFetch<{ purchase_units: { custom_id?: string }[] }>(`/v2/checkout/orders/${order.id}`);
  console.log(`custom_id round-trip: ${rest.purchase_units[0].custom_id === custom ? "OK" : "MISMATCH"}`);
  const tk = (await toolkitGetOrder(order.id)) as { id?: string; status?: string };
  console.log(`agent toolkit get_order: ${tk.id === order.id ? "OK" : "unexpected"} (${tk.status})`);
  console.log(`approve in a browser (sandbox buyer) to test capture: ${order.links.find((l) => l.rel === "approve")?.href}`);
}

main().catch((e) => {
  console.error("SMOKE FAILED:", e.message, e.body ?? "");
  process.exit(1);
});
