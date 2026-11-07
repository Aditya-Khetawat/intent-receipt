import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 3000);

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  retries: 0,
  use: { baseURL: `http://localhost:${port}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run dev -- --port ${port}`,
    url: `http://localhost:${port}/api/health`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
