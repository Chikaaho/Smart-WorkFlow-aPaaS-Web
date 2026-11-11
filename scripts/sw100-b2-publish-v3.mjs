/* 发布打印模板版本（v3），并提交 R3（新实例）用于“配置生效”的打印预览 */
import { chromium } from 'file:///E:/code/Smart-WorkFlow-Agent-Workspace/Smart-WorkFlow-aPaaS-Web/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs'
import { readFileSync, writeFileSync } from 'node:fs'
import { login, BASE, EV } from './sw100-lib.mjs'
const setup = JSON.parse(readFileSync(EV + '/setup.json', 'utf8'))
const browser = await chromium.launch()
const { page } = await login(browser, { pass: process.env.SW_ADMIN_PASS })
let auth = ''
page.on('request', (req) => {
  const h = req.headers()['authorization']
  if (h && req.url().includes('/api/')) auth = h
})
await page.goto(BASE + '/workspace', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1000)
async function api(method, url, body) {
  const r = await page.evaluate(
    async ({ method, url, body, auth }) => {
      const resp = await fetch('/api' + url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      return { status: resp.status, body: await resp.text() }
    },
    { method, url, body, auth },
  )
  console.log(
    method + ' ' + url + ' -> ' + r.status + ' ' + r.body.replace(/\s+/g, ' ').slice(0, 160),
  )
  return r
}
const defResp = await api('GET', '/form/def/by-key/' + setup.formKey + '/definition')
const definition = JSON.parse(defResp.body).data
await api('POST', '/form/def/' + setup.formId + '/publish-version', { definition })
const dto = JSON.parse((await api('GET', '/form/def/' + setup.formId)).body).data
console.log('formVersion=' + dto.formVersion + ' status=' + dto.status)

// R3：发布后提交的新实例（打印模板生效）
const rowsA = Array.from({ length: 30 }, (_, i) => ({
  product: '新版本部件-' + String(i + 1).padStart(2, '0'),
  qty: i + 1,
  amount: (i + 1) * 1000,
  buyer: '1',
  due: '2026-11-12 09:30:00',
  tags: ['b', 'c'],
  secretNote: '机密-仅管理员可见-新' + String(i + 1).padStart(2, '0'),
}))
const rowsB = Array.from({ length: 5 }, (_, i) => ({
  checkpoint: '新验收项-' + (i + 1),
  reviewer: '1',
  reviewDate: '2026-11-12 10:00:00',
  remark: '新验收说明-' + (i + 1),
}))
const payload = {
  requestTitle: '打印模板生效验收记录（v3）',
  owner: '1',
  dept: '1',
  applyDate: '2026-11-12 10:00:00',
  level: 'NORMAL',
  tags: ['b', 'c'],
  internalNote: '内部备注：仅管理员可见',
  itemsA: rowsA,
  itemsB: rowsB,
}
const draft = JSON.parse(
  (await api('POST', '/workflow/drafts', { formKey: setup.formKey, payload })).body,
).data
const submitted = JSON.parse(
  (await api('POST', '/workflow/drafts/' + draft.id + '/submit')).body,
).data
console.log('r3 commandId=' + submitted.commandId)
writeFileSync(
  EV + '/setup2.json',
  JSON.stringify(
    { formVersion: dto.formVersion, r3DraftId: draft.id, r3CommandId: submitted.commandId },
    null,
    2,
  ),
)
await browser.close()
