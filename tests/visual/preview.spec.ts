import { test } from "@playwright/test";
import { argosScreenshot } from "@argos-ci/playwright";

// Design source-of-truth mockup (lives in design/mockups, uses real tokens).
test("design mockup (SOT)", async ({ page }) => {
  await page.goto(
    "file://" + process.cwd() + "/design/mockups/audio-to-sheet-music.html",
  );
  await page.waitForTimeout(300);
  await argosScreenshot(page, "design-mockup");
});

// Actual built app — landing (auth gate when unauthenticated).
test("app landing", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(400);
  await argosScreenshot(page, "app-landing", { fullPage: true });
});

// Actual built app — studio after mock auth setup (requires MSW).
test("app studio", async ({ page }) => {
  // Studio loads client-side — capture the default Transcribe step
  await page.goto("/");
  await page.waitForTimeout(400);
  // If MSW is enabled, the page may show the studio; otherwise it shows auth
  await argosScreenshot(page, "app-studio", { fullPage: true });
});
