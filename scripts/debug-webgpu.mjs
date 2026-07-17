import { chromium } from "playwright";

const URL = process.env.URL || "https://hello-ai-wheat.vercel.app";

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

await page.goto(URL, { waitUntil: "domcontentloaded" });

// Check WebGPU availability
const webgpu = await page.evaluate(() => !!navigator.gpu);
console.log("navigator.gpu available:", webgpu);

// Wait for model to be ready (status text)
try {
  await page.waitForFunction(
    () => document.querySelector(".status")?.textContent?.includes("Ready"),
    { timeout: 180000 }
  );
  console.log("Model ready.");
} catch (e) {
  console.log("Model did NOT become ready. Status:", await page.$eval(".status", (el) => el.textContent).catch(() => "n/a"));
}

// Type a message and send
await page.fill("textarea", "What is 2+2?");
await page.click("button");

// Wait for the assistant message to update / error
let msg = "";
for (let i = 0; i < 12; i++) {
  await page.waitForTimeout(10000);
  msg = await page.$eval(".msg.assistant", (el) => el.textContent).catch(() => "no assistant msg");
  const status = await page.$eval(".status", (el) => el.textContent).catch(() => "");
  console.log(`t+${(i + 1) * 10}s status="${status}" msg="${msg}"`);
  if (msg && msg !== "▋" && !msg.endsWith("▋")) break;
}

console.log("\n=== FULL CONSOLE LOGS ===");
console.log(logs.join("\n"));

await browser.close();
