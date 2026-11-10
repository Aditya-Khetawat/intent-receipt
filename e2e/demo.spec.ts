import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Guided-demo smoke: reset, trigger S1, see the analysis, open the detail, approve (simulated).
test("guided demo: S1 dispute end to end", async ({ page }) => {
  await page.goto("/demo");
  await page.getByRole("button", { name: "Reset demo data…" }).click();
  await page.getByRole("button", { name: "Yes, reset for everyone" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Demo data reset." })).toBeVisible();

  await page.getByRole("button", { name: /Trigger S1/ }).click();
  await page.waitForURL(/\/merchant\/disputes\//);
  await expect(page.getByText(/\d+ of \d+ kept/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Contest", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Review request…" }).click();
  await expect(page.getByText(/provide-evidence/)).toBeVisible();
  await expect(page.getByRole("link", { name: "IntentReceipt-evidence-ir_seed_s1_ridge40.pdf" })).toBeVisible();
  await page.getByRole("button", { name: "Approve (simulated send)" }).click();
  await expect(page.getByText("Action log")).toBeVisible();
  await expect(page.getByText("Attached", { exact: true })).toBeVisible();

  await page.goto("/merchant");
  await expect(page.getByRole("gridcell", { name: "Maya Rao" })).toBeVisible();
});

test("receipt verifies in the browser", async ({ page }) => {
  await page.goto("/receipt/ir_seed_s1_ridge40");
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.getByText(/Chain intact, \d+ entries, signed by/)).toBeVisible();
});

test("an evidence pack verifies at /verify, and an edited one fails", async ({ page, request }) => {
  const pdf = await (await request.get("/api/evidence/ir_seed_s1_ridge40")).body();
  await page.goto("/verify");
  const input = page.locator('input[type="file"]');
  await input.setInputFiles({ name: "pack.pdf", mimeType: "application/pdf", buffer: pdf });
  await expect(page.getByRole("status").filter({ hasText: "Verified:" })).toBeVisible();

  const json = await (await request.get("/api/evidence/ir_seed_s1_ridge40?format=json")).json();
  json.intent_record.selection.price_cents = 100;
  await input.setInputFiles({ name: "edited.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(json)) });
  await expect(page.getByRole("status").filter({ hasText: "Failed:" })).toBeVisible();
  await expect(page.getByText("The readable record differs from the one signed")).toBeVisible();
});

test("confirm with a passkey, then verify it on the receipt and in the evidence pack", async ({ page, request }) => {
  const health = await (await request.get("/api/health")).json();
  test.skip(health.aiAvailable, "The example proposal is offered only while the AI is unavailable (run with AI_PROVIDER=off).");
  // A virtual platform authenticator: a real WebAuthn ceremony without touching the machine's own passkeys.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  });

  await page.goto("/shop");
  await page.waitForLoadState("networkidle"); // hydrated, so the click reaches React
  const example = page.waitForResponse("**/api/agent/example");
  await page.getByRole("button", { name: "Use the example proposal" }).click();
  const intentId = (await (await example).json()).intent.id as string;
  await page.getByRole("button", { name: /Confirm with passkey/ }).click();
  await expect(page.getByText("Signed with your passkey and into the ledger.")).toBeVisible({ timeout: 15_000 });

  await page.goto(`/receipt/${intentId}`);
  await expect(page.getByText(/passkey signed that hash on their device/)).toBeVisible();
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.getByText(/Buyer passkey verified in your browser/)).toBeVisible();

  const pack = await (await request.get(`/api/evidence/${intentId}`)).body();
  await page.goto("/verify");
  await page.locator('input[type="file"]').setInputFiles({ name: "pack.pdf", mimeType: "application/pdf", buffer: pack });
  await expect(page.getByRole("status").filter({ hasText: "Verified:" })).toBeVisible();
  await expect(page.getByText(/Signed by passkey .* over this card's hash/)).toBeVisible();
});

test("theme toggle switches to dark and persists across a reload", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

for (const colorScheme of ["light", "dark"] as const)
  for (const path of ["/", "/shop", "/demo", "/orders", "/merchant", "/receipt/ir_seed_s2_cable1m", "/verify"]) {
    test(`no serious accessibility violations on ${path} (${colorScheme})`, async ({ page }) => {
      // The OS setting picks the theme when nothing is saved; reduced motion keeps entrance animations from skewing contrast.
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);
      const results = await new AxeBuilder({ page }).analyze();
      const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(
        serious.map(
          (v) =>
            `${v.id}: ${v.nodes
              .map((n) => n.target.join(" "))
              .slice(0, 3)
              .join(" | ")}`,
        ),
      ).toEqual([]);
    });
  }
