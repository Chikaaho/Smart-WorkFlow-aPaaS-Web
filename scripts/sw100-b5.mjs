/* B5：字段隐藏账号（yangfan）→ 页面 / 打印预览 / PDF / 明细表导出 四者对照 */
import { chromium } from 'file:///E:/code/Smart-WorkFlow-Agent-Workspace/Smart-WorkFlow-aPaaS-Web/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs'
import { writeFileSync } from 'node:fs'
import { login, BASE, EV } from './sw100-lib.mjs'

const browser = await chromium.launch()
const { page } = await login(browser, {
  user: 'yangfan',
  pass: process.env.SW_USER_PASS,
})

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
  writeFileSync(EV + '/' + name, Buffer.from(b64, 'base64'))
  console.log('saved ' + name)
}

await page.goto(BASE + '/form/form-data/v100_print_demo', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3000)
const row = page.locator('.el-table__row').filter({ hasText: '打印模板生效验收记录（v3）' }).first()
await row.getByRole('button', { name: '查看' }).click()
await page.waitForTimeout(2500)
await page.screenshot({ path: EV + '/b5_yangfan_page.png', fullPage: false })
const pageText = await page.locator('body').innerText()
console.log(
  'page has secret=' +
    pageText.includes('机密-仅管理员可见') +
    ' has internalNote=' +
    pageText.includes('内部备注：仅管理员可见'),
)

// PDF（参与人/发起人可访问）
await resetBlobCapture()
await page
  .locator('button:visible', { hasText: '下载 PDF' })
  .first()
  .evaluate((el) => el.click())
await saveCapturedBlob('b5_yangfan.pdf')

// 打印预览
await page.waitForSelector('.sw-print-sheet__content', { state: 'attached', timeout: 20000 })
await page.evaluate(() => document.body.classList.add('sw-printing'))
await page.emulateMedia({ media: 'print' })
await page.waitForTimeout(500)
await page.screenshot({ path: EV + '/b5_yangfan_print.png', fullPage: true })
const printText = await page.locator('.sw-print-sheet__content').innerText()
console.log(
  'print has secret=' +
    printText.includes('机密-仅管理员可见') +
    ' has internalNote=' +
    printText.includes('内部备注：仅管理员可见'),
)
await page.emulateMedia({ media: 'screen' })
await page.evaluate(() => document.body.classList.remove('sw-printing'))
await page.waitForTimeout(300)

// 明细表导出
const buttons = page.locator('button:visible', { hasText: '导出 Excel' })
await resetBlobCapture()
await buttons.nth(0).evaluate((el) => el.click())
await saveCapturedBlob('b5_yangfan_itemsA.xlsx')

await browser.close()
