import { test, expect, type Page } from "@playwright/test";
import { mockSession } from "../fixtures/mockSession";

const REF = "cijhpddqvvzyzfzmkdnn";

const LIBRARY_FILES = [
  {
    name: "1742400000000-my recording.wav",
    id: "library/dev/1742400000000-my recording.wav",
    updated_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    metadata: { size: 98765, mimetype: "audio/wav" },
  },
];

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

async function mockLibraryStorage(page: Page) {
  await page.route("**/storage/v1/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(LIBRARY_FILES),
    }),
  );
}

test.describe("P4: library list", () => {
  test("authenticated user sees library items and can open one", async ({
    page,
  }) => {
    await seedSession(page);
    await mockLibraryStorage(page);

    await page.goto("/?tab=library");
    await page.locator(".drop-zone").first().waitFor({ timeout: 15_000 });

    await expect(page.getByText("my recording.wav")).toBeVisible({
      timeout: 15_000,
    });

    const playButton = page.getByRole("button", { name: /▶ Play/ }).first();
    await expect(playButton).toBeVisible();
    await playButton.click();
    await expect(
      page.getByRole("button", { name: /⏸ Pause/ }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});
