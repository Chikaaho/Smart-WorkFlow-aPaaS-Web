import { chromium } from 'file:///E:/code/Smart-WorkFlow-Agent-Workspace/Smart-WorkFlow-aPaaS-Web/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs'
import { login, BASE } from './sw100-lib.mjs'
const browser = await chromium.launch()
const { page } = await login(browser, { pass: process.env.SW_ADMIN_PASS })
let auth = ''
page.on('request', (req) => {
  const h = req.headers()['authorization']
  if (h && req.url().includes('/api/')) auth = h
})
await page.goto(BASE + '/system/user', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1500)
async function call(label, payload) {
  const r = await page.evaluate(
    async ({ auth, payload }) => {
      const resp = await fetch('/api/system/user/page?pageNum=1&pageSize=10', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: JSON.stringify(payload),
      })
      return { status: resp.status, body: (await resp.text()).slice(0, 200) }
    },
    { auth, payload },
  )
  console.log(label + ' status=' + r.status + ' body=' + r.body)
}
await call('kw+dept+tenant', { keyword: 'a', deptId: 91001, tenantId: 9001 })
await call('tenant-9001', { tenantId: 9001 })
await call('dept+kw', { deptId: 91001, keyword: 'a' })
await call('status+role', { status: 0, roleId: 1 })
await call('all', { keyword: 'a', status: 0, deptId: 91001, postId: 1, roleId: 1, tenantId: 9001 })
await browser.close()
