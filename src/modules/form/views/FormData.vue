<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
/* global Event, HTMLInputElement, URL, document */
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { StandardListTemplate, LoadErrorState, ListActionsColumn } from '@/components/page-layout'
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
import { deriveColumns, deriveFilterFields } from '@/modules/form/utils/derive-list-config'
import { getListConfig } from '@/modules/form/api/i2-choices'
import { getErrorMessage } from '@/foundation/request/error-code-map'
import { ApiError } from '@/foundation/request'
import type { FormSchema } from '@/contracts/form-schema'
import type { PageResult } from '@/contracts/common'

const { hasPerm } = usePermission()
const canTemplate = computed(() => hasPerm('form:data:template'))
const canImport = computed(() => hasPerm('form:data:import'))
const canExport = computed(() => hasPerm('form:data:export'))

const route = useRoute()
const router = useRouter()
const formKey = String(route.params.formKey)

// ── 状态 ──
const loading = ref(false)
const errorMsg = ref('')
/** 查询失败的归一化对象；有值时渲染分类错误态与重试入口，而不是空表。 */
const loadError = ref<ApiError | null>(null)
const schema = ref<FormSchema | null>(null)
const result = ref<PageResult<Record<string, unknown>> | null>(null)
const pageNum = ref(1)
const pageSize = ref(10)

// ── 列与筛选配置（I2：优先消费服务端持久化列表配置；未配置回退 definition 派生） ──
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

// ── 筛选值状态 ──
const filterValues = ref<Record<string, string>>({})
const dateRange = ref<[string, string] | null>(null)
const dateFieldName = ref('')

// ── 空态 ──
// 失败不能被渲染成「暂无数据」：查询失败与成功空结果是两种状态。
const isEmpty = computed(
  () =>
    !loading.value && !errorMsg.value && !loadError.value && (result.value?.list.length ?? 0) === 0,
)

// ── 导入相关状态 ──
const importLoading = ref(false)
const importResultVisible = ref(false)
const importResult = ref<{
  totalRows: number
  successCount: number
  errorCount: number
  errors: Array<{ rowNum: number; message: string }>
  processing: number
} | null>(null)

/** 处理中取服务端同步契约的显式值（恒为 0），不由前端臆算。 */
const importProcessingCount = computed(() => importResult.value?.processing ?? 0)

/**
 * 整批回滚判定：失败行数多于实际不合法明细时，说明其余行是被整批原子策略连带
 * 回滚的，而不是本身有问题。页面必须把这件事讲清楚，不用「失败 N」冒充 N 行都错。
 */
const importRolledBack = computed(() => {
  const failed = importResult.value?.errorCount ?? 0
  const invalid = importResult.value?.errors?.length ?? 0
  return failed > invalid
})

// ── 加载 definition ──
async function loadDefinition() {
  try {
    schema.value = await getFormDefinition(formKey)
    // I2：读取服务端持久化列表配置（刷新/重登/多用户按授权稳定生效）
    try {
      const def = await getFormDef(formKey)
      if (def?.id) persistedListConfig.value = await getListConfig(def.id)
    } catch {
      persistedListConfig.value = null
    }
    // 初始化筛选值
    for (const f of filterFields.value) {
      if (f.type === 'DATE') {
        dateFieldName.value = f.field
      }
    }
  } catch {
    errorMsg.value = t('form.definitionEndpointPending')
  }
}

// ── 查询 ──
async function loadData() {
  loading.value = true
  errorMsg.value = ''
  loadError.value = null
  try {
    const filters: QueryFilter[] = []
    // 普通筛选字段
    for (const [field, value] of Object.entries(filterValues.value)) {
      if (!value) continue
      const f = filterFields.value.find((ff) => ff.field === field)
      filters.push({ field, op: f?.op ?? 'EQ', value })
    }
    // 日期范围（拆成 GE + LE 两条）
    if (dateRange.value && dateRange.value[0]) {
      filters.push({ field: dateFieldName.value, op: 'GE', value: dateRange.value[0] })
    }
    if (dateRange.value && dateRange.value[1]) {
      filters.push({ field: dateFieldName.value, op: 'LE', value: dateRange.value[1] })
    }

    result.value = await queryFormData(formKey, {
      pageNum: pageNum.value,
      pageSize: pageSize.value,
      filters,
    })
  } catch (err: unknown) {
    // 不再从裸对象猜 code/message：请求层已把 4xx/5xx/网络/超时归一为带分类的 ApiError，
    // 页面按分类给出结论与恢复动作，并保留事件引用供用户反馈。
    loadError.value = err instanceof ApiError ? err : null
    errorMsg.value = loadError.value ? '' : t('form.queryFailed', { msg: String(err) })
    result.value = null
  } finally {
    loading.value = false
  }
}

// ── 分页事件 ──
function handlePageNumChange(p: number) {
  pageNum.value = p
  void loadData()
}

function handlePageSizeChange(s: number) {
  pageSize.value = s
  pageNum.value = 1
  void loadData()
}

// ── 查询/重置 ──
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

// ── 行操作 ──
function handleView(row: Record<string, unknown>) {
  router.push({
    name: 'form-render',
    params: { formKey },
    query: { recordId: String(row.id ?? ''), mode: 'view' },
  })
}

function handleEdit(row: Record<string, unknown>) {
  router.push({
    name: 'form-render',
    params: { formKey },
    query: { recordId: String(row.id ?? ''), mode: 'edit' },
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
    return // 用户取消
  }

  try {
    await deleteFormData(formKey, String(row.id))
    ElMessage.success(t('common.deleteSuccess'))
    await loadData()
  } catch (err: unknown) {
    const errObj = err as { code?: number; message?: string }
    const code = errObj.code ?? 0
    const msg = getErrorMessage(code, errObj.message)
    ElMessage.error(msg)
  }
}

/** 统一操作列（V012-BUG-002）：查看/编辑直显，删除收进「更多」 */
function rowActions(r: unknown): ListAction[] {
  const row = r as Record<string, unknown>
  return [
    {
      key: 'view',
      label: t('common.view'),
      onClick: () => handleView(row),
    },
    {
      key: 'edit',
      label: t('common.edit'),
      onClick: () => handleEdit(row),
    },
    {
      key: 'delete',
      label: t('common.delete'),
      type: 'danger',
      onClick: () => handleDelete(row),
    },
  ]
}

// ── 值显示辅助 ──
function formatCellValue(
  row: Record<string, unknown>,
  col: { prop: string; type: string; dictType?: string },
): string {
  const raw = row[col.prop]
  if (raw === null || raw === undefined) return '-'

  switch (col.type) {
    case 'BOOL':
      return raw === 1 || raw === true || raw === '1' ? t('common.yes') : t('common.no')
    case 'DATE':
      return String(raw)
    case 'REFERENCE':
      // 展示裸 ref_id（展示名解析未做，与后端 v1 一致）
      return raw !== null ? String(raw) : '-'
    case 'DICT':
      // 字典值通过 useDict 查找 label
      return String(raw)
    default:
      return String(raw)
  }
}

// ── 模板下载 ──
async function handleDownloadTemplate() {
  try {
    const blob = await downloadFormTemplate(formKey)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${formKey}_template.xlsx`
    document.body.appendChild(a)
    a.click()
    URL.revokeObjectURL(url)
    document.body.removeChild(a)
    ElMessage.success(t('form.templateDownloaded'))
  } catch (err: unknown) {
    const errObj = err as { code?: number; message?: string }
    const code = errObj.code ?? 0
    const msg = getErrorMessage(code, errObj.message)
    ElMessage.error(t('form.templateDownloadFailed', { msg }))
  }
}

// ── 导入 ──
const fileInputRef = ref<HTMLInputElement | null>(null)

function handleImportClick() {
  fileInputRef.value?.click()
}

async function handleFileChange(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  // 验证文件类型
  if (!file.name.endsWith('.xlsx')) {
    ElMessage.error(t('form.importSelectXlsx'))
    return
  }

  importLoading.value = true
  importResult.value = null

  try {
    const result = await importFormData(formKey, file)
    importResult.value = result
    // R2c：总量/成功/失败与逐行明细必须可见，不能只靠一条 toast
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
    const code = errObj.code ?? 0
    const msg = getErrorMessage(code, errObj.message)
    ElMessage.error(t('form.importFailed', { msg }))
  } finally {
    importLoading.value = false
    // 清空文件输入
    if (fileInputRef.value) {
      fileInputRef.value.value = ''
    }
  }
}

// ── 导出 ──
const exportLoading = ref(false)

async function handleExport() {
  exportLoading.value = true

  try {
    // 构建查询条件
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

    const query = {
      pageNum: 1,
      pageSize: 1000, // 限制最大导出行数
      filters,
    }

    const blob = await exportFormData(formKey, query)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${formKey}_data.xlsx`
    document.body.appendChild(a)
    a.click()
    URL.revokeObjectURL(url)
    document.body.removeChild(a)
    ElMessage.success(t('form.exported'))
  } catch (err: unknown) {
    const errObj = err as { code?: number; message?: string }
    const code = errObj.code ?? 0
    const msg = getErrorMessage(code, errObj.message)
    ElMessage.error(t('form.exportFailed', { msg }))
  } finally {
    exportLoading.value = false
  }
}

// ── 挂载 ──
onMounted(async () => {
  await loadDefinition()
  if (schema.value) {
    await loadData()
  }
})
</script>

<template>
  <StandardListTemplate
    :title="schema?.title ?? t('form.dataDialogTitle', { formKey })"
    :total="result?.total ?? 0"
    :page-num="pageNum"
    :page-size="pageSize"
    :empty="isEmpty"
    @update:page-num="handlePageNumChange"
    @update:page-size="handlePageSizeChange"
  >
    <!-- 筛选栏 -->
    <template #filter>
      <template v-for="ff in filterFields" :key="ff.field">
        <!-- TEXT / NUMBER → input -->
        <el-input
          v-if="ff.type === 'TEXT' || ff.type === 'NUMBER'"
          v-model="filterValues[ff.field]"
          :placeholder="ff.label"
          clearable
          style="width: 180px"
          @keyup.enter="handleQuery"
        />
        <!-- BOOL → select 是/否 -->
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
        <!-- DICT → select + useDict -->
        <DictSelect
          v-else-if="ff.type === 'DICT'"
          v-model="filterValues[ff.field]"
          :type="ff.dictType ?? ''"
          :placeholder="ff.label"
          size="default"
        />
        <!-- DATE → 日期范围 -->
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

    <!-- 筛选操作按钮 -->
    <template #filter-actions>
      <el-button type="primary" @click="handleQuery">{{ t('common.query') }}</el-button>
      <el-button @click="handleReset">{{ t('common.reset') }}</el-button>
    </template>

    <!-- 查询失败：分类错误态 + 恢复动作 + 重试，不再渲染成空表或空态 -->
    <LoadErrorState v-if="loadError" :error="loadError" @retry="loadData" />

    <!-- 表格 -->
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
          <!-- DICT → DictTag 显示 label -->
          <DictTag
            v-if="col.type === 'DICT' && col.dictType"
            :type="col.dictType"
            :value="String(row[col.prop] ?? '')"
          />
          <!-- BOOL → 是/否 -->
          <span v-else-if="col.type === 'BOOL'">
            <el-tag
              :type="row[col.prop] === 1 || row[col.prop] === true ? 'success' : 'info'"
              size="small"
            >
              {{ formatCellValue(row, col) }}
            </el-tag>
          </span>
          <!-- DATE → 原样显示 -->
          <span v-else-if="col.type === 'DATE'">{{ row[col.prop] ?? '-' }}</span>
          <!-- REFERENCE → 占位 -->
          <span v-else-if="col.type === 'REFERENCE'">{{
            row[col.prop] !== null && row[col.prop] !== undefined ? row[col.prop] : '-'
          }}</span>
          <!-- 其余类型原值 -->
          <span v-else>{{ row[col.prop] ?? '-' }}</span>
        </template>
      </el-table-column>

      <!-- 操作列 -->
      <ListActionsColumn :actions="rowActions" :width="150" />
    </el-table>

    <!-- toolbar 操作 -->
    <template #toolbar-actions>
      <el-button v-if="canTemplate" @click="handleDownloadTemplate">{{
        t('form.downloadTemplate')
      }}</el-button>
      <el-button v-if="canImport" :loading="importLoading" @click="handleImportClick">{{
        t('common.import')
      }}</el-button>
      <el-button v-if="canExport" :loading="exportLoading" @click="handleExport">{{
        t('common.export')
      }}</el-button>
      <input
        ref="fileInputRef"
        type="file"
        accept=".xlsx"
        style="display: none"
        @change="handleFileChange"
      />

      <!-- R2c 导入结果：总量/成功/失败/处理中 + 逐行安全明细（不直出原始异常） -->
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
        <p class="import-processing-note" data-testid="import-result-processing-note">
          {{ t('form.importProcessingNote') }}
        </p>
        <!--
          整批原子契约：任一行不合法则整批不落库。此时「失败」= 未落库的行数，
          而明细只列出真正不合法的行；两者数量不同必须解释，否则用户会把
          「失败 3」读成「3 行都有问题」。
        -->
        <p
          v-if="importRolledBack"
          class="import-rollback-note"
          data-testid="import-result-rollback-note"
        >
          {{
            t('form.importAtomicRollbackNote', {
              failed: importResult?.errorCount ?? 0,
              invalid: importResult?.errors?.length ?? 0,
            })
          }}
        </p>
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
    </template>
  </StandardListTemplate>
</template>

<style scoped>
.import-processing-note {
  margin: 12px 0 0;
  font-size: 12px;
  color: #909399;
}
.import-rollback-note {
  margin: 8px 0 0;
  font-size: 12px;
  color: #e6a23c;
}
</style>
