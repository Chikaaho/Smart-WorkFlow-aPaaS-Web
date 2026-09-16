/**
 * P61 R2a：把「模板直接渲染裸枚举字段」改为经 enumLabel 查表。
 *
 * 每处替换都在下方 RULES 里显式声明领域，逐条可复核；
 * 只替换 {{ 表达式 }} 整段渲染位，不动业务值比较（那些是线值语义，必须保持原样）。
 *
 * 用法：node scripts/p61-enum-label-codemod.mjs [--dry]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const dry = process.argv.includes('--dry')

/** file → [{ re, domain, note }] */
const RULES = {
  'src/modules/agent/components/execution/NodeTrajectory.vue': [
    { re: /\{\{\s*node\.nodeType\s*\}\}/g, domain: 'AGENT_NODE_TYPE', note: '节点类型标签' },
  ],
  'src/modules/agent/views/ConversationList.vue': [
    { re: /\{\{\s*row\.status\s*\}\}/g, domain: 'AGENT_CONVERSATION', note: '会话状态' },
  ],
  'src/modules/agent/views/GraphDesigner.vue': [
    {
      re: /\{\{\s*selectedNode\.type\s*\}\}/g,
      domain: 'AGENT_NODE_TYPE',
      note: '属性面板节点类型',
    },
  ],
  'src/modules/iot/views/IotConnectionList.vue': [
    { re: /\{\{\s*row\.healthStatus\s*\}\}/g, domain: 'IOT_HEALTH', note: '连接健康状态' },
  ],
  'src/modules/iot/views/IotDeviceList.vue': [
    { re: /\{\{\s*row\.manageStatus\s*\}\}/g, domain: 'IOT_RELEASE_STATE', note: '设备管理状态' },
    { re: /\{\{\s*row\.status\s*\}\}/g, domain: 'IOT_DEVICE_ONLINE', note: '设备在线状态' },
  ],
  'src/modules/iot/views/IotFlowActions.vue': [
    { re: /\{\{\s*row\.status\s*\}\}/g, domain: 'IOT_RELEASE_STATE', note: '流程动作发布状态' },
  ],
  'src/modules/iot/views/IotProductList.vue': [
    { re: /\{\{\s*row\.modelStatus\s*\}\}/g, domain: 'IOT_RELEASE_STATE', note: '物模型发布状态' },
    { re: /\{\{\s*v\.status\s*\}\}/g, domain: 'IOT_RELEASE_STATE', note: '物模型版本状态' },
  ],
  'src/modules/iot/views/IotRuleList.vue': [
    { re: /\{\{\s*row\.status\s*\}\}/g, domain: 'IOT_RELEASE_STATE', note: '事件规则发布状态' },
  ],
  'src/modules/iot/views/IotRuntimeLogs.vue': [
    { re: /\{\{\s*row\.parseStatus\s*\}\}/g, domain: 'IOT_TASK_STATE', note: '解析结果' },
    { re: /\{\{\s*row\.status\s*\}\}/g, domain: 'IOT_TASK_STATE', note: '任务/指令状态' },
  ],
  'src/modules/iot/views/IotScriptList.vue': [
    { re: /\{\{\s*row\.status\s*\}\}/g, domain: 'IOT_RELEASE_STATE', note: '脚本发布状态' },
  ],
  'src/modules/notify/views/NotifyRecordList.vue': [
    { re: /\{\{\s*row\.deliveryStatus\s*\}\}/g, domain: 'NOTIFY_DELIVERY', note: '投递状态' },
    {
      re: /\{\{\s*detail\.message\.deliveryStatus\s*\}\}/g,
      domain: 'NOTIFY_DELIVERY',
      note: '详情投递状态',
    },
  ],
  'src/modules/workflow/views/MobileWorkspace.vue': [
    {
      re: /\{\{\s*refInstance\.status\s*\}\}/g,
      domain: 'WORKFLOW_INSTANCE',
      note: '移动端实例状态',
    },
  ],
  'src/modules/workflow/views/MyCc.vue': [
    {
      re: /\{\{\s*row\.instanceStatus\s*\?\?\s*'[^']*'\s*\}\}/g,
      domain: 'WORKFLOW_INSTANCE',
      note: '抄送实例状态',
    },
  ],
  'src/modules/workflow/views/ProcessDesigner.vue': [
    { re: /\{\{\s*cap\.type\s*\}\}/g, domain: 'WORKFLOW_NODE_TYPE', note: '调色板节点类型' },
    { re: /\{\{\s*node\.type\s*\}\}/g, domain: 'WORKFLOW_NODE_TYPE', note: '画布节点类型' },
    { re: /\{\{\s*selectedNode\.type\s*\}\}/g, domain: 'WORKFLOW_NODE_TYPE', note: '属性面板类型' },
  ],
  'src/modules/workflow/views/ProcessGraphView.vue': [
    { re: /\{\{\s*node\.type\s*\}\}/g, domain: 'WORKFLOW_NODE_TYPE', note: '流程图节点类型' },
  ],
  'src/modules/workflow/views/TaskHandover.vue': [
    { re: /\{\{\s*result\.status\s*\}\}/g, domain: 'HANDOVER_RESULT', note: '交接批次状态' },
  ],
}

const IMPORT_LINE = "import { enumLabel } from '@/foundation/i18n/enum-label'"

let totalFiles = 0
let totalHits = 0
const skipped = []

for (const [rel, rules] of Object.entries(RULES)) {
  const file = join(ROOT, rel)
  let src = readFileSync(file, 'utf8')
  const original = src
  /** @type {string[]} */
  const applied = []

  for (const rule of rules) {
    const before = src
    src = src.replace(rule.re, (match) => {
      // 取原始表达式（去掉 {{ }} 与首尾空白），保留调用方原本的变量路径
      const expr = match.replace(/^\{\{\s*/, '').replace(/\s*\}\}$/, '')
      if (expr.includes('enumLabel(')) return match
      applied.push(`${rule.domain} <- ${expr}（${rule.note}）`)
      return `{{ enumLabel('${rule.domain}', ${expr}) }}`
    })
    if (src === before) skipped.push(`${rel} :: ${rule.re} 未命中（可能已被改写）`)
  }

  if (applied.length === 0) continue

  if (!src.includes(IMPORT_LINE)) {
    if (/<script setup lang="ts">/.test(src)) {
      src = src.replace(/<script setup lang="ts">\n/, `<script setup lang="ts">\n${IMPORT_LINE}\n`)
    } else {
      throw new Error(`${rel} 缺少 <script setup lang="ts">，无法注入 enumLabel 导入`)
    }
  }

  if (src !== original) {
    if (!dry) writeFileSync(file, src)
    totalFiles++
    totalHits += applied.length
    console.log(`${rel}`)
    for (const a of applied) console.log(`    ${a}`)
  }
}

console.log(
  `\n枚举直出改造：${totalFiles} 个文件，${totalHits} 处（${dry ? 'dry-run' : '已写入'}）`,
)
if (skipped.length) {
  console.log(`\n未命中 ${skipped.length} 条：`)
  for (const s of skipped) console.log('  ' + s)
}
