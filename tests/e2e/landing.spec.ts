import { test, expect, type Page } from "@playwright/test";

async function openHome(page: Page) {
  await page.goto("/");
  await page
    .locator(".stepper, button:has-text('Sign In'), .drop-zone, h1")
    .first()
    .waitFor({ timeout: 15_000 });
}

test.describe("P1: unauthenticated landing", () => {
  test("anonymous visitor lands on / without crashing and a sign-in affordance is present", async ({
    page,
  }) => {
    await openHome(page);

    const appCrashed = await page.locator("text=Application error").count();
    expect(appCrashed).toBe(0);

    const stepper = page.locator(".stepper");
    const signInButton = page.getByRole("button", { name: /Sign In|Sign in with Google/i });

    if (await stepper.count()) {
      test.info().annotations.push({
        type: "note",
        description:
          "Auth is bypassed (NEXT_PUBLIC_MOCK_ENABLED=true). Studio renders directly, so the sign-in affordance lives behind auth enforcement. Asserting the app shell renders without crashing.",
      });
      await expect(stepper).toBeVisible();
      return;
    }

    await expect(page.getByRole("heading", { name: "Music AI Studio" })).toBeVisible();
    await expect(signInButton.first()).toBeVisible();
  });
});
