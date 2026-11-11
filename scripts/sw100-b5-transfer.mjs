import { chromium } from 'file:///E:/code/Smart-WorkFlow-Agent-Workspace/Smart-WorkFlow-aPaaS-Web/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs'
import { login, BASE } from './sw100-lib.mjs'
const browser = await chromium.launch()
const { page } = await login(browser, { pass: process.env.SW_ADMIN_PASS })
let auth = ''
page.on('request', (req) => { const h = req.headers()['authorization']; if (h && req.url().includes('/api/')) auth = h })
await page.goto(BASE + '/workspace', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1000)
const r = await page.evaluate(async ({ auth }) => {
  const resp = await fetch('/api/workflow/tasks/3b039997-dd80-11f1-8d99-00ff9e2a8dfb/transfer', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: JSON.stringify({ targetUserId: '2118753964336414722', comment: '字段隐藏对照（B5）转办' }),
  })
  return { status: resp.status, body: (await resp.text()).slice(0, 300) }
}, { auth })
console.log(JSON.stringify(r))
await browser.close()
