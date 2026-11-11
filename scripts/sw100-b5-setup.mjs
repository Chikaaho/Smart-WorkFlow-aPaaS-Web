/* B5：发布 v4（字段级隐藏），并给 R3 任务加签 yangfan，使其成为流程参与人 */
import { chromium } from 'file:///E:/code/Smart-WorkFlow-Agent-Workspace/Smart-WorkFlow-aPaaS-Web/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs'
import { readFileSync } from 'node:fs'
import { login, BASE, EV } from './sw100-lib.mjs'

const setup = JSON.parse(readFileSync(EV + '/setup.json', 'utf8'))
const TASK_ID = process.env.R3_TASK_ID
const YANGFAN_ID = '2118753964336414722'
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
  console.log(method + ' ' + url + ' -> ' + r.status + ' ' + r.body.replace(/\s+/g, ' ').slice(0, 240))
  return r
}

const defResp = await api('GET', '/form/def/by-key/' + setup.formKey + '/definition')
const definition = JSON.parse(JSON.parse(defResp.body).data)
if (!definition.fieldPermissions || !definition.fieldPermissions['itemsA.secretNote']) {
  definition.fieldPermissions = {
    internalNote: { view: ['user:1'] },
    'itemsA.secretNote': { view: ['user:1'] },
  }
  await api('POST', '/form/def/' + setup.formId + '/publish-version', {
    definition: JSON.stringify(definition),
  })
}
const dto = JSON.parse((await api('GET', '/form/def/' + setup.formId)).body).data
console.log('formVersion=' + dto.formVersion)

// 加签 yangfan（并行、原办理人前），使其成为实例参与人
await api('POST', '/workflow/tasks/' + TASK_ID + '/add-sign', {
  participants: [YANGFAN_ID],
  mode: 'PARALLEL',
  signPosition: 'BEFORE',
  policy: 'ALL_PASS',
  comment: '字段隐藏对照（B5）加签',
})
await browser.close()
