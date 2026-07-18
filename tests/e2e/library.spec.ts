import { test, expect, type Page } from "@playwright/test";

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

async function mockLibraryStorage(page: Page) {
  await page.route(
    (url) => url.toString().includes("supabase.co/storage/v1"),
    async (route) => {
      const url = route.request().url();
      if (url.includes("/object/v1/list/library")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(LIBRARY_FILES),
        });
      } else if (url.includes("/object/public/library/")) {
        await route.fulfill({
          status: 200,
          contentType: "audio/wav",
          body: Buffer.from("RIFF...."),
        });
      } else {
        await route.continue();
      }
    },
  );
}

test.describe("P4: library list", () => {
  test("authenticated user sees library items and can open one", async ({
    page,
  }) => {
    await mockLibraryStorage(page);

    await page.goto("/?tab=library");
    await page.locator(".drop-zone").first().waitFor({ timeout: 15_000 });

    await expect(page.getByText("my recording.wav")).toBeVisible({
      timeout: 15_000,
    });

    const playButton = page.getByRole("button", { name: /▶ Play/ }).first();
    await expect(playButton).toBeVisible();
    await playButton.click();
    await expect(page.getByRole("button", { name: /⏸ Pause/ }).first()).toBeVisible({
      timeout: 10_000,
    });
  });
});
