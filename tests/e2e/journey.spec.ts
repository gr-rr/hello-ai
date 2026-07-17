import { test, expect } from "@playwright/test";

const FIXTURE = {
  notes: [
    { pitch: 60, start: 0.0, end: 0.5, velocity: 80 },
    { pitch: 62, start: 0.5, end: 1.0, velocity: 80 },
    { pitch: 64, start: 1.0, end: 1.5, velocity: 80 },
    { pitch: 65, start: 1.5, end: 2.0, velocity: 80 },
    { pitch: 67, start: 2.0, end: 2.5, velocity: 80 },
  ],
  num_notes: 5,
  wav_base64: "",
  midi_base64: "TVRoZAAAAAYAAQABAM8=",
};

async function mockBackend(page: import("@playwright/test").Page) {
  await page.route("**/api/music/enhance", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ wav_base64: "UklGRiA=", url: undefined }),
    }),
  );
  await page.route("**/api/music/transcribe", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(FIXTURE),
    }),
  );
}

test.describe("User journeys", () => {
  test("Transcribe: upload -> sheet music -> MIDI download", async ({
    page,
  }) => {
    await mockBackend(page);
    await page.goto("/?tab=transcribe");
    await page.waitForFunction(
      () => typeof window !== "undefined" && document.querySelector('.stage input[type="file"]') !== null,
      { timeout: 15_000 },
    );

    const input = page.locator(".stage input[type=\"file\"]");
    await input.setInputFiles({
      name: "test.wav",
      mimeType: "audio/wav",
      buffer: Buffer.from("RIFF...."),
    });

    const sheet = page.locator(".score-abc");
    await expect(sheet).toBeVisible({ timeout: 10_000 });
    await expect(sheet.locator("svg").first()).toBeVisible({ timeout: 10_000 });

    const playBtn = page.getByRole("button", { name: "▶ Play" });
    await expect(playBtn).toBeVisible();
    await expect(playBtn).toBeEnabled({ timeout: 10_000 });

    await playBtn.click();
    await expect(playBtn).toBeEnabled();

    const midiLink = page.locator('a.chip.ghost[download="transcription.mid"]');
    await expect(midiLink).toBeVisible();
  });

  test("Library: upload via drop zone", async ({ page }) => {
    await page.goto("/?tab=library");
    const dropZone = page.locator(".drop-zone");
    await expect(dropZone).toBeVisible();

    const fileInput = page.locator(".stage input[type=\"file\"]");
    await fileInput.setInputFiles({
      name: "clip.m4a",
      mimeType: "audio/mp4",
      buffer: Buffer.from("xxxx"),
    });

    await expect(page.locator(".stage .status")).toHaveText(/Saved ✓/, {
      timeout: 15_000,
    });
  });
});
