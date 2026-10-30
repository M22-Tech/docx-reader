import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.spec.ts',
  reporter: 'list',
  use: {
    browserName: 'chromium',
    viewport: { width: 412, height: 915 },
  },
});
