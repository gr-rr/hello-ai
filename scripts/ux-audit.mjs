import { chromium } from "@playwright/test";
import path from "path";
import fs from "fs";

const OUTPUT_DIR = "/tmp/ux-audit";
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });

  const fixture = {
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

  const HOME = "http://localhost:3000";

  async function mockBackend(page) {
    await page.route("**/api/music/enhance", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ wav_base64: "UklGRiA=" }) })
    );
    await page.route("**/api/music/transcribe", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fixture) })
    );
  }

  // 1. Overview page
  const overview = await browser.newPage();
  await mockBackend(overview);
  await overview.goto(HOME);
  await overview.waitForTimeout(3000);
  await overview.screenshot({ path: path.join(OUTPUT_DIR, "01-overview.png"), fullPage: true });
  console.log("01-overview.png");
  await overview.close();

  // 2. Library page
  const lib = await browser.newPage();
  await lib.goto(HOME + "/?tab=library");
  await lib.waitForTimeout(3000);
  await lib.screenshot({ path: path.join(OUTPUT_DIR, "02-library.png"), fullPage: true });
  console.log("02-library.png");
  await lib.close();

  // 3. Transcribe page with result
  const tr = await browser.newPage();
  await mockBackend(tr);
  await tr.goto(HOME + "/?tab=transcribe");
  await tr.waitForTimeout(2000);
  const fileInput = tr.locator('input[type="file"]');
  await fileInput.setInputFiles({ name: "my-piano-loop.wav", mimeType: "audio/wav", buffer: Buffer.from("RIFF....") });
  await tr.waitForTimeout(6000);
  await tr.screenshot({ path: path.join(OUTPUT_DIR, "03-transcribe-result.png"), fullPage: true });
  console.log("03-transcribe-result.png");
  // Get page HTML for DOM analysis
  const html = await tr.content();
  fs.writeFileSync(path.join(OUTPUT_DIR, "03-transcribe-result.html"), html);
  console.log("03-transcribe-result.html");
  await tr.close();

  // 4. Transcribe page empty
  const te = await browser.newPage();
  await te.goto(HOME + "/?tab=transcribe");
  await te.waitForTimeout(2000);
  await te.screenshot({ path: path.join(OUTPUT_DIR, "04-transcribe-empty.png"), fullPage: true });
  console.log("04-transcribe-empty.png");
  await te.close();

  // 5. Check console errors across pages
  const errors = [];
  const checkPage = await browser.newPage();
  checkPage.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  checkPage.on("pageerror", (err) => errors.push("PAGE: " + err.message));
  await checkPage.goto(HOME);
  await checkPage.waitForTimeout(2000);
  await checkPage.goto(HOME + "/?tab=library");
  await checkPage.waitForTimeout(2000);
  await checkPage.goto(HOME + "/?tab=transcribe");
  await checkPage.waitForTimeout(2000);
  fs.writeFileSync(path.join(OUTPUT_DIR, "console-errors.txt"), errors.join("\n"));
  console.log("console-errors.txt (" + errors.length + " errors)");
  await checkPage.close();

  await browser.close();
  console.log("UX audit complete");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
