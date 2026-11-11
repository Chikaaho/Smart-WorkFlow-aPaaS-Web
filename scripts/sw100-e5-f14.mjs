/* F1-4 改密链 v2：改密页截图 → 带 token 业务 403 → label 定位改密 → 正常使用 */
import { chromium } from 'file:///E:/code/Smart-WorkFlow-Agent-Workspace/Smart-WorkFlow-aPaaS-Web/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs'
import { login, EV } from './sw100-lib.mjs'

const browser = await chromium.launch()
const { page } = await login(browser, { user: 'sw100_imp_a1', pass: process.env.SW_IMPORT_PASS })
await page.waitForTimeout(1200)
console.log('after-login-url=' + page.url())
await page.screenshot({ path: EV + '/f14_change_password_page.png' })

// 拦截应用请求头拿 token，改密前直接调业务接口
let auth = ''
page.on('request', (req) => {
  const h = req.headers()['authorization']
  if (h && req.url().includes('/api/')) auth = h
})
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1500)

const denied = await page.evaluate(
  async ({ auth }) => {
    const r = await fetch('/api/system/user/page?pageNum=1&pageSize=1', {
      headers: { Authorization: auth },
    })
    return { status: r.status, body: (await r.text()).slice(0, 200) }
  },
  { auth },
)
console.log('pre-change-api=' + JSON.stringify(denied))

// UI 改密（label 定位）
await page.getByLabel('当前密码').fill(process.env.SW_IMPORT_PASS ?? '')
await page.getByLabel('新密码', { exact: true }).fill(process.env.SW_IMPORT_NEW_PASS ?? '')
await page.getByLabel('确认新密码').fill(process.env.SW_IMPORT_NEW_PASS ?? '')
await page.screenshot({ path: EV + '/f14_change_filled.png' })
await page.getByRole('button', { name: '确认修改' }).click()
await page.waitForTimeout(2500)
await page.screenshot({ path: EV + '/f14_after_change.png' })
console.log('after-change-url=' + page.url())

const allowed = await page.evaluate(
  async ({ auth }) => {
    const r = await fetch('/api/system/user/page?pageNum=1&pageSize=1', {
      headers: { Authorization: auth },
    })
    return { status: r.status, body: (await r.text()).slice(0, 100) }
  },
  { auth },
)
console.log('post-change-api=' + JSON.stringify(allowed))
await browser.close()
