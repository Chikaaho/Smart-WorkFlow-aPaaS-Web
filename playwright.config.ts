import { defineConfig, devices } from '@playwright/test'

/**
 * P53 视觉回归底座（方向 §4.7：唯一视觉工具链，禁止第二套并行工具）。
 *
 * - dev:mock 提供受控测试数据，仅用于布局/视觉验证，不承担真实后端业务证据；
 *   功能级正式浏览器证据必须来自 headless=false 的用户可见会话（方向 §4.7 分级）。
 * - 区域阈值与独立阻断条件定义在 e2e/visual/regions.ts，整页差异比例不得单独放行。
 * - 截图基线在阶段 B（全局壳/登录/入口页）改造完成后建立；建立后只允许一次有说明的校准。
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list']],
  use: {
    // Keep the visual browser headed: headless Chromium crashed while mounting the
    // form designer fixture, while the same single-worker case passes when visible.
    headless: false,
    // 独立端口：避免复用机器上可能存在的非 mock dev server（5173），保证受控 fixture 生效。
    baseURL: 'http://localhost:5174',
    trace: 'retain-on-failure',
  },
  expect: {
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      // 阈值不在此处全局放行：整页默认 0 差异，区域阈值由 regions.ts 显式声明。
      maxDiffPixels: 0,
    },
  },
  projects: [
    {
      name: 'chrome-1440',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1024 } },
    },
    {
      name: 'chrome-1920',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } },
    },
    {
      name: 'chrome-1280',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'chrome-375',
      use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 812 } },
    },
  ],
  webServer: {
    command: 'pnpm dev:mock --port 5174 --strictPort',
    url: 'http://localhost:5174',
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
