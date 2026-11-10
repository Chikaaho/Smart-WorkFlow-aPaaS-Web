/* F4/F2 补：IoT 行查看详情 → 抽屉截图（系统（IoT）+打印按钮）→ PDF */
import { chromium } from 'file:///E:/code/Smart-WorkFlow-Agent-Workspace/Smart-WorkFlow-aPaaS-Web/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs'
import { login, BASE, EV } from './sw100-lib.mjs'

const browser = await chromium.launch()
const { page } = await login(browser)
await page.goto(BASE + '/workflow/monitor', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2000)
let iotRow = page.locator('.el-table__row').filter({ hasText: '系统（IoT）' }).first()
for (let p = 0; p < 8 && !(await iotRow.count()); p++) {
  const next = page.locator('.el-pagination .btn-next')
  if (await next.count() && await next.isEnabled()) { await next.click(); await page.waitForTimeout(1300); iotRow = page.locator('.el-table__row').filter({ hasText: '系统（IoT）' }).first() } else break
}
await iotRow.locator('text=查看详情').first().click()
await page.waitForTimeout(2800)
await page.screenshot({ path: EV + '/f4_flow_monitor_iot_detail.png', fullPage: false })
const body = await page.locator('body').innerText()
console.log('drawer-iot=' + body.includes('系统（IoT）') + ' pdfbtn=' + await page.getByRole('button', { name: '下载 PDF' }).count())
const pdfBtn = page.getByRole('button', { name: '下载 PDF' }).first()
if (await pdfBtn.count()) {
  const [pdf] = await Promise.all([
    page.waitForEvent('download', { timeout: 60000 }),
    pdfBtn.click(),
  ])
  await pdf.saveAs(EV + '/f2_monitor_iot.pdf')
  console.log('iot-pdf saved ' + pdf.suggestedFilename())
}
await browser.close()
