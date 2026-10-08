import { defineConfig } from '@playwright/test';
import 'dotenv/config';

const runTimeoutMin = Number(process.env.ANALYSIS_TIMEOUT_MIN ?? 30);

export default defineConfig({
  testDir: './tests',
  testMatch: /.*\.spec\.ts/,
  // One shared RUN_ID per invocation, so the role-based specs chain together.
  globalSetup: './tests/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0, // a retry would create a second project/analysis; fail loudly instead
  timeout: (runTimeoutMin + 15) * 60_000,
  expect: { timeout: 20_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    channel: 'chrome', // real Chrome, not bundled Chromium
    headless: process.env.HEADLESS === 'true',
    viewport: { width: 1600, height: 1000 },
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
    ignoreHTTPSErrors: process.env.IGNORE_HTTPS_ERRORS === 'true',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
