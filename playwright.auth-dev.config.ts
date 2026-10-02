import { defineConfig, devices } from '@playwright/test';

// Run against npm run dev: LAN hydration/HMR behavior is development-specific.
export default defineConfig({
  outputDir: './test-results/auth-dev',
  testDir: './tests',
  testMatch: ['auth.spec.ts', 'save-origin.spec.ts'],
  workers: 1,
  use: { ...devices['Desktop Chrome'], trace: 'retain-on-failure' },
  projects: ['localhost', '192.168.1.4'].map(host => ({
    name: host,
    use: { baseURL: `http://${host}:3000` },
  })),
});
