import { chromium } from 'file:///E:/code/Smart-WorkFlow-Agent-Workspace/Smart-WorkFlow-aPaaS-Web/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs'
import { login, BASE, EV } from './sw100-lib.mjs'
const browser = await chromium.launch()
const { page } = await login(browser, { pass: process.env.SW_ADMIN_PASS })
await page.goto(BASE + '/workflow/instances', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)
// 每页 100 条，一页覆盖全部实例，便于同时看到两行 IoT
const sizeSelect = page.locator('.list-pagination .el-select').first()
if (await sizeSelect.count()) {
  await sizeSelect.click()
  await page.waitForTimeout(400)
  await page.locator('.el-select-dropdown:visible').getByText('100条/页').click()
  await page.waitForTimeout(2000)
}
await page.screenshot({ path: EV + '/b9_iot_list.png', fullPage: true })
const row = page.locator('.el-table__row').filter({ hasText: 'iot-2118780073471991810' }).first()
console.log('iot row count=' + (await row.count()))
if (await row.count()) {
  await row.getByRole('button', { name: /查看|详情/ }).first().click()
  await page.waitForTimeout(2500)
  await page.screenshot({ path: EV + '/b9_iot_detail.png' })
  const text = await page.locator('body').innerText()
  console.log('detail systemIot=' + text.includes('系统（IoT）') + ' initiatorSys=' + text.includes('系统'))
}
// 实例监控干预页：确认是否有发起人列（planner §5 观察）
await page.goto(BASE + '/workflow/monitor', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2000)
const headers = await page.locator('.el-table__header th').allTextContents()
console.log('instanceMonitorHeaders=' + JSON.stringify(headers))
await page.screenshot({ path: EV + '/b9_instance_monitor.png' })
await browser.close()
