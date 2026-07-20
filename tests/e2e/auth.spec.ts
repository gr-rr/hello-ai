import { test, expect, type Page } from "@playwright/test";
import { mockSession } from "../fixtures/mockSession";

const REF = "cijhpddqvvzyzfzmkdnn";

async function seedSession(page: Page) {
  await page.addInitScript(
    ({ ref, session }) => {
      try {
        window.localStorage.setItem(
          `sb-${ref}-auth-token`,
          JSON.stringify(session),
        );
      } catch {
        /* ignore */
      }
    },
    { ref: REF, session: mockSession },
  );
}

async function openHome(page: Page) {
  await page.goto("/");
  await page.locator(".nav").first().waitFor({ timeout: 15_000 });
}

test.describe("P2: sign-in flow reaches Studio", () => {
  test("a signed-in (mocked) session renders Studio and the Transcribe tab", async ({
    page,
  }) => {
    await seedSession(page);
    await openHome(page);

    await expect(page.locator(".nav")).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole("button", { name: /Transcribe/ }),
    ).toBeVisible();
  });

  test("studio nav navigates between Library and Transcribe tabs", async ({
    page,
  }) => {
    await seedSession(page);
    await openHome(page);

    await expect(page.locator(".nav")).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: /Library/ }).click();
    await expect(page.locator(".drop-zone").first()).toBeVisible({
      timeout: 10_000,
    });

    await page.getByRole("button", { name: /Transcribe/ }).click();
    await expect(
      page.locator(".card-title", { hasText: /Transcribe/ }),
    ).toBeVisible({ timeout: 10_000 });
  });
});
