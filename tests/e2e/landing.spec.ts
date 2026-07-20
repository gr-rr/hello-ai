import { test, expect, type Page } from "@playwright/test";

async function openHome(page: Page) {
  await page.goto("/");
  await page.locator(".topbar, .nav").first().waitFor({ timeout: 15_000 });
}

test.describe("P1: unauthenticated landing", () => {
  test("anonymous visitor lands on / without crashing and Studio renders", async ({
    page,
  }) => {
    await openHome(page);

    const appCrashed = await page.locator("text=Application error").count();
    expect(appCrashed).toBe(0);

    // In mock/bypass mode the Studio shell renders directly with its nav tabs.
    await expect(page.locator(".nav")).toBeVisible();
    await expect(page.getByRole("button", { name: /Transcribe/ })).toBeVisible();
  });
});
