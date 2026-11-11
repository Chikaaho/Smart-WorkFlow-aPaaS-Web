import { chromium } from 'file:///E:/code/Smart-WorkFlow-Agent-Workspace/Smart-WorkFlow-aPaaS-Web/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs'
import { login, BASE, EV } from './sw100-lib.mjs'
const browser = await chromium.launch()
const { page } = await login(browser, { pass: process.env.SW_ADMIN_PASS })
await page.goto(BASE + '/system/log', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2000)
await page.getByRole('tab', { name: '异常日志' }).click()
await page.waitForTimeout(1000)
await page.getByPlaceholder('模块').fill('系统管理')
await page.getByRole('button', { name: '查询', exact: true }).click()
await page.waitForTimeout(1500)
const expand = page.locator('.el-table__expand-icon').first()
if (await expand.count()) { await expand.click(); await page.waitForTimeout(600) }
await page.screenshot({ path: EV + '/b8_log_exception_field.png', fullPage: true })
const text = await page.locator('body').innerText()
console.log('hasType=' + text.includes('异常类型') + ' hasTrace=' + text.includes('事件引用') + ' hasTarget=' + text.includes('/system/user/import'))
await browser.close()
