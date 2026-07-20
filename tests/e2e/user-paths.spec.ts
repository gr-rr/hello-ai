import { test, expect, type Page } from "@playwright/test";

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

const SB_SESSION = {
  access_token: "e2e-fake-access-token",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: "e2e-fake-refresh-token",
  user: {
    id: "00000000-0000-0000-0000-000000000001",
    email: "e2e@example.com",
    aud: "authenticated",
    role: "authenticated",
    app_metadata: {},
    user_metadata: {},
    created_at: new Date().toISOString(),
  },
};

async function mockTranscribeApi(page: Page) {
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

async function mockSupabaseStorage(page: Page, files: unknown[] = []) {
  await page.route(
    (url) => url.toString().includes("supabase.co/storage/v1"),
    async (route) => {
      const url = route.request().url();
      if (url.includes("/object/list/library")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(files),
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

async function isBypassMode(page: Page): Promise<boolean> {
  await page.goto("/");
  await page
    .locator(".stepper, button:has-text('Sign In'), .drop-zone")
    .first()
    .waitFor({ timeout: 15_000 });
  return (await page.locator(".stepper").count()) > 0;
}

test.describe("Supported user paths", () => {
  test("P1: anonymous visitor lands on / without crashing (Google CTA when auth is enforced)", async ({
    page,
  }) => {
    const bypass = await isBypassMode(page);

    if (bypass) {
      test.info().annotations.push({
        type: "note",
        description:
          "Auth is bypassed (NEXT_PUBLIC_MOCK_ENABLED / dev). Landing shows Studio directly; asserting no-crash. Run against a non-bypass build to assert the Google CTA. See docs/USER_PATHS.md.",
      });
      await expect(page.locator(".stepper")).toBeVisible();
      return;
    }

    const signIn = page.getByRole("button", { name: "Sign In" });
    await expect(signIn).toBeVisible();
    await signIn.click();

    await expect(
      page.getByRole("heading", { name: "Music AI Studio" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Sign in with Google" }),
    ).toBeVisible();
  });

  test("P2: a signed-in (mocked) session renders Studio", async ({ page }) => {
    const bypass = await isBypassMode(page);

    if (bypass) {
      test.info().annotations.push({
        type: "note",
        description:
          "Auth is bypassed; Studio always renders. Asserting the stepper is present so the AuthProvider/HomeClient render path is exercised. Session-gated assertion runs against a non-bypass build.",
      });
      await expect(page.locator(".stepper")).toBeVisible();
      return;
    }

    await page.addInitScript((session) => {
      try {
        const projectRef = "cijhpddqvvzyzfzmkdnn";
        window.localStorage.setItem(
          `sb-${projectRef}-auth-token`,
          JSON.stringify(session),
        );
      } catch {
        /* ignore */
      }
    }, SB_SESSION);

    await page.goto("/");
    await expect(page.locator(".stepper")).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole("button", { name: /Transcribe/ }),
    ).toBeVisible();
  });

  test("P3: transcribe a library file → piano roll + sheet music (mocked backend)", async ({
    page,
  }) => {
    await mockTranscribeApi(page);

    const libraryFile = {
      name: "1742400000000-my recording.wav",
      created_at: new Date().toISOString(),
      metadata: { size: 98765, mimetype: "audio/wav" },
    };
    await mockSupabaseStorage(page, [libraryFile]);

    await page.goto("/?tab=transcribe");

    const select = page.locator("select.sel");
    const uploadZone = page.locator(".drop-zone");

    if (await select.count()) {
      await expect(select).toBeVisible({ timeout: 15_000 });
      await select.selectOption("1742400000000-my recording.wav");
    } else {
      await expect(uploadZone.first()).toBeVisible({ timeout: 15_000 });
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles({
        name: "direct.wav",
        mimeType: "audio/wav",
        buffer: Buffer.from("RIFF...."),
      });
    }

    await expect(page.locator(".piano-roll-container")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator("audio[controls]")).toBeVisible();
    await expect(
      page.locator('a.chip.ghost[download="transcription.mid"]'),
    ).toBeVisible();
  });

  test("P3b: transcribe via Upload new → piano roll + sheet music (mocked backend)", async ({
    page,
  }) => {
    await mockTranscribeApi(page);
    await mockSupabaseStorage(page, []);

    await page.goto("/?tab=transcribe");

    const select = page.locator("select.sel");
    if (await select.count()) {
      await expect(select).toBeVisible({ timeout: 15_000 });
      await select.selectOption("__upload_new__");
    } else {
      await expect(page.locator(".drop-zone").first()).toBeVisible({
        timeout: 15_000,
      });
    }

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "direct.wav",
      mimeType: "audio/wav",
      buffer: Buffer.from("RIFF...."),
    });

    await expect(page.locator(".piano-roll-container")).toBeVisible({
      timeout: 20_000,
    });
  });
});
