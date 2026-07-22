import { test, expect, type Page } from "@playwright/test";

const SAMPLE = {
  name: "test-audio.wav",
  mimeType: "audio/wav",
  buffer: Buffer.from("RIFF...."),
};

async function openStudio(page: Page, tab = "transcribe") {
  await page.goto(`/?tab=${tab}`);
  await page.locator(".nav").first().waitFor({ timeout: 15_000 });
}

test.describe("Signed-in user flow", () => {
  test("Transcribe from upload → piano roll + audio", async ({ page }) => {
    await openStudio(page, "transcribe");

    await page
      .locator(".source-card input[type='file']")
      .first()
      .setInputFiles(SAMPLE);

    await expect(page.getByTestId("piano-roll")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator("audio[controls]")).toBeVisible();
    await expect(page.locator("button.btn-primary")).toBeVisible();
  });

  test("Analyze from transcribe tab → analysis view loads", async ({
    page,
  }) => {
    await openStudio(page, "transcribe");

    await page
      .locator(".source-card input[type='file']")
      .first()
      .setInputFiles(SAMPLE);

    const analyzeBtn = page.locator("button.btn-primary");
    await expect(analyzeBtn).toBeVisible({ timeout: 20_000 });
    await analyzeBtn.click();

    await expect(page.locator(".stat").first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText("Diatonic chords")).toBeVisible();
    await expect(page.getByText("Key")).toBeVisible();
    await expect(page.getByText("Tempo")).toBeVisible();
    await expect(page.getByText("Time signature")).toBeVisible();
  });

  test("Analyze tab shows empty state when no tracks", async ({ page }) => {
    await openStudio(page, "analyze");

    await expect(
      page.getByText("No transcribed tracks in your library"),
    ).toBeVisible();
  });

  test("Switch between tabs preserves transcribe result", async ({ page }) => {
    await openStudio(page, "transcribe");

    await page
      .locator(".source-card input[type='file']")
      .first()
      .setInputFiles(SAMPLE);

    await expect(page.getByTestId("piano-roll")).toBeVisible({
      timeout: 20_000,
    });

    await page.getByRole("button", { name: "Library" }).click();
    await expect(page.locator(".nav-item.active")).toHaveText("Library");

    await page.getByRole("button", { name: "Transcribe" }).click();
    await expect(page.getByTestId("piano-roll")).toBeVisible();
  });

  test("Clear button resets transcribe state", async ({ page }) => {
    await openStudio(page, "transcribe");

    await page
      .locator(".source-card input[type='file']")
      .first()
      .setInputFiles(SAMPLE);

    await expect(page.getByTestId("piano-roll")).toBeVisible({
      timeout: 20_000,
    });

    await page.getByRole("button", { name: /Clear/ }).click();
    await expect(page.getByText("Choose an audio source")).toBeVisible();
  });

  test("Analyze another track reloads dropdown", async ({ page }) => {
    await openStudio(page, "transcribe");

    await page
      .locator(".source-card input[type='file']")
      .first()
      .setInputFiles(SAMPLE);

    const analyzeBtn = page.locator("button.btn-primary");
    await expect(analyzeBtn).toBeVisible({ timeout: 20_000 });
    await analyzeBtn.click();

    await expect(page.locator(".stat").first()).toBeVisible({
      timeout: 20_000,
    });

    await page.getByRole("button", { name: /Analyze another track/ }).click();

    await expect(
      page.getByText("No transcribed tracks in your library"),
    ).toBeVisible();
  });
});

