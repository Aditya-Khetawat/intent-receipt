// Central, server-only access to configuration. Secrets never leave this module
// except through narrowly-scoped helpers (invariant I6).

function str(name: string, fallback = ""): string {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : v;
}

export const env = {
  get nodeEnv() {
    return str("NODE_ENV", "development");
  },
  get isDev() {
    return this.nodeEnv !== "production";
  },
  get appBaseUrl() {
    return str("APP_BASE_URL", "http://localhost:3000");
  },
  get demoMode() {
    return str("DEMO_MODE", "true") === "true";
  },
  get paypalEnv() {
    return str("PAYPAL_ENV", "sandbox");
  },
  get paypalClientId() {
    return str("PAYPAL_CLIENT_ID");
  },
  get paypalClientSecret() {
    return str("PAYPAL_CLIENT_SECRET");
  },
  get paypalWebhookId() {
    return str("PAYPAL_WEBHOOK_ID");
  },
  get paypalConfigured() {
    return this.paypalClientId !== "" && this.paypalClientSecret !== "";
  },
  get publicPaypalClientId() {
    return str("NEXT_PUBLIC_PAYPAL_CLIENT_ID", str("PAYPAL_CLIENT_ID"));
  },
  /** Webhook signature verification can only be disabled in development. */
  get webhookVerify() {
    if (this.nodeEnv !== "development") return true;
    return str("WEBHOOK_VERIFY", "on") !== "off";
  },
  get aiProvider() {
    return str("AI_PROVIDER", "google");
  },
  get aiModelAgent() {
    return str("AI_MODEL_AGENT", "gemini-3.5-flash");
  },
  get aiModelAnalyst() {
    return str("AI_MODEL_ANALYST", "gemini-3.5-flash");
  },
  get aiDailyBudgetCalls() {
    return Number(str("AI_DAILY_BUDGET_CALLS", "300"));
  },
  get signingKey() {
    return str("INTENT_SIGNING_KEY");
  },
  get keyId() {
    return str("INTENT_KEY_ID", "ir-key-1");
  },
  get databasePath() {
    return str("DATABASE_PATH", "./data/intentreceipt.db");
  },
};

export function assertSandbox(): void {
  if (env.paypalEnv !== "sandbox" && process.env.ALLOW_PRODUCTION !== "true") {
    throw new Error(
      `PAYPAL_ENV must be "sandbox" (got "${env.paypalEnv}"). IntentReceipt is a sandbox-only prototype.`,
    );
  }
}
