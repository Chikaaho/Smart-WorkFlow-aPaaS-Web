import { chromium } from 'file:///E:/code/Smart-WorkFlow-Agent-Workspace/Smart-WorkFlow-aPaaS-Web/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs'
import { readFileSync } from 'node:fs'
import { login, BASE, EV } from './sw100-lib.mjs'
const setup = JSON.parse(readFileSync(EV + '/setup.json','utf8'))
const browser = await chromium.launch()
const { page } = await login(browser, { pass: process.env.SW_ADMIN_PASS })
await page.goto(BASE + '/form/designer/' + setup.formId, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.designer__workbench', { timeout: 30000 })
await page.waitForTimeout(2500)
// 当前已发布版本：工具条「发布」即发布新版本（i18n label 同名）
await page.locator('.designer__actions button', { hasText: '发布' }).last().click()
await page.waitForTimeout(800)
await page.screenshot({ path: EV + '/b2_publish_confirm.png' })
const confirm = page.locator('.designer-publish-dialog:visible, .el-dialog:visible').filter({ hasText: '历史记录与快照保留' }).first()
await confirm.getByRole('button', { name: '发布', exact: true }).click()
await page.waitForTimeout(3500)
await page.screenshot({ path: EV + '/b2_after_publish.png' })
const version = await page.evaluate(async ({ id }) => {
  const r = await fetch('/api/form/def/' + id); const j = await r.json(); return j.data?.formVersion
}, { id: setup.formId })
console.log('formVersion=' + version)
await browser.close()
