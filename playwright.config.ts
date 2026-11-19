import { defineConfig, devices } from "@playwright/test";
import { localSupabase } from "./e2e/local-supabase";

/**
 * End-to-end tests against a LOCAL Supabase (Docker), never the live project.
 *
 *   pnpm exec supabase start      # once; applies every migration
 *   pnpm run test:e2e
 *
 * Uses the installed Microsoft Edge (no browser download). The production build
 * is served on port 5180 with its Supabase variables pointed at the local stack.
 */
const sb = localSupabase();
const PORT = 5180;

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/.results",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: "msedge",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Edge"], channel: "msedge", viewport: { width: 1366, height: 768 } }, grepInvert: /@mobile/ },
    { name: "phone", use: { channel: "msedge", viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true }, grep: /@mobile/ },
  ],
  webServer: {
    // The production build, served by vite preview: what students actually get,
    // and no on-demand compiling or dependency reloads mid-test.
    command: `pnpm exec vite build --outDir dist-e2e --emptyOutDir && pnpm exec vite preview --outDir dist-e2e --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: false,
    timeout: 240_000,
    env: {
      VITE_SUPABASE_URL: sb.url,
      VITE_SUPABASE_PUBLISHABLE_KEY: sb.anonKey,
      VITE_SUPABASE_PROJECT_ID: "local",
    },
  },
});
