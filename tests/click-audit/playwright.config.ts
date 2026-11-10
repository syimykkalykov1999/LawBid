import { defineConfig } from '@playwright/test';

// Click-through smoke audit (README.md). LOCAL stack only: the URLs default to
// localhost and the suite refuses anything else (lib/guard.ts).
export default defineConfig({
  testDir: './specs',
  outputDir: './results/pw',
  timeout: 15 * 60_000,
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  globalSetup: './setup/global-setup.ts',
  use: {
    channel: process.env.PW_CHANNEL ?? 'chrome',
    headless: true,
    viewport: { width: 1440, height: 900 },
    locale: 'ru-RU',
    actionTimeout: 8_000,
    navigationTimeout: 30_000,
  },
});
