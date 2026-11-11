import { chromium } from 'file:///E:/code/Smart-WorkFlow-Agent-Workspace/Smart-WorkFlow-aPaaS-Web/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs'
import { login, BASE, EV } from './sw100-lib.mjs'
const browser = await chromium.launch()
const { page } = await login(browser, { pass: process.env.SW_ADMIN_PASS })
await page.goto(BASE + '/workflow/instances', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2000)
const sizeSelect = page.locator('.list-pagination .el-select').first()
if (await sizeSelect.count()) {
  await sizeSelect.click(); await page.waitForTimeout(300)
  await page.locator('.el-select-dropdown:visible').getByText('100条/页').click(); await page.waitForTimeout(1500)
}
const row = page.locator('.el-table__row').filter({ hasText: 'iot-2118780073471991810' }).first()
await row.scrollIntoViewIfNeeded(); await page.waitForTimeout(500)
await page.screenshot({ path: EV + '/b9_iot_list_row.png' })
await browser.close()
