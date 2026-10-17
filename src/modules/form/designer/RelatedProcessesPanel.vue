<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * RelatedProcessesPanel — 表单工作台「关联流程」工作区（P52）。
 *
 * 契约（方向 §3.4）：
 *   - 只展示与当前表单稳定标识（formKey，持久化于后端 sw_bpm_process_def.form_key）
 *     关联的流程；过滤由后端执行，前端不做本地筛选；
 *   - 一个表单可关联多个流程；列表展示名称 / 状态 / 版本 / 最近更新时间；
 *   - 创建关联流程：自动带入当前表单身份，服务端持久化（POST /workflow/defs
 *     校验表单存在并落库），不靠前端路由参数形成伪关联；
 *   - 复用现有流程创建 / 设计 / 发布能力，不建平行流程管理体系；
 *     本轮后端无挂起/激活能力，不提供对应按钮（不伪装支持）。
 */
import { defineAsyncComponent, ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { ApiError } from '@/foundation/request'
import {
  createProcessDef,
  pageProcessDefs,
  themeRuleDisplay,
  themeRuleDialogLoader,
} from '@/adapters/process-catalog'
import type { ProcessDef } from '@/contracts/bpm'

/** 主题规则设置弹窗经接缝异步加载（跨模块组件不静态直引）。 */
const ThemeRuleDialog = defineAsyncComponent(themeRuleDialogLoader)

const props = defineProps<{ formId: string; formKey: string }>()
const emit = defineEmits<{
  (e: 'enter-process', def: ProcessDef): void
  /** 关联流程数量（供设计器工具条「流程编号设置」入口联动禁用态） */
  (e: 'update:process-count', count: number): void
}>()

const records = ref<ProcessDef[]>([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(10)
const loading = ref(false)
const searchText = ref('')
const statusFilter = ref('ALL')
/** 迟到响应防护：只应用最后一次请求的结果。 */
let requestSeq = 0

const hasFormKey = computed(() => props.formKey.trim().length > 0)

async function load() {
  if (!hasFormKey.value) return
  const seq = ++requestSeq
  loading.value = true
  try {
    const result = await pageProcessDefs(
      { pageNum: pageNum.value, pageSize: pageSize.value },
      props.formKey,
    )
    // 迟到响应不得覆盖当前列表（快速切换表单/多标签页防串位）
    if (seq !== requestSeq) return
    records.value = result.list
    total.value = result.total
    emit('update:process-count', result.list.length)
  } catch {
    if (seq !== requestSeq) return
    ElMessage.error(t('form.relatedProcessLoadFailed'))
  } finally {
    if (seq === requestSeq) loading.value = false
  }
}

watch(
  () => props.formKey,
  () => {
    pageNum.value = 1
    records.value = []
    total.value = 0
    emit('update:process-count', 0)
    load()
  },
  { immediate: true },
)

/* ── 创建关联流程 ── */
const createVisible = ref(false)
const newName = ref('')
const creating = ref(false)

function openCreate() {
  newName.value = ''
  createVisible.value = true
}

async function submitCreate() {
  const name = newName.value.trim()
  if (!name) {
    ElMessage.warning(t('common.processNamePlaceholder'))
    return
  }
  creating.value = true
  try {
    await createProcessDef({ name, formKey: props.formKey })
    ElMessage.success(t('form.relatedProcessCreated'))
    createVisible.value = false
    pageNum.value = 1
    await load()
  } catch (err) {
    // 请求层只抛 ApiError、不做全局提示，这里必须自己说话
    ElMessage.error(err instanceof ApiError ? err.msg : t('workflow.createFailed'))
  } finally {
    creating.value = false
  }
}

// el-table row slot 的 DefaultRow 类型不兼容，桥接函数（对齐 ProcessDefList 先例）
function procRow(r: unknown) {
  return r as ProcessDef
}

function handlePageChange(page: number) {
  pageNum.value = page
  load()
}

function displayVersion(row: ProcessDef) {
  return row.versionLabel ? `v${row.versionLabel}` : `v${row.defVersion}`
}

/* ── V011-BUG-019：操作列三个独立按钮（编辑 / 版本 / 更多） ── */

/** 版本信息弹窗（真实行数据，不做假能力）。 */
const versionVisible = ref(false)
const versionRow = ref<ProcessDef | null>(null)

function openVersion(row: ProcessDef) {
  versionRow.value = row
  versionVisible.value = true
}

// 0.1.7 #21：流程定义禁删——关联流程面板不提供删除。

function statusLabel(status: ProcessDef['status']) {
  if (status === 'PUBLISHED') return t('form.relatedProcessStatusEnabled')
  if (status === 'DRAFT') return t('form.relatedProcessStatusDraft')
  return t('form.relatedProcessStatusDisabled')
}

function statusTagType(status: ProcessDef['status']) {
  if (status === 'PUBLISHED') return 'success'
  if (status === 'DRAFT') return 'info'
  return 'warning'
}

/* ── BF20261013-043：流程编号设置（发布前必填；规则编辑器与流程定义列表共用） ── */

/** 目标流程（弹窗编辑对象） */
const ruleTarget = ref<ProcessDef | null>(null)
const ruleDialogVisible = ref(false)
/** 多个流程时的选择弹窗 */
const rulePickerVisible = ref(false)

/** 编号规则展示文字：变量显示成 [发起时间] 这类标识，不暴露占位记法 */
function ruleTextOf(row: ProcessDef): string {
  return themeRuleDisplay(row.themeRule ?? '', (key, params) => (params ? t(key, params) : t(key)))
}

function openRuleDialog(row: ProcessDef) {
  ruleTarget.value = row
  rulePickerVisible.value = false
  ruleDialogVisible.value = true
}

/** 流程编号设置：单流程直接进入规则编辑器；多个流程先选择 */
function openNumberSettings() {
  if (records.value.length === 0) return
  if (records.value.length === 1) {
    openRuleDialog(records.value[0])
    return
  }
  rulePickerVisible.value = true
}

/** 0.1.7 #25 回归：入口已上收设计器工具条右上角，由宿主经模板 ref 调用 */
defineExpose({ openNumberSettings })
</script>

<template>
  <div class="related-processes">
    <div v-if="!hasFormKey" class="related-processes__empty">
      {{ t('form.noFormKeyHint') }}
    </div>

    <template v-else>
      <!-- 0.1.7 #25 回归：左上角标题/描述/「共 N 个流程 · 启用 N 个」汇总计数为噪音，全部去除，
           筛选栏即本页最顶部；「新建流程」入筛选栏查询右侧（查询与新建一并靠右），
           「流程编号设置」上收设计器工具条右上角（见 FormDesigner.designer__actions） -->
      <div class="related-processes__filter" role="search">
        <el-input
          v-model="searchText"
          class="related-processes__search"
          :placeholder="t('form.relatedProcessSearchPlaceholder')"
          clearable
          @keyup.enter="load"
        />
        <el-select v-model="statusFilter" class="related-processes__status" :teleported="false">
          <el-option :label="t('common.allStatuses')" value="ALL" />
          <el-option :label="t('form.relatedProcessStatusEnabled')" value="PUBLISHED" />
          <el-option :label="t('form.relatedProcessStatusDisabled')" value="DISABLED" />
          <el-option :label="t('form.relatedProcessStatusDraft')" value="DRAFT" />
        </el-select>
        <div class="related-processes__filter-actions">
          <el-button class="related-processes__query" type="primary" @click="load">
            {{ t('common.query') }}
          </el-button>
          <el-button class="related-processes__create" type="primary" @click="openCreate">
            {{ t('form.createProcess') }}
          </el-button>
        </div>
      </div>

      <section class="related-processes__table-card" aria-label="关联流程列表">
        <!-- V011-BUG-018：列宽改为 min-width 弹性伸展，表格随容器宽度填满 -->
        <el-table v-loading="loading" :data="records" class="related-processes__table">
          <el-table-column :label="t('form.relatedProcessNameColumn')" min-width="300">
            <template #default="{ row }">
              <div class="related-processes__name-cell">
                <strong>{{ procRow(row).name }}</strong>
                <span>{{ procRow(row).processKey }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column :label="t('common.version')" min-width="100">
            <template #default="{ row }">{{ displayVersion(procRow(row)) }}</template>
          </el-table-column>
          <el-table-column :label="t('form.relatedProcessEnabledColumn')" min-width="110">
            <template #default="{ row }">
              <el-tag
                class="related-processes__status-tag"
                :type="statusTagType(procRow(row).status)"
                size="small"
              >
                {{ statusLabel(procRow(row).status) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column
            prop="createTime"
            :label="t('form.relatedProcessCreatedAtColumn')"
            min-width="180"
          />
          <el-table-column :label="t('form.relatedProcessCreatorColumn')" min-width="120">
            <template #default="{ row }">{{ procRow(row).updatedBy || '—' }}</template>
          </el-table-column>
          <el-table-column :label="t('form.relatedProcessActionColumn')" min-width="200">
            <template #default="{ row }">
              <!-- V011-BUG-019：编辑=当前页进入网格设计器；版本/更多为独立按钮 -->
              <div class="related-processes__actions">
                <el-button
                  class="related-processes__action"
                  size="small"
                  type="primary"
                  plain
                  @click="emit('enter-process', procRow(row))"
                >
                  {{ t('form.relatedProcessEditAction') }}
                </el-button>
                <el-button
                  class="related-processes__action"
                  size="small"
                  @click="openVersion(procRow(row))"
                >
                  {{ t('common.version') }}
                </el-button>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </section>

      <!-- V011-BUG-019：版本信息弹窗（当前行真实版本数据） -->
      <el-dialog
        v-model="versionVisible"
        :title="t('form.relatedProcessVersionTitle')"
        width="420px"
        append-to-body
      >
        <el-descriptions v-if="versionRow" :column="1" border>
          <el-descriptions-item :label="t('common.processName')">
            {{ versionRow.name }}
          </el-descriptions-item>
          <el-descriptions-item :label="t('common.version')">
            {{ displayVersion(versionRow) }}
          </el-descriptions-item>
          <el-descriptions-item :label="t('form.relatedProcessEnabledColumn')">
            {{ statusLabel(versionRow.status) }}
          </el-descriptions-item>
          <el-descriptions-item :label="t('form.relatedProcessCreatedAtColumn')">
            {{ versionRow.createTime }}
          </el-descriptions-item>
        </el-descriptions>
        <template #footer>
          <el-button @click="versionVisible = false">{{ t('common.close') }}</el-button>
        </template>
      </el-dialog>

      <div v-if="total > pageSize" class="related-processes__pager">
        <el-pagination
          layout="prev, pager, next"
          :total="total"
          :page-size="pageSize"
          :current-page="pageNum"
          @current-change="handlePageChange"
        />
      </div>
    </template>

    <el-dialog
      v-model="createVisible"
      :title="t('form.createRelatedProcess')"
      width="480px"
      append-to-body
    >
      <el-form label-width="90px" @submit.prevent>
        <el-form-item :label="t('common.formKey')">
          <el-input :model-value="formKey" disabled />
        </el-form-item>
        <el-form-item :label="t('common.processName')" required>
          <el-input
            v-model="newName"
            :placeholder="t('common.processNamePlaceholder')"
            maxlength="100"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="creating" @click="submitCreate">{{
          t('common.create')
        }}</el-button>
      </template>
    </el-dialog>

    <!-- BF20261013-043：多个流程时的编号设置选择 -->
    <el-dialog
      v-model="rulePickerVisible"
      :title="t('form.relatedProcessNumberSetting')"
      width="520px"
      append-to-body
    >
      <ul class="related-processes__rule-list">
        <li v-for="row in records" :key="row.id" class="related-processes__rule-row">
          <span class="related-processes__rule-name">{{ row.name }}</span>
          <span
            v-if="row.themeRule"
            class="related-processes__rule-value"
            :title="ruleTextOf(row)"
            >{{ ruleTextOf(row) }}</span
          >
          <span v-else class="related-processes__rule-value related-processes__rule-value--unset">{{
            t('workflow.themeRuleUnset')
          }}</span>
          <el-button size="small" @click="openRuleDialog(row)">{{ t('common.edit') }}</el-button>
        </li>
      </ul>
    </el-dialog>

    <!-- 流程编号规则编辑（与流程定义列表共用同一弹窗） -->
    <ThemeRuleDialog v-model:visible="ruleDialogVisible" :def="ruleTarget" @saved="load" />
  </div>
</template>

<style scoped>
.related-processes {
  flex: 1;
  min-height: 0;
  box-sizing: border-box;
  padding: 20px 48px 32px;
  overflow: auto;
}

/* 0.1.7 #25 回归：标题/描述/汇总计数噪音已去除（见模板注释），筛选栏即页首；
   「新建流程」紧随查询，两个按钮整体靠右 */
.related-processes__filter {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 82px;
  padding: 0 23px;
  box-sizing: border-box;
  border: 1px solid var(--sw-border-light, #e7ebf1);
  border-radius: 8px;
  background: var(--sw-surface, #fff);
}

.related-processes__search {
  width: 350px;
}

.related-processes__status {
  width: 130px;
}

.related-processes__status :deep(.el-input__inner) {
  line-height: 17px;
}

.related-processes__status :deep(.el-select__selected-item),
.related-processes__status :deep(.el-select__placeholder) {
  line-height: 17px;
}

.related-processes__filter-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-left: auto;
  flex: none;
}

.related-processes__query,
.related-processes__create {
  height: 36px;
  margin: 0;
  padding: 0 12px;
  line-height: 17px;
  /* BF20261013-046：按钮文字居中（原 fixture 左对齐，文字明显偏左） */
  text-align: center;
  justify-content: center;
}

.related-processes__query {
  width: 88px;
}
.related-processes__rule-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.related-processes__rule-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--sw-border-light, #e7ebf1);
}

.related-processes__rule-row:last-child {
  border-bottom: none;
}

.related-processes__rule-name {
  flex: 0 0 160px;
  overflow: hidden;
  color: var(--sw-text-primary, #1f2937);
  font-size: 14px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.related-processes__rule-value {
  flex: 1;
  overflow: hidden;
  color: var(--sw-text-secondary, #687386);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.related-processes__rule-value--unset {
  color: var(--el-color-warning, #e6a23c);
}

.related-processes__filter {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 82px;
  padding: 0 23px;
  box-sizing: border-box;
  border: 1px solid var(--sw-border-light, #e7ebf1);
  border-radius: 8px;
  background: var(--sw-surface, #fff);
}

.related-processes__search {
  width: 350px;
}

.related-processes__status {
  width: 130px;
}

.related-processes__status :deep(.el-input__inner) {
  line-height: 17px;
}

.related-processes__status :deep(.el-select__selected-item),
.related-processes__status :deep(.el-select__placeholder) {
  line-height: 17px;
}

.related-processes__filter-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: none;
  margin-left: auto;
}

.related-processes__query,
.related-processes__create {
  height: 36px;
  margin: 0;
  padding: 0 12px;
  line-height: 17px;
  /* BF20261013-046：按钮文字居中（原 fixture 左对齐，文字明显偏左） */
  text-align: center;
  justify-content: center;
}

.related-processes__query {
  width: 88px;
}

/* BF20261013-038 全局巡检：去掉 24px 23px 0 内距——表格即卡片首行，表头上方不再留空白行、
   左右不再留白（边框/圆角/固定高度保持）。 */
.related-processes__table-card {
  height: 518px;
  margin-top: 23px;
  padding: 0;
  box-sizing: border-box;
  overflow: hidden;
  border: 1px solid var(--sw-border-light, #e7ebf1);
  border-radius: 8px;
  background: var(--sw-surface, #fff);
}

.related-processes__table {
  width: 100%;
}

.related-processes__name-cell {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 95px;
  line-height: 1;
}

.related-processes__name-cell strong {
  color: var(--sw-text-primary, #1f2937);
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
}

.related-processes__name-cell span {
  margin-top: 7px;
  color: var(--sw-text-secondary, #687386);
  font-size: 12px;
  line-height: 15px;
}

.related-processes__status-tag {
  min-width: 84px;
  height: 24px;
  /* BF20261013-046：徽标文字居中（原 fixture 左对齐，84px 底纹里文字贴左） */
  justify-content: center;
  padding: 0 8px;
  box-sizing: border-box;
  line-height: 15px;
  text-align: center;
  border: none;
}
.related-processes__status-tag.el-tag--success,
.related-processes__status-tag.el-tag--success :deep(.el-tag__content) {
  color: #15a77f !important;
  background-color: #e6f8f2 !important;
  border-color: #b8ead8 !important;
}

.related-processes__actions {
  display: flex;
  gap: 8px;
}

.related-processes__actions .related-processes__action {
  margin: 0;
}

.related-processes__action {
  height: 28px;
  padding: 0 12px;
  font-size: 12px;
  border-radius: 4px;
  line-height: 16px;
}

.related-processes__empty {
  padding: var(--sw-space-32) 0;
  text-align: center;
  font-size: 13px;
  color: var(--sw-text-secondary, #909399);
}

.related-processes__table :deep(.el-table__header-wrapper th) {
  height: 46px;
  padding: 0;
  background: #f8fafc;
  color: var(--sw-text-secondary, #687386);
  font-size: 13px;
  font-weight: 500;
}

.related-processes__table :deep(th .cell) {
  line-height: 17px;
}

.related-processes__table :deep(.el-table__body-wrapper td) {
  height: 95px;
  padding: 0;
  color: var(--sw-text-primary, #1f2937);
  font-size: 14px;
}

.related-processes__table :deep(td .cell) {
  line-height: 19px;
}

.related-processes__table :deep(td.el-table__cell) {
  border-bottom: none;
}

.related-processes__table :deep(td.el-table__cell:last-child .cell) {
  padding-left: 3px;
}

.related-processes__table :deep(.el-table__body tr:nth-child(even) td) {
  background: #f8fafc;
}

.related-processes__table :deep(.el-table__inner-wrapper::before) {
  display: none;
}

.related-processes__search :deep(.el-input__wrapper),
.related-processes__status :deep(.el-select__wrapper) {
  height: 36px;
  min-height: 36px;
  box-sizing: border-box;
}

.related-processes__search :deep(.el-input__wrapper) {
  padding: 0;
}

.related-processes__search :deep(.el-input__inner) {
  height: 17px;
  line-height: 17px;
  padding: 0 12px;
}

.related-processes__table :deep(.el-table__body-wrapper) {
  overflow: hidden;
}

.related-processes__pager {
  display: flex;
  justify-content: flex-end;
  padding-top: var(--sw-space-12);
}
</style>
