<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { StandardListTemplate, LoadErrorState, ListActionsColumn } from '@/components/page-layout'
import type { ListAction } from '@/components/page-layout/ListActionsColumn.vue'
import DictSelect from '@/foundation/dict/DictSelect.vue'
import DictTag from '@/foundation/dict/DictTag.vue'
import {
  getFormDefinition,
  getFormDef,
  queryFormData,
  type QueryFilter,
} from '@/modules/form/api/form'
import { usePermission } from '@/foundation/permission'
import { deriveColumns, deriveFilterFields } from '@/modules/form/utils/derive-list-config'
import { getListConfig } from '@/modules/form/api/i2-choices'
import { ApiError } from '@/foundation/request'
import type { FormSchema } from '@/contracts/form-schema'
import type { PageResult } from '@/contracts/common'
import { useI18n } from '@/locales'

/**
 * 应用中心 · 表单数据列表（用户端）。
 *
 * 权限口径与详情一致：读取走 form:data:query 与既有行权限（ALL/SELF/DEPT/...），
 * 无查询权限时不请求数据并给出可读受限态，同时保留已获授权的填写/发起入口；
 * 查询结果为零时显示空列表，不用静态演示数据代替。
 *
 * 两种用法（原型 2026-10-16）：
 * - 应用内页嵌入（AppCenterDetail）：传入 formKey/appId 并置 embedded，隐藏「返回应用中心」；
 * - 数据列表深链（/form/app-form/:formKey）：无 props，表单标识与来源应用取自路由。
 */
const props = withDefaults(
  defineProps<{
    /** 表单业务标识；缺省取路由参数 */
    formKey?: string
    /** 来源应用 ID（决定返回目标）；缺省取路由 query.appId */
    appId?: string
    /** 嵌入应用内页时为 true：不再渲染「返回应用中心」（由应用内页统一提供） */
    embedded?: boolean
  }>(),
  { formKey: undefined, appId: undefined, embedded: false },
)

const { t } = useI18n()
const { hasPerm } = usePermission()
const route = useRoute()
const router = useRouter()

const formKey = computed(() => props.formKey ?? String(route.params.formKey ?? ''))
const appId = computed(
  () => props.appId ?? (typeof route.query.appId === 'string' ? route.query.appId : ''),
)

const canQuery = computed(() => hasPerm('form:data:query'))
const canEdit = computed(() => hasPerm('form:data:edit'))

const loading = ref(false)
const errorMsg = ref('')
const loadError = ref<ApiError | null>(null)
const schema = ref<FormSchema | null>(null)
const schemaLoaded = ref(false)
const result = ref<PageResult<Record<string, unknown>> | null>(null)
const pageNum = ref(1)
const pageSize = ref(10)
const idLabelMaps = ref<{ user: Map<string, string>; dept: Map<string, string> } | null>(null)

const persistedListConfig = ref<Awaited<ReturnType<typeof getListConfig>>>(null)

const columns = computed(() => {
  if (schema.value && persistedListConfig.value?.columns?.length) {
    return persistedListConfig.value.columns.map((c) => {
      const def = schema.value?.fields.find((sf) => sf.name === c.name)
      const type = def?.type ?? 'TEXT'
      return {
        prop: type === 'REFERENCE' ? `ref_${c.name}_id` : c.name,
        label: c.label ?? def?.label ?? c.name,
        type,
        dictType: def?.type === 'DICT' ? def.dictType : undefined,
      }
    })
  }
  return schema.value ? deriveColumns(schema.value) : []
})

const filterFields = computed(() => {
  if (schema.value && persistedListConfig.value?.filters?.length) {
    return persistedListConfig.value.filters.map((f) => ({
      field: f.name,
      label: schema.value?.fields.find((sf) => sf.name === f.name)?.label ?? f.name,
      type: schema.value?.fields.find((sf) => sf.name === f.name)?.type ?? ('TEXT' as const),
      op: (f.op as 'EQ' | 'LIKE' | 'GE' | 'LE') ?? ('EQ' as const),
      dictType:
        schema.value?.fields.find((sf) => sf.name === f.name)?.type === 'DICT'
          ? (schema.value.fields.find((sf) => sf.name === f.name) as { dictType?: string }).dictType
          : undefined,
    }))
  }
  return schema.value ? deriveFilterFields(schema.value) : []
})

const filterValues = ref<Record<string, string>>({})
const dateRange = ref<[string, string] | null>(null)
const dateFieldName = ref('')

/* ── 查询字段设置（0.1.7 #28）：勾选哪些字段出现在筛选栏；本机偏好，不落服务端 ── */

const FILTER_PREF_PREFIX = 'sw:app-form-filters:'

/** 可查询字段池：与 deriveFilterFields 同一类型口径，但不做 3 个截断（用户自选）。 */
const FILTERABLE_TYPES = new Set(['TEXT', 'NUMBER', 'DATE', 'BOOL', 'DICT'])

const filterPool = computed(() => {
  if (!schema.value) return []
  return schema.value.fields
    .filter((f) => FILTERABLE_TYPES.has(f.type))
    .map((f) => ({ field: f.name, label: f.label ?? f.name, type: f.type as string, op: 'EQ' }))
})

const filterCandidates = computed(() => {
  const persisted = persistedListConfig.value?.filters
  if (persisted?.length) {
    return persisted.map((f) => {
      const def = schema.value?.fields.find((sf) => sf.name === f.name)
      return {
        field: f.name,
        label: schema.value?.fields.find((sf) => sf.name === f.name)?.label ?? f.name,
        type: (def?.type ?? 'TEXT') as string,
        op: (f.op as 'EQ' | 'LIKE' | 'GE' | 'LE') ?? ('EQ' as const),
      }
    })
  }
  return filterPool.value
})

const filterPref = ref<string[] | null>(null)

function readFilterPref(key: string): string[] | null {
  const raw = globalThis.localStorage?.getItem(`${FILTER_PREF_PREFIX}${key}`)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : null
  } catch {
    return null
  }
}

/** 筛选栏实际渲染的字段：未设置偏好时维持原口径，设置后=候选 ∩ 偏好。 */
const queryableFields = computed(() => {
  if (filterPref.value === null) return filterFields.value
  const keep = new Set(filterPref.value)
  return filterFields.value.filter((f) => keep.has(f.field))
})

const draftQueryFields = ref<string[]>([])

function toggleQueryField(field: string, checked: boolean) {
  const set = new Set(draftQueryFields.value)
  if (checked) set.add(field)
  else set.delete(field)
  draftQueryFields.value = [...set]
  filterPref.value = [...set]
  globalThis.localStorage?.setItem(
    `${FILTER_PREF_PREFIX}${formKey.value}`,
    JSON.stringify([...set]),
  )
  // 不再可查询的字段：丢弃已填值，避免看不见的过滤条件
  for (const k of Object.keys(filterValues.value)) {
    if (!set.has(k)) delete filterValues.value[k]
  }
  if (dateFieldName.value && !set.has(dateFieldName.value)) dateRange.value = null
}

const isEmpty = computed(
  () =>
    !loading.value && !errorMsg.value && !loadError.value && (result.value?.list.length ?? 0) === 0,
)

/* ── 表头设置：哪些列展示 + 顺序（本机个人偏好，不落服务端） ── */

interface ColumnPref {
  hidden: string[]
  order: string[]
}

const COLUMN_PREF_PREFIX = 'sw:app-form-columns:'

function readColumnPref(key: string): ColumnPref {
  const raw = globalThis.localStorage?.getItem(`${COLUMN_PREF_PREFIX}${key}`)
  if (!raw) return { hidden: [], order: [] }
  try {
    const parsed = JSON.parse(raw) as Partial<ColumnPref>
    return {
      hidden: Array.isArray(parsed.hidden)
        ? parsed.hidden.filter((x): x is string => typeof x === 'string')
        : [],
      order: Array.isArray(parsed.order)
        ? parsed.order.filter((x): x is string => typeof x === 'string')
        : [],
    }
  } catch {
    // 损坏的本地偏好按「未调整」处理，不阻塞列表
    return { hidden: [], order: [] }
  }
}

const columnPref = ref<ColumnPref>({ hidden: [], order: [] })

/** 全部列按当前偏好排序（含被隐藏列，供设置面板保持位置稳定）。 */
const orderedColumns = computed(() => {
  const rest = new Map(columns.value.map((c) => [c.prop, c]))
  const ordered: typeof columns.value = []
  for (const prop of columnPref.value.order) {
    const col = rest.get(prop)
    if (col) {
      ordered.push(col)
      rest.delete(prop)
    }
  }
  for (const col of columns.value) {
    if (rest.has(col.prop)) {
      ordered.push(col)
      rest.delete(col.prop)
    }
  }
  return ordered
})

const displayColumns = computed(() =>
  orderedColumns.value.filter((c) => !columnPref.value.hidden.includes(c.prop)),
)

const columnDrawerVisible = ref(false)
const draftColumns = ref<Array<{ prop: string; label: string; visible: boolean }>>([])
/** 拖拽状态：仅允许通过 ≡ 手柄发起拖拽（0.1.7 #23） */
const dragArmedIndex = ref<number | null>(null)
const dragFromIndex = ref<number | null>(null)

function openColumnSettings() {
  draftColumns.value = orderedColumns.value.map((c) => ({
    prop: c.prop,
    label: c.label,
    visible: !columnPref.value.hidden.includes(c.prop),
  }))
  draftQueryFields.value = filterPref.value ?? filterFields.value.map((f) => f.field)
  columnDrawerVisible.value = true
}

/** 勾选/拖拽即时持久化（抽屉无确认按钮，改动即生效）。 */
function applyColumnSettings() {
  if (!draftColumns.value.some((c) => c.visible)) {
    ElMessage.warning(t('form.appCenter.columnRequired'))
    return
  }
  const next: ColumnPref = {
    order: draftColumns.value.map((c) => c.prop),
    hidden: draftColumns.value.filter((c) => !c.visible).map((c) => c.prop),
  }
  columnPref.value = next
  globalThis.localStorage?.setItem(`${COLUMN_PREF_PREFIX}${formKey.value}`, JSON.stringify(next))
}

function toggleDraftColumn(index: number, visible: boolean) {
  const col = draftColumns.value[index]
  if (!col) return
  if (!visible && draftColumns.value.filter((c) => c.visible).length <= 1) {
    ElMessage.warning(t('form.appCenter.columnRequired'))
    return
  }
  col.visible = visible
  applyColumnSettings()
}

function armColumnDrag(index: number) {
  dragArmedIndex.value = index
}

/** 结构类型口径（dnd.ts 同因）：.vue 内不直书 DOM 全局名，真实 DragEvent 结构化匹配。 */
function onColumnDragStart(
  index: number,
  event: {
    dataTransfer: { setData: (format: string, data: string) => void } | null
    preventDefault: () => void
  },
) {
  if (dragArmedIndex.value !== index) {
    event.preventDefault()
    return
  }
  dragFromIndex.value = index
  event.dataTransfer?.setData('text/plain', String(index))
}

function onColumnDrop(index: number) {
  const from = dragFromIndex.value
  dragArmedIndex.value = null
  if (from === null || from === index) return
  const next = draftColumns.value.slice()
  const [moved] = next.splice(from, 1)
  if (!moved) return
  next.splice(index, 0, moved)
  draftColumns.value = next
  applyColumnSettings()
}

function onColumnDragEnd() {
  dragArmedIndex.value = null
  dragFromIndex.value = null
}

async function loadDefinition() {
  try {
    schema.value = await getFormDefinition(formKey.value)
    try {
      const def = await getFormDef(formKey.value)
      if (def?.id) persistedListConfig.value = await getListConfig(def.id)
    } catch {
      persistedListConfig.value = null
    }
    for (const f of filterCandidates.value) {
      if (f.type === 'DATE') dateFieldName.value = f.field
    }
  } catch {
    schema.value = null
  } finally {
    schemaLoaded.value = true
  }
}

async function loadData() {
  if (!canQuery.value) return
  loading.value = true
  errorMsg.value = ''
  loadError.value = null
  try {
    const filters: QueryFilter[] = []
    for (const [field, value] of Object.entries(filterValues.value)) {
      if (!value) continue
      const f = filterCandidates.value.find((ff) => ff.field === field)
      filters.push({ field, op: (f?.op as 'EQ' | 'LIKE' | 'GE' | 'LE') ?? 'EQ', value })
    }
    if (dateRange.value && dateRange.value[0]) {
      filters.push({ field: dateFieldName.value, op: 'GE', value: dateRange.value[0] })
    }
    if (dateRange.value && dateRange.value[1]) {
      filters.push({ field: dateFieldName.value, op: 'LE', value: dateRange.value[1] })
    }
    // 按当前 formKey 重新取数：分页/刷新不混入其他表单数据
    result.value = await queryFormData(formKey.value, {
      pageNum: pageNum.value,
      pageSize: pageSize.value,
      filters,
    })
    void resolveRowIdLabels()
  } catch (err: unknown) {
    loadError.value = err instanceof ApiError ? err : null
    errorMsg.value = loadError.value ? '' : t('form.queryFailed', { msg: String(err) })
    result.value = null
  } finally {
    loading.value = false
  }
}

async function resolveRowIdLabels() {
  const cols = columns.value.filter((c) => c.type === 'USER' || c.type === 'DEPT')
  if (cols.length === 0 || !result.value?.list?.length) {
    idLabelMaps.value = cols.length === 0 ? null : idLabelMaps.value
    return
  }
  const userIds = new Set<string>()
  const deptIds = new Set<string>()
  for (const row of result.value.list) {
    for (const col of cols) {
      const rawText = row[col.prop] == null ? '' : String(row[col.prop])
      if (!rawText) continue
      const ids: string[] = []
      if (rawText.trim().startsWith('[')) {
        try {
          const decoded = JSON.parse(rawText)
          if (Array.isArray(decoded)) ids.push(...decoded.map((x) => String(x)))
        } catch {
          ids.push(rawText)
        }
      } else {
        ids.push(...rawText.split(','))
      }
      for (const id of ids) {
        const trimmed = id.trim().replace(/^#/, '')
        if (/^\d{1,19}$/.test(trimmed)) (col.type === 'USER' ? userIds : deptIds).add(trimmed)
      }
    }
  }
  const next = { user: new Map<string, string>(), dept: new Map<string, string>() }
  try {
    if (userIds.size > 0 || deptIds.size > 0) {
      const [users, depts] = await Promise.all([
        userIds.size > 0
          ? (await import('@/modules/form/api/i2-choices')).loadUserChoices().catch(() => [])
          : Promise.resolve([] as { id: string; label: string }[]),
        deptIds.size > 0
          ? (await import('@/modules/form/api/i2-choices')).loadDeptChoices().catch(() => [])
          : Promise.resolve([] as { id: string; label: string }[]),
      ])
      for (const u of users) {
        if (userIds.has(u.id)) next.user.set(u.id, u.label)
      }
      for (const d of depts) {
        if (deptIds.has(d.id)) next.dept.set(d.id, d.label.replace(/^\u3000+/, ''))
      }
    }
    idLabelMaps.value = next
  } catch {
    idLabelMaps.value = null
  }
}

function handlePageNumChange(p: number) {
  pageNum.value = p
  void loadData()
}

function handlePageSizeChange(s: number) {
  pageSize.value = s
  pageNum.value = 1
  void loadData()
}

function handleQuery() {
  pageNum.value = 1
  void loadData()
}

function handleReset() {
  filterValues.value = {}
  dateRange.value = null
  pageNum.value = 1
  void loadData()
}

function handleView(row: Record<string, unknown>) {
  router.push({
    name: 'form-render',
    params: { formKey: formKey.value },
    query: { recordId: String(row.id ?? ''), mode: 'view', from: 'app-form' },
  })
}

function handleEdit(row: Record<string, unknown>) {
  router.push({
    name: 'form-render',
    params: { formKey: formKey.value },
    query: { recordId: String(row.id ?? ''), mode: 'edit', from: 'app-form' },
  })
}

function handleCreate() {
  router.push({
    name: 'form-render',
    params: { formKey: formKey.value },
    query: { from: 'app-form' },
  })
}

function rowActions(r: unknown): ListAction[] {
  const row = r as Record<string, unknown>
  const actions: ListAction[] = [
    { key: 'view', label: t('common.view'), onClick: () => handleView(row) },
  ]
  if (canEdit.value) {
    actions.push({ key: 'edit', label: t('common.edit'), onClick: () => handleEdit(row) })
  }
  return actions
}

function formatCellValue(
  row: Record<string, unknown>,
  col: { prop: string; type: string; dictType?: string },
): string {
  const raw = row[col.prop]
  if (raw === null || raw === undefined) return '-'
  switch (col.type) {
    case 'BOOL':
      return raw === 1 || raw === true || raw === '1' ? t('common.yes') : t('common.no')
    case 'USER':
    case 'DEPT': {
      const rawText = String(raw)
      let ids: string[] = []
      if (rawText.trim().startsWith('[')) {
        try {
          const decoded = JSON.parse(rawText)
          if (Array.isArray(decoded)) ids = decoded.map((x) => String(x).trim()).filter(Boolean)
        } catch {
          ids = []
        }
      }
      if (ids.length === 0)
        ids = rawText
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean)
      const map = col.type === 'USER' ? idLabelMaps.value?.user : idLabelMaps.value?.dept
      if (!map) return rawText || '-'
      const parts = ids.map((id) => map.get(id) ?? `#${id.replace(/^#/, '')}`)
      return parts.length ? parts.join('、') : '-'
    }
    default:
      return String(raw)
  }
}

function backToApp() {
  if (appId.value) {
    void router.push({ name: 'form-app-center-detail', params: { appId: appId.value } })
  } else {
    void router.push({ name: 'form-app-center' })
  }
}

/** 切换表单（应用内页选择另一个表单）时重建定义、列偏好与数据。 */
async function reload() {
  pageNum.value = 1
  result.value = null
  filterValues.value = {}
  dateRange.value = null
  schema.value = null
  schemaLoaded.value = false
  idLabelMaps.value = null
  columnPref.value = readColumnPref(formKey.value)
  filterPref.value = readFilterPref(formKey.value)
  columnDrawerVisible.value = false
  await loadDefinition()
  if (canQuery.value) {
    await loadData()
  }
}

watch(formKey, () => {
  void reload()
})

onMounted(async () => {
  columnPref.value = readColumnPref(formKey.value)
  filterPref.value = readFilterPref(formKey.value)
  await loadDefinition()
  if (canQuery.value) {
    await loadData()
  }
})
</script>

<template>
  <div class="afd">
    <!-- 0.1.7 #22：返回入口统一为左上角圆角箭头（仅深链/独立页渲染；嵌入态由宿主页提供） -->
    <div v-if="!embedded" class="afd__back-row">
      <button
        type="button"
        class="afd__back"
        data-testid="form-data-back"
        :title="t('common.backShort')"
        @click="backToApp"
      >
        <el-icon><ArrowLeft /></el-icon>
      </button>
    </div>
    <StandardListTemplate
      :total="result?.total ?? 0"
      :page-num="pageNum"
      :page-size="pageSize"
      :empty="isEmpty"
      @update:page-num="handlePageNumChange"
      @update:page-size="handlePageSizeChange"
    >
      <!-- 筛选栏（有查询权限时可用） -->
      <template v-if="canQuery" #filter>
        <template v-for="ff in queryableFields" :key="ff.field">
          <el-input
            v-if="ff.type === 'TEXT' || ff.type === 'NUMBER'"
            v-model="filterValues[ff.field]"
            :placeholder="ff.label"
            clearable
            style="width: 180px"
            @keyup.enter="handleQuery"
          />
          <el-select
            v-else-if="ff.type === 'BOOL'"
            v-model="filterValues[ff.field]"
            :placeholder="ff.label"
            clearable
            style="width: 120px"
          >
            <el-option :label="t('common.yes')" value="1" />
            <el-option :label="t('common.no')" value="0" />
          </el-select>
          <DictSelect
            v-else-if="ff.type === 'DICT'"
            v-model="filterValues[ff.field]"
            :type="ff.dictType ?? ''"
            :placeholder="ff.label"
            size="default"
          />
          <el-date-picker
            v-else-if="ff.type === 'DATE'"
            v-model="dateRange"
            type="daterange"
            :range-separator="t('common.to')"
            :start-placeholder="t('common.startDate')"
            :end-placeholder="t('common.endDate')"
            value-format="YYYY-MM-DD"
            style="width: 240px"
          />
        </template>
      </template>
      <template v-if="canQuery" #filter-actions>
        <el-button data-testid="form-data-create" @click="handleCreate">{{
          t('form.appCenter.createRecord')
        }}</el-button>
        <el-button type="primary" @click="handleQuery">{{ t('common.query') }}</el-button>
        <el-button @click="handleReset">{{ t('common.reset') }}</el-button>
      </template>

      <!-- 无查询权限：明确受限态，保留已获授权的填写/发起入口 -->
      <div v-if="!canQuery" class="data-forbidden" data-testid="data-forbidden">
        <p class="data-forbidden__title">{{ t('form.appCenter.dataForbiddenTitle') }}</p>
        <p class="data-forbidden__desc">{{ t('form.appCenter.dataForbiddenDesc') }}</p>
        <el-button type="primary" data-testid="form-data-create" @click="handleCreate">{{
          t('form.appCenter.createRecord')
        }}</el-button>
      </div>

      <LoadErrorState v-else-if="loadError" :error="loadError" @retry="loadData" />

      <template v-else>
        <el-table
          v-loading="loading"
          :data="result?.list ?? []"
          stripe
          style="width: 100%"
          :show-overflow-tooltip="true"
        >
          <el-table-column
            v-for="col in displayColumns"
            :key="col.prop"
            :prop="col.prop"
            :label="col.label"
            :min-width="col.type === 'DICT' || col.type === 'BOOL' ? 100 : 140"
            show-overflow-tooltip
          >
            <template #default="{ row }">
              <DictTag
                v-if="col.type === 'DICT' && col.dictType"
                :type="col.dictType"
                :value="String(row[col.prop] ?? '')"
              />
              <el-tag
                v-else-if="col.type === 'BOOL'"
                :type="row[col.prop] === 1 || row[col.prop] === true ? 'success' : 'info'"
                size="small"
              >
                {{ formatCellValue(row, col) }}
              </el-tag>
              <span v-else>{{ formatCellValue(row, col) }}</span>
            </template>
          </el-table-column>

          <ListActionsColumn :actions="rowActions" :width="150">
            <template #header>
              <!-- 0.1.7 #28：≡ 合并进操作列表头右侧（Owner 回归裁决：不单列） -->
              <span class="afd__cols-head">
                {{ t('common.actions') }}
                <button
                  v-if="columns.length > 0"
                  type="button"
                  class="afd__cols-trigger"
                  data-testid="form-column-settings"
                  :title="t('form.appCenter.columnSettings')"
                  @click.stop="openColumnSettings"
                >
                  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                    <rect x="1" y="3" width="14" height="1.6" rx="0.8" fill="currentColor" />
                    <rect x="1" y="7.2" width="14" height="1.6" rx="0.8" fill="currentColor" />
                    <rect x="1" y="11.4" width="14" height="1.6" rx="0.8" fill="currentColor" />
                  </svg>
                </button>
              </span>
            </template>
          </ListActionsColumn>
        </el-table>
      </template>
    </StandardListTemplate>

    <!-- 0.1.7 #23：表头设置 = 右侧抽屉；字段按当前顺序排列，右侧「显示」勾选 + ≡ 手柄拖拽排序，改动即时生效 -->
    <el-drawer
      v-model="columnDrawerVisible"
      :title="t('form.appCenter.columnSettings')"
      direction="rtl"
      size="320px"
      append-to-body
    >
      <p class="afd-cols__section">{{ t('form.appCenter.sectionColumns') }}</p>
      <ul class="afd-cols" data-testid="column-settings-list">
        <li
          v-for="(col, index) in draftColumns"
          :key="col.prop"
          class="afd-cols__row"
          draggable="true"
          @dragstart="onColumnDragStart(index, $event)"
          @dragover.prevent
          @drop="onColumnDrop(index)"
          @dragend="onColumnDragEnd"
        >
          <span class="afd-cols__label">{{ col.label }}</span>
          <span class="afd-cols__ops">
            <el-checkbox
              :model-value="col.visible"
              size="small"
              :title="t('form.appCenter.columnShow')"
              :aria-label="t('form.appCenter.columnShow')"
              @update:model-value="toggleDraftColumn(index, Boolean($event))"
            />
            <span
              class="afd-cols__handle"
              :title="t('form.appCenter.columnDragHint')"
              @mousedown="armColumnDrag(index)"
            >
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                <rect x="1" y="3" width="14" height="1.6" rx="0.8" fill="currentColor" />
                <rect x="1" y="7.2" width="14" height="1.6" rx="0.8" fill="currentColor" />
                <rect x="1" y="11.4" width="14" height="1.6" rx="0.8" fill="currentColor" />
              </svg>
            </span>
          </span>
        </li>
      </ul>

      <!-- 0.1.7 #28：勾选哪些字段出现在筛选栏（本机偏好，即时生效） -->
      <template v-if="filterCandidates.length > 0">
        <p class="afd-cols__section">{{ t('form.appCenter.sectionFilters') }}</p>
        <ul class="afd-cols" data-testid="filter-settings-list">
          <li v-for="ff in filterCandidates" :key="ff.field" class="afd-cols__row">
            <span class="afd-cols__label">{{ ff.label }}</span>
            <el-checkbox
              :model-value="draftQueryFields.includes(ff.field)"
              size="small"
              :title="t('common.query')"
              :aria-label="t('common.query')"
              @update:model-value="toggleQueryField(ff.field, Boolean($event))"
            />
          </li>
        </ul>
      </template>
    </el-drawer>
  </div>
</template>

<style scoped>
.data-forbidden {
  padding: 24px 0;
  color: #606266;
}
.data-forbidden__title {
  font-size: 15px;
  font-weight: 600;
  margin: 0 0 6px;
}
.data-forbidden__desc {
  font-size: 13px;
  color: #909399;
  margin: 0 0 12px;
}
.afd__back-row {
  padding: 8px 16px 0;
}
.afd__back {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--sw-border-base, #dcdfe6);
  border-radius: 50%;
  background: #fff;
  color: var(--sw-text-regular, #606266);
  cursor: pointer;
}
.afd__back:hover {
  color: var(--el-color-primary);
  border-color: var(--el-color-primary-light-7, #c6e2ff);
  background: var(--el-color-primary-light-9, #ecf5ff);
}
.afd__cols-head {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  white-space: nowrap;
}
.afd__cols-trigger {
  display: inline-flex;
  padding: 2px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--sw-text-secondary, #909399);
  cursor: pointer;
}
.afd__cols-trigger:hover {
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9, #ecf5ff);
}
.afd-cols__section {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--sw-text-regular, #606266);
}
.afd-cols__section + .afd-cols {
  margin-bottom: 16px;
}
.afd-cols {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.afd-cols__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  background: #fafbfe;
}
.afd-cols__row:hover {
  background: #f0f4fb;
}
.afd-cols__label {
  font-size: 13px;
  color: var(--sw-text-primary, #303133);
}
.afd-cols__ops {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}
.afd-cols__handle {
  display: inline-flex;
  padding: 2px;
  color: #909399;
  cursor: grab;
}
.afd-cols__handle:active {
  cursor: grabbing;
}
</style>
