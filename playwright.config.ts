import { defineConfig } from "@playwright/test";
import { createArgosReporterOptions } from "@argos-ci/playwright/reporter";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  reporter: [
    process.env.CI ? ["dot"] : ["list"],
    [
      "@argos-ci/playwright/reporter",
      createArgosReporterOptions({ uploadToArgos: !!process.env.CI }),
    ],
  ],
  use: {
    baseURL: process.env.BASE_URL || "http://localhost:3000",
    viewport: { width: 1180, height: 1000 },
    launchOptions: {
      args: ["--disable-lcd-text", "--font-render-hinting=none"],
    },
  },
});
