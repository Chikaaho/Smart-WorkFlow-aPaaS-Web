/* 收口：IoT 详情重试、待办任务详情截图、PDF 可视化 */
import { chromium } from 'file:///E:/code/Smart-WorkFlow-Agent-Workspace/Smart-WorkFlow-aPaaS-Web/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs'
import { login, BASE, EV } from './sw100-lib.mjs'

const browser = await chromium.launch()
const { page } = await login(browser)

// IoT 详情（重试）
await page.goto(BASE + '/workflow/monitor', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2000)
let iotRow = page.locator('.el-table__row').filter({ hasText: '系统（IoT）' }).first()
for (let p = 0; p < 8 && !(await iotRow.count()); p++) {
  const next = page.locator('.el-pagination .btn-next')
  if ((await next.count()) && (await next.isEnabled())) {
    await next.click()
    await page.waitForTimeout(1300)
    iotRow = page.locator('.el-table__row').filter({ hasText: '系统（IoT）' }).first()
  } else break
}
const viewBtn = iotRow.getByRole('button', { name: '查看详情' })
if (await viewBtn.count()) await viewBtn.first().click()
else
  await iotRow
    .locator('a')
    .first()
    .click()
    .catch(() => {})
await page.waitForTimeout(2800)
await page.screenshot({ path: EV + '/f4_flow_monitor_iot_detail.png', fullPage: false })
const body = await page.locator('body').innerText()
console.log(
  'drawer-iot=' +
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
  await pdf.saveAs(EV + '/f2_monitor_iot.pdf')
  console.log('iot-pdf saved')
}
await page.keyboard.press('Escape')
await page.waitForTimeout(800)

// 待办任务详情（含 PrintActions 页头）
await page.goto(BASE + '/workspace/todo', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)
await page.screenshot({ path: EV + '/f2_todo_list.png' })
const todoDetail = page.getByRole('button', { name: /详情|查看|处理/ }).first()
if (await todoDetail.count()) {
  await todoDetail.click().catch(() => {})
  await page.waitForTimeout(3000)
  await page.screenshot({ path: EV + '/f2_task_detail.png' })
  console.log(
    'task-detail-url=' +
      page.url() +
      ' pdfbtn=' +
      (await page.getByRole('button', { name: '下载 PDF' }).count()),
  )
} else console.log('todo: 0 items')

// PDF 可视化（file:// 打开本地已下载 PDF）
const ctx2 = await browser.newContext({ viewport: { width: 1000, height: 1200 } })
const p2 = await ctx2.newPage()
await p2.goto(
  'file:///E:/code/Smart-WorkFlow-Agent-Workspace/product/v1.0.0-release/receipts/evidence/f2_my_instance_detail.pdf',
)
await p2.waitForTimeout(2500)
await p2.screenshot({ path: EV + '/f2_pdf_view.png' })
console.log('pdf view shot done')
await browser.close()
