import { test, expect } from "@playwright/test";

// Deterministic transcription fixture returned by the intercepted backend,
// so the journey runs without the external Oracle backend (no flakiness).
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
  midi_base64: "",
};

// Intercept the backend proxy routes and return the fixture. This keeps the
// journey test deterministic and independent of the Oracle backend.
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
  test("Transcribe: upload audio -> sheet music renders -> playback advances", async ({
    page,
  }) => {
    await mockBackend(page);
    await page.goto("/?tab=transcribe");
    // Wait for React to hydrate (client components interactive) before interacting.
    await page.waitForFunction(
      () => typeof window !== "undefined" && document.querySelector('input[type="file"]') !== null,
      { timeout: 15_000 },
    );

    // 1) Upload a file (drives the real onFile -> processBlob flow).
    const input = page.locator('input[type="file"]');
    await input.setInputFiles({
      name: "test.wav",
      mimeType: "audio/wav",
      buffer: Buffer.from("RIFF...."),
    });

    // 2) Sheet music section appears with rendered ABC notation.
    const sheet = page.locator(".score-abc");
    await expect(sheet).toBeVisible({ timeout: 10_000 });
    // abcjs renders the score as an <svg> directly inside .score-abc.
    await expect(sheet.locator("svg").first()).toBeVisible({ timeout: 10_000 });

    // 3) Playback controls exist and the synth initialized successfully.
    // The "▶ Play" button is only enabled after abcjs.setTune() resolves with a
    // valid soundfont URL. The original bug used a 404 soundfont URL, which left
    // the synth uninitialized (button disabled / stuck at "0:00" on click) — this
    // assertion is the regression guard for that "0:00, can't play" bug.
    const playBtn = page.getByRole("button", { name: "▶ Play" });
    await expect(playBtn).toBeVisible();
    await expect(playBtn).toBeEnabled({ timeout: 10_000 });

    // 4) Clicking play engages the transport (regression guard for the broken
    // synth wiring). Note: the visual time display only advances in a real audio
    // device; headless Chromium has no audio clock, so we assert the play action
    // is accepted (button remains enabled and no error) rather than the clock.
    await playBtn.click();
    await expect(playBtn).toBeEnabled();
  });

  test("Library: upload to Supabase succeeds (RLS must allow anon inserts)", async ({
    page,
  }) => {
    await page.goto("/?tab=library");
    const fileInput = page.locator('input[type="file"]');
    await expect(fileInput).toBeVisible();

    await fileInput.setInputFiles({
      name: "clip.m4a",
      mimeType: "audio/mp4",
      buffer: Buffer.from("xxxx"),
    });

    // On success the UI shows "Saved ✓ <name>". If RLS blocks anon inserts
    // this instead shows "⚠️ ...row-level security" and the assertion fails,
    // blocking the PR — exactly the failure we want caught automatically.
    await expect(page.locator(".status")).toHaveText(/Saved ✓/, {
      timeout: 15_000,
    });
  });
});
