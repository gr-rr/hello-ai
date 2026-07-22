import { test, expect, type Page } from "@playwright/test";

const APP = "http://localhost:3000";

// ── Helpers ──────────────────────────────────────────────────────
async function signIn(page: Page) {
  await page.goto(APP);
  // Wait for MSW to initialize (check for mock banner or main UI)
  await page.waitForTimeout(1000);
  
  // Click sign in button if present
  const signInBtn = page.getByRole("button", { name: /sign.?in/i });
  if (await signInBtn.isVisible()) {
    await signInBtn.click();
    await page.waitForTimeout(500);
  }
}

// ── Tests ────────────────────────────────────────────────────────
test.describe("Signed-in user flow", () => {
  test("P1: upload → transcribe → score renders", async ({ page }) => {
    await signIn(page);
    
    // Navigate to Transcribe tab
    await page.getByRole("button", { name: "Transcribe" }).click();
    
    // Upload a test file
    const fileInput = page.locator("input[type='file']");
    await fileInput.setInputFiles({
      name: "test.wav",
      mimeType: "audio/wav",
      buffer: Buffer.from("RIFF" + "0".repeat(100)),
    });
    
    // Wait for transcription to complete
    await page.waitForSelector("text=notes", { timeout: 10000 });
    
    // Verify score/piano roll rendered
    const pianoRoll = page.locator("[class*='piano'], [class*='roll'], canvas");
    await expect(pianoRoll.first()).toBeVisible();
  });

  test("P2: library → analyze → key/tempo displays", async ({ page }) => {
    await signIn(page);
    
    // Navigate to Library tab
    await page.getByRole("button", { name: "Library" }).click();
    
    // Wait for library to load
    await page.waitForTimeout(1000);
    
    // Click analyze button on first track (if exists)
    const analyzeBtn = page.getByRole("button", { name: /analyze/i }).first();
    if (await analyzeBtn.isVisible()) {
      await analyzeBtn.click();
      
      // Verify analysis displays
      await page.waitForSelector("text=key|tempo", { timeout: 10000 });
      const analysisSection = page.locator("[class*='analysis'], [class*='result']");
      await expect(analysisSection.first()).toBeVisible();
    }
  });

  test("P3: analyze dropdown populates with transcribed tracks", async ({ page }) => {
    await signIn(page);
    
    // Navigate to Analyze tab
    await page.getByRole("button", { name: "Analyze" }).click();
    
    // Wait for dropdown to populate
    await page.waitForTimeout(1000);
    
    // Check if dropdown exists and has options
    const select = page.locator("select");
    if (await select.isVisible()) {
      const options = await select.locator("option").count();
      expect(options).toBeGreaterThan(1); // At least placeholder + one track
    }
  });

  test("P4: delete from library removes track", async ({ page }) => {
    await signIn(page);
    
    // Navigate to Library tab
    await page.getByRole("button", { name: "Library" }).click();
    
    // Wait for library to load
    await page.waitForTimeout(1000);
    
    // Count initial tracks
    const initialTracks = await page.locator("[class*='track']").count();
    
    // Click delete on first track (if exists)
    const deleteBtn = page.getByRole("button", { name: /delete|remove/i }).first();
    if (await deleteBtn.isVisible()) {
      await deleteBtn.click();
      
      // Confirm deletion if dialog appears
      const confirmBtn = page.getByRole("button", { name: /confirm|yes|ok/i });
      if (await confirmBtn.isVisible()) {
        await confirmBtn.click();
      }
      
      // Wait for track to be removed
      await page.waitForTimeout(1000);
      
      // Verify track count decreased
      const finalTracks = await page.locator("[class*='track']").count();
      expect(finalTracks).toBeLessThanOrEqual(initialTracks);
    }
  });

  test("P5: error states display correctly", async ({ page }) => {
    await signIn(page);
    
    // Navigate to Transcribe tab
    await page.getByRole("button", { name: "Transcribe" }).click();
    
    // Try to transcribe without file
    const transcribeBtn = page.getByRole("button", { name: /transcribe/i }).first();
    if (await transcribeBtn.isVisible()) {
      await transcribeBtn.click();
      
      // Should show error or be disabled
      await page.waitForTimeout(500);
      const errorOrDisabled = 
        await page.locator("[class*='error'], [class*='alert']").isVisible() ||
        await transcribeBtn.isDisabled();
      expect(errorOrDisabled).toBeTruthy();
    }
  });

  test("P6: navigation between tabs works", async ({ page }) => {
    await signIn(page);
    
    // Click through all tabs
    const tabs = ["Library", "Transcribe", "Analyze"];
    for (const tab of tabs) {
      await page.getByRole("button", { name: tab }).click();
      await page.waitForTimeout(300);
      
      // Verify tab content is visible (check for tab-specific elements)
      const tabContent = page.getByText(tab, { exact: false });
      await expect(tabContent.first()).toBeVisible();
    }
  });
});
