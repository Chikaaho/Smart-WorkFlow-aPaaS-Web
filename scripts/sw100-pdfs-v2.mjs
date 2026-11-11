/* 重新生成 B4/B6 PDF（显示值修复后）：R3 三入口 + R1 旧版本 + R2 未定位版本 */
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
  const btn = page.locator('button:visible', { hasText: '下载 PDF' }).first()
  if ((await btn.count()) === 0) {
    console.log('no pdf button for ' + name)
    return false
  }
  await btn.evaluate((el) => el.click())
  await saveCapturedBlob(name)
  return true
}

async function openFormDetail(rowText) {
  await page.goto(BASE + '/form/form-data/v100_print_demo', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  await page
    .locator('.el-table__row')
    .filter({ hasText: rowText })
    .first()
    .getByRole('button', { name: '查看' })
    .click()
  await page.waitForTimeout(2500)
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

// R3 表单详情（无实例：页脚未定位版本；模板 v3 生效）
await openFormDetail('打印模板生效验收记录（v3）')
await pdf('b4_form_detail.pdf')
await page.keyboard.press('Escape')
await page.waitForTimeout(600)

// R3 我发起的（v3 版本 + 审批历史段）
await openMyInstance('202611111130240004')
await pdf('b4_my_instance.pdf')
await page.keyboard.press('Escape')
await page.waitForTimeout(600)

// R1 我发起的（旧版本 v2）
await openMyInstance('202611111120070002')
await pdf('b6_r1_old_v2.pdf')
await page.keyboard.press('Escape')
await page.waitForTimeout(600)

// R2 我发起的（实例时间早于全部快照 → 未定位版本）
await openMyInstance('202611111120060001')
await pdf('b6_r2_unpinned.pdf')

await browser.close()
