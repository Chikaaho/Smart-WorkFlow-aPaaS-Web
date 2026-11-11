/*
 * B3/B4/B7：三处入口（表单详情、任务详情、我发起的）打印预览 + PDF + 明细表导出。
 * 打印预览：emulateMedia(print) + body.sw-printing（与真实打印同一套 @media print 版式）。
 */
import { chromium } from 'file:///E:/code/Smart-WorkFlow-Agent-Workspace/Smart-WorkFlow-aPaaS-Web/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs'
import { readFileSync, writeFileSync } from 'node:fs'
import { login, BASE, EV } from './sw100-lib.mjs'

const setup = JSON.parse(readFileSync(EV + '/setup.json', 'utf8'))
const TASK_ID = process.env.R3_TASK_ID
const TITLE = '打印模板生效验收记录（v3）'
if (!TASK_ID) throw new Error('R3_TASK_ID required')

const browser = await chromium.launch({
  downloadsPath: 'E:/code/Smart-WorkFlow-Agent-Workspace/.tmp-downloads',
})
const { page } = await login(browser, { pass: process.env.SW_ADMIN_PASS })
page.on('console', (msg) => {
  if (msg.type() === 'error') console.log('console-error: ' + msg.text().slice(0, 160))
})

async function printPreview(name) {
  await page.waitForSelector('.sw-print-sheet__content', { state: 'attached', timeout: 20000 })
  await page.evaluate(() => document.body.classList.add('sw-printing'))
  await page.emulateMedia({ media: 'print' })
  await page.waitForTimeout(500)
  await page.screenshot({ path: EV + '/' + name, fullPage: true })
  await page.emulateMedia({ media: 'screen' })
  await page.evaluate(() => document.body.classList.remove('sw-printing'))
  await page.waitForTimeout(300)
}

/** 拦截 UI 生成并交给 a.click() 的 Blob（下载通道在本机磁盘紧张时会失败，但 Blob 已生成）。 */
async function resetBlobCapture() {
  await page.evaluate(() => {
    const w = globalThis
    w.__capturedBlobs = []
    if (!w.__blobPatched) {
      const original = URL.createObjectURL.bind(URL)
      URL.createObjectURL = (blob) => {
        w.__capturedBlobs.push(blob)
        return original(blob)
      }
      w.__blobPatched = true
    }
  })
}

async function saveCapturedBlob(name, index = 0) {
  await page.waitForFunction((i) => globalThis.__capturedBlobs?.length > i, index, {
    timeout: 60000,
  })
  const b64 = await page.evaluate(async (i) => {
    const blob = globalThis.__capturedBlobs[i]
    const bytes = new Uint8Array(await blob.arrayBuffer())
    let bin = ''
    for (let k = 0; k < bytes.length; k++) bin += String.fromCharCode(bytes[k])
    return btoa(bin)
  }, index)
  writeFileSync(EV + '/' + name, Buffer.from(b64, 'base64'))
  console.log('saved ' + name + ' bytes=' + Buffer.from(b64, 'base64').length)
}

async function downloadPdf(name) {
  await resetBlobCapture()
  await page
    .locator('button:visible', { hasText: '下载 PDF' })
    .first()
    .evaluate((el) => el.click())
  await saveCapturedBlob(name)
}

async function exportTables(prefix) {
  const buttons = page.locator('button:visible', { hasText: '导出 Excel' })
  const count = await buttons.count()
  console.log(prefix + ' export buttons=' + count)
  for (let i = 0; i < count; i++) {
    await resetBlobCapture()
    await buttons.nth(i).evaluate((el) => el.click())
    const name = prefix + '_' + (i === 0 ? 'itemsA' : 'itemsB') + '.xlsx'
    await saveCapturedBlob(name)
  }
}

// ── 1. 表单详情（表单数据列表 → 查看） ──
await page.goto(BASE + '/form/form-data/' + setup.formKey, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)
await page.screenshot({ path: EV + '/b3_form_data_list.png' })
const row = page.locator('.el-table__row').filter({ hasText: TITLE }).first()
await row.getByRole('button', { name: '查看' }).click()
await page.waitForTimeout(2500)
await page.screenshot({ path: EV + '/b3_form_detail.png' })
await exportTables('b7_form_detail')
await downloadPdf('b4_form_detail.pdf')
await printPreview('b3_form_detail_print.png')
await page.keyboard.press('Escape')
await page.waitForTimeout(800)

// ── 2. 任务详情 ──
await page.goto(BASE + '/workflow/task/' + TASK_ID, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3000)
await page.screenshot({ path: EV + '/b3_task_detail.png' })
await exportTables('b7_task_detail')
await downloadPdf('b4_task_detail.pdf')
await printPreview('b3_task_detail_print.png')

// ── 3. 我发起的 ──
await page.goto(BASE + '/workspace/my-instances', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3000)
// 我发起的列表按流程名展示；最新一条即 R3（流程编号 202611111130240004）
const myRow = page.locator('.el-table__row').filter({ hasText: '202611111130240004' }).first()
await myRow.getByRole('button', { name: '查看', exact: true }).click()
await page.waitForTimeout(2500)
await page.screenshot({ path: EV + '/b3_my_instance_detail.png' })
await exportTables('b7_my_instance')
await downloadPdf('b4_my_instance.pdf')
await printPreview('b3_my_instance_print.png')

await browser.close()
