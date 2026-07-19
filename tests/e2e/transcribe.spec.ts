import { test, expect } from "@playwright/test";
import path from "path";

const SAMPLE_WAV = path.join(__dirname, "..", "fixtures", "sample.wav");

const TRANSCRIBE_FIXTURE = {
  notes: [
    { pitch: 60, start: 0.0, end: 0.5, velocity: 80 },
    { pitch: 62, start: 0.5, end: 1.0, velocity: 80 },
    { pitch: 64, start: 1.0, end: 1.5, velocity: 80 },
    { pitch: 65, start: 1.5, end: 2.0, velocity: 80 },
    { pitch: 67, start: 2.0, end: 2.5, velocity: 80 },
  ],
  num_notes: 5,
  wav_base64: "UklGRiA=",
  midi_base64: "TVRoZAAAAAYAAQABAM8=",
  analysis: {
    key: { tonic: "C", mode: "major", confidence: 0.8 },
    tempo: { bpm: 120, confidence: 0.92 },
    time_signature: { numerator: 4, denominator: 4, confidence: 0.95 },
  },
};

async function mockTranscribeApi(page: import("@playwright/test").Page) {
  await page.route(
    (url) => url.toString().includes("/api/music/enhance"),
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ wav_base64: "UklGRiA=", url: undefined }),
      }),
  );
  await page.route(
    (url) => url.toString().includes("/api/music/transcribe"),
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(TRANSCRIBE_FIXTURE),
      }),
  );
}

test.describe("P3: transcribe an uploaded audio file", () => {
  test("authenticated user uploads audio and the piano roll renders notes", async ({
    page,
  }) => {
    await mockTranscribeApi(page);

    await page.goto("/?tab=transcribe");
    await page.locator(".drop-zone").first().waitFor({ timeout: 15_000 });

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(SAMPLE_WAV);

    await expect(page.getByTestId("piano-roll")).toBeVisible({
      timeout: 20_000,
    });

    const notes = page.getByTestId("piano-roll").locator("rect");
    expect(await notes.count()).toBeGreaterThan(0);

    await expect(page.locator("audio[controls]")).toBeVisible();
    await expect(
      page.locator('a.chip.ghost[download="transcription.mid"]'),
    ).toBeVisible();
  });
});
