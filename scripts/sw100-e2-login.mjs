/* 1.0.0 阶段3：单挑战登录——取验证码→等外部读取写入 /tmp/sw100-captcha.txt→填表提交 */
import { chromium } from 'file:///E:/code/Smart-WorkFlow-Agent-Workspace/Smart-WorkFlow-aPaaS-Web/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs'
import { writeFileSync, readFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs'

const BASE = process.env.SW_BASE || 'http://localhost:5275'
const USER = process.env.SW_USER || 'admin'
const PASS = process.env.SW_PASS
if (!PASS) throw new Error('SW_PASS required')
const CAP_FILE = 'E:/tmp/sw100-captcha.txt'
const EV = 'E:/code/Smart-WorkFlow-Agent-Workspace/product/v1.0.0-release/receipts/evidence'
mkdirSync(EV, { recursive: true })

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('img[src^="data:image"]', { timeout: 10000 })
await page.waitForTimeout(500)
const src = await page
  .getByRole('img', { name: /点击刷新验证码/ })
  .first()
  .evaluate((el) => el.src)
writeFileSync('E:/tmp/sw100-captcha.png', Buffer.from(src.split(',')[1], 'base64'))
if (existsSync(CAP_FILE)) unlinkSync(CAP_FILE)
console.log('CAPTCHA_READY')

let code = process.argv[2] || ''
if (!code) {
  for (let i = 0; i < 90; i++) {
    await page.waitForTimeout(1000)
    if (existsSync(CAP_FILE)) {
      code = readFileSync(CAP_FILE, 'utf8').trim()
      if (code) break
    }
  }
}
console.log('captcha-input-len=' + code.length)
await page.getByPlaceholder('请输入账号').fill(USER)
await page.getByPlaceholder('请输入密码').fill(PASS)
await page.getByPlaceholder('请输入验证码').fill(code)
await page.screenshot({ path: EV + '/f1_login_filled.png' })
await page.getByRole('button', { name: '登录' }).click()
await page.waitForTimeout(2500)
await page.screenshot({ path: EV + '/f1_after_login.png' })
console.log('url=' + page.url())
if (!page.url().includes('/login')) {
  await ctx.storageState({ path: 'E:/tmp/sw100-state-admin.json' })
  console.log('state saved: ' + USER)
} else {
  console.log('body=' + (await page.locator('body').innerText()).slice(0, 200).replace(/\n/g, '|'))
}
await browser.close()
