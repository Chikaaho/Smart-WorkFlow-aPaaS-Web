/* F1 主流（自带登录）：列表截图 → 模板下载 → UI 上传导入 → 结果/列表截图 → 导出 */
import { chromium } from 'file:///E:/code/Smart-WorkFlow-Agent-Workspace/Smart-WorkFlow-aPaaS-Web/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs'
import { login, BASE, EV } from './sw100-lib.mjs'

const XLSX = process.argv[2] || ''

const browser = await chromium.launch()
const { page } = await login(browser)
await page.goto(BASE + '/system/user', { waitUntil: 'domcontentloaded' })
await page.getByRole('button', { name: '导入' }).waitFor({ state: 'visible', timeout: 20000 })
await page.screenshot({ path: EV + '/f1_user_list_admin.png' })
console.log('list ok')

// 模板下载
await page.getByRole('button', { name: '导入' }).click()
await page.waitForTimeout(900)
await page.screenshot({ path: EV + '/f1_import_dialog.png' })
const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 30000 }),
  page.getByRole('button', { name: '下载模板' }).click(),
])
await download.saveAs(EV + '/f1_user_import_template.xlsx')
console.log('template saved: ' + download.suggestedFilename())

async function doImport(path, shotPrefix) {
  if (
    !(await page
      .locator('input[type=file]')
      .isVisible()
      .catch(() => false))
  ) {
    await page.getByRole('button', { name: '导入' }).click()
  }
  await page.waitForTimeout(700)
  await page.locator('input[type="file"]').setInputFiles(path)
  await page
    .getByPlaceholder('所有导入账号共用；首次登录必须修改')
    .fill(process.env.SW_IMPORT_PASS ?? '')
  await page.screenshot({ path: `${EV}/${shotPrefix}_filled.png` })
  await page.getByRole('button', { name: '开始导入' }).click()
  await page.waitForTimeout(1800)
  await page.screenshot({ path: `${EV}/${shotPrefix}_result.png` })
  const body = await page.locator('body').innerText()
  const i = body.indexOf('导入结果')
  console.log(
    shotPrefix +
      '=' +
      (i >= 0
        ? body
            .slice(i, i + 300)
            .split(String.fromCharCode(10))
            .join('|')
        : 'NO_RESULT_DIALOG'),
  )
  const ok = page.getByRole('button', { name: '知道了' })
  if (await ok.count()) {
    await ok.click()
    await page.waitForTimeout(1200)
  } else {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(900)
    if (
      await page
        .locator('input[type=file]')
        .isVisible()
        .catch(() => false)
    ) {
      await page
        .getByRole('button', { name: '取消' })
        .click()
        .catch(() => {})
      await page.waitForTimeout(800)
    }
  }
}

// F1-6 负例：超管未指定目标租户 → 拒绝
if (process.argv.includes('--neg-tenant')) {
  await doImport(process.argv[3], 'f1_import_no_tenant')
}

// 选目标租户（演示集团A）：先含错批（0 落库）再成功批
const OK_BATCH = process.argv[4] || ''
if (XLSX || OK_BATCH) {
  await page.keyboard.press('Escape')
  await page.waitForTimeout(600)
  await page.locator('.el-select').first().click()
  await page.waitForTimeout(600)
  await page.getByRole('option', { name: '演示集团A' }).click()
  await page.waitForTimeout(1500)
  if (XLSX && !XLSX.startsWith('--')) await doImport(XLSX, 'f1_import_err')
  if (OK_BATCH) {
    await doImport(OK_BATCH, 'f1_import_ok')
    await page.screenshot({ path: EV + '/f1_user_list_after_import.png' })
    // 翻到含导入账号的页：账号筛选
    await page.getByPlaceholder('请输入').first().fill('sw100_imp')
    await page.getByRole('button', { name: '查询', exact: true }).click()
    await page.waitForTimeout(1500)
    await page.screenshot({ path: EV + '/f1_user_list_imported.png' })
  }
}

// 导出
const [exp] = await Promise.all([
  page.waitForEvent('download', { timeout: 30000 }),
  page.getByRole('button', { name: '导出' }).click(),
])
await exp.saveAs(EV + '/f1_users_export.xlsx')
console.log('export saved: ' + exp.suggestedFilename())
await browser.close()
