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
import { ref, computed, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ApiError } from '@/foundation/request'
import { createProcessDef, pageProcessDefs, deleteProcessDef } from '@/modules/workflow/api'
import type { ProcessDef } from '@/contracts/bpm'

const props = defineProps<{ formId: string; formKey: string }>()
const emit = defineEmits<{ (e: 'enter-process', def: ProcessDef): void }>()

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
const publishedCount = computed(
  () => records.value.filter((record) => record.status === 'PUBLISHED').length,
)

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

/** 更多：删除关联流程（既有真实能力；发布中的流程是否可删由后端校验兜底）。 */
async function removeProcess(row: ProcessDef) {
  try {
    await ElMessageBox.confirm(
      t('form.relatedProcessDeleteConfirm', { name: row.name }),
      t('common.warningTitle'),
      {
        type: 'warning',
        confirmButtonText: t('common.delete'),
        cancelButtonText: t('common.cancel'),
      },
    )
  } catch {
    return
  }
  try {
    await deleteProcessDef(row.id)
    ElMessage.success(t('form.relatedProcessDeleted'))
    await load()
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('workflow.deleteFailed'))
  }
}

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
</script>

<template>
  <div class="related-processes">
    <div v-if="!hasFormKey" class="related-processes__empty">
      {{ t('form.noFormKeyHint') }}
    </div>

    <template v-else>
      <header class="related-processes__head">
        <h1 class="related-processes__title">{{ t('form.relatedProcessTitle') }}</h1>
        <p class="related-processes__subtitle">{{ t('form.relatedProcessDescription') }}</p>
        <el-button class="related-processes__create" type="primary" @click="openCreate">
          {{ t('form.createProcess') }}
        </el-button>
      </header>

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
        <el-button class="related-processes__query" type="primary" @click="load">
          {{ t('common.query') }}
        </el-button>
        <span class="related-processes__total">
          {{
            t('form.relatedProcessSummary', {
              total,
              published: publishedCount,
            })
          }}
        </span>
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
                <el-button
                  class="related-processes__action"
                  size="small"
                  @click="removeProcess(procRow(row))"
                >
                  {{ t('common.delete') }}
                </el-button>
              </div>
            </template>
          </el-table-column>
        </el-table>

        <p class="related-processes__footnote">{{ t('form.relatedProcessFootnote') }}</p>
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
  </div>
</template>

<style scoped>
.related-processes {
  flex: 1;
  min-height: 0;
  box-sizing: border-box;
  padding: 36px 48px 32px;
  overflow: auto;
}

.related-processes__head {
  position: relative;
  min-height: 63px;
}

.related-processes__title {
  margin: 0;
  color: var(--sw-text-primary, #1f2937);
  font-size: 28px;
  font-weight: 700;
  line-height: 38px;
}

.related-processes__subtitle {
  margin: 5px 0 0;
  color: var(--sw-text-secondary, #687386);
  font-size: 14px;
  line-height: 19px;
}

.related-processes__create {
  position: absolute;
  top: 8px;
  right: 2px;
  width: 140px;
  height: 36px;
  margin: 0;
  padding: 0 12px;
  line-height: 17px;
  text-align: left;
  justify-content: flex-start;
}

.related-processes__filter {
  position: relative;
  height: 82px;
  margin-top: 30px;
  padding: 0;
  box-sizing: border-box;
  border: 1px solid var(--sw-border-light, #e7ebf1);
  border-radius: 8px;
  background: var(--sw-surface, #fff);
}

.related-processes__filter-label {
  position: absolute;
  top: -7px;
  left: 24px;
  color: var(--sw-text-secondary, #687386);
  font-size: 12px;
  line-height: 17px;
}

.related-processes__search {
  position: absolute;
  top: 22px;
  left: 23px;
  width: 350px;
}

.related-processes__status {
  position: absolute;
  top: 24px;
  left: 393px;
  width: 130px;
}

.related-processes__status :deep(.el-input__inner) {
  line-height: 17px;
}

.related-processes__status :deep(.el-select__selected-item),
.related-processes__status :deep(.el-select__placeholder) {
  line-height: 17px;
}

.related-processes__query {
  position: absolute;
  top: 24px;
  left: 539px;
  width: 88px;
  height: 36px;
  padding: 0 12px;
  line-height: 17px;
  text-align: left;
  justify-content: flex-start;
}

.related-processes__total {
  position: absolute;
  top: 32px;
  left: 1079px;
  color: var(--sw-text-secondary, #687386);
  font-size: 14px;
  line-height: 17px;
}

.related-processes__table-card {
  height: 518px;
  margin-top: 23px;
  padding: 24px 23px 0;
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
  justify-content: flex-start;
  padding: 0 8px;
  box-sizing: border-box;
  line-height: 15px;
  text-align: left;
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

.related-processes__footnote {
  margin: 24px 12px 0;
  color: var(--sw-text-secondary, #687386);
  font-size: 12px;
  line-height: 17px;
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
