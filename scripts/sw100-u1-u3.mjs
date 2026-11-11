/* U1-U3 取证：打印时区一致、日期格式四处统一、明细表只读多选回显 */
import { chromium } from 'file:///E:/code/Smart-WorkFlow-Agent-Workspace/Smart-WorkFlow-aPaaS-Web/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs'
import { readFileSync, writeFileSync } from 'node:fs'
import { login, BASE, EV } from './sw100-lib.mjs'

const setup = JSON.parse(readFileSync(EV + '/setup.json', 'utf8'))
const R1_TASK_ID = 'cb6afca0-dd7e-11f1-a7b1-00ff9e2a8dfb'
const R3_TASK_ID = '3b039997-dd80-11f1-8d99-00ff9e2a8dfb'

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
  writeFileSync(EV + '/' + name, Buffer.from(b64, 'base64'))
  console.log('saved ' + name)
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

async function printPreview(name) {
  await waitSheet()
  const text = await page.locator('.sw-print-sheet__content').innerText()
  await page.evaluate(() => document.body.classList.add('sw-printing'))
  await page.emulateMedia({ media: 'print' })
  await page.waitForTimeout(500)
  await page.screenshot({ path: EV + '/' + name, fullPage: true })
  await page.emulateMedia({ media: 'screen' })
  await page.evaluate(() => document.body.classList.remove('sw-printing'))
  await page.waitForTimeout(300)
  return text
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

/** 只读明细表「标签」列：返回选中/未选中的选项文本（去重，U3 断言用）。 */
async function tableTagMarks() {
  return page.evaluate(() => {
    const cells = [...document.querySelectorAll('.dynamic-field__table--readonly .readonly-option')]
    const dedupe = (list) => [...new Set(list)]
    return {
      selected: dedupe(
        cells
          .filter((el) => el.classList.contains('is-selected'))
          .map((el) => el.textContent.trim()),
      ),
      unchecked: dedupe(
        cells
          .filter((el) => !el.classList.contains('is-selected'))
          .map((el) => el.textContent.trim()),
      ),
    }
  })
}

/* ==================== U1：R1 三入口打印时间与页面/PDF 一致 ==================== */
await openFormDetail('1.0.0 打印与导出验收记录')
let u1 = await printPreview('u1_r1_form_detail_print.png')
console.log(
  'U1 form-detail: due0930=' +
    u1.includes('2026-11-10 09:30') +
    ' apply1000=' +
    u1.includes('2026-11-11 10:00') +
    ' noUTC0130=' +
    !u1.includes('01:30') +
    ' noUTC0200=' +
    !u1.includes('02:00') +
    ' pinnedV2=' +
    u1.includes('表单版本 v2（提交时版本）'),
)
await pdf('u1_r1_form_detail.pdf')
await page.keyboard.press('Escape')
await page.waitForTimeout(700)

await page.goto(BASE + '/workflow/task/' + R1_TASK_ID, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)
u1 = await printPreview('u1_r1_task_detail_print.png')
console.log(
  'U1 task-detail: due0930=' +
    u1.includes('2026-11-10 09:30') +
    ' apply1000=' +
    u1.includes('2026-11-11 10:00') +
    ' noUTC=' +
    (!u1.includes('01:30') && !u1.includes('02:00')),
)

await openMyInstance('202611111120070002')
u1 = await printPreview('u1_r1_my_instance_print.png')
console.log(
  'U1 my-instance: due0930=' +
    u1.includes('2026-11-10 09:30') +
    ' apply1000=' +
    u1.includes('2026-11-11 10:00') +
    ' noUTC=' +
    (!u1.includes('01:30') && !u1.includes('02:00')),
)
await pdf('u1_r1_old_v2.pdf')
await page.keyboard.press('Escape')
await page.waitForTimeout(700)

/* ==================== U2：R3 同一行 页面/打印/PDF/Excel 日期一致 ==================== */
await openMyInstance('202611111130240004')
await page.waitForTimeout(1000)
await page.screenshot({ path: EV + '/u2_r3_page.png' })
const u2 = await printPreview('u2_r3_print.png')
console.log(
  'U2 print: dayOnly=' +
    u2.includes('2026-11-12') +
    ' noTime=' +
    !u2.includes('09:30') +
    ' applyDatetime=' +
    u2.includes('2026-11-12 10:00') +
    ' pinnedV3=' +
    u2.includes('表单版本 v3（提交时版本）'),
)
await pdf('u2_r3.pdf')
await exportTable('u2_r3_itemsA.xlsx', 0)
await page.keyboard.press('Escape')
await page.waitForTimeout(700)

/* U2 字段配置：设计器主表「申请日期」日期格式开关 + 定义 JSON 子字段 format */
await page.goto(BASE + '/form/designer/' + setup.formId, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3500)
const applyShell = page.locator('.field-shell', { hasText: '申请日期' }).first()
if ((await applyShell.count()) > 0) {
  await applyShell.click()
  await page.waitForTimeout(900)
  await page.screenshot({ path: EV + '/u2_field_config_applydate.png' })
  const switchOn = await page
    .locator('[data-testid="date-format-switch"]')
    .first()
    .evaluate((el) => el.classList.contains('is-checked'))
    .catch(() => null)
  console.log('U2 applyDate config shot; datetimeSwitchOn=' + switchOn)
} else {
  console.log('U2 designer field-shell not found')
}
let auth = ''
page.on('request', (req) => {
  const h = req.headers()['authorization']
  if (h && req.url().includes('/api/')) auth = h
})
await page.goto(BASE + '/workspace', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1000)
const rawDef = await page.evaluate(
  async ({ auth, formKey }) => {
    const r = await fetch('/api/form/def/by-key/' + formKey + '/definition', {
      headers: { Authorization: auth },
    })
    return r.text()
  },
  { auth, formKey: setup.formKey },
)
const definition = JSON.parse(JSON.parse(rawDef).data)
const dateSubs = []
for (const field of definition.fields ?? []) {
  for (const sub of field.subFields ?? []) {
    if (sub.type === 'DATE')
      dateSubs.push(field.name + '.' + sub.name + '=' + (sub.format ?? '<none>'))
  }
  if (field.type === 'DATE' && field.name === 'applyDate') {
    dateSubs.push('main.applyDate=' + (field.format ?? '<none>'))
  }
}
const pageForJson = await browser.newPage({ viewport: { width: 1100, height: 900 } })
const jsonHtml =
  '<pre style="font:13px/1.6 Consolas,monospace;background:#fff;color:#111;padding:16px">' +
  'v100_print_demo 当前定义（GET /api/form/def/by-key/v100_print_demo/definition）\n' +
  dateSubs.join('\n') +
  '\n\n' +
  JSON.stringify(definition, null, 1)
    .split('\n')
    .filter((l) => /"name"|"format"|"type": "DATE"|"label"/.test(l))
    .join('\n') +
  '</pre>'
await pageForJson.setContent(jsonHtml)
await pageForJson.screenshot({ path: EV + '/u2_field_config_subfields.png', fullPage: true })
console.log('U2 config json: ' + dateSubs.join(' | '))
await pageForJson.close()

/* ==================== U3：三处页面明细表 标签 列回显 ==================== */
await openFormDetail('打印模板生效验收记录')
await page.waitForTimeout(800)
let marks = await tableTagMarks()
await page.screenshot({ path: EV + '/u3_form_detail_table.png', fullPage: true })
console.log(
  'U3 form-detail selected=[' +
    marks.selected.join(',') +
    '] unchecked=[' +
    marks.unchecked.join(',') +
    ']',
)
await page.keyboard.press('Escape')
await page.waitForTimeout(700)

await page.goto(BASE + '/workflow/task/' + R3_TASK_ID, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)
await page.waitForTimeout(800)
marks = await tableTagMarks()
await page.screenshot({ path: EV + '/u3_task_detail_table.png', fullPage: true })
console.log(
  'U3 task-detail selected=[' +
    marks.selected.join(',') +
    '] unchecked=[' +
    marks.unchecked.join(',') +
    ']',
)

await openMyInstance('202611111130240004')
await page.waitForTimeout(800)
marks = await tableTagMarks()
await page.screenshot({ path: EV + '/u3_my_instance_table.png', fullPage: true })
console.log(
  'U3 my-instance selected=[' +
    marks.selected.join(',') +
    '] unchecked=[' +
    marks.unchecked.join(',') +
    ']',
)

await browser.close()
