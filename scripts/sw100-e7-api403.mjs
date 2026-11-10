/* F1-5 API 403：等 token 捕获后调 import-template */
import { chromium } from 'file:///E:/code/Smart-WorkFlow-Agent-Workspace/Smart-WorkFlow-aPaaS-Web/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs'
import { login, BASE, EV } from './sw100-lib.mjs'

const browser = await chromium.launch()
const { page } = await login(browser, { user: 'yangfan', pass: 'Sw100-Test-User!' })
let auth = ''
page.on('request', (req) => {
  const h = req.headers()['authorization']
  if (h && req.url().includes('/api/') && !auth) auth = h
})
await page.goto(BASE + '/system/user', { waitUntil: 'domcontentloaded' })
for (let i = 0; i < 20 && !auth; i++) await page.waitForTimeout(300)
console.log('auth=' + (auth ? 'captured' : 'missing'))
const denied = await page.evaluate(async ({ auth }) => {
  const r = await fetch('/api/system/user/import-template', { headers: { Authorization: auth } })
  return { status: r.status, body: (await r.text()).slice(0, 180) }
}, { auth })
console.log('api=' + JSON.stringify(denied))
await browser.close()
