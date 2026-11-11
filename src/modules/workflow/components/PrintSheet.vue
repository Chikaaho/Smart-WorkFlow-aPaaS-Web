<script setup lang="ts">
/* global document */
/**
 * PrintSheet — 浏览器打印专用版面（1.0.0 F2-2/F2-5）。
 *
 * 由 PrintActions 挂载并 Teleport 到 body，屏幕隐藏、打印时独占纸张。
 * 打印定义来自服务端 `/workflow/print/context`：与 PDF 共用提交时版本定位
 * （快照命中用提交时定义，定位不到回退当前定义并在页脚注明）。
 * 版面只输出纯文本显示值：人员/部门名称、选项标签、多选顿号分隔、日期按字段格式、
 * 数值去尾随 0；不出现输入框、图标、下拉箭头或复选框。字段/明细表/审批历史/抬头页脚
 * 均按 printTemplate 生效。
 */
import { computed, ref, watch } from 'vue'
import { getFormData, resolvePartyNames, resolveReferenceDisplay } from '@/adapters/form-runtime'
import { getInstanceRelation } from '@/adapters/instance-relation'
import { getPrintContext } from '@/modules/workflow/api'
import { parseDefinition } from '@/adapters/form-designer'
import { loadDict } from '@/foundation/dict'
import { normalizeFormDateValue } from '@/contracts/form-date'
import type { ApprovalHistoryItem } from '@/contracts/bpm'
import type {
  FormPrintTemplate,
  FormSchema,
  FormSchemaField,
  TableSubField,
} from '@/contracts/form-schema'

const emit = defineEmits<{ ready: [boolean] }>()

const props = defineProps<{
  formKey: string
  recordId?: string
  processInstanceId?: string
}>()

interface FieldRow {
  label: string
  value: string
}

interface TableView {
  label: string
  headers: string[]
  rows: string[][]
}

const loaded = ref(false)
const title = ref('')
const template = ref<FormPrintTemplate | null>(null)
const mainRows = ref<FieldRow[]>([])
const tables = ref<TableView[]>([])
const history = ref<ApprovalHistoryItem[]>([])
const versionNote = ref('')
const showHistory = computed(
  () => template.value?.includeHistory !== false && history.value.length > 0,
)

let loadToken = 0

/* ==================== 显示格式 ==================== */

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/**
 * 打印日期与页面同一时区口径（form-date.normalizeFormDateValue）：
 * 带时区的时间戳先还原浏览器本地时间；无时区历史值保持原义。
 * datetime 字段输出 yyyy-MM-dd HH:mm（与 PDF TIME_FMT 一致），日期字段只到日。
 */
function formatDate(raw: unknown, datetime: boolean): string {
  if (raw == null || raw === '') return '—'
  if (typeof raw === 'number') {
    const date = new Date(raw)
    const text = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    return datetime ? `${text} ${pad(date.getHours())}:${pad(date.getMinutes())}` : text
  }
  const text = normalizeFormDateValue(raw, datetime)
  if (datetime) {
    return text.length >= 16 ? text.slice(0, 16) : text
  }
  return text.length >= 10 ? text.slice(0, 10) : text
}

function formatTime(raw: unknown): string {
  if (raw == null || raw === '') return '—'
  const text = String(raw)
  return text.length >= 5 ? text.slice(0, 5) : text
}

function formatNumber(raw: unknown, decimals?: number): string {
  if (raw == null || raw === '') return '—'
  const value = typeof raw === 'number' ? raw : Number(String(raw))
  if (!Number.isFinite(value)) return String(raw)
  if (typeof decimals === 'number' && decimals >= 0) {
    return value.toFixed(decimals)
  }
  // 默认去掉尾随 0（与页面显示一致）
  return String(Number(value.toFixed(12)))
}

function stripHtml(raw: unknown): string {
  const text = String(raw ?? '')
  if (!text.includes('<')) return text
  try {
    const container = document.createElement('div')
    container.innerHTML = text
    return container.textContent ?? ''
  } catch {
    return text
  }
}

function splitValues(raw: unknown): string[] {
  if (raw == null || raw === '') return []
  if (Array.isArray(raw)) return raw.map((item) => String(item)).filter(Boolean)
  const text = String(raw).trim()
  if (text.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(text)
      if (Array.isArray(parsed)) return parsed.map((item) => String(item)).filter(Boolean)
    } catch {
      // 非 JSON：按逗号回退
    }
  }
  return text
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function numericIds(raw: unknown): string[] {
  const ids: string[] = []
  for (const value of splitValues(raw)) {
    if (/^\d{1,19}$/.test(value)) ids.push(value)
  }
  return ids
}

function optionLabel(
  options: Array<{ key: string; value: string }> | undefined,
  dict: Record<string, string>,
  code: string,
): string | null {
  for (const option of options ?? []) {
    if (option.key === code) return option.value || option.key
  }
  return dict[code] ?? null
}

function dictTypeOf(field: { type?: string; dictType?: string; source?: string }): string | null {
  if (field.type === 'DICT') return field.dictType ?? null
  if (field.type === 'MULTISELECT' && field.source === 'dict') return field.dictType ?? null
  return null
}

/* ==================== 取值 ==================== */

interface DisplayContext {
  userLabels: Record<string, string>
  deptLabels: Record<string, string>
  dicts: Record<string, Record<string, string>>
  referenceLabels: Record<string, Record<string, string>>
}

function displayValue(
  field: {
    type?: string
    name: string
    format?: string
    decimals?: number
    precision?: number
    options?: Array<{ key: string; value: string }>
    dictType?: string
  },
  raw: unknown,
  context: DisplayContext,
  referenceKey: string,
): string {
  if (raw == null || raw === '') return '—'
  const type = field.type ?? 'TEXT'
  switch (type) {
    case 'USER': {
      const labels = numericIds(raw)
        .map((id) => context.userLabels[id])
        .filter(Boolean)
      return labels.length ? labels.join('、') : '—'
    }
    case 'DEPT': {
      const labels = numericIds(raw)
        .map((id) => context.deptLabels[id])
        .filter(Boolean)
      return labels.length ? labels.join('、') : '—'
    }
    case 'DICT': {
      const code = String(raw)
      const dict = field.dictType ? (context.dicts[field.dictType] ?? {}) : {}
      return optionLabel(field.options, dict, code) ?? code
    }
    case 'MULTISELECT': {
      const dict = field.dictType ? (context.dicts[field.dictType] ?? {}) : {}
      const labels = splitValues(raw).map(
        (value) => optionLabel(field.options, dict, value) ?? value,
      )
      return labels.length ? labels.join('、') : '—'
    }
    case 'DATE':
      return formatDate(raw, field.format === 'datetime')
    case 'TIME':
      return formatTime(raw)
    case 'BOOL': {
      const text = String(raw)
      return text === '1' || text === 'true' ? '是' : text === '0' || text === 'false' ? '否' : text
    }
    case 'NUMBER':
    case 'FORMULA':
      return formatNumber(raw, field.decimals ?? field.precision)
    case 'REFERENCE': {
      const labels = context.referenceLabels[referenceKey] ?? {}
      return labels[String(raw)] ?? '—'
    }
    case 'ATTACHMENT':
    case 'IMAGE': {
      try {
        const parsed: unknown = JSON.parse(String(raw))
        if (Array.isArray(parsed)) {
          const names = parsed
            .map((item) =>
              item && typeof item === 'object' && 'name' in item
                ? String((item as { name: unknown }).name)
                : '',
            )
            .filter(Boolean)
          return names.length ? names.join('、') : '—'
        }
      } catch {
        // 纯文本：原样输出
      }
      return String(raw)
    }
    case 'DATASOURCE': {
      try {
        const parsed = JSON.parse(String(raw)) as { display?: string }
        if (parsed?.display) return parsed.display
      } catch {
        // 非 JSON：原样输出
      }
      return String(raw)
    }
    case 'RICH_TEXT':
      return stripHtml(raw) || '—'
    default:
      return String(raw)
  }
}

function collectIds(
  fields: Array<{ type?: string; name: string }>,
  valueOf: (field: { type?: string; name: string }) => unknown,
): { users: string[]; depts: string[] } {
  const users: string[] = []
  const depts: string[] = []
  for (const field of fields) {
    if (field.type === 'USER') users.push(...numericIds(valueOf(field)))
    if (field.type === 'DEPT') depts.push(...numericIds(valueOf(field)))
  }
  return { users: [...new Set(users)], depts: [...new Set(depts)] }
}

async function buildView(
  schema: FormSchema,
  record: Record<string, unknown>,
  templateValue: FormPrintTemplate | null,
) {
  const fieldSelected = (field: FormSchemaField) =>
    !templateValue?.fields?.length || templateValue.fields.includes(field.name)
  const tableSelected = (field: FormSchemaField) =>
    !templateValue?.tables?.length || templateValue.tables.includes(field.name)

  const mainFields = schema.fields.filter((field) => field.type !== 'TABLE' && fieldSelected(field))
  const tableFields = schema.fields.filter(
    (field): field is FormSchemaField & { subFields: TableSubField[] } =>
      field.type === 'TABLE' && tableSelected(field),
  )

  // 字典类型预加载
  const dictTypes = new Set<string>()
  for (const field of mainFields) {
    const type = dictTypeOf(field)
    if (type) dictTypes.add(type)
  }
  for (const table of tableFields) {
    for (const sub of table.subFields ?? []) {
      const type = dictTypeOf(sub)
      if (type) dictTypes.add(type)
    }
  }
  const dicts: Record<string, Record<string, string>> = {}
  await Promise.all(
    [...dictTypes].map(async (type) => {
      try {
        const items = await loadDict(type)
        dicts[type] = Object.fromEntries(items.map((item) => [String(item.value), item.label]))
      } catch {
        dicts[type] = {}
      }
    }),
  )

  // 人员/部门名称预加载（主表 + 明细表）
  const rowsOf = (tableName: string): Array<Record<string, unknown>> =>
    Array.isArray(record[tableName]) ? (record[tableName] as Array<Record<string, unknown>>) : []
  const mainParties = collectIds(mainFields, (field) => record[field.name])
  const subUsers: string[] = []
  const subDepts: string[] = []
  for (const table of tableFields) {
    for (const row of rowsOf(table.name)) {
      const parties = collectIds(table.subFields ?? [], (field) => row[field.name])
      subUsers.push(...parties.users)
      subDepts.push(...parties.depts)
    }
  }
  const [userLabels, deptLabels] = await Promise.all([
    resolvePartyNames('USER', [...new Set([...mainParties.users, ...subUsers])]),
    resolvePartyNames('DEPT', [...new Set([...mainParties.depts, ...subDepts])]),
  ])

  // REFERENCE 显示值预加载
  const referenceLabels: Record<string, Record<string, string>> = {}
  const resolveReference = async (
    field: { type?: string; name: string; targetFormId?: string },
    ids: string[],
    key: string,
  ) => {
    if (field.type !== 'REFERENCE' || !field.targetFormId || ids.length === 0) return
    const map: Record<string, string> = {}
    await Promise.all(
      [...new Set(ids)].map(async (id) => {
        try {
          map[id] = await resolveReferenceDisplay(String(field.targetFormId), id)
        } catch {
          // 解析失败不阻断打印
        }
      }),
    )
    referenceLabels[key] = map
  }
  for (const field of mainFields) {
    const raw = record[`ref_${field.name}_id`] ?? record[field.name]
    await resolveReference(field, splitValues(raw), field.name)
  }
  for (const table of tableFields) {
    for (const sub of table.subFields ?? []) {
      if (sub.type !== 'REFERENCE') continue
      const ids: string[] = []
      for (const row of rowsOf(table.name)) {
        ids.push(...splitValues(row[`ref_${sub.name}_id`] ?? row[sub.name]))
      }
      await resolveReference(sub, ids, `${table.name}.${sub.name}`)
    }
  }

  const context: DisplayContext = { userLabels, deptLabels, dicts, referenceLabels }

  mainRows.value = mainFields.map((field) => ({
    label: field.label ?? field.name,
    value: displayValue(
      field,
      field.type === 'REFERENCE'
        ? (record[`ref_${field.name}_id`] ?? record[field.name])
        : record[field.name],
      context,
      field.name,
    ),
  }))

  tables.value = tableFields.map((table) => {
    const rows = rowsOf(table.name)
    const subFields = table.subFields ?? []
    return {
      label: table.label ?? table.name,
      headers: subFields.map((sub) => sub.label ?? sub.name),
      rows: rows.map((row) =>
        subFields.map((sub) =>
          displayValue(
            sub,
            sub.type === 'REFERENCE' ? (row[`ref_${sub.name}_id`] ?? row[sub.name]) : row[sub.name],
            context,
            `${table.name}.${sub.name}`,
          ),
        ),
      ),
    }
  })
}

function opinionText(item: ApprovalHistoryItem): string {
  if (item.opinionFields?.length) {
    return item.opinionFields
      .filter((field) => field.displayValue)
      .map((field) => `${field.label || field.name}：${field.displayValue}`)
      .join('；')
  }
  const comment = item.opinionData?.comment
  return typeof comment === 'string' ? comment : ''
}

function resultText(item: ApprovalHistoryItem): string {
  if (item.approvalResult === 'APPROVED') return '通过'
  if (item.approvalResult === 'REJECTED') return '驳回'
  return '进行中'
}

async function load() {
  if (!props.formKey || !props.recordId) return
  const token = ++loadToken
  loaded.value = false
  emit('ready', false)
  try {
    const [context, record] = await Promise.all([
      getPrintContext(props.formKey, props.recordId, props.processInstanceId),
      getFormData(props.formKey, props.recordId),
    ])
    if (token !== loadToken) return
    const schema = parseDefinition(context.definition)
    title.value = schema.title || context.formName
    template.value = schema.printTemplate ?? null
    versionNote.value = context.versionPinned
      ? `表单版本 v${context.formVersion}（提交时版本）`
      : `未定位到提交时版本，按当前版本 v${context.formVersion} 打印`
    await buildView(schema, record, template.value)
    try {
      const relation = await getInstanceRelation(props.formKey, props.recordId)
      if (token === loadToken) history.value = relation.approvalHistory ?? []
    } catch {
      // 无流程关系时仅打印表单
    }
    if (token !== loadToken) return
    loaded.value = true
    emit('ready', true)
  } catch {
    if (token === loadToken) {
      loaded.value = false
      emit('ready', false)
    }
  }
}

watch(
  () => [props.formKey, props.recordId, props.processInstanceId],
  () => void load(),
  { immediate: true },
)
</script>

<template>
  <div v-if="loaded" class="sw-print-sheet__content">
    <div v-if="template?.header" class="print-header">{{ template.header }}</div>
    <h2 class="print-title">{{ title }}</h2>

    <div class="print-fields">
      <div v-for="row in mainRows" :key="row.label" class="print-field">
        <span class="print-field__label">{{ row.label }}：</span>
        <span class="print-field__value">{{ row.value }}</span>
      </div>
    </div>

    <section v-for="table in tables" :key="table.label" class="print-table-section">
      <h3>{{ table.label }}</h3>
      <table>
        <thead>
          <tr>
            <th v-for="header in table.headers" :key="header">{{ header }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, index) in table.rows" :key="index">
            <td v-for="(cell, cellIndex) in row" :key="cellIndex">{{ cell }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section v-if="showHistory" class="print-history">
      <h3>审批历史</h3>
      <table>
        <thead>
          <tr>
            <th>节点</th>
            <th>办理人</th>
            <th>部门</th>
            <th>结果</th>
            <th>时间</th>
            <th>意见</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in history" :key="item.taskId">
            <td>{{ item.taskName }}</td>
            <td>{{ item.assigneeName || item.assignee }}</td>
            <td>{{ item.assigneeDept || '—' }}</td>
            <td>{{ resultText(item) }}</td>
            <td>{{ (item.endTime || item.createTime || '').replace('T', ' ').slice(0, 19) }}</td>
            <td>{{ opinionText(item) || '—' }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <div class="print-footer">
      <div v-if="template?.footer" class="print-footer__text">{{ template.footer }}</div>
      <div class="print-footer__version">{{ versionNote }}</div>
    </div>
  </div>
</template>

<style scoped>
.sw-print-sheet__content {
  width: 100%;
  color: #000;
  background: #fff;
  font-size: 13px;
  line-height: 1.7;
}
.print-header {
  margin-bottom: 4px;
  font-size: 12px;
  text-align: center;
}
.print-title {
  margin: 0 0 14px;
  font-size: 20px;
  font-weight: 600;
  text-align: center;
}
.print-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 2px 20px;
}
.print-field {
  display: flex;
  gap: 4px;
}
.print-field__label {
  flex: 0 0 auto;
  color: #333;
}
.print-field__value {
  min-width: 0;
  word-break: break-all;
}
.print-table-section {
  margin-top: 14px;
}
.print-table-section h3,
.print-history h3 {
  margin: 0 0 6px;
  font-size: 14px;
}
.print-table-section table,
.print-history table {
  width: 100%;
  border-collapse: collapse;
}
.print-table-section th,
.print-table-section td,
.print-history th,
.print-history td {
  padding: 4px 6px;
  border: 1px solid #999;
  font-size: 12px;
  text-align: left;
  vertical-align: top;
}
.print-table-section thead th,
.print-history thead th {
  background: #eee;
}
.print-history {
  margin-top: 16px;
}
.print-footer {
  margin-top: 18px;
  padding-top: 6px;
  border-top: 1px solid #999;
  font-size: 12px;
  color: #333;
}
.print-footer__text {
  text-align: center;
}
.print-footer__version {
  color: #555;
}
</style>
