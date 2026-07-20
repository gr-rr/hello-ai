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
  wav_base64: "UklGRiA=",
  midi_base64: "TVRoZAAAAAYAAQABAM8=",
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
        body: JSON.stringify(FIXTURE),
      }),
  );
}

async function mockSupabase(
  page: import("@playwright/test").Page,
  opts: { files?: any[]; listOnly?: boolean } = {},
) {
  const files = opts.files;
  const listOnly = opts.listOnly ?? false;

  await page.route(
    (url) => url.toString().includes("supabase.co/storage/v1"),
    async (route) => {
      const url = route.request().url();
      if (url.includes("/object/list/library")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(files ?? []),
        });
      } else if (!listOnly && url.includes("/object/library/library/")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({}),
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

test.describe("User journeys", () => {
  test("Library: upload, play, and delete", async ({ page }) => {
    const storedFiles: any[] = [];

    await mockSupabase(page, { files: storedFiles });

    // Mock the delete API
    await page.route("http://localhost:3000/api/music/library/**", (route) => {
      console.log("DELETE HANDLER CALLED:", route.request().url());
      storedFiles.splice(0, storedFiles.length);
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
    });

    await page.goto("/?tab=library");
    await page.waitForFunction(
      () =>
        typeof window !== "undefined" &&
        document.querySelector(".stage") !== null,
      { timeout: 15_000 },
    );

    // Empty state
    await expect(page.getByText("No files yet.")).toBeVisible();

    // Upload via hidden file input
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "test clip.wav",
      mimeType: "audio/wav",
      buffer: Buffer.from("RIFF...."),
    });

    // Simulate upload success — add file to the mock store
    storedFiles.push({
      name: "1742400000000-test clip.wav",
      created_at: new Date(Date.now() - 3600000).toISOString(),
      metadata: { size: 123456, mimetype: "audio/wav" },
    });

    // Status shows success
    await expect(page.locator(".status")).toContainText("Saved", {
      timeout: 15_000,
    });

    // File appears with name and size metadata
    await expect(page.locator(".file-name")).toHaveText("test clip.wav");
    await expect(page.getByText("120.6 KB")).toBeVisible();

    // Play button toggles to Pause
    const playBtn = page.getByRole("button", { name: "\u25B6 Play" });
    await expect(playBtn).toBeVisible();
    await playBtn.click();
    await expect(
      page.getByRole("button", { name: "\u23F8 Pause" }),
    ).toBeVisible();

    // Delete removes the file from the list
    await page.getByRole("button", { name: /Delete/ }).click();
    await page.waitForTimeout(2000);
    console.log(
      "status after delete:",
      await page.locator(".status").textContent(),
    );
    console.log(
      "files after delete:",
      await page.locator(".file-name").allTextContents(),
    );
    await expect(page.getByText("No files yet.")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("Library: record button shows recording state", async ({ page }) => {
    // Mock getUserMedia so the Record button triggers recording state
    await page.addInitScript(() => {
      const audioTrack = { kind: "audio", enabled: true, stop: () => {} };
      Object.defineProperty(navigator, "mediaDevices", {
        value: {
          getUserMedia: () =>
            Promise.resolve({
              getTracks: () => [audioTrack],
              getAudioTracks: () => [audioTrack],
            }),
        },
        configurable: true,
      });
    });

    // Mock MediaRecorder so recording starts without real mic
    await page.addInitScript(() => {
      class MockRecorder {
        mimeType = "audio/webm";
        state = "inactive";
        ondataavailable: any = null;
        onstop: any = null;
        start() {
          this.state = "recording";
        }
        stop() {
          this.state = "inactive";
          if (typeof this.ondataavailable === "function") {
            this.ondataavailable({
              data: new Blob(["fake"], { type: "audio/webm" }),
            });
          }
          if (typeof this.onstop === "function") {
            this.onstop();
          }
        }
        static isTypeSupported() {
          return true;
        }
      }
      window.MediaRecorder = MockRecorder as any;
    });

    await mockSupabase(page);

    await page.goto("/?tab=library");
    await page.waitForFunction(
      () =>
        typeof window !== "undefined" &&
        document.querySelector(".stage") !== null,
      { timeout: 15_000 },
    );

    // Record button exists
    const recordBtn = page.getByRole("button", { name: /Record/ });
    await expect(recordBtn).toBeVisible();
    await recordBtn.click();
    await page.waitForTimeout(300);

    // UI now shows recording state: stop button + indicator
    await expect(page.getByRole("button", { name: /Stop/ })).toBeVisible();
    await expect(page.locator(".record-dot")).toBeVisible();
    await expect(page.locator(".status")).toContainText("Recording");
  });

  test("Transcribe: select library file → piano roll", async ({
    page,
  }) => {
    await mockTranscribeApi(page);

    const libraryFile = {
      name: "1742400000000-my recording.wav",
      created_at: new Date().toISOString(),
      metadata: { size: 98765, mimetype: "audio/wav" },
    };

    await mockSupabase(page, { files: [libraryFile] });

    await page.goto("/?tab=transcribe");
    await page.waitForFunction(
      () =>
        typeof window !== "undefined" &&
        document.querySelector("select.sel") !== null,
      { timeout: 15_000 },
    );

    // Dropdown is visible with the library file
    const select = page.locator("select.sel");
    await expect(select).toBeVisible();
    const options = select.locator("option");
    await expect(options).toHaveCount(3);
    await expect(options.nth(1)).toHaveText("my recording.wav");

    // Select the library file to start transcription
    await select.selectOption("1742400000000-my recording.wav");

    // Transcription results — piano roll
    const pianoRoll = page.locator(".piano-roll-container");
    await expect(pianoRoll).toBeVisible({ timeout: 15_000 });

    // Audio player
    await expect(page.locator("audio[controls]")).toBeVisible();

    // MIDI download link
    const midiLink = page.locator(
      'a.chip.ghost[download="transcription.mid"]',
    );
    await expect(midiLink).toBeVisible();
  });

  test("Transcribe: Upload new option works", async ({ page }) => {
    await mockTranscribeApi(page);
    await mockSupabase(page);

    await page.goto("/?tab=transcribe");
    await page.waitForFunction(
      () =>
        typeof window !== "undefined" &&
        document.querySelector("select.sel") !== null,
      { timeout: 15_000 },
    );

    // Select "Upload new…" option
    await page.locator("select.sel").selectOption("__upload_new__");

    // Upload via the hidden file input
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "direct.wav",
      mimeType: "audio/wav",
      buffer: Buffer.from("RIFF...."),
    });

    // Wait for transcription results
    const pianoRoll = page.locator(".piano-roll-container");
    await expect(pianoRoll).toBeVisible({ timeout: 15_000 });

    // Audio name shown in the heading
    await expect(page.getByText("direct.wav")).toBeVisible();
  });
});
