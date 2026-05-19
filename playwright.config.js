// playwright.config.js
const { defineConfig, devices } = require('@playwright/test');

const PORT = process.env.NAMIBIA_E2E_PORT || 8765;

module.exports = defineConfig({
  testDir: './tests',
  testMatch: ['e2e/**/*.spec.js', 'ui/**/*.spec.js'],
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    permissions: ['geolocation'],
    locale: 'en-US',
    timezoneId: 'Africa/Windhoek',
    serviceWorkers: 'block',
    trace: 'on-first-retry'
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
      testMatch: ['e2e/**/*.spec.js', 'ui/**/*.spec.js']
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 5'] },
      testMatch: ['ui/**/*.spec.js']
    }
  ],
  webServer: {
    command: `node node_modules/http-server/bin/http-server -p ${PORT} -c-1 -s .`,
    port: Number(PORT),
    reuseExistingServer: !process.env.CI,
    timeout: 30000
  },
  expect: {
    toMatchSnapshot: { maxDiffPixels: 250 }
  }
});
