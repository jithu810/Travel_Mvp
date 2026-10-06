import { defineConfig, devices } from '@playwright/test';
import creation from './playwright.creation.config';
export default defineConfig({ ...creation, testMatch: 'photo-optimization.spec.ts', outputDir: './test-results/photo-upload', projects: [
  { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
  { name: 'iphone-webkit', use: { ...devices['iPhone 13'], browserName: 'webkit' } },
  { name: 'android-chromium', use: { ...devices['Pixel 7'], browserName: 'chromium' } },
] });
