import { defineConfig } from "@playwright/test";

// Click-through tests of the UI in the browser preview. Uses the Edge already on Windows,
// so no browser download is needed. The Chromium pane itself is covered by e2e-native.
export default defineConfig({
  testDir: "e2e",
  testIgnore: "native/**",
  fullyParallel: true,
  // Many parallel webviews starve each other, and axe then samples colours mid-theme-change and
  // reports false contrast failures. Four is stable; pass --workers to override.
  workers: 4,
  reporter: "line",
  use: {
    baseURL: "http://localhost:1420",
    channel: "msedge",
    viewport: { width: 1440, height: 900 },
    screenshot: "only-on-failure",
  },
  outputDir: "test-results",
  webServer: {
    command: "npm run dev",
    url: "http://localhost:1420",
    reuseExistingServer: true,
  },
});
