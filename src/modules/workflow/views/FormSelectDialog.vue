<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
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
import { pageFormDefs, getFormDefStatusLabel, getFormDefStatusType } from '@/adapters/form-catalog'
import type { FormDefListItem } from '@/adapters/form-catalog'
import { ListPagination } from '@/components/page-layout'

/* ── Props & emits ── */

const props = defineProps<{
  visible: boolean
  /** 当前已选的 formKey，用于回显高亮。 */
  currentFormKey?: string
  /** 表单类型：流程定义绑定业务表单传 BUSINESS；节点审批意见表单保持默认。 */
  formType?: 'BUSINESS' | 'APPROVAL_COMMENT'
  /** 弹窗标题；默认审批意见表单，流程绑定场景传「选择表单」。 */
  title?: string
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
    // 流程定义绑定业务表单（BUSINESS）；节点审批意见表单（APPROVAL_COMMENT）。
    // 服务端按类型过滤，避免流程绑定误选审批意见表单。
    const result = await pageFormDefs(
      { pageNum: pageNum.value, pageSize: pageSize.value },
      currentKeyword.value || undefined,
      props.formType ?? 'APPROVAL_COMMENT',
    )
    // 客户端过滤：只展示已发布（PUBLISHED）表单（引用草稿表单无意义）
    const published = result.list.filter((item) => item.status === 'PUBLISHED')
    list.value = published
    total.value = published.length
  } catch {
    ElMessage.error(t('common.loadFailed'))
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
    ElMessage.warning(t('form.selectTargetForm'))
    return
  }
  const row = list.value.find((it) => it.formKey === selectedFormKey.value)
  if (!row) {
    ElMessage.warning(t('form.targetFormNotFound'))
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
    :title="title ?? '选择审批意见表单'"
    :close-on-click-modal="false"
    destroy-on-close
    width="720px"
    @update:model-value="emit('update:visible', $event)"
  >
    <div class="form-select">
      <!-- 提示条：只展示与当前场景匹配的已发布表单 -->
      <el-alert type="info" :closable="false" show-icon style="margin-bottom: var(--sw-space-16)">
        <template #title>{{
          formType === 'BUSINESS' ? '仅展示已发布的业务表单' : '仅展示已发布的审批意见表单'
        }}</template>
      </el-alert>

      <!-- 搜索栏 -->
      <div class="form-select__search">
        <el-input
          v-model="keyword"
          :placeholder="t('workflow.searchFormNamePlaceholder')"
          clearable
          style="width: 260px"
          @keyup.enter="handleSearch"
          @clear="handleReset"
        />
        <el-button type="primary" @click="handleSearch">{{ t('common.search') }}</el-button>
        <el-button @click="handleReset">{{ t('common.reset') }}</el-button>
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
        <el-table-column
          prop="name"
          :label="t('common.formName')"
          min-width="220"
          show-overflow-tooltip
        />
        <el-table-column prop="formVersion" :label="t('common.version')" width="80" />
        <el-table-column :label="t('common.status')" width="90">
          <template #default="{ row }">
            <el-tag :type="getFormDefStatusType(row.status)" size="small">
              {{ getFormDefStatusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>

        <template #empty>
          <span v-if="!loading" style="color: var(--sw-text-secondary)">{{
            t('workflow.noSelectableForms')
          }}</span>
        </template>
      </el-table>

      <!-- 分页 -->
      <ListPagination
        :total="total"
        :page-num="pageNum"
        :page-size="pageSize"
        layout="sizes, prev, pager, next"
        :page-sizes="[10, 20, 50]"
        small
        total-text
        align="space-between"
        :inset="false"
        @update:page-num="handlePageChange"
        @update:page-size="handlePageSizeChange"
      />
    </div>

    <template #footer>
      <el-button @click="close">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" :disabled="!selectedFormKey" @click="confirmSelection">
        {{ t('form.confirmSelection') }}
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
</style>
