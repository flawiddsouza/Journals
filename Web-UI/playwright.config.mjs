import { defineConfig } from '@playwright/test';

// Runs any page-type's e2e specs (files under a `tests/**/e2e/` folder) against
// the Vite dev server. Each suite drives its own standalone harness page.
export default defineConfig({
  testDir: './tests',
  testMatch: '**/e2e/**/*.spec.mjs',
  reporter: 'list',
  use: { headless: true, baseURL: 'http://localhost:5173' },
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://localhost:5173/', // dev-server readiness probe (not suite-specific)
    reuseExistingServer: true,
    timeout: 120000,
  },
});
