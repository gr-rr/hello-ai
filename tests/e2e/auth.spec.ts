import { test, expect, type Page } from "@playwright/test";
import { mockSession } from "@/tests/fixtures/mockSession";

async function openHome(page: Page) {
  await page.goto("/");
  await page
    .locator(".stepper, button:has-text('Sign In'), .drop-zone")
    .first()
    .waitFor({ timeout: 15_000 });
}

test.describe("P2: sign-in flow reaches Studio", () => {
  test("a signed-in (mocked) session renders Studio and the Transcribe tab", async ({
    page,
  }) => {
    await page.addInitScript((session) => {
      try {
        const projectRef = "cijhpddqvvzyzfzmkdnn";
        window.localStorage.setItem(
          `sb-${projectRef}-auth-token`,
          JSON.stringify(session),
        );
      } catch {
        /* ignore */
      }
    }, mockSession);

    await openHome(page);

    const stepper = page.locator(".stepper");
    if (await stepper.count()) {
      test.info().annotations.push({
        type: "note",
        description:
          "Auth is bypassed (NEXT_PUBLIC_MOCK_ENABLED=true); Studio always renders. Asserting the Studio shell and Transcribe UI are reachable.",
      });
      await expect(stepper).toBeVisible({ timeout: 15_000 });
      await expect(
        page.getByRole("button", { name: /Transcribe/ }),
      ).toBeVisible();
      return;
    }

    await expect(stepper).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: /Transcribe/ })).toBeVisible();
  });

  test("studio stepper navigates between Library and Transcribe tabs", async ({
    page,
  }) => {
    await page.addInitScript((session) => {
      try {
        window.localStorage.setItem(
          `sb-${"cijhpddqvvzyzfzmkdnn"}-auth-token`,
          JSON.stringify(session),
        );
      } catch {
        /* ignore */
      }
    }, mockSession);

    await openHome(page);

    const stepper = page.locator(".stepper");
    await expect(stepper).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: /Library/ }).click();
    await expect(page.locator(".drop-zone").first()).toBeVisible({
      timeout: 10_000,
    });

    await page.getByRole("button", { name: /Transcribe/ }).click();
    await expect(
      page.getByRole("heading", { name: /Transcribe/ }),
    ).toBeVisible({ timeout: 10_000 });
  });
});
