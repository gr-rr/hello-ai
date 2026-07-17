import { chromium } from "@playwright/test";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  const fixture = {
    notes: [{ pitch: 60, start: 0.0, end: 0.5, velocity: 80 }],
    num_notes: 1,
    wav_base64: "",
    midi_base64: "",
  };
  await page.route("**/api/music/enhance", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ wav_base64: "UklGRiA=" }) })
  );
  await page.route("**/api/music/transcribe", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fixture) })
  );

  await page.goto("http://localhost:3000/?tab=transcribe");
  await page.waitForFunction(() => document.querySelector('input[type="file"]') !== null);
  await page.locator('input[type="file"]').setInputFiles({
    name: "test.wav", mimeType: "audio/wav", buffer: Buffer.from("RIFF....")
  });
  await page.waitForTimeout(5000);

  // Check if the warning exists and is visible
  const warning = await page.$(".abcjs-css-warning");
  if (warning) {
    const visible = await warning.isVisible();
    const display = await warning.evaluate((el) => getComputedStyle(el).display);
    console.log("Warning exists:", true);
    console.log("Visible:", visible);
    console.log("Computed display:", display);
    console.log("Inline style:", await warning.evaluate((el) => el.getAttribute("style")));
  } else {
    console.log("Warning does not exist in DOM");
  }

  // Check inline audio exists
  const audio = await page.$(".abcjs-inline-audio");
  console.log("Inline audio exists:", !!audio);
  if (audio) {
    const audioVisible = await audio.isVisible();
    console.log("Inline audio visible:", audioVisible);
    console.log("Audio display:", await audio.evaluate((el) => getComputedStyle(el).display));
  }

  await browser.close();
}

main().catch(console.error);
