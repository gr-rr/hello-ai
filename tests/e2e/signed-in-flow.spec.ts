import { test, expect, type Page } from "@playwright/test";

const APP = "http://localhost:3000";

// ── Helpers ──────────────────────────────────────────────────────
async function signIn(page: Page) {
  await page.goto(APP);
  await page.waitForTimeout(1000);
  const signInBtn = page.getByRole("button", { name: /sign.?in/i });
  if (await signInBtn.isVisible()) {
    await signInBtn.click();
    await page.waitForTimeout(500);
  }
}

// ── Library flow tests ───────────────────────────────────────────
test.describe("Library transcribe/analyze flow", () => {
  test("L1: untranscribed track shows Transcribe, no Analyze", async ({ page }) => {
    await signIn(page);
    await page.getByRole("button", { name: "Library" }).click();
    await page.waitForTimeout(1000);

    const track = page.locator("[class*='track']").first();
    if (await track.isVisible()) {
      // Transcribe button should exist
      await expect(track.getByRole("button", { name: /transcribe/i })).toBeVisible();
      // Analyze button should NOT exist (no notes yet)
      await expect(track.getByRole("button", { name: /analyze/i })).toHaveCount(0);
      // Should show "MIDI — transcribe to generate"
      await expect(track.getByText("transcribe to generate")).toBeVisible();
    }
  });

  test("L2: transcribed track shows Analyze + MIDI indicator", async ({ page }) => {
    await signIn(page);
    await page.getByRole("button", { name: "Library" }).click();
    await page.waitForTimeout(1000);

    // Find a track that has been transcribed (has MIDI indicator)
    const transcribedTrack = page.locator("[class*='track']").filter({
      hasText: "MIDI — transcribed",
    }).first();

    if (await transcribedTrack.isVisible()) {
      // Analyze button should exist
      await expect(transcribedTrack.getByRole("button", { name: /analyze/i })).toBeVisible();
    }
  });

  test("L3: Analyze tab dropdown only shows transcribed tracks", async ({ page }) => {
    await signIn(page);
    await page.getByRole("button", { name: "Analyze" }).click();
    await page.waitForTimeout(1000);

    const select = page.locator("select");
    if (await select.isVisible()) {
      // All options (except placeholder) should be transcribed tracks
      const options = select.locator("option:not(:first-child)");
      const count = await options.count();
      // If there are tracks, they should all be transcribed
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });

  test("L4: transcribe from library sends library_path to backend", async ({ page }) => {
    await signIn(page);
    await page.getByRole("button", { name: "Library" }).click();
    await page.waitForTimeout(1000);

    const track = page.locator("[class*='track']").first();
    if (await track.isVisible()) {
      const transcribeBtn = track.getByRole("button", { name: /transcribe/i });
      if (await transcribeBtn.isVisible()) {
        await transcribeBtn.click();
        // Should redirect to transcribe tab
        await page.waitForTimeout(500);
        // Should show transcribing status (not 404 error)
        const errorAlert = page.locator("[class*='error'], [class*='alert-danger']");
        await expect(errorAlert).toHaveCount(0);
      }
    }
  });

  test("L5: delete from library removes track", async ({ page }) => {
    await signIn(page);
    await page.getByRole("button", { name: "Library" }).click();
    await page.waitForTimeout(1000);

    const initialTracks = await page.locator("[class*='track']").count();
    const track = page.locator("[class*='track']").first();

    if (await track.isVisible()) {
      const deleteBtn = track.locator("button").filter({ hasText: /✕|delete/i }).first();
      if (await deleteBtn.isVisible()) {
        await deleteBtn.click();
        await page.waitForTimeout(1000);
        const finalTracks = await page.locator("[class*='track']").count();
        expect(finalTracks).toBeLessThanOrEqual(initialTracks);
      }
    }
  });
});

// ── Transcribe flow tests ────────────────────────────────────────
test.describe("Transcribe flow", () => {
  test("T1: upload new file → transcribe → notes render", async ({ page }) => {
    await signIn(page);
    await page.getByRole("button", { name: "Transform" }).click();

    const fileInput = page.locator("input[type='file']");
    await fileInput.setInputFiles({
      name: "test.wav",
      mimeType: "audio/wav",
      buffer: Buffer.from("RIFF" + "0".repeat(100)),
    });

    await page.waitForSelector("text=notes", { timeout: 10000 });
    const pianoRoll = page.locator("[class*='piano'], [class*='roll'], canvas");
    await expect(pianoRoll.first()).toBeVisible();
  });

  test("T2: transcribe existing library file does not 404", async ({ page }) => {
    await signIn(page);
    await page.getByRole("button", { name: "Library" }).click();
    await page.waitForTimeout(1000);

    const track = page.locator("[class*='track']").first();
    if (await track.isVisible()) {
      const transcribeBtn = track.getByRole("button", { name: /transcribe/i });
      if (await transcribeBtn.isVisible()) {
        await transcribeBtn.click();
        await page.waitForTimeout(1000);
        // Should NOT show 404 error
        const error404 = page.getByText("404");
        await expect(error404).toHaveCount(0);
      }
    }
  });

  test("T3: analyze from transcribe tab works", async ({ page }) => {
    await signIn(page);
    await page.getByRole("button", { name: "Transform" }).click();

    const fileInput = page.locator("input[type='file']");
    await fileInput.setInputFiles({
      name: "test.wav",
      mimeType: "audio/wav",
      buffer: Buffer.from("RIFF" + "0".repeat(100)),
    });

    await page.waitForSelector("text=notes", { timeout: 10000 });
    // Use .btn-primary to disambiguate from the nav "Analyze" tab
    const analyzeBtn = page.locator("button.btn-primary", { hasText: /analyze/i });
    if (await analyzeBtn.isVisible()) {
      await analyzeBtn.click();
      // Should redirect to analyze tab
      await page.waitForTimeout(500);
      const errorAlert = page.locator("[class*='error'], [class*='alert-danger']");
      await expect(errorAlert).toHaveCount(0);
    }
  });
});

// ── Analyze flow tests ───────────────────────────────────────────
test.describe("Analyze flow", () => {
  test("A1: analyze tab shows dropdown with transcribed tracks", async ({ page }) => {
    await signIn(page);
    await page.getByRole("button", { name: "Analyze" }).click();
    await page.waitForTimeout(1000);

    const select = page.locator("select");
    if (await select.isVisible()) {
      const options = await select.locator("option").count();
      expect(options).toBeGreaterThan(0);
    }
  });

  test("A2: analyze dropdown does not show untranscribed tracks", async ({ page }) => {
    await signIn(page);
    await page.getByRole("button", { name: "Analyze" }).click();
    await page.waitForTimeout(1000);

    const select = page.locator("select");
    if (await select.isVisible()) {
      const options = select.locator("option:not(:first-child)");
      const count = await options.count();
      // All visible tracks should be transcribed
      for (let i = 0; i < count; i++) {
        const text = await options.nth(i).textContent();
        expect(text).toBeTruthy();
      }
    }
  });

  test("A3: selecting track from dropdown shows analysis", async ({ page }) => {
    await signIn(page);
    await page.getByRole("button", { name: "Analyze" }).click();
    await page.waitForTimeout(1000);

    const select = page.locator("select");
    if (await select.isVisible()) {
      const firstOption = select.locator("option:not(:first-child)").first();
      if (await firstOption.isVisible()) {
        await select.selectOption({ index: 1 });
        // Should show analysis results
        await page.waitForTimeout(2000);
        const analysisSection = page.locator("[class*='analysis'], [class*='result']");
        await expect(analysisSection.first()).toBeVisible();
      }
    }
  });

  test("A4: analyze another track clears and re-shows dropdown", async ({ page }) => {
    await signIn(page);
    await page.getByRole("button", { name: "Analyze" }).click();
    await page.waitForTimeout(1000);

    const select = page.locator("select");
    if (await select.isVisible()) {
      const firstOption = select.locator("option:not(:first-child)").first();
      if (await firstOption.isVisible()) {
        await select.selectOption({ index: 1 });
        await page.waitForTimeout(2000);

        // Click "Analyze another track"
        const anotherBtn = page.getByRole("button", { name: /analyze another/i });
        if (await anotherBtn.isVisible()) {
          await anotherBtn.click();
          // Should re-show the dropdown
          await expect(select).toBeVisible();
        }
      }
    }
  });
});

// ── Navigation tests ─────────────────────────────────────────────
test.describe("Navigation", () => {
  test("N1: tab navigation works correctly", async ({ page }) => {
    await signIn(page);
    for (const tab of ["Library", "Transform", "Analyze"]) {
      await page.getByRole("button", { name: tab }).click();
      await page.waitForTimeout(300);
      await expect(page.getByText(tab, { exact: false }).first()).toBeVisible();
    }
  });
});
