/* B3 历史意见 + B6 历史版本：R1（v2 旧实例，已审批）三处打印预览 + 旧版本 PDF；R2（回拨时间）未定位版本 PDF */
import { chromium } from 'file:///E:/code/Smart-WorkFlow-Agent-Workspace/Smart-WorkFlow-aPaaS-Web/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs'
import { writeFileSync } from 'node:fs'
import { login, BASE, EV } from './sw100-lib.mjs'

const browser = await chromium.launch()
const { page } = await login(browser, { pass: process.env.SW_ADMIN_PASS })

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

async function saveCapturedBlob(name) {
  await page.waitForFunction(() => globalThis.__capturedBlobs?.length > 0, undefined, { timeout: 60000 })
  const b64 = await page.evaluate(async () => {
    const bytes = new Uint8Array(await globalThis.__capturedBlobs[0].arrayBuffer())
    let bin = ''
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
    return btoa(bin)
  })
  const buf = Buffer.from(b64, 'base64')
  writeFileSync(EV + '/' + name, buf)
  console.log('saved ' + name + ' bytes=' + buf.length)
}

async function pdf(name) {
  await resetBlobCapture()
  await page
    .locator('button:visible', { hasText: '下载 PDF' })
    .first()
    .evaluate((el) => el.click())
  await saveCapturedBlob(name)
}

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

async function openMyInstance(theme) {
  await page.goto(BASE + '/workspace/my-instances', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  await page
    .locator('.el-table__row')
    .filter({ hasText: theme })
    .first()
    .getByRole('button', { name: '查看', exact: true })
    .click()
  await page.waitForTimeout(2500)
}

// ── R1 表单详情（历史意见 + 表头过滤） ──
await page.goto(BASE + '/form/form-data/v100_print_demo', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)
await page
  .locator('.el-table__row')
  .filter({ hasText: '1.0.0 打印与导出验收记录' })
  .first()
  .getByRole('button', { name: '查看' })
  .click()
await page.waitForTimeout(2500)
await page.screenshot({ path: EV + '/b3_r1_form_detail.png' })
await printPreview('b3_r1_form_detail_print.png')
await page.keyboard.press('Escape')
await page.waitForTimeout(800)

// ── R1 任务详情（已办结任务页仍可打印） ──
await page.goto(BASE + '/workflow/task/cb6afca0-dd7e-11f1-a7b1-00ff9e2a8dfb', {
  waitUntil: 'domcontentloaded',
})
await page.waitForTimeout(2500)
await page.screenshot({ path: EV + '/b3_r1_task_detail.png' })
await printPreview('b3_r1_task_detail_print.png')

// ── R1 我发起的（旧版本 PDF：v2） ──
await openMyInstance('202611111120070002')
await page.screenshot({ path: EV + '/b3_r1_my_instance.png' })
await printPreview('b3_r1_my_instance_print.png')
await pdf('b6_r1_old_v2.pdf')
await page.keyboard.press('Escape')
await page.waitForTimeout(600)

// ── R2 我发起的（实例时间早于全部快照 → 未定位版本页脚） ──
await openMyInstance('202611111120060001')
await pdf('b6_r2_unpinned.pdf')

await browser.close()
