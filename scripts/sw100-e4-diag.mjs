/* 诊断：页面内 fetch 调导入接口，取真实响应体 */
import { chromium } from 'file:///E:/code/Smart-WorkFlow-Agent-Workspace/Smart-WorkFlow-aPaaS-Web/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs'
import { readFileSync } from 'node:fs'
import { login, BASE } from './sw100-lib.mjs'

const FILE =
  'E:/code/Smart-WorkFlow-Agent-Workspace/product/v1.0.0-release/receipts/evidence/f1_import_batch_err.xlsx'
const browser = await chromium.launch()
const { page } = await login(browser)
let auth = ''
page.on('request', (req) => {
  const h = req.headers()['authorization']
  if (h && req.url().includes('/api/')) auth = h
})
await page.goto(BASE + '/system/user', { waitUntil: 'domcontentloaded' })
await page.getByRole('button', { name: '导入' }).waitFor({ state: 'visible', timeout: 20000 })
console.log('auth-captured=' + (auth ? 'yes' : 'no'))
const b64 = readFileSync(FILE).toString('base64')
const resp = await page.evaluate(
  async ({ b64, auth }) => {
    const bin = atob(b64)
    const arr = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
    const fd = new FormData()
    fd.append(
      'file',
      new Blob([arr], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      'batch.xlsx',
    )
    fd.append('initialPassword', process.env.SW_IMPORT_PASS ?? '')
    fd.append('tenantId', '9001')
    const r = await fetch('/api/system/user/import', {
      method: 'POST',
      body: fd,
      credentials: 'include',
      headers: { Authorization: auth },
    })
    return { status: r.status, body: await r.text() }
  },
  { b64, auth },
)
console.log('status=' + resp.status)
console.log('body=' + resp.body.slice(0, 600))
await browser.close()
