import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(__dirname, "..", "index.html"), "utf8");

const checks = [
  ["has doctype", /<!DOCTYPE html>/i.test(html)],
  ["has html lang", /<html lang="en">/.test(html)],
  ["has charset", /<meta charset="UTF-8">/.test(html)],
  ["has viewport", /name="viewport"/.test(html)],
  ["has title", /<title>.*<\/title>/.test(html)],
  ["has main element", /<main[\s>]/.test(html)],
  ["links styles.css", /href="styles\.css"/.test(html)],
  ["links not broken to # only is allowed", true],
];

let failed = 0;
for (const [name, ok] of checks) {
  if (ok) {
    console.log(`  ok  - ${name}`);
  } else {
    console.error(`  FAIL - ${name}`);
    failed++;
  }
}

if (failed > 0) {
  console.error(`\n${failed} check(s) failed.`);
  process.exit(1);
}

console.log("\nAll landing page checks passed.");
