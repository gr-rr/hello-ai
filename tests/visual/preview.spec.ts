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

// Actual built app — overview (landing).
test("app overview", async ({ page }) => {
  await page.goto("/?tab=overview");
  await page.waitForTimeout(400);
  await argosScreenshot(page, "app-overview", { fullPage: true });
});

// Actual built app — transcribe tab.
test("app transcribe", async ({ page }) => {
  await page.goto("/?tab=transcribe");
  await page.waitForTimeout(400);
  await argosScreenshot(page, "app-transcribe", { fullPage: true });
});
