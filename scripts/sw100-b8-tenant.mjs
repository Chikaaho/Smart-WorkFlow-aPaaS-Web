import { chromium } from 'file:///E:/code/Smart-WorkFlow-Agent-Workspace/Smart-WorkFlow-aPaaS-Web/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs'
import { login, BASE, EV } from './sw100-lib.mjs'
const browser = await chromium.launch()
const { page } = await login(browser, { user: 'sw100_imp_a1', pass: process.env.SW_IMPORT_NEW_PASS })
let auth = ''
page.on('request', (req) => { const h = req.headers()['authorization']; if (h && req.url().includes('/api/')) auth = h })
await page.goto(BASE + '/system/log', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)
await page.screenshot({ path: EV + '/b8_log_tenant_admin.png' })
const res = await page.evaluate(async ({ auth }) => {
  const call = async (body) => {
    const r = await fetch('/api/system/audit-log/page?pageNum=1&pageSize=20', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: auth }, body: JSON.stringify(body),
    })
    return { status: r.status, text: await r.text() }
  }
  const own = await call({ logType: 'LOGIN' })
  const cross = await call({ logType: 'LOGIN', tenantId: 0 })
  const parse = (t) => { try { return JSON.parse(t) } catch { return null } }
  const ownJson = parse(own.text)
  const tenants = [...new Set((ownJson?.data?.records ?? []).map((r) => r.tenantId))]
  return { ownStatus: own.status, tenants, crossStatus: cross.status, cross: cross.text.slice(0, 160) }
}, { auth })
console.log(JSON.stringify(res))
await browser.close()
