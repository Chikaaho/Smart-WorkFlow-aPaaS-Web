/* B8：生成新审计数据（导出成功 / 表单配置修改 / 导入失败 / 查询不记）并取页面截图 */
import { chromium } from 'file:///E:/code/Smart-WorkFlow-Agent-Workspace/Smart-WorkFlow-aPaaS-Web/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs'
import { readFileSync } from 'node:fs'
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

async function api(method, url, body, contentType) {
  const r = await page.evaluate(
    async ({ method, url, body, auth, contentType }) => {
      const resp = await fetch('/api' + url, {
        method,
        headers: contentType
          ? { 'Content-Type': contentType, Authorization: auth }
          : { 'Content-Type': 'application/json', Authorization: auth },
        body,
      })
      return { status: resp.status, body: (await resp.text()).slice(0, 200) }
    },
    { method, url, body, auth, contentType },
  )
  console.log(method + ' ' + url + ' -> ' + r.status + ' ' + r.body.replace(/\s+/g, ' ').slice(0, 120))
}

// 1) 导出成功（二进制响应不得再记为失败）
await api('POST', '/system/user/export', JSON.stringify({}))
// 2) 表单配置修改（保存同一份定义）
const def = JSON.parse(JSON.parse((await page.evaluate(async ({ auth, formKey }) => {
  const r = await fetch('/api/form/def/by-key/' + formKey + '/definition', { headers: { Authorization: auth } })
  return r.text()
}, { auth, formKey: setup.formKey }))).data)
await api('POST', '/form/def/' + setup.formId + '/config',
  JSON.stringify({ definition: JSON.stringify(def) }))
// 3) 导入失败（无文件 → 400，失败原因应可读）
await api('POST', '/system/user/import', new FormData())
// 4) 查询类：关键字检索用户（修复后应 200，且不产生操作审计）
await api('POST', '/system/user/page?pageNum=1&pageSize=5', JSON.stringify({ keyword: 'admin' }))

// 页面截图（三页签 + 异常字段展开）
await page.goto(BASE + '/system/log', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)
await page.screenshot({ path: EV + '/b8_log_login.png' })
await page.getByRole('tab', { name: '操作日志' }).click()
await page.waitForTimeout(1500)
await page.screenshot({ path: EV + '/b8_log_operation.png' })
await page.getByRole('tab', { name: '异常日志' }).click()
await page.waitForTimeout(1500)
// 展开第一行异常，展示类型/请求/事件引用/摘要
const expand = page.locator('.el-table__expand-icon').first()
if (await expand.count()) {
  await expand.click()
  await page.waitForTimeout(600)
}
await page.screenshot({ path: EV + '/b8_log_exception.png' })
await browser.close()
