import { defineConfig, devices } from '@playwright/test';

const PORT = 3101;

/**
 * E2E: builds the client and runs the production server on an in-memory DB with the fake translator,
 * so tests are deterministic and need no API key. First run on a new machine: `npx playwright install chromium`.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1, // one server, one in-memory DB: keep tests ordered
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'off',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: /mobile\.spec/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile\.spec/ },
  ],
  webServer: {
    command: 'npx vite build --logLevel warn && npx tsx src/server/index.ts --production',
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { PORT: String(PORT), DB_PATH: ':memory:', GLOSSA_FAKE_AI: '1', ANTHROPIC_API_KEY: '' },
  },
});
