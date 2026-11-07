import "./_env";
import { env } from "../src/lib/env";
import { getAccessToken, paypalFetch } from "../src/lib/paypal/client";

// `npm run doctor`: checks every owner setup item and prints plain-English fixes.

type Check = { name: string; ok: boolean | "warn"; detail: string };
const checks: Check[] = [];
const add = (name: string, ok: boolean | "warn", detail: string) => checks.push({ name, ok, detail });

async function main() {
  const [major] = process.versions.node.split(".").map(Number);
  add("Node.js 20+", major >= 20, major >= 20 ? process.versions.node : `Found ${process.versions.node}. Install Node 20 or newer.`);

  add("PAYPAL_ENV is sandbox", env.paypalEnv === "sandbox", env.paypalEnv === "sandbox" ? "sandbox" : "Set PAYPAL_ENV=sandbox. This project never uses production.");

  if (!env.paypalConfigured) {
    add(
      "PayPal sandbox credentials",
      "warn",
      "PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET are empty. The app still runs, but checkout is SIMULATED. Get them at developer.paypal.com > Apps & Credentials > Sandbox > Create App.",
    );
  } else {
    try {
      await getAccessToken();
      add("PayPal sandbox OAuth", true, "Got an access token from api-m.sandbox.paypal.com");
      try {
        await paypalFetch("/v1/customer/disputes?page_size=1");
        add("PayPal Disputes API access", true, "GET /v1/customer/disputes succeeded");
      } catch (e) {
        add("PayPal Disputes API access", "warn", `${(e as Error).message}. Real dispute ingest may not work; simulated disputes still do.`);
      }
    } catch (e) {
      add("PayPal sandbox OAuth", false, `${(e as Error).message}. Re-copy the sandbox Client ID and Secret (not the live ones).`);
    }
  }
  add(
    "NEXT_PUBLIC_PAYPAL_CLIENT_ID",
    env.paypalConfigured ? (process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ? true : "warn") : "warn",
    process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ? "set" : "Empty; the server falls back to PAYPAL_CLIENT_ID for the PayPal buttons. Set it to the same sandbox Client ID.",
  );
  add(
    "PAYPAL_WEBHOOK_ID",
    env.paypalWebhookId ? true : "warn",
    env.paypalWebhookId
      ? "set"
      : "Empty. Add a webhook in the sandbox app for https://<your-url>/api/webhooks/paypal with CUSTOMER.DISPUTE.CREATED/UPDATED/RESOLVED and PAYMENT.CAPTURE.COMPLETED, then copy its ID.",
  );
  if (!env.webhookVerify) add("Webhook verification", "warn", "WEBHOOK_VERIFY=off (development only). Never deploy like this.");

  const keyVar = ({ groq: "GROQ_API_KEY", anthropic: "ANTHROPIC_API_KEY", google: "GOOGLE_GENERATIVE_AI_API_KEY" } as Record<string, string>)[env.aiProvider];
  const aiKey = keyVar ? process.env[keyVar] : undefined;
  add(
    `Runtime AI key (${env.aiProvider})`,
    aiKey ? true : "warn",
    aiKey
      ? `models: agent=${env.aiModelAgent}, analyst=${env.aiModelAnalyst}`
      : `No key. The shopping agent is disabled and disputes show CACHED analyses. Get a free key at https://console.groq.com/keys and set GROQ_API_KEY (or set ${keyVar ?? "a supported AI_PROVIDER"}).`,
  );
  if (aiKey && env.aiProvider === "groq") {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/models", { headers: { Authorization: `Bearer ${aiKey}` } });
      const ids = res.ok ? ((await res.json()) as { data: { id: string }[] }).data.map((m) => m.id) : [];
      const missing = [env.aiModelAgent, env.aiModelAnalyst].filter((m) => !ids.includes(m));
      add(
        "AI model id exists",
        res.ok && missing.length === 0,
        !res.ok ? `Groq rejected the key (HTTP ${res.status}).` : missing.length ? `Not available on Groq: ${missing.join(", ")}` : env.aiModelAgent,
      );
    } catch (e) {
      add("AI model id exists", "warn", (e as Error).message);
    }
  }
  if (aiKey && env.aiProvider === "google") {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${env.aiModelAgent}?key=${aiKey}`);
      add("AI model id exists", res.ok, res.ok ? env.aiModelAgent : `Model ${env.aiModelAgent} not found (HTTP ${res.status}). Try AI_MODEL_AGENT=gemini-flash-latest.`);
    } catch (e) {
      add("AI model id exists", "warn", (e as Error).message);
    }
  }

  add(
    "INTENT_SIGNING_KEY",
    env.signingKey ? true : env.nodeEnv === "production" ? false : "warn",
    env.signingKey ? `key id ${env.keyId}` : "Empty. Development auto-generates data/dev-signing-key.txt; production refuses to start. Run `npm run gen-keys`.",
  );
  add("DEMO_MODE", true, env.demoMode ? "on (guided demo and /api/dev/* enabled)" : "off (/api/dev/* disabled)");

  for (const c of checks) {
    const icon = c.ok === true ? "OK  " : c.ok === "warn" ? "WARN" : "FAIL";
    console.log(`${icon}  ${c.name}\n      ${c.detail}`);
  }
  const failed = checks.filter((c) => c.ok === false).length;
  console.log(failed ? `\n${failed} check(s) failed.` : "\nNo blocking problems. Run `npm run dev` and open http://localhost:3000");
  process.exit(failed ? 1 : 0);
}

void main();
