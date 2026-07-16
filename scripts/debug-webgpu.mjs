import { chromium } from "playwright";

const BASE = process.env.URL || "https://hello-ai-wheat.vercel.app";

const browser = await chromium.launch({
  args: [
    "--enable-unsafe-webgpu",
    "--enable-features=Vulkan",
    "--use-angle=swiftshader",
    "--ignore-gpu-blocklist",
  ],
});

const page = await browser.newPage();
const logs = [];
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));

// ---------- Music Studio (/ ) ----------
console.log("=== Music Studio (/ ) ===");
await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });

const webgpu = await page.evaluate(() => !!navigator.gpu);
console.log("navigator.gpu available:", webgpu);

try {
  await page.waitForFunction(
    () => document.querySelector(".status")?.textContent?.includes("Ready"),
    { timeout: 240000 }
  );
  console.log("Music model ready.");
} catch (e) {
  console.log(
    "Music model did NOT become ready. Status:",
    await page
      .$eval(".status", (el) => el.textContent)
      .catch(() => "n/a")
  );
}

await page.fill(".prompt", "lofi slow bpm electro chill with organic samples");
await page.click(".generate");

let ok = false;
for (let i = 0; i < 30; i++) {
  await page.waitForTimeout(10000);
  const status = await page
    .$eval(".status", (el) => el.textContent)
    .catch(() => "");
  console.log(`t+${(i + 1) * 10}s status="${status}"`);
  if (status?.includes("Done") || status?.includes("Encoding")) {
    ok = true;
    break;
  }
  if (status?.includes("error")) break;
}

const audioSrc = await page
  .$eval("audio", (el) => el.getAttribute("src"))
  .catch(() => null);
const hasCanvas = (await page.$("canvas.visualizer")) !== null;
console.log("audio src:", audioSrc);
console.log("visualizer canvas present:", hasCanvas);
console.log("music generation completed:", ok && !!audioSrc?.startsWith("blob:"));

console.log("\n=== FULL CONSOLE LOGS ===");
console.log(logs.join("\n"));

await browser.close();
