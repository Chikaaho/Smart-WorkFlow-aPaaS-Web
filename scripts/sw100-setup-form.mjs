/*
 * F2/B2-B7 取证数据准备：
 * 1) 创建并发布表单 v100_print_demo（2 张明细表）
 * 2) 创建/发布流程定义（审批节点绑定该表单，办理人 admin）
 * 3) 通过草稿提交生成流程实例 R1（itemsA 30 行，跨越一页）
 * 4) 直接提交一条无流程记录 R2（用于“未定位到提交时版本”的页脚）
 * 所有动作走真实 API；仅克隆库使用。
 */
import { chromium } from 'file:///E:/code/Smart-WorkFlow-Agent-Workspace/Smart-WorkFlow-aPaaS-Web/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs'
import { writeFileSync } from 'node:fs'
import { login, BASE, EV } from './sw100-lib.mjs'

const FORM_KEY = 'v100_print_demo'
const DEF = {
  title: '1.0.0 打印验收表单',
  fields: [
    {
      name: 'requestTitle',
      type: 'TEXT',
      label: '申请标题',
      length: 120,
      colSpan: 24,
      required: true,
    },
    { name: 'owner', type: 'USER', label: '负责人', colSpan: 8, required: true },
    { name: 'dept', type: 'DEPT', label: '所属部门', colSpan: 8 },
    { name: 'applyDate', type: 'DATE', label: '申请日期', format: 'datetime', colSpan: 8 },
    {
      name: 'level',
      type: 'DICT',
      label: '研判结论',
      dictType: 'assessment_conclusion',
      colSpan: 8,
      required: true,
    },
    {
      name: 'tags',
      type: 'MULTISELECT',
      label: '标签',
      source: 'custom',
      options: [
        { key: 'a', value: '红色' },
        { key: 'b', value: '蓝色' },
        { key: 'c', value: '绿色' },
      ],
      colSpan: 16,
    },
    { name: 'internalNote', type: 'TEXT', label: '内部备注', length: 200, colSpan: 24 },
    {
      name: 'itemsA',
      type: 'TABLE',
      label: '采购明细',
      colSpan: 24,
      subFields: [
        { name: 'product', type: 'TEXT', label: '产品名称' },
        { name: 'qty', type: 'NUMBER', label: '数量' },
        { name: 'amount', type: 'NUMBER', label: '金额' },
        { name: 'buyer', type: 'USER', label: '采购负责人' },
        { name: 'due', type: 'DATE', format: 'datetime', label: '到货时间' },
        {
          name: 'tags',
          type: 'MULTISELECT',
          source: 'custom',
          label: '标签',
          options: [
            { key: 'a', value: '红色' },
            { key: 'b', value: '蓝色' },
            { key: 'c', value: '绿色' },
          ],
        },
        { name: 'secretNote', type: 'TEXT', label: '密级备注' },
      ],
    },
    {
      name: 'itemsB',
      type: 'TABLE',
      label: '验收明细',
      colSpan: 24,
      subFields: [
        { name: 'checkpoint', type: 'TEXT', label: '检查项' },
        { name: 'reviewer', type: 'USER', label: '验收人' },
        { name: 'reviewDate', type: 'DATE', format: 'datetime', label: '验收时间' },
        { name: 'remark', type: 'TEXT', label: '说明' },
      ],
    },
  ],
}

const browser = await chromium.launch()
const { page } = await login(browser, { pass: process.env.SW_ADMIN_PASS })
let auth = ''
page.on('request', (req) => {
  const h = req.headers()['authorization']
  if (h && req.url().includes('/api/')) auth = h
})
await page.goto(BASE + '/workspace', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1200)
if (!auth) throw new Error('no auth captured')

async function api(method, url, body) {
  const r = await page.evaluate(
    async ({ method, url, body, auth }) => {
      const resp = await fetch('/api' + url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      const text = await resp.text()
      return { status: resp.status, body: text }
    },
    { method, url, body, auth },
  )
  console.log(
    method + ' ' + url + ' -> ' + r.status + ' ' + r.body.replace(/\s+/g, ' ').slice(0, 240),
  )
  return r
}

// ── 1. 表单（幂等：已存在则复用） ──
let existing = await api('GET', '/form/def/by-key/' + FORM_KEY)
let formId = JSON.parse(existing.body).data?.id
if (!formId) {
  const created = await api('POST', '/form/def', {
    formKey: FORM_KEY,
    name: '1.0.0 打印验收表单',
    description: 'F2 打印模板/PDF/明细表导出验收用（克隆库测试数据）',
  })
  formId = JSON.parse(created.body).data?.id
  if (!formId) throw new Error('form create failed')
  await api('POST', '/form/def/' + formId + '/config', { definition: JSON.stringify(DEF) })
  await api('POST', '/form/def/' + formId + '/publish')
} else {
  console.log('form exists: ' + formId + ' status=' + JSON.parse(existing.body).data?.status)
}

// ── 2. 流程定义 ──
let defId = process.env.DEF_ID
let graph
if (!defId) {
  const procCreated = await api('POST', '/workflow/defs', {
    name: '1.0.0 打印验收流程',
    formKey: FORM_KEY,
  })
  const procData = JSON.parse(procCreated.body).data || {}
  defId = procData.defId
  graph = procData.graph
} else {
  const byKey = await api('GET', '/workflow/defs/by-key/' + (process.env.PROC_KEY || ''))
  graph = JSON.parse(byKey.body).data
}
if (!defId || !graph) throw new Error('process create failed')
graph.name = '1.0.0 打印验收流程'
graph.formKey = FORM_KEY
graph.elements = [
  { id: 'node_start', kind: 'node', type: 'START', config: {}, style: {}, x: 100, y: 300 },
  { id: 'node_end', kind: 'node', type: 'END', config: {}, style: {}, x: 700, y: 300 },
  {
    id: 'node_2',
    kind: 'node',
    type: 'APPROVAL',
    config: {
      name: '审批',
      participant: { strategy: 'FIXED_USER', value: ['1'] },
      nodeForm: { formKey: FORM_KEY },
    },
    style: {},
    x: 400,
    y: 300,
  },
  { id: 'edge_2', kind: 'edge', source: 'node_start', target: 'node_2', config: {}, style: null },
  { id: 'edge_3', kind: 'edge', source: 'node_2', target: 'node_end', config: {}, style: null },
]
await api('PUT', '/workflow/defs/' + defId + '/graph', graph)
await api('PUT', '/workflow/defs/' + defId + '/theme-rule', {
  themeRule: '{YYYYMMDDHHMMSS}{SEQ:4}',
})
const published = await api('POST', '/workflow/defs/' + defId + '/publish')
const procKey = JSON.parse(published.body).data?.processKey || graph.processKey
if (!procKey) throw new Error('process publish failed')

// ── 3. 记录 R1（流程实例，itemsA 30 行） ──
const rowsA = Array.from({ length: 30 }, (_, i) => ({
  product: '设备部件-' + String(i + 1).padStart(2, '0'),
  qty: i + 1,
  amount: (i + 1) * 1000,
  buyer: '1',
  due: '2026-11-10 09:30:00',
  tags: ['a', 'c'],
  secretNote: '机密-仅管理员可见-' + String(i + 1).padStart(2, '0'),
}))
const rowsB = Array.from({ length: 5 }, (_, i) => ({
  checkpoint: '验收项-' + (i + 1),
  reviewer: '1',
  reviewDate: '2026-11-11 10:00:00',
  remark: '验收说明-' + (i + 1),
}))
const payload = {
  requestTitle: '1.0.0 打印与导出验收记录',
  owner: '1',
  dept: '1',
  applyDate: '2026-11-11 10:00:00',
  level: 'NORMAL',
  tags: ['a', 'c'],
  internalNote: '内部备注：仅管理员可见',
  itemsA: rowsA,
  itemsB: rowsB,
}
const draft = await api('POST', '/workflow/drafts', { formKey: FORM_KEY, payload })
const draftId = JSON.parse(draft.body).data?.id
if (!draftId) throw new Error('draft create failed')
const submitted = await api('POST', '/workflow/drafts/' + draftId + '/submit')
const commandId = JSON.parse(submitted.body).data?.commandId
console.log('commandId=' + commandId)

// ── 4. 记录 R2（无流程，用于版本未定位页脚） ──
const r2 = await api('POST', '/form/data/' + FORM_KEY, {
  ...payload,
  requestTitle: '1.0.0 无流程记录（版本页脚验证）',
  itemsA: rowsA.slice(0, 3),
})
const recordNoProcess = JSON.parse(r2.body).data

writeFileSync(
  EV + '/setup.json',
  JSON.stringify(
    { formKey: FORM_KEY, formId, procKey, defId, commandId, recordNoProcess },
    null,
    2,
  ),
)
await browser.close()
