<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
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
 */
const { t } = useI18n()
const { hasPerm } = usePermission()
const route = useRoute()
const router = useRouter()

const formKey = computed(() => String(route.params.formKey ?? ''))
const appId = computed(() => (typeof route.query.appId === 'string' ? route.query.appId : ''))

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

const isEmpty = computed(
  () =>
    !loading.value && !errorMsg.value && !loadError.value && (result.value?.list.length ?? 0) === 0,
)

async function loadDefinition() {
  try {
    schema.value = await getFormDefinition(formKey.value)
    try {
      const def = await getFormDef(formKey.value)
      if (def?.id) persistedListConfig.value = await getListConfig(def.id)
    } catch {
      persistedListConfig.value = null
    }
    for (const f of filterFields.value) {
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
      const f = filterFields.value.find((ff) => ff.field === field)
      filters.push({ field, op: f?.op ?? 'EQ', value })
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

onMounted(async () => {
  await loadDefinition()
  if (canQuery.value) {
    await loadData()
  }
})
</script>

<template>
  <StandardListTemplate
    :title="schema?.title ?? t('form.dataDialogTitle', { formKey })"
    :show-toolbar-total="canQuery"
    :total="result?.total ?? 0"
    :page-num="pageNum"
    :page-size="pageSize"
    :empty="isEmpty"
    @update:page-num="handlePageNumChange"
    @update:page-size="handlePageSizeChange"
  >
    <template #toolbar-actions>
      <el-button @click="backToApp">{{ t('form.appCenter.backToCenter') }}</el-button>
      <el-button type="primary" data-testid="form-data-create" @click="handleCreate">
        {{ t('form.appCenter.createRecord') }}
      </el-button>
    </template>

    <!-- 筛选栏（有查询权限时可用） -->
    <template v-if="canQuery" #filter>
      <template v-for="ff in filterFields" :key="ff.field">
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
      <el-button type="primary" @click="handleQuery">{{ t('common.query') }}</el-button>
      <el-button @click="handleReset">{{ t('common.reset') }}</el-button>
    </template>

    <!-- 无查询权限：明确受限态，保留已获授权的填写/发起入口 -->
    <div v-if="!canQuery" class="data-forbidden" data-testid="data-forbidden">
      <p class="data-forbidden__title">{{ t('form.appCenter.dataForbiddenTitle') }}</p>
      <p class="data-forbidden__desc">{{ t('form.appCenter.dataForbiddenDesc') }}</p>
      <el-button type="primary" @click="handleCreate">{{
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
          v-for="col in columns"
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

        <ListActionsColumn :actions="rowActions" :width="140" />
      </el-table>
    </template>

    <template #empty-action>
      <el-button type="primary" @click="handleCreate">{{
        t('form.appCenter.createRecord')
      }}</el-button>
    </template>
  </StandardListTemplate>
</template>

<style scoped>
.data-forbidden {
  padding: 48px 24px;
  text-align: center;
}
.data-forbidden__title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
  margin: 0 0 8px;
}
.data-forbidden__desc {
  font-size: 13px;
  color: #909399;
  margin: 0 0 16px;
}
</style>
