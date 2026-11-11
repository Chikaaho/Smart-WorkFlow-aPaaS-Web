import { chromium } from 'file:///E:/code/Smart-WorkFlow-Agent-Workspace/Smart-WorkFlow-aPaaS-Web/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs'
import { login, BASE, EV } from './sw100-lib.mjs'
const browser = await chromium.launch()
const { page } = await login(browser, { pass: process.env.SW_ADMIN_PASS })
await page.goto(BASE + '/system/user', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)
// 超管默认未选目标租户
await page.getByRole('button', { name: '导入', exact: true }).click()
await page.waitForTimeout(800)
const toast = await page.locator('.el-message').allTextContents()
const dialogVisible = await page.locator('.el-dialog:visible').filter({ hasText: '导入人员' }).count()
console.log('toast=' + JSON.stringify(toast) + ' dialog=' + dialogVisible)
await page.screenshot({ path: EV + '/r6_import_guard.png' })
await browser.close()
