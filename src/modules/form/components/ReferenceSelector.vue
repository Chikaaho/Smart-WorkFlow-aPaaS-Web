<script setup lang="ts">
/**
 * ReferenceSelector — REFERENCE 字段关联选择器弹窗。
 *
 * 打开后加载目标表单数据列表（分页 + 搜索），用户单选一行回填
 * IdValueProperty {id, value} 给父组件（DynamicField）。
 *
 * 列表列配置 / 显示字段 / 搜索字段 均通过 derive 接缝函数从目标
 * definition 推导，将来设计时自定义配置只需替换对应 derive 函数。
 */
import { ref, watch, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { getFormDefinition, queryFormData, type QueryFilter } from '@/modules/form/api/form'
import {
  deriveReferenceColumns,
  deriveDisplayField,
  deriveSearchFields,
  type ColumnConfig,
} from '@/modules/form/utils/derive-list-config'
import { getErrorMessage } from '@/foundation/request/error-code-map'
import type { FormSchema, IdValueProperty } from '@/contracts/form-schema'
import type { PageResult } from '@/contracts/common'
import DictTag from '@/foundation/dict/DictTag.vue'

/* ── Props ── */

const props = defineProps<{
  /** 目标表单 key，来自 REFERENCE 字段的 targetFormId。 */
  targetFormKey: string
  /** 弹窗显隐（v-model）。 */
  visible: boolean
  /** 当前已选记录 ID（编辑场景回显高亮用，可选）。 */
  selectedId?: string
}>()

/* ── Emits ── */

const emit = defineEmits<{
  'update:visible': [value: boolean]
  select: [payload: IdValueProperty]
}>()

/* ── 内部状态 ── */

const loading = ref(false)
const errorMsg = ref('')
const definition = ref<FormSchema | null>(null)
const result = ref<PageResult<Record<string, unknown>> | null>(null)
const pageNum = ref(1)
const pageSize = ref(10)
const searchKeyword = ref('')
const selectedRow = ref<Record<string, unknown> | null>(null)

/* ── 派生配置 ── */

const columns = computed<ColumnConfig[]>(() =>
  definition.value ? deriveReferenceColumns(definition.value) : [],
)

const displayField = computed(() =>
  definition.value ? deriveDisplayField(definition.value) : 'id',
)

const searchFields = computed(() => (definition.value ? deriveSearchFields(definition.value) : []))

const dialogTitle = computed(() => {
  const title = definition.value?.title ?? props.targetFormKey
  return `选择关联记录 — ${title || '目标表单'}`
})

/* ── 加载 definition ── */

async function loadDefinition() {
  if (!props.targetFormKey) return
  try {
    definition.value = await getFormDefinition(props.targetFormKey)
  } catch (e) {
    const err = e as { code?: number; message?: string }
    errorMsg.value = getErrorMessage(err.code ?? -1, err.message) || '加载目标表单定义失败'
  }
}

/* ── 查询数据 ── */

async function loadData() {
  if (!props.targetFormKey) return
  loading.value = true
  errorMsg.value = ''
  try {
    const filters: QueryFilter[] = []
    const keyword = searchKeyword.value.trim()
    if (keyword && searchFields.value.length > 0) {
      filters.push({
        field: searchFields.value[0],
        op: 'LIKE',
        value: keyword,
      })
    }
    result.value = await queryFormData(props.targetFormKey, {
      pageNum: pageNum.value,
      pageSize: pageSize.value,
      filters,
    })
    // 清空选中
    selectedRow.value = null
  } catch (e) {
    const err = e as { code?: number; message?: string }
    errorMsg.value = getErrorMessage(err.code ?? -1, err.message) || '查询目标表单数据失败'
    result.value = null
  } finally {
    loading.value = false
  }
}

/* ── 搜索 ── */

function handleSearch() {
  pageNum.value = 1
  void loadData()
}

function handleReset() {
  searchKeyword.value = ''
  pageNum.value = 1
  void loadData()
}

/* ── 分页 ── */

function handlePageChange(page: unknown) {
  pageNum.value = Number(page)
  void loadData()
}

function handlePageSizeChange(size: unknown) {
  pageSize.value = Number(size)
  pageNum.value = 1
  void loadData()
}

/* ── 行选中 ── */

function handleRowClick(row: Record<string, unknown>) {
  selectedRow.value = row
}

function handleRowDblclick(row: Record<string, unknown>) {
  selectedRow.value = row
  confirmSelection()
}

/* ── 确认 / 取消 ── */

function confirmSelection() {
  if (!selectedRow.value) {
    ElMessage.warning('请选择一条记录')
    return
  }
  const row = selectedRow.value
  const payload: IdValueProperty = {
    id: String(row.id ?? ''),
    value: String(row[displayField.value] ?? ''),
  }
  emit('select', payload)
  close()
}

function close() {
  emit('update:visible', false)
}

watch(
  () => props.visible,
  (v) => {
    if (v) {
      searchKeyword.value = ''
      pageNum.value = 1
      selectedRow.value = null
      errorMsg.value = ''
      result.value = null
      // 异步加载 definition + 首屏数据
      void loadDefinition().then(() => {
        void loadData()
      })
    }
  },
)

/* ── 值显示 ── */

function formatCellValue(row: Record<string, unknown>, col: ColumnConfig): string {
  const raw = row[col.prop]
  if (raw === null || raw === undefined) return '-'
  if (col.type === 'BOOL') return raw === 1 || raw === true ? '是' : '否'
  return String(raw)
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    :title="dialogTitle"
    :close-on-click-modal="false"
    destroy-on-close
    width="820px"
    @update:model-value="emit('update:visible', $event)"
    @closed="selectedRow = null"
  >
    <div class="reference-selector">
      <!-- 错误提示 -->
      <el-alert
        v-if="errorMsg"
        :title="errorMsg"
        type="error"
        :closable="false"
        show-icon
        style="margin-bottom: var(--sw-space-16)"
      />

      <!-- 搜索栏 -->
      <div class="reference-selector__search">
        <el-input
          v-model="searchKeyword"
          placeholder="请输入关键词搜索"
          clearable
          style="width: 260px"
          @keyup.enter="handleSearch"
          @clear="handleReset"
        />
        <el-button type="primary" @click="handleSearch">搜索</el-button>
        <el-button @click="handleReset">重置</el-button>
      </div>

      <!-- 表格 -->
      <el-table
        v-loading="loading"
        :data="result?.list ?? []"
        stripe
        highlight-current-row
        style="width: 100%"
        max-height="360px"
        @row-click="handleRowClick"
        @row-dblclick="handleRowDblclick"
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
            <span v-else-if="col.type === 'BOOL'">
              <el-tag
                :type="row[col.prop] === 1 || row[col.prop] === true ? 'success' : 'info'"
                size="small"
              >
                {{ formatCellValue(row, col) }}
              </el-tag>
            </span>
            <span v-else>{{ formatCellValue(row, col) }}</span>
          </template>
        </el-table-column>

        <!-- 空态 -->
        <template #empty>
          <span v-if="!loading" style="color: var(--sw-text-secondary)">暂无数据</span>
        </template>
      </el-table>

      <!-- 分页 -->
      <div class="reference-selector__pagination">
        <span class="reference-selector__pagination-total">
          共 {{ result?.total ?? 0 }} 条记录
        </span>
        <el-pagination
          :current-page="pageNum"
          :page-size="pageSize"
          :total="result?.total ?? 0"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          background
          small
          @current-change="handlePageChange"
          @size-change="handlePageSizeChange"
        />
      </div>
    </div>

    <template #footer>
      <el-button @click="close">取消</el-button>
      <el-button type="primary" :disabled="!selectedRow" @click="confirmSelection">
        确认选择
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.reference-selector {
  display: flex;
  flex-direction: column;
  gap: var(--sw-space-16);
}

.reference-selector__search {
  display: flex;
  align-items: center;
  gap: var(--sw-space-8);
}

.reference-selector__pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: var(--sw-space-8);
}

.reference-selector__pagination-total {
  font-size: var(--sw-font-secondary);
  color: var(--sw-text-secondary);
}
</style>
