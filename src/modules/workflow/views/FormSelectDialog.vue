<script setup lang="ts">
/**
 * FormSelectDialog — 流程定义表单绑定选择弹窗。
 *
 * 复用 pageFormDefs 拉表单定义列表（分页 + 可选名称搜索）。
 * 展示表单名 + formKey + 状态，让作者认得出选哪个。
 * 只允许选已发布（PUBLISHED）的表单——引用一个未发布的草稿表单没意义。
 *
 * 红线：选中后回填的是 formKey（非 id）。
 */
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { pageFormDefs } from '@/modules/form/api/form-def'
import { getFormDefStatusLabel, getFormDefStatusType } from '@/modules/form/utils/form-def-status'
import type { FormDefListItem } from '@/modules/form/api/form-def'

/* ── Props & emits ── */

const props = defineProps<{
  visible: boolean
  /** 当前已选的 formKey，用于回显高亮。 */
  currentFormKey?: string
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  /** 回填选中的 formKey 和表单名称。 */
  select: [formKey: string, formName: string]
}>()

/* ── 内部状态 ── */

const list = ref<FormDefListItem[]>([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(10)
const loading = ref(false)

const keyword = ref('')
const currentKeyword = ref('')

const selectedFormKey = ref<string | null>(null)

/* ── 加载列表 ── */

async function loadList() {
  loading.value = true
  try {
    const result = await pageFormDefs(
      { pageNum: pageNum.value, pageSize: pageSize.value },
      currentKeyword.value || undefined,
    )
    // 客户端过滤：只展示已发布（PUBLISHED）表单（引用草稿表单无意义）
    const published = result.list.filter((item) => item.status === 'PUBLISHED')
    list.value = published
    total.value = published.length
  } catch {
    list.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

/* ── 搜索 ── */

function handleSearch() {
  currentKeyword.value = keyword.value.trim()
  pageNum.value = 1
  void loadList()
}

function handleReset() {
  keyword.value = ''
  currentKeyword.value = ''
  pageNum.value = 1
  void loadList()
}

/* ── 分页 ── */

function handlePageChange(p: number) {
  pageNum.value = p
  void loadList()
}

function handlePageSizeChange(s: number) {
  pageSize.value = s
  pageNum.value = 1
  void loadList()
}

/* ── 行选中 ── */

function handleRowClick(row: FormDefListItem) {
  selectedFormKey.value = row.formKey
}

function handleRowDblclick(row: FormDefListItem) {
  selectedFormKey.value = row.formKey
  confirmSelection()
}

/* ── 确认 / 取消 ── */

function confirmSelection() {
  if (!selectedFormKey.value) {
    ElMessage.warning('请选择一个目标表单')
    return
  }
  const row = list.value.find((it) => it.formKey === selectedFormKey.value)
  if (!row) {
    ElMessage.warning('所选表单不在列表中')
    return
  }
  // 红线：回填 formKey，不是 id
  emit('select', row.formKey, row.name)
  close()
}

function close() {
  emit('update:visible', false)
}

/* ── 弹窗打开时加载 ── */

watch(
  () => props.visible,
  (v) => {
    if (v) {
      keyword.value = ''
      currentKeyword.value = ''
      pageNum.value = 1
      selectedFormKey.value = props.currentFormKey ?? null
      void loadList()
    }
  },
)
</script>

<template>
  <el-dialog
    :model-value="visible"
    title="选择关联表单"
    :close-on-click-modal="false"
    destroy-on-close
    width="720px"
    @update:model-value="emit('update:visible', $event)"
  >
    <div class="form-select">
      <!-- 提示条：只展示已发布表单 -->
      <el-alert type="info" :closable="false" show-icon style="margin-bottom: var(--sw-space-16)">
        <template #title> 仅展示已发布的表单作为可选绑定目标（草稿表单不可用） </template>
      </el-alert>

      <!-- 搜索栏 -->
      <div class="form-select__search">
        <el-input
          v-model="keyword"
          placeholder="搜索表单名称或 formKey"
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
        :data="list"
        stripe
        highlight-current-row
        style="width: 100%"
        max-height="360px"
        @row-click="handleRowClick"
        @row-dblclick="handleRowDblclick"
      >
        <el-table-column prop="name" label="表单名称" min-width="160" show-overflow-tooltip />
        <el-table-column prop="formKey" label="formKey" min-width="140" show-overflow-tooltip />
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="getFormDefStatusType(row.status)" size="small">
              {{ getFormDefStatusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>

        <template #empty>
          <span v-if="!loading" style="color: var(--sw-text-secondary)">暂无可选表单</span>
        </template>
      </el-table>

      <!-- 分页 -->
      <div class="form-select__pagination">
        <span class="form-select__pagination-total"> 共 {{ total }} 条记录 </span>
        <el-pagination
          :current-page="pageNum"
          :page-size="pageSize"
          :total="total"
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
      <el-button type="primary" :disabled="!selectedFormKey" @click="confirmSelection">
        确认选择
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.form-select {
  display: flex;
  flex-direction: column;
  gap: var(--sw-space-16);
}

.form-select__search {
  display: flex;
  align-items: center;
  gap: var(--sw-space-8);
}

.form-select__pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: var(--sw-space-8);
}

.form-select__pagination-total {
  font-size: var(--sw-font-secondary);
  color: var(--sw-text-secondary);
}
</style>
