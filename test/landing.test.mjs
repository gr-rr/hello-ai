import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(__dirname, "..", "index.html"), "utf8");
const js = readFileSync(join(__dirname, "..", "piano.js"), "utf8");

const checks = [
    ["html has doctype", /<!DOCTYPE html>/i.test(html)],
    ["html has lang", /<html lang="en">/.test(html)],
    ["html has charset", /<meta charset="UTF-8">/.test(html)],
    ["html has viewport", /name="viewport"/.test(html)],
    ["html has title", /<title>.*<\/title>/.test(html)],
    ["page has a main element", /<main[\s>]/.test(html)],
    ["links styles.css", /href="styles\.css"/.test(html)],
    ["loads piano.js", /src="piano\.js"/.test(html)],
    ["has piano container", /id="piano"/.test(html)],
    ["piano.js uses Web Audio", /AudioContext/.test(js)],
    ["piano.js defines notes", /freq:\s*261\.63/.test(js)],
    ["piano.js maps keyboard input", /keydown/.test(js)],
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

console.log("\nAll mini piano checks passed.");
