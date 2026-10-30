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
import { pageFormDefs, getFormDefStatusLabel } from '@/adapters/form-catalog'
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

/** 472:16071 行内选择：点「选择」直接回填并关闭 */
function handleRowPick(row: FormDefListItem) {
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
    class="form-select-dialog"
    :title="title ?? '选择审批意见表单'"
    :close-on-click-modal="false"
    destroy-on-close
    align-center
    :width="formType === 'BUSINESS' ? '640px' : '960px'"
    @update:model-value="emit('update:visible', $event)"
  >
    <div class="form-select" :class="{ 'form-select--wide': formType !== 'BUSINESS' }">
      <!-- 搜索栏（472:16071 执行提示18：名称左锚 + 410 输入，无按钮）；
           Q11（273:1257）审批意见场景 960 宽，搜索输入伸展到可用区域 -->
      <div class="form-select__search">
        <span class="form-select__label">{{ t('common.formName') }}</span>
        <el-input
          v-model="keyword"
          class="form-select__search-input"
          :placeholder="t('workflow.searchFormNamePlaceholder')"
          clearable
          @keyup.enter="handleSearch"
          @clear="handleReset"
        />
      </div>

      <!-- 内清单：名称 + 版本/状态同主次一行，逐行 80×32 选择按钮始终完整 -->
      <div v-loading="loading" class="form-select__list" data-testid="form-select-list">
        <div
          v-for="row in list"
          :key="row.formKey"
          class="form-select__row"
          :class="{ 'is-active': row.formKey === selectedFormKey }"
          @click="handleRowClick(row)"
          @dblclick="handleRowDblclick(row)"
        >
          <div class="form-select__main">
            <span class="form-select__name" :title="row.name">{{ row.name }}</span>
            <span class="form-select__meta">
              <span>v{{ row.formVersion }}</span>
              <span>{{ getFormDefStatusLabel(row.status) }}</span>
            </span>
          </div>
          <el-button
            type="primary"
            class="form-select__pick"
            :data-testid="'form-select-pick-' + row.formKey"
            @click.stop="handleRowPick(row)"
          >
            {{ t('common.select') }}
          </el-button>
        </div>
        <p v-if="!loading && list.length === 0" class="form-select__empty">
          {{ t('workflow.noSelectableForms') }}
        </p>
      </div>

      <!-- 必要分页：真实行数超过单页时保留 -->
      <ListPagination
        v-if="total > pageSize"
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
    </template>
  </el-dialog>
</template>

<style scoped>
.form-select {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* 472:16071（执行提示18）：名称标签 + 410 输入，行内无搜索按钮 */
.form-select__search {
  display: flex;
  align-items: center;
  gap: 12px;
}
.form-select__label {
  box-sizing: border-box;
  flex: 0 0 56px;
  color: var(--sw-text-regular, #606266);
  font-size: 13px;
  line-height: 22px;
}
.form-select__search-input {
  width: 410px;
}
/* Q11（273:1257）：意见表单选择 960 宽时搜索输入占据余量 */
.form-select--wide .form-select__search-input {
  flex: 1;
  width: auto;
}
.form-select__search-input :deep(.el-input__wrapper) {
  box-sizing: border-box;
  height: 32px;
}
.form-select__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 288px;
  min-height: 48px;
  overflow-y: auto;
}
.form-select__row {
  display: flex;
  flex: 0 0 48px;
  align-items: center;
  gap: 12px;
  box-sizing: border-box;
  height: 48px;
  padding: 0 8px 0 14px;
  border: 1px solid #dde3ef;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
}
.form-select__row:hover {
  border-color: var(--sw-color-primary, #409eff);
}
.form-select__row.is-active {
  border-color: var(--sw-color-primary, #409eff);
  background: #ecf5ff;
}
.form-select__main {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
  flex: 1;
}
.form-select__name {
  overflow: hidden;
  color: var(--sw-text-primary, #303133);
  font-size: 14px;
  font-weight: 500;
  line-height: 22px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.form-select__meta {
  display: inline-flex;
  gap: 8px;
  color: var(--sw-text-secondary, #909399);
  font-size: 12px;
  line-height: 20px;
  white-space: nowrap;
}
.form-select__pick {
  flex: 0 0 80px;
  width: 80px;
  height: 32px;
  margin: 0;
}
.form-select__empty {
  margin: 0;
  padding: 12px 0;
  color: var(--sw-text-secondary);
  text-align: center;
}
</style>

<style>
/* 472:16071（执行提示18）：对话框内距/标题按原图，行内锚点 665 起 */
.form-select-dialog.el-dialog {
  box-sizing: border-box;
  padding: 24px;
  border: 1px solid #dde3ef;
  border-radius: 12px;
}
.form-select-dialog .el-dialog__header {
  box-sizing: border-box;
  height: 32px;
  margin: 0 0 16px;
  padding: 4px 32px 4px 0;
}
.form-select-dialog .el-dialog__title {
  color: #172033;
  font-size: 16px;
  font-weight: 600;
  line-height: 24px;
}
.form-select-dialog .el-dialog__headerbtn {
  top: 24px;
  right: 24px;
  width: 32px;
  height: 32px;
}
.form-select-dialog .el-dialog__body {
  padding: 0;
}
.form-select-dialog .el-dialog__footer {
  height: 32px;
  margin-top: 16px;
  padding: 0;
  text-align: right;
}
.form-select-dialog .el-dialog__footer .el-button {
  width: 80px;
  height: 32px;
  margin: 0;
}
</style>
