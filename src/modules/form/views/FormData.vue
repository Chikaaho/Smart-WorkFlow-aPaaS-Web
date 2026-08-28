<script setup lang="ts">
/* global Event, HTMLInputElement, URL, document */
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { StandardListTemplate } from '@/components/page-layout'
import DictSelect from '@/foundation/dict/DictSelect.vue'
import DictTag from '@/foundation/dict/DictTag.vue'
import {
  getFormDefinition,
  queryFormData,
  deleteFormData,
  downloadFormTemplate,
  importFormData,
  exportFormData,
  type QueryFilter,
} from '@/modules/form/api/form'
import { usePermission } from '@/foundation/permission'
import { deriveColumns, deriveFilterFields } from '@/modules/form/utils/derive-list-config'
import { getErrorMessage } from '@/foundation/request/error-code-map'
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
const schema = ref<FormSchema | null>(null)
const result = ref<PageResult<Record<string, unknown>> | null>(null)
const pageNum = ref(1)
const pageSize = ref(10)

// ── 列与筛选配置（从 definition 推导） ──
const columns = computed(() => (schema.value ? deriveColumns(schema.value) : []))
const filterFields = computed(() => (schema.value ? deriveFilterFields(schema.value) : []))

// ── 筛选值状态 ──
const filterValues = ref<Record<string, string>>({})
const dateRange = ref<[string, string] | null>(null)
const dateFieldName = ref('')

// ── 空态 ──
const isEmpty = computed(
  () => !loading.value && !errorMsg.value && (result.value?.list.length ?? 0) === 0,
)

// ── 导入相关状态 ──
const importLoading = ref(false)
const importResult = ref<{
  totalRows: number
  successCount: number
  errorCount: number
  errors: Array<{ rowNum: number; message: string }>
} | null>(null)

// ── 加载 definition ──
async function loadDefinition() {
  try {
    schema.value = await getFormDefinition(formKey)
    // 初始化筛选值
    for (const f of filterFields.value) {
      if (f.type === 'DATE') {
        dateFieldName.value = f.field
      }
    }
  } catch {
    errorMsg.value = '表单定义加载失败：后端端点待上线'
  }
}

// ── 查询 ──
async function loadData() {
  loading.value = true
  errorMsg.value = ''
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
    const errObj = err as { code?: number; message?: string }
    const code = errObj.code ?? 0
    const msg = getErrorMessage(code, errObj.message)
    errorMsg.value = `查询失败：${msg}`
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
    await ElMessageBox.confirm('确认删除该记录？此操作不可恢复。', '删除确认', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return // 用户取消
  }

  try {
    await deleteFormData(formKey, String(row.id))
    ElMessage.success('删除成功')
    await loadData()
  } catch (err: unknown) {
    const errObj = err as { code?: number; message?: string }
    const code = errObj.code ?? 0
    const msg = getErrorMessage(code, errObj.message)
    ElMessage.error(msg)
  }
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
      return raw === 1 || raw === true || raw === '1' ? '是' : '否'
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
    ElMessage.success('模板下载成功')
  } catch (err: unknown) {
    const errObj = err as { code?: number; message?: string }
    const code = errObj.code ?? 0
    const msg = getErrorMessage(code, errObj.message)
    ElMessage.error(`模板下载失败：${msg}`)
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
    ElMessage.error('请选择 .xlsx 格式的文件')
    return
  }

  importLoading.value = true
  importResult.value = null

  try {
    const result = await importFormData(formKey, file)
    importResult.value = result

    if (result.errorCount === 0) {
      ElMessage.success(`导入成功：${result.successCount} 条数据`)
      await loadData()
    } else {
      ElMessage.warning(`导入完成：成功 ${result.successCount} 条，失败 ${result.errorCount} 条`)
    }
  } catch (err: unknown) {
    const errObj = err as { code?: number; message?: string }
    const code = errObj.code ?? 0
    const msg = getErrorMessage(code, errObj.message)
    ElMessage.error(`导入失败：${msg}`)
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
    ElMessage.success('导出成功')
  } catch (err: unknown) {
    const errObj = err as { code?: number; message?: string }
    const code = errObj.code ?? 0
    const msg = getErrorMessage(code, errObj.message)
    ElMessage.error(`导出失败：${msg}`)
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
    :title="schema?.title ?? `表单数据 — ${formKey}`"
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
          <el-option label="是" value="1" />
          <el-option label="否" value="0" />
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
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          value-format="YYYY-MM-DD"
          style="width: 240px"
        />
      </template>
    </template>

    <!-- 筛选操作按钮 -->
    <template #filter-actions>
      <el-button type="primary" @click="handleQuery">查询</el-button>
      <el-button @click="handleReset">重置</el-button>
    </template>

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
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button size="small" link type="primary" @click="handleView(row)">查看</el-button>
          <el-button size="small" link type="primary" @click="handleEdit(row)">编辑</el-button>
          <el-button size="small" link type="danger" @click="handleDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- toolbar 操作 -->
    <template #toolbar-actions>
      <el-button v-if="canTemplate" @click="handleDownloadTemplate">下载模板</el-button>
      <el-button v-if="canImport" :loading="importLoading" @click="handleImportClick"
        >导入</el-button
      >
      <el-button v-if="canExport" :loading="exportLoading" @click="handleExport">导出</el-button>
      <input
        ref="fileInputRef"
        type="file"
        accept=".xlsx"
        style="display: none"
        @change="handleFileChange"
      />
    </template>
  </StandardListTemplate>
</template>
