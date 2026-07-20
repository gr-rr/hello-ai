import { test, expect } from "@playwright/test";

test.describe("P4: library list", () => {
  test("library tab renders the drop zone and empty state", async ({
    page,
  }) => {
    await page.goto("/?tab=library");
    await page
      .locator(".drop-zone")
      .first()
      .waitFor({ timeout: 15_000 });

    // Without a configured backend the library is empty; the shell still renders.
    await expect(page.getByText(/No tracks yet/i)).toBeVisible({
      timeout: 15_000,
    });

    // The drop zone (upload target) and the Record control are present.
    await expect(page.locator(".drop-zone").first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Record/ }),
    ).toBeVisible();
  });
});
