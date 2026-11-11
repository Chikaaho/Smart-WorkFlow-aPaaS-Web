/* F4 终版：侧栏「流程监控」→ 发起人列 IoT 行 → 详情抽屉 → PDF */
import { chromium } from 'file:///E:/code/Smart-WorkFlow-Agent-Workspace/Smart-WorkFlow-aPaaS-Web/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs'
import { login, BASE, EV } from './sw100-lib.mjs'

const browser = await chromium.launch()
const { page } = await login(browser)
await page.goto(BASE + '/workflow/monitor', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2000)
await page.getByText('流程监控', { exact: true }).first().click()
await page.waitForTimeout(2200)
await page.screenshot({ path: EV + '/f4_flow_monitor_list.png' })
let iotRow = page.locator('.el-table__row').filter({ hasText: '系统（IoT）' }).first()
for (let p = 0; p < 8 && !(await iotRow.count()); p++) {
  const next = page.locator('.el-pagination .btn-next')
  if ((await next.count()) && (await next.isEnabled())) {
    await next.click()
    await page.waitForTimeout(1400)
    iotRow = page.locator('.el-table__row').filter({ hasText: '系统（IoT）' }).first()
  } else break
}
const rows = await page.locator('.el-table__row').allTextContents()
console.log('rows=' + rows.length + ' hasIoT=' + rows.some((r) => r.includes('系统（IoT）')))
if (await iotRow.count()) {
  await iotRow.locator('a, button, .cell').first().click()
  await page.waitForTimeout(2500)
  await page.screenshot({ path: EV + '/f4_flow_monitor_iot_detail.png' })
  const body = await page.locator('body').innerText()
  console.log(
    'detail-iot=' +
      body.includes('系统（IoT）') +
      ' pdfbtn=' +
      (await page.getByRole('button', { name: '下载 PDF' }).count()),
  )
  const pdfBtn = page.getByRole('button', { name: '下载 PDF' }).first()
  if (await pdfBtn.count()) {
    const [pdf] = await Promise.all([
      page.waitForEvent('download', { timeout: 60000 }),
      pdfBtn.click(),
    ])
    await pdf.saveAs(EV + '/f2_flow_monitor_iot.pdf')
    console.log('iot-pdf saved')
  }
} else {
  console.log('no iot row visible on page 1')
}
await browser.close()
