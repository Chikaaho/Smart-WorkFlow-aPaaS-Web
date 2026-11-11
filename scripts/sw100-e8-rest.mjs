/* F2/F3/F4 综合取证（admin）：我发起的/任务详情/监控详情 打印+PDF、日志三页签+筛选、IoT 发起人 */
import { chromium } from 'file:///E:/code/Smart-WorkFlow-Agent-Workspace/Smart-WorkFlow-aPaaS-Web/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs'
import { login, BASE, EV } from './sw100-lib.mjs'

const browser = await chromium.launch()
const { page } = await login(browser)
page.on('console', (msg) => {
  if (msg.type() === 'error') console.log('console-error: ' + msg.text().slice(0, 120))
})

// ── F4/F2: 监控列表 IoT 发起人 + 详情抽屉 + 打印/PDF ──
await page.goto(BASE + '/workflow/monitor', { waitUntil: 'domcontentloaded' }).catch(() => {})
await page.waitForTimeout(2500)
await page.screenshot({ path: EV + '/f4_monitor_list.png' })
console.log('monitor-url=' + page.url())

// ── F3: 日志查询页 ──
await page.goto(BASE + '/system/log', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)
await page.screenshot({ path: EV + '/f3_log_login_tab.png' })
const tabs = await page.locator('.el-tabs__item').allTextContents()
console.log('tabs=' + JSON.stringify(tabs))
await page.getByRole('tab', { name: '操作日志' }).click()
await page.waitForTimeout(1500)
await page.screenshot({ path: EV + '/f3_log_operation_tab.png' })
await page.getByRole('tab', { name: '异常日志' }).click()
await page.waitForTimeout(1500)
await page.screenshot({ path: EV + '/f3_log_exception_tab.png' })
// 筛选：登录页签 + 结果=失败
await page.getByRole('tab', { name: '登录日志' }).click()
await page.waitForTimeout(1200)
await page.locator('.el-select').first().click()
await page.waitForTimeout(600)
await page.getByRole('option', { name: '失败' }).click()
await page.waitForTimeout(400)
await page.getByRole('button', { name: '查询', exact: true }).click()
await page.waitForTimeout(1500)
await page.screenshot({ path: EV + '/f3_log_filtered_fail.png' })
const rows = await page.locator('.el-table__row').allTextContents()
console.log('filtered-rows=' + rows.length + ' sample=' + (rows[0] || '').slice(0, 80))

// ── F2: 我发起的 → 详情 → 打印/PDF ──
await page.goto(BASE + '/workspace/my-instances', { waitUntil: 'domcontentloaded' }).catch(() => {})
await page.waitForTimeout(2500)
const firstDetail = page.getByRole('button', { name: '详情' }).first()
if (await firstDetail.count()) {
  await firstDetail.click()
  await page.waitForTimeout(3000)
  await page.screenshot({ path: EV + '/f2_my_instance_detail.png' })
  console.log(
    'print-actions-in-detail=' + (await page.getByRole('button', { name: '下载 PDF' }).count()),
  )
  const [pdf] = await Promise.all([
    page.waitForEvent('download', { timeout: 60000 }),
    page.getByRole('button', { name: '下载 PDF' }).click(),
  ])
  await pdf.saveAs(EV + '/f2_my_instance_detail.pdf')
  console.log('pdf saved: ' + pdf.suggestedFilename())
} else {
  console.log('my-instances: no detail button (admin may have 0 own instances)')
}
await browser.close()
