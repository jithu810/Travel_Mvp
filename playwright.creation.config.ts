import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  outputDir: './test-results/creation',
  testDir: './tests/creation',workers: 1,timeout: 60000,
  use: { baseURL: 'http://localhost:3200',trace: 'retain-on-failure' },
  projects: [{ name: 'desktop',use: { ...devices['Desktop Chrome'] } },{ name: 'mobile',use: { ...devices['iPhone 13'],browserName: 'chromium' } }],
  webServer: [
    { command: 'node tests/fixtures/supabase-creation.mjs',url: 'http://127.0.0.1:54329/health',reuseExistingServer: false },
    { command: 'node scripts/start-creation-test.mjs',url: 'http://localhost:3200',timeout: 120000,reuseExistingServer: false },
  ],
});
