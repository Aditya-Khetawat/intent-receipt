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
  await page.getByRole("button", { name: "Approve (simulated send)" }).click();
  await expect(page.getByText("Action log")).toBeVisible();

  await page.goto("/merchant");
  await expect(page.getByRole("gridcell", { name: "Maya Rao" })).toBeVisible();
});

test("receipt verifies in the browser", async ({ page }) => {
  await page.goto("/receipt/ir_seed_s1_ridge40");
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.getByText(/Chain intact, \d+ entries, signed by/)).toBeVisible();
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
  for (const path of ["/", "/shop", "/demo", "/orders", "/merchant", "/receipt/ir_seed_s2_cable1m"]) {
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
