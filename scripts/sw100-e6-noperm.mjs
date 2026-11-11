/* F1-5 无权限对照：yangfan（staff）导入/导出按钮隐藏 + API 403 */
import { chromium } from 'file:///E:/code/Smart-WorkFlow-Agent-Workspace/Smart-WorkFlow-aPaaS-Web/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs'
import { login, BASE, EV } from './sw100-lib.mjs'

const browser = await chromium.launch()
const { page } = await login(browser, { user: 'yangfan', pass: process.env.SW_USER_PASS })
await page.goto(BASE + '/system/user', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2000)
await page.screenshot({ path: EV + '/f15_user_list_no_perm.png' })
console.log(
  'import-btn=' + (await page.getByRole('button', { name: '导入' }).count()),
  'export-btn=' + (await page.getByRole('button', { name: '导出' }).count()),
)
let auth = ''
page.on('request', (req) => {
  const h = req.headers()['authorization']
  if (h && req.url().includes('/api/')) auth = h
})
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1200)
const denied = await page.evaluate(
  async ({ auth }) => {
    const r = await fetch('/api/system/user/import-template', { headers: { Authorization: auth } })
    return { status: r.status, body: (await r.text()).slice(0, 160) }
  },
  { auth },
)
console.log('api=' + JSON.stringify(denied))
await browser.close()
