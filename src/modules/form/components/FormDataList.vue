<script setup lang="ts">
/* global Event, HTMLInputElement, URL, document */
/**
 * FormDataList — 表单数据列表唯一实现。
 *
 * 管理端表单数据页与用户端应用数据页共用本组件，页面只保留各自的导航外壳。
 * 入口显隐统一按权限判定：查询/新增/编辑/删除/模板/导入/导出。
 */
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { MoreFilled } from '@element-plus/icons-vue'
import {
  StandardListTemplate,
  LoadErrorState,
  ListActionsColumn,
  ListFilterItem,
} from '@/components/page-layout'
import type { ListAction } from '@/components/page-layout/ListActionsColumn.vue'
import DictSelect from '@/foundation/dict/DictSelect.vue'
import DictTag from '@/foundation/dict/DictTag.vue'
import {
  getFormDefinition,
  getFormDef,
  queryFormData,
  deleteFormData,
  downloadFormTemplate,
  importFormData,
  exportFormData,
  type QueryFilter,
} from '@/modules/form/api/form'
import { usePermission } from '@/foundation/permission'
import { deriveColumns } from '@/modules/form/utils/derive-list-config'
import { getListConfig } from '@/modules/form/api/i2-choices'
import { ApiError } from '@/foundation/request'
import { getErrorMessage } from '@/foundation/request/error-code-map'
import BusinessDetailDialog from '@/components/business-detail/BusinessDetailDialog.vue'
import type { FormSchema } from '@/contracts/form-schema'
import type { PageResult } from '@/contracts/common'
import { useI18n } from '@/locales'

const props = defineProps<{ formKey: string }>()

interface ListColumn {
  prop: string
  label: string
  type: string
  dictType?: string
}

interface FilterField {
  field: string
  label: string
  type: string
  op: 'EQ' | 'LIKE' | 'GE' | 'LE'
  dictType?: string
}

interface ColumnPref {
  hidden: string[]
  order: string[]
}

const { t } = useI18n()
const { hasPerm } = usePermission()
const router = useRouter()

const canQuery = computed(() => hasPerm('form:data:query'))
const canSubmit = computed(() => hasPerm('form:data:submit'))
const canEdit = computed(() => hasPerm('form:data:edit'))
const canDelete = computed(() => hasPerm('form:data:delete'))
const canTemplate = computed(() => hasPerm('form:data:template'))
const canImport = computed(() => hasPerm('form:data:import'))
const canExport = computed(() => hasPerm('form:data:export'))

const loading = ref(false)
const errorMsg = ref('')
const loadError = ref<ApiError | null>(null)
const schema = ref<FormSchema | null>(null)
const result = ref<PageResult<Record<string, unknown>> | null>(null)
const pageNum = ref(1)
const pageSize = ref(10)
const idLabelMaps = ref<{ user: Map<string, string>; dept: Map<string, string> } | null>(null)

const persistedListConfig = ref<Awaited<ReturnType<typeof getListConfig>>>(null)

const columns = computed<ListColumn[]>(() => {
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

/** 可查询字段池：服务端持久化筛选优先，未配置时按 definition 全量派生。 */
const filterCandidates = computed<FilterField[]>(() => {
  if (schema.value && persistedListConfig.value?.filters?.length) {
    return persistedListConfig.value.filters.map((f) => {
      const def = schema.value?.fields.find((sf) => sf.name === f.name)
      return {
        field: f.name,
        label: def?.label ?? f.name,
        type: def?.type ?? 'TEXT',
        op: (f.op as FilterField['op']) ?? 'EQ',
        dictType: def?.type === 'DICT' ? def.dictType : undefined,
      }
    })
  }
  if (!schema.value) return []
  const filterable = new Set(['TEXT', 'NUMBER', 'DATE', 'BOOL', 'DICT'])
  const opOf = (type: string): FilterField['op'] => (type === 'TEXT' ? 'LIKE' : 'EQ')
  return schema.value.fields
    .filter((field) => filterable.has(field.type))
    .map((field) => ({
      field: field.name,
      label: field.label ?? field.name,
      type: field.type,
      op: opOf(field.type),
      dictType: field.type === 'DICT' ? field.dictType : undefined,
    }))
})

const filterValues = ref<Record<string, string>>({})
const dateRange = ref<[string, string] | null>(null)
const dateFieldName = ref('')

/* ── 筛选字段本机偏好 ── */

const FILTER_PREF_PREFIX = 'sw:app-form-filters:'

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

const filterPref = ref<string[] | null>(null)

/** 筛选栏实际渲染的字段：未设置偏好时维持原口径，设置后=候选 ∩ 偏好。 */
const queryableFields = computed(() => {
  if (filterPref.value === null) return filterCandidates.value
  const keep = new Set(filterPref.value)
  return filterCandidates.value.filter((f) => keep.has(f.field))
})

const draftQueryFields = ref<string[]>([])

function toggleQueryField(field: string, checked: boolean) {
  const set = new Set(draftQueryFields.value)
  if (checked) set.add(field)
  else set.delete(field)
  draftQueryFields.value = [...set]
  filterPref.value = [...set]
  globalThis.localStorage?.setItem(
    `${FILTER_PREF_PREFIX}${props.formKey}`,
    JSON.stringify([...set]),
  )
  for (const key of Object.keys(filterValues.value)) {
    if (!set.has(key)) delete filterValues.value[key]
  }
  if (dateFieldName.value && !set.has(dateFieldName.value)) dateRange.value = null
}

const isEmpty = computed(
  () =>
    !loading.value && !errorMsg.value && !loadError.value && (result.value?.list.length ?? 0) === 0,
)

/* ── 表头设置：哪些列展示 + 顺序（本机个人偏好，不落服务端） ── */

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
    return { hidden: [], order: [] }
  }
}

const columnPref = ref<ColumnPref>({ hidden: [], order: [] })

const orderedColumns = computed(() => {
  const rest = new Map(columns.value.map((c) => [c.prop, c]))
  const ordered: ListColumn[] = []
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
const dragArmedIndex = ref<number | null>(null)
const dragFromIndex = ref<number | null>(null)

function openColumnSettings() {
  draftColumns.value = orderedColumns.value.map((c) => ({
    prop: c.prop,
    label: c.label,
    visible: !columnPref.value.hidden.includes(c.prop),
  }))
  draftQueryFields.value = filterPref.value ?? filterCandidates.value.map((f) => f.field)
  columnDrawerVisible.value = true
}

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
  globalThis.localStorage?.setItem(`${COLUMN_PREF_PREFIX}${props.formKey}`, JSON.stringify(next))
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

/* ── 定义与数据 ── */

async function loadDefinition() {
  try {
    schema.value = await getFormDefinition(props.formKey)
    try {
      const def = await getFormDef(props.formKey)
      if (def?.id) persistedListConfig.value = await getListConfig(def.id)
    } catch {
      persistedListConfig.value = null
    }
    dateFieldName.value = filterCandidates.value.find((f) => f.type === 'DATE')?.field ?? ''
  } catch {
    schema.value = null
    errorMsg.value = t('form.definitionEndpointPending')
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
      const def = filterCandidates.value.find((f) => f.field === field)
      filters.push({ field, op: def?.op ?? 'EQ', value })
    }
    if (dateRange.value?.[0]) {
      filters.push({ field: dateFieldName.value, op: 'GE', value: dateRange.value[0] })
    }
    if (dateRange.value?.[1]) {
      filters.push({ field: dateFieldName.value, op: 'LE', value: dateRange.value[1] })
    }
    result.value = await queryFormData(props.formKey, {
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

/** 按当前页收集 USER/DEPT 列 ID，解析可读名；取不到的字段回退原值。 */
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
        const trimmedId = id.trim().replace(/^#/, '')
        if (/^\d{1,19}$/.test(trimmedId)) {
          ;(col.type === 'USER' ? userIds : deptIds).add(trimmedId)
        }
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

async function reload() {
  pageNum.value = 1
  result.value = null
  filterValues.value = {}
  dateRange.value = null
  schema.value = null
  idLabelMaps.value = null
  persistedListConfig.value = null
  errorMsg.value = ''
  loadError.value = null
  columnPref.value = readColumnPref(props.formKey)
  filterPref.value = readFilterPref(props.formKey)
  columnDrawerVisible.value = false
  await loadDefinition()
  if (canQuery.value) await loadData()
}

watch(
  () => props.formKey,
  () => void reload(),
  { immediate: true },
)

/* ── 分页与筛选操作 ── */

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

/* ── 行操作 ── */

const detailVisible = ref(false)
const detailRecordId = ref('')

function handleView(row: Record<string, unknown>) {
  detailRecordId.value = String(row.id ?? '')
  detailVisible.value = true
}

function handleEdit(row: Record<string, unknown>) {
  void router.push({
    name: 'form-render',
    params: { formKey: props.formKey },
    query: { recordId: String(row.id ?? ''), mode: 'edit' },
  })
}

function handleCreate() {
  void router.push({
    name: 'form-render',
    params: { formKey: props.formKey },
    query: { from: 'form-data' },
  })
}

async function handleDelete(row: Record<string, unknown>) {
  try {
    await ElMessageBox.confirm(t('form.deleteRecordConfirm'), t('common.deleteConfirmTitle'), {
      get confirmButtonText() {
        return t('common.confirm')
      },
      get cancelButtonText() {
        return t('common.cancel')
      },
      type: 'warning',
    })
  } catch {
    return
  }

  try {
    await deleteFormData(props.formKey, String(row.id))
    ElMessage.success(t('common.deleteSuccess'))
    await loadData()
  } catch (err: unknown) {
    const errObj = err as { code?: number; message?: string }
    ElMessage.error(getErrorMessage(errObj.code ?? 0, errObj.message))
  }
}

function rowActions(r: unknown): ListAction[] {
  const row = r as Record<string, unknown>
  const actions: ListAction[] = [
    { key: 'view', label: t('common.view'), onClick: () => handleView(row) },
  ]
  if (canEdit.value) {
    actions.push({ key: 'edit', label: t('common.edit'), onClick: () => handleEdit(row) })
  }
  if (canDelete.value) {
    actions.push({
      key: 'delete',
      label: t('common.delete'),
      type: 'danger',
      onClick: () => void handleDelete(row),
    })
  }
  return actions
}

function formatCellValue(row: Record<string, unknown>, col: ListColumn): string {
  const raw = row[col.prop]
  if (raw === null || raw === undefined) return '-'

  switch (col.type) {
    case 'BOOL':
      return raw === 1 || raw === true || raw === '1' ? t('common.yes') : t('common.no')
    case 'DATE':
      return String(raw)
    case 'REFERENCE':
      return String(raw)
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
      if (ids.length === 0) {
        ids = rawText
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean)
      }
      const map = col.type === 'USER' ? idLabelMaps.value?.user : idLabelMaps.value?.dept
      if (!map) return rawText || '-'
      const parts = ids.map((id) => map.get(id) ?? `#${id.replace(/^#/, '')}`)
      return parts.length ? parts.join('、') : '-'
    }
    default:
      return String(raw)
  }
}

/* ── 模板 / 导入 / 导出 ── */

async function handleDownloadTemplate() {
  try {
    const blob = await downloadFormTemplate(props.formKey)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${props.formKey}_template.xlsx`
    document.body.appendChild(a)
    a.click()
    URL.revokeObjectURL(url)
    document.body.removeChild(a)
    ElMessage.success(t('form.templateDownloaded'))
  } catch (err: unknown) {
    const errObj = err as { code?: number; message?: string }
    ElMessage.error(
      t('form.templateDownloadFailed', {
        msg: getErrorMessage(errObj.code ?? 0, errObj.message),
      }),
    )
  }
}

const fileInputRef = ref<HTMLInputElement | null>(null)
const importLoading = ref(false)
const importResultVisible = ref(false)
const importResult = ref<{
  totalRows: number
  successCount: number
  errorCount: number
  errors: Array<{ rowNum: number; message: string }>
  processing: number
} | null>(null)

const importProcessingCount = computed(() => importResult.value?.processing ?? 0)

function handleImportClick() {
  fileInputRef.value?.click()
}

function handleDataTool(command: string) {
  if (command === 'template') void handleDownloadTemplate()
  else if (command === 'import') handleImportClick()
  else if (command === 'export') void handleExport()
}

async function handleFileChange(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  if (!file.name.endsWith('.xlsx')) {
    ElMessage.error(t('form.importSelectXlsx'))
    return
  }

  importLoading.value = true
  importResult.value = null
  try {
    const result = await importFormData(props.formKey, file)
    importResult.value = result
    importResultVisible.value = true
    if (result.errorCount === 0) {
      ElMessage.success(t('form.importSucceeded', { successCount: result.successCount }))
      await loadData()
    } else {
      ElMessage.warning(
        t('form.importCompletedWithErrors', {
          successCount: result.successCount,
          errorCount: result.errorCount,
        }),
      )
    }
  } catch (err: unknown) {
    const errObj = err as { code?: number; message?: string }
    ElMessage.error(
      t('form.importFailed', { msg: getErrorMessage(errObj.code ?? 0, errObj.message) }),
    )
  } finally {
    importLoading.value = false
    if (fileInputRef.value) fileInputRef.value.value = ''
  }
}

const exportLoading = ref(false)

async function handleExport() {
  exportLoading.value = true
  try {
    const filters: QueryFilter[] = []
    for (const [field, value] of Object.entries(filterValues.value)) {
      if (!value) continue
      const def = filterCandidates.value.find((f) => f.field === field)
      filters.push({ field, op: def?.op ?? 'EQ', value })
    }
    if (dateRange.value?.[0]) {
      filters.push({ field: dateFieldName.value, op: 'GE', value: dateRange.value[0] })
    }
    if (dateRange.value?.[1]) {
      filters.push({ field: dateFieldName.value, op: 'LE', value: dateRange.value[1] })
    }
    const blob = await exportFormData(props.formKey, {
      pageNum: 1,
      pageSize: 1000,
      filters,
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${props.formKey}_data.xlsx`
    document.body.appendChild(a)
    a.click()
    URL.revokeObjectURL(url)
    document.body.removeChild(a)
    ElMessage.success(t('form.exported'))
  } catch (err: unknown) {
    const errObj = err as { code?: number; message?: string }
    ElMessage.error(
      t('form.exportFailed', { msg: getErrorMessage(errObj.code ?? 0, errObj.message) }),
    )
  } finally {
    exportLoading.value = false
  }
}
</script>

<template>
  <div class="form-data-list">
    <StandardListTemplate
      v-if="canQuery"
      :total="result?.total ?? 0"
      :page-num="pageNum"
      :page-size="pageSize"
      :empty="isEmpty"
      @update:page-num="handlePageNumChange"
      @update:page-size="handlePageSizeChange"
    >
      <template #filter>
        <ListFilterItem v-for="ff in queryableFields" :key="ff.field" :label="ff.label">
          <el-input
            v-if="ff.type === 'TEXT' || ff.type === 'NUMBER'"
            v-model="filterValues[ff.field]"
            :placeholder="t('common.pleaseInput')"
            clearable
            @keyup.enter="handleQuery"
          />
          <el-select
            v-else-if="ff.type === 'BOOL'"
            v-model="filterValues[ff.field]"
            :placeholder="t('common.all')"
            clearable
          >
            <el-option :label="t('common.yes')" value="1" />
            <el-option :label="t('common.no')" value="0" />
          </el-select>
          <DictSelect
            v-else-if="ff.type === 'DICT'"
            v-model="filterValues[ff.field]"
            :type="ff.dictType ?? ''"
            :placeholder="t('common.all')"
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
          />
        </ListFilterItem>
      </template>

      <template #filter-actions>
        <el-button v-if="canSubmit" data-testid="form-data-create" @click="handleCreate">{{
          t('form.appCenter.createRecord')
        }}</el-button>
        <el-button type="primary" @click="handleQuery">{{ t('common.query') }}</el-button>
        <el-button @click="handleReset">{{ t('common.reset') }}</el-button>
      </template>

      <el-alert v-if="errorMsg" :title="errorMsg" type="error" :closable="false" show-icon />

      <LoadErrorState v-if="loadError" :error="loadError" @retry="loadData" />

      <template v-else>
        <div class="form-data-list__table-shell">
          <el-dropdown
            v-if="canTemplate || canImport || canExport"
            trigger="click"
            class="form-data-list__more"
            @command="handleDataTool"
          >
            <button
              type="button"
              class="form-data-list__more-trigger"
              :title="t('common.moreActions')"
            >
              <el-icon><MoreFilled /></el-icon>
            </button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item v-if="canTemplate" command="template">
                  {{ t('form.downloadTemplate') }}
                </el-dropdown-item>
                <el-dropdown-item v-if="canImport" command="import">
                  {{ t('common.import') }}
                </el-dropdown-item>
                <el-dropdown-item v-if="canExport" command="export">
                  {{ t('common.export') }}
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
          <input
            ref="fileInputRef"
            type="file"
            accept=".xlsx"
            style="display: none"
            @change="handleFileChange"
          />
          <button
            v-if="columns.length > 0"
            type="button"
            class="form-data-list__cols-trigger"
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

            <ListActionsColumn :actions="rowActions" :width="150" />
          </el-table>
        </div>
      </template>
    </StandardListTemplate>

    <!-- 无查询权限：明确受限态，保留已获授权的填写入口 -->
    <div v-else class="form-data-list__forbidden">
      <div class="data-forbidden" data-testid="data-forbidden">
        <p class="data-forbidden__title">{{ t('form.appCenter.dataForbiddenTitle') }}</p>
        <p class="data-forbidden__desc">{{ t('form.appCenter.dataForbiddenDesc') }}</p>
        <el-button
          v-if="canSubmit"
          type="primary"
          data-testid="form-data-create"
          @click="handleCreate"
        >
          {{ t('form.appCenter.createRecord') }}
        </el-button>
      </div>
    </div>

    <!-- 表头/筛选设置：字段顺序、显示与筛选栏字段，改动即时生效 -->
    <el-drawer
      v-model="columnDrawerVisible"
      :title="t('form.appCenter.columnSettings')"
      direction="rtl"
      size="320px"
      append-to-body
    >
      <p class="form-data-list__drawer-section">{{ t('form.appCenter.sectionColumns') }}</p>
      <ul class="form-data-list__cols" data-testid="column-settings-list">
        <li
          v-for="(col, index) in draftColumns"
          :key="col.prop"
          class="form-data-list__col-row"
          draggable="true"
          @dragstart="onColumnDragStart(index, $event)"
          @dragover.prevent
          @drop="onColumnDrop(index)"
          @dragend="onColumnDragEnd"
        >
          <span class="form-data-list__col-label">{{ col.label }}</span>
          <span class="form-data-list__col-ops">
            <el-checkbox
              :model-value="col.visible"
              size="small"
              :title="t('form.appCenter.columnShow')"
              :aria-label="t('form.appCenter.columnShow')"
              @update:model-value="toggleDraftColumn(index, Boolean($event))"
            />
            <span
              class="form-data-list__col-handle"
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

      <template v-if="filterCandidates.length > 0">
        <p class="form-data-list__drawer-section">{{ t('form.appCenter.sectionFilters') }}</p>
        <ul class="form-data-list__cols" data-testid="filter-settings-list">
          <li v-for="ff in filterCandidates" :key="ff.field" class="form-data-list__col-row">
            <span class="form-data-list__col-label">{{ ff.label }}</span>
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

    <BusinessDetailDialog
      v-model="detailVisible"
      :form-key="formKey"
      :record-id="detailRecordId"
      :title="t('common.detail')"
    />

    <!-- 导入结果：总量/成功/失败/处理中 + 逐行安全明细 -->
    <el-dialog v-model="importResultVisible" :title="t('form.importResultTitle')" width="620px">
      <el-descriptions :column="4" border>
        <el-descriptions-item :label="t('form.importTotalRows')">
          <span data-testid="import-result-total">{{ importResult?.totalRows ?? 0 }}</span>
        </el-descriptions-item>
        <el-descriptions-item :label="t('common.resultSuccess')">
          <span data-testid="import-result-success">{{ importResult?.successCount ?? 0 }}</span>
        </el-descriptions-item>
        <el-descriptions-item :label="t('common.resultFailed')">
          <span data-testid="import-result-failed">{{ importResult?.errorCount ?? 0 }}</span>
        </el-descriptions-item>
        <el-descriptions-item :label="t('common.resultProcessing')">
          <span data-testid="import-result-processing">{{ importProcessingCount }}</span>
        </el-descriptions-item>
      </el-descriptions>
      <template v-if="(importResult?.errors?.length ?? 0) > 0">
        <div class="import-errors__title">{{ t('form.importErrorRows') }}</div>
        <el-table :data="importResult?.errors ?? []" size="small" max-height="260">
          <el-table-column prop="rowNum" :label="t('form.importRowNumber')" width="90" />
          <el-table-column prop="message" :label="t('common.reason')" min-width="260" />
        </el-table>
      </template>
      <template #footer>
        <el-button type="primary" @click="importResultVisible = false">{{
          t('common.confirm')
        }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.form-data-list__forbidden {
  padding: 12px 16px;
}

.data-forbidden {
  padding: 24px 0;
  color: #606266;
}

.data-forbidden__title {
  margin: 0 0 6px;
  font-size: 15px;
  font-weight: 600;
}

.data-forbidden__desc {
  margin: 0 0 12px;
  color: #909399;
  font-size: 13px;
}

.form-data-list__table-shell {
  position: relative;
}

.form-data-list__more {
  position: absolute;
  top: 11px;
  right: 32px;
  z-index: 10;
}

.form-data-list__more-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--sw-text-secondary, #909399);
  cursor: pointer;
}

.form-data-list__more-trigger:hover {
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9, #ecf5ff);
}

.form-data-list__cols-trigger {
  position: absolute;
  top: 11px;
  right: 8px;
  z-index: 10;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--sw-text-secondary, #909399);
  cursor: pointer;
}

.form-data-list__cols-trigger:hover {
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9, #ecf5ff);
}

.form-data-list__drawer-section {
  margin: 0 0 8px;
  color: var(--sw-text-regular, #606266);
  font-size: 13px;
  font-weight: 600;
}

.form-data-list__drawer-section + .form-data-list__cols {
  margin-bottom: 16px;
}

.form-data-list__cols {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.form-data-list__col-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  background: #fafbfe;
}

.form-data-list__col-row:hover {
  background: #f0f4fb;
}

.form-data-list__col-label {
  color: var(--sw-text-primary, #303133);
  font-size: 13px;
}

.form-data-list__col-ops {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.form-data-list__col-handle {
  display: inline-flex;
  padding: 2px;
  color: #909399;
  cursor: grab;
}

.form-data-list__col-handle:active {
  cursor: grabbing;
}

.import-errors__title {
  margin: 16px 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: #606266;
}
</style>
