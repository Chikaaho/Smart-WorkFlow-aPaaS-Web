/* F4+F2 终版：监控筛 initiator=0 → IoT 详情抽屉截图+PDF；我发起的首行详情截图+PDF；待办任务详情截图 */
import { chromium } from 'file:///E:/code/Smart-WorkFlow-Agent-Workspace/Smart-WorkFlow-aPaaS-Web/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs'
import { login, BASE } from './sw100-lib.mjs'
const EV =
  process.env.SW_EV ||
  'E:/code/Smart-WorkFlow-Agent-Workspace/product/v1.0.0-release/receipts/evidence'

const browser = await chromium.launch()
const { page } = await login(browser)

// ── 监控：发起人 ID=0 筛选 ──
await page.goto(BASE + '/workflow/monitor', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2200)
const inputs = page.getByPlaceholder('请输入')
const initiatorInput = inputs.nth(2)
await initiatorInput.fill('0')
await page.getByRole('button', { name: '查询', exact: true }).click()
await page.waitForTimeout(2000)
await page.screenshot({ path: EV + '/f4_monitor_iot_rows.png' })
const firstId = await page.locator('.el-table__row a, .el-table__row .cell').first().textContent()
console.log('first-row-text=' + (firstId || '').trim().slice(0, 40))
// 点首行（实例 ID 链接或行）
await page.locator('.el-table__row').first().locator('a, .cell').first().click()
await page.waitForTimeout(2500)
await page.screenshot({ path: EV + '/f4_monitor_iot_detail.png', fullPage: false })
const body = await page.locator('body').innerText()
const iot = body.includes('系统（IoT）')
console.log(
  'detail-has-系统IoT=' +
    iot +
    ' has-pdf-btn=' +
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

// ── 我发起的：首行详情 ──
await page.goto(BASE + '/workspace/my-instances', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)
await page.screenshot({ path: EV + '/f2_my_instances_list.png' })
const detailBtns = page.getByRole('button', { name: /详情|查看/ })
const cnt = await detailBtns.count()
console.log('detail-btn-count=' + cnt)
if (cnt) {
  await detailBtns.first().click()
  await page.waitForTimeout(3000)
  await page.screenshot({ path: EV + '/f2_my_instance_detail.png' })
  console.log('my-detail-pdf-btn=' + (await page.getByRole('button', { name: '下载 PDF' }).count()))
  const [pdf2] = await Promise.all([
    page.waitForEvent('download', { timeout: 60000 }),
    page.getByRole('button', { name: '下载 PDF' }).first().click(),
  ])
  await pdf2.saveAs(EV + '/f2_my_instance_detail.pdf')
  console.log('my-pdf saved')
}
await browser.close()
