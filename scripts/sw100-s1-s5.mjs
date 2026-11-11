/* S1-S5 取证：历史版本浏览器打印、纯文本版面、数值一致、PDF 重拍、日志对象 */
import { chromium } from 'file:///E:/code/Smart-WorkFlow-Agent-Workspace/Smart-WorkFlow-aPaaS-Web/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs'
import { readFileSync, writeFileSync } from 'node:fs'
import { login, BASE, EV } from './sw100-lib.mjs'

const setup = JSON.parse(readFileSync(EV + '/setup.json', 'utf8'))
const R3_TASK_ID = '3b039997-dd80-11f1-8d99-00ff9e2a8dfb'
const R1_TASK_ID = 'cb6afca0-dd7e-11f1-a7b1-00ff9e2a8dfb'

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
  await page.waitForFunction(() => globalThis.__capturedBlobs?.length > 0, undefined, {
    timeout: 60000,
  })
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

async function exportTable(name, index = 0) {
  await resetBlobCapture()
  await page
    .locator('button:visible', { hasText: '导出 Excel' })
    .nth(index)
    .evaluate((el) => el.click())
  await saveCapturedBlob(name)
}

async function waitSheet() {
  await page.waitForSelector('.sw-print-sheet__content', { state: 'attached', timeout: 30000 })
  await page.waitForFunction(
    () =>
      document.querySelector('.sw-print-sheet__content')?.textContent?.includes('表单版本') ||
      document
        .querySelector('.sw-print-sheet__content')
        ?.textContent?.includes('未定位到提交时版本'),
    { timeout: 30000 },
  )
}

async function printPreview(name, expectText) {
  await waitSheet()
  if (expectText) {
    await page.waitForFunction(
      (text) => document.querySelector('.sw-print-sheet__content')?.textContent?.includes(text),
      expectText,
      { timeout: 30000 },
    )
  }
  const text = await page.locator('.sw-print-sheet__content').innerText()
  const controls = await page
    .locator(
      '.sw-print-sheet__content input, .sw-print-sheet__content .el-select, .sw-print-sheet__content .el-checkbox',
    )
    .count()
  await page.evaluate(() => document.body.classList.add('sw-printing'))
  await page.emulateMedia({ media: 'print' })
  await page.waitForTimeout(500)
  await page.screenshot({ path: EV + '/' + name, fullPage: true })
  await page.emulateMedia({ media: 'screen' })
  await page.evaluate(() => document.body.classList.remove('sw-printing'))
  await page.waitForTimeout(300)
  return { text, controls }
}

async function openFormDetail(title) {
  await page.goto(BASE + '/form/form-data/v100_print_demo', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  await page
    .locator('.el-table__row')
    .filter({ hasText: title })
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

/* ==================== S1：R1 旧实例三处浏览器打印 ==================== */
await openFormDetail('1.0.0 打印与导出验收记录')
await page.screenshot({ path: EV + '/s1_r1_form_detail_page.png' })
let s1 = await printPreview('s1_r1_form_detail_print.png', '表单版本 v2（提交时版本）')
console.log(
  'S1 form detail pinned=' +
    s1.text.includes('表单版本 v2（提交时版本）') +
    ' hasTemplateHeader=' +
    s1.text.includes('华云科技') +
    ' hasInternalNote=' +
    s1.text.includes('内部备注') +
    ' controls=' +
    s1.controls,
)
await pdf('s1_r1_form_detail.pdf')
await page.keyboard.press('Escape')
await page.waitForTimeout(700)

await page.goto(BASE + '/workflow/task/' + R1_TASK_ID, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)
s1 = await printPreview('s1_r1_task_detail_print.png', '表单版本 v2（提交时版本）')
console.log(
  'S1 task detail pinned=' +
    s1.text.includes('表单版本 v2（提交时版本）') +
    ' hasTemplateHeader=' +
    s1.text.includes('华云科技') +
    ' controls=' +
    s1.controls,
)

await openMyInstance('202611111120070002')
s1 = await printPreview('s1_r1_my_instance_print.png', '表单版本 v2（提交时版本）')
console.log(
  'S1 my instance pinned=' +
    s1.text.includes('表单版本 v2（提交时版本）') +
    ' hasTemplateHeader=' +
    s1.text.includes('华云科技') +
    ' controls=' +
    s1.controls,
)
await pdf('s1_r1_old_v2.pdf')
await page.keyboard.press('Escape')
await page.waitForTimeout(700)

/* ==================== S1：R2 未定位版本页脚 ==================== */
await openMyInstance('202611111120060001')
s1 = await printPreview('s1_r2_unpinned_print.png', '未定位到提交时版本')
console.log('S1 R2 unpinned=' + s1.text.includes('未定位到提交时版本，按当前版本 v5'))
await pdf('s1_r2_unpinned.pdf')
await page.keyboard.press('Escape')
await page.waitForTimeout(700)

/* ==================== S2/S3：R3 页面/打印/PDF/Excel ==================== */
await openMyInstance('202611111130240004')
await page.screenshot({ path: EV + '/s2_r3_page.png' })
const s2 = await printPreview('s2_r3_print.png', '表单版本 v3（提交时版本）')
console.log(
  'S2/S3 print pureText=' +
    (s2.controls === 0) +
    ' user=' +
    s2.text.includes('系统管理员') +
    ' multi=' +
    s2.text.includes('蓝色、绿色') +
    ' date=' +
    s2.text.includes('2026-11-12 09:30') +
    ' qty1=' +
    s2.text.includes('新版本部件-01') +
    ' rawScale=' +
    s2.text.includes('1.000000'),
)
await pdf('s2_r3.pdf')
await exportTable('s2_r3_itemsA.xlsx', 0)
await page.keyboard.press('Escape')
await page.waitForTimeout(700)

/* ==================== S4：R3 任务详情 PDF（当前 jar） ==================== */
await page.goto(BASE + '/workflow/task/' + R3_TASK_ID, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)
await pdf('s4_task_detail.pdf')

/* ==================== S5：表单定义修改的日志对象 ==================== */
let auth = ''
page.on('request', (req) => {
  const h = req.headers()['authorization']
  if (h && req.url().includes('/api/')) auth = h
})
await page.goto(BASE + '/workspace', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1000)
const def = await page.evaluate(
  async ({ auth, formKey }) => {
    const r = await fetch('/api/form/def/by-key/' + formKey + '/definition', {
      headers: { Authorization: auth },
    })
    return r.text()
  },
  { auth, formKey: setup.formKey },
)
const definition = JSON.parse(JSON.parse(def).data)
await page.evaluate(
  async ({ auth, formId, definition }) => {
    await fetch('/api/form/def/' + formId + '/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify({ definition: JSON.stringify(definition) }),
    })
  },
  { auth, formId: setup.formId, definition },
)
await page.goto(BASE + '/system/log', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2000)
await page.getByRole('tab', { name: '操作日志' }).click()
await page.waitForTimeout(1200)
await page.getByPlaceholder('模块').fill('表单定义')
await page.getByRole('button', { name: '查询', exact: true }).click()
await page.waitForTimeout(1500)
await page.screenshot({ path: EV + '/s5_log_form_def_target.png' })
const logText = await page.locator('body').innerText()
console.log(
  'S5 uuidTarget=' +
    logText.includes(setup.formId) +
    ' typeOnlyRow=' +
    /表单定义\s*\n/.test(logText),
)

await browser.close()
