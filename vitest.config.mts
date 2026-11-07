import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    env: { DATABASE_PATH: ":memory:", NODE_ENV: "test", DEMO_MODE: "true", PAYPAL_CLIENT_ID: "", PAYPAL_CLIENT_SECRET: "", GOOGLE_GENERATIVE_AI_API_KEY: "" },
    pool: "forks",
  },
});
