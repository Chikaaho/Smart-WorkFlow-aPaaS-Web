<script setup lang="ts">
import { enumLabel } from '@/foundation/i18n/enum-label'
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * MobileWorkspace — 移动端统一工作台（I4 §3.7，响应式 H5 正式形态）。
 * 覆盖：待办详情（任务/业务表单数据回显）、正式意见表单动态渲染（必填/显隐/初值）、
 * 发起入口、草稿、结果查询。与 PC 同一业务对象/API/权限（foundation/request +
 * 服务端当前身份），复杂意见表单在 H5 内原生完成，不以静态页或桌面跳转代替。
 */
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  queryTodoTasks,
  myDrafts,
  myInstances,
  acceptTaskAction,
  pollCommandStatus,
  queryTaskDetail,
  getInstanceDetail,
} from '@/modules/workflow/api'
import type { PageQuery } from '@/contracts/common'
import type { TaskDetail } from '@/contracts/bpm'
import { ApiError } from '@/foundation/request'
import { getFormData, loadOrgUserChoices } from '@/adapters/form-runtime'
import BusinessFormReadonly from '@/components/business-detail/BusinessFormReadonly.vue'

type MobileTab = 'todo' | 'initiated' | 'drafts'

// I6 G4b：收件箱深链恢复（ref=processInstanceId → 实例详情，服务端对象权限 fail closed）
const mRoute = useRoute()
const refInstance = ref<import('@/contracts/bpm').InstanceDetail | null>(null)
const refInstanceError = ref('')
const refVisible = ref(false)

const router = useRouter()
const activeTab = ref<MobileTab>('todo')
const loading = ref(false)
const errorMsg = ref('')

interface Row {
  taskId?: string
  id?: string | number
  name?: string
  processName?: string | null
  processDefinitionKey?: string
  formKey?: string
  status?: string
  createTime?: string
}

const rows = ref<Row[]>([])

// ─── 详情面板状态（R5：任务详情 + 业务表单数据 + 正式意见表单） ───
const detailVisible = ref(false)
const detailLoading = ref(false)
const detail = ref<TaskDetail | null>(null)
const formRecord = ref<Record<string, unknown> | null>(null)
const opinionData = ref<Record<string, unknown>>({})
const submitting = ref(false)
const submitError = ref('')

const isEmpty = computed(() => !loading.value && !errorMsg.value && rows.value.length === 0)

type OpinionField = NonNullable<NonNullable<TaskDetail['opinionForm']>['fields']>[number]

async function loadTab(tab: MobileTab) {
  loading.value = true
  errorMsg.value = ''
  const page: PageQuery = { pageNum: 1, pageSize: 20 }
  try {
    if (tab === 'todo') {
      rows.value = (await queryTodoTasks(page)).list as unknown as Row[]
    } else if (tab === 'initiated') {
      rows.value = (await myInstances(page)).list as unknown as Row[]
    } else {
      rows.value = (await myDrafts(page)).list as unknown as Row[]
    }
  } catch (err) {
    errorMsg.value = err instanceof ApiError ? err.msg : t('common.loadFailed')
  } finally {
    loading.value = false
  }
}

async function openTask(row: Row) {
  const taskId = String(row.taskId ?? '')
  if (!taskId) return
  detailVisible.value = true
  detailLoading.value = true
  detail.value = null
  formRecord.value = null
  opinionData.value = {}
  submitError.value = ''
  try {
    detail.value = await queryTaskDetail(taskId)
    initializeOpinionData()
    void ensureOpinionUsers()
    if (detail.value?.formKey && detail.value?.businessKey) {
      try {
        formRecord.value = await getFormData(detail.value.formKey, detail.value.businessKey)
      } catch {
        formRecord.value = null
      }
    }
  } catch (err) {
    submitError.value = err instanceof ApiError ? err.msg : t('workflow.mobileTaskDetailLoadFailed')
  } finally {
    detailLoading.value = false
  }
}

// ─── 正式意见表单：动态字段渲染（与 PC 同一配置与校验口径） ───
const opinionFields = computed(() => detail.value?.opinionForm?.fields ?? [])
const hasOpinionForm = computed(() => (detail.value?.opinionForm?.fields ?? []).length > 0)

function resolveOpinionVariable(expression: string): unknown {
  const variables = detail.value?.processVariables ?? {}
  const dot = expression.indexOf('.')
  if (expression.startsWith('variable.') && dot > 0) {
    const key = expression.slice(dot + 1)
    return (variables as Record<string, unknown>)[key]
  }
  return (variables as Record<string, unknown>)[expression]
}

function isOpinionFieldVisible(field: OpinionField): boolean {
  const visibleWhen = field.visibleWhen
  if (!visibleWhen) return true
  // 受控表达式仅支持「variable.<key> == <值>」单比较，与 PC 可见性口径一致；无法解析不展示
  const match = /^(variable\.[A-Za-z0-9_]+)\s*==\s*(.+)$/.exec(visibleWhen)
  if (!match) return true
  const actual = resolveOpinionVariable(match[1])
  const expected = match[2].trim().replace(/^['"]|['"]$/g, '')
  return String(actual) === expected
}

const visibleOpinionFields = computed(() => opinionFields.value.filter(isOpinionFieldVisible))

function initializeOpinionData() {
  const initial: Record<string, unknown> = {}
  for (const field of detail.value?.opinionForm?.fields ?? []) {
    if (!field.initialExpression || !isOpinionFieldVisible(field)) continue
    const value = resolveOpinionVariable(field.initialExpression)
    if (value !== undefined) initial[field.key] = value
  }
  opinionData.value = { ...initial }
}

/** 人员字段候选（已授权同租户启用用户）；加载失败保持空列表，提交后由服务端复核。 */
const opinionUsers = ref<Array<{ id: string; name: string }>>([])

async function ensureOpinionUsers(): Promise<void> {
  if (opinionUsers.value.length > 0) return
  if (!opinionFields.value.some((field) => field.type === 'USER')) return
  try {
    opinionUsers.value = await loadOrgUserChoices()
  } catch {
    opinionUsers.value = []
  }
}

function opinionFieldValue(field: OpinionField): unknown {
  return opinionData.value[field.key]
}

function setOpinionFieldValue(key: string, value: unknown) {
  opinionData.value[key] = value
}

function opinionRequiredMissing(): boolean {
  return visibleOpinionFields.value.some((field) => {
    if (!field.required || field.type === 'NOTE') return false
    const value = opinionData.value[field.key]
    return value == null || (typeof value === 'string' && value.trim() === '')
  })
}

async function submitHandle(action: 'APPROVE' | 'DISAPPROVE') {
  if (!detail.value) return
  // 反向：缺必填在 H5 内确定拒绝（后端 ApprovalOpinionValidator 同口径二次把关）
  if (hasOpinionForm.value && opinionRequiredMissing()) {
    ElMessage.warning(t('workflow.commentRequired'))
    return
  }
  submitting.value = true
  submitError.value = ''
  try {
    const payload: Record<string, unknown> = hasOpinionForm.value
      ? {
          opinionFormId: detail.value.opinionForm?.formId,
          opinionFormVersion: detail.value.opinionForm?.version,
          opinionData: { ...opinionData.value },
        }
      : { comment: '' }
    // 与 PC 同一命令受理链：受理后轮询命令终态，不以受理代替成功
    // 不通过意见走 disapprove 段（节点结算）；REJECT 是流程级终态，不再被移动端误用
    const accepted = await acceptTaskAction(
      detail.value.taskId,
      action === 'APPROVE' ? 'complete' : 'disapprove',
      payload,
    )
    const finalStatus = await pollCommandStatus(accepted.commandId)
    if (finalStatus?.status === 'COMPLETED') {
      ElMessage.success(t('workflow.handled'))
      detailVisible.value = false
      await loadTab('todo')
    } else if (finalStatus?.status === 'FAILED') {
      submitError.value = finalStatus.failureReason || t('workflow.actionFailedCommand')
    } else {
      ElMessage.info(t('workflow.processingCheckList'))
      detailVisible.value = false
    }
  } catch (err) {
    submitError.value = err instanceof ApiError ? err.msg : t('workflow.actionFailed')
  } finally {
    submitting.value = false
  }
}

function rowTitle(row: Row): string {
  return row.processName || row.name || t('workflow.taskDetail')
}

function handleTabChange(tab: string | number) {
  void loadTab(tab as MobileTab)
}

function opinionInputType(field: OpinionField): string {
  if (field.type === 'NUMBER') return 'number'
  if (field.type === 'DATETIME') return 'datetime-local'
  return 'text'
}

onMounted(() => void loadTab('todo'))

// 深链恢复：服务端重新鉴权（无权/不存在 → fail closed 错误提示），不依赖前端缓存的登录态
void (async () => {
  const refId = mRoute.query.ref
  if (typeof refId !== 'string' || !refId) return
  try {
    refInstance.value = await getInstanceDetail(refId)
    refVisible.value = true
  } catch (err) {
    // 非 ApiError（网络/超时）不能断言成无权限：那是在替后端下结论
    refInstanceError.value = err instanceof ApiError ? err.msg : t('common.loadFailed')
    refVisible.value = true
  }
})()
</script>

<template>
  <div class="mobile-workspace">
    <header class="m-header">
      <h1 class="m-title">{{ t('common.workspace') }}</h1>
      <el-button link type="primary" @click="router.push('/m/form/leave_form')">{{
        t('common.start')
      }}</el-button>
    </header>

    <el-tabs v-model="activeTab" @tab-change="handleTabChange">
      <el-tab-pane :label="t('workflow.todoTab')" name="todo" />
      <el-tab-pane :label="t('common.startedByMe')" name="initiated" />
      <el-tab-pane :label="t('common.statusDraft')" name="drafts" />
    </el-tabs>

    <el-alert v-if="errorMsg" :title="errorMsg" type="error" :closable="false" />

    <ul v-loading="loading" class="m-list">
      <li
        v-for="(row, index) in rows"
        :key="row.taskId ?? row.id ?? index"
        class="m-item"
        @click="activeTab === 'todo' ? openTask(row) : undefined"
      >
        <div class="m-item-title">{{ rowTitle(row) }}</div>
        <div class="m-item-meta">
          <span>{{
            activeTab === 'todo'
              ? t('workflow.pendingHandle')
              : activeTab === 'drafts'
                ? t('common.statusDraft')
                : enumLabel('WORKFLOW_INSTANCE', row.status)
          }}</span>
          <span>{{ row.createTime || '' }}</span>
        </div>
      </li>
      <li v-if="isEmpty" class="m-item m-empty">{{ t('common.emptyData') }}</li>
    </ul>

    <!-- I6 G4b：深链恢复的实例详情（只读，服务端对象权限已裁决） -->
    <el-drawer v-model="refVisible" size="92%" direction="btt" class="m-detail">
      <template #title>
        <span class="m-detail-title">{{ t('workflow.instanceDetailTitle') }}</span>
      </template>
      <div class="m-detail-body">
        <el-alert
          v-if="refInstanceError"
          :title="refInstanceError"
          type="error"
          :closable="false"
        />
        <template v-if="refInstance">
          <section class="m-section">
            <h3 class="m-section-title">{{ t('common.basicInfo') }}</h3>
            <div class="m-kv">
              <span>{{ t('common.status') }}</span
              ><b>{{ enumLabel('WORKFLOW_INSTANCE', refInstance.status) }}</b>
            </div>
            <div class="m-kv">
              <span>{{ t('common.initiator') }}</span
              ><b>{{ refInstance.initiatorName || '—' }}</b>
            </div>
          </section>
          <section class="m-section">
            <h3 class="m-section-title">{{ t('common.flowHistory') }}</h3>
            <div v-for="(trace, i) in refInstance.flowTrace || []" :key="i" class="m-kv">
              <span>{{ trace.activityName || '流程节点' }}</span>
              <b>{{ trace.assigneeName || '' }} {{ trace.endTime || '' }}</b>
            </div>
          </section>
        </template>
      </div>
    </el-drawer>

    <!-- 详情面板：任务/业务表单详情 + 正式意见表单 -->
    <el-drawer v-model="detailVisible" size="92%" direction="btt" class="m-detail">
      <template #title>
        <span class="m-detail-title">{{ detail?.taskName || t('workflow.taskDetail') }}</span>
      </template>
      <div v-loading="detailLoading" class="m-detail-body">
        <el-alert v-if="submitError" :title="submitError" type="error" :closable="false" />

        <template v-if="detail">
          <section class="m-section">
            <h3 class="m-section-title">{{ t('workflow.taskInfo') }}</h3>
            <div class="m-kv">
              <span>{{ t('common.processName') }}</span
              ><b>{{ detail.processName || '—' }}</b>
            </div>
            <div class="m-kv">
              <span>{{ t('common.initiator') }}</span
              ><b>{{ detail.initiatorName || '—' }}</b>
            </div>
            <div class="m-kv">
              <span>{{ t('workflow.currentAssignee') }}</span
              ><b>{{ detail.assigneeName || '—' }}</b>
            </div>
            <div class="m-kv">
              <span>{{ t('common.businessNo') }}</span
              ><b>{{ detail.businessKey || '—' }}</b>
            </div>
            <div class="m-kv">
              <span>{{ t('common.createTime') }}</span
              ><b>{{ detail.createTime || '—' }}</b>
            </div>
          </section>

          <section class="m-section">
            <h3 class="m-section-title">{{ t('workflow.formDataThisSubmission') }}</h3>
            <BusinessFormReadonly
              v-if="detail.formKey && formRecord"
              :form-key="detail.formKey"
              :record-id="detail.businessKey"
              :record="formRecord"
              class="m-business-form"
            />
            <p v-else class="m-empty-line">{{ t('workflow.formRecordUnavailable') }}</p>
          </section>

          <section class="m-section">
            <h3 class="m-section-title">
              {{
                hasOpinionForm ? t('workflow.approvalCommentFormal') : t('workflow.approvalComment')
              }}
            </h3>
            <div v-for="field in visibleOpinionFields" :key="field.key" class="m-opinion-field">
              <template v-if="field.type === 'NOTE'">
                <span class="m-opinion-note">{{ field.label }}</span>
              </template>
              <template v-else>
                <label :for="`op-${field.key}`" class="m-opinion-label">
                  {{ field.label || field.key
                  }}<span v-if="field.required" class="m-required"> *</span>
                </label>
                <textarea
                  v-if="field.type === 'TEXTAREA'"
                  :id="`op-${field.key}`"
                  class="m-input"
                  rows="3"
                  :maxlength="field.maxLength"
                  :value="(opinionFieldValue(field) as string) ?? ''"
                  @input="
                    setOpinionFieldValue(field.key, ($event.target as HTMLTextAreaElement).value)
                  "
                />
                <select
                  v-else-if="field.type === 'USER'"
                  :id="`op-${field.key}`"
                  class="m-input"
                  :value="String(opinionFieldValue(field) ?? '')"
                  @change="
                    setOpinionFieldValue(field.key, ($event.target as HTMLSelectElement).value)
                  "
                >
                  <option value="">{{ t('common.pleaseSelect') }}</option>
                  <option v-for="user in opinionUsers" :key="user.id" :value="user.id">
                    {{ user.name }}
                  </option>
                </select>
                <select
                  v-else-if="field.type === 'SELECT'"
                  :id="`op-${field.key}`"
                  class="m-input"
                  :value="String(opinionFieldValue(field) ?? '')"
                  @change="
                    setOpinionFieldValue(field.key, ($event.target as HTMLSelectElement).value)
                  "
                >
                  <option value="">{{ t('common.pleaseSelect') }}</option>
                  <option v-for="option in field.options ?? []" :key="option" :value="option">
                    {{ option }}
                  </option>
                </select>
                <div v-else-if="field.type === 'RADIO'" class="m-opinion-options">
                  <label
                    v-for="option in field.options ?? []"
                    :key="option"
                    class="m-opinion-option"
                  >
                    <input
                      type="radio"
                      :name="`op-${field.key}`"
                      :value="option"
                      :checked="opinionFieldValue(field) === option"
                      @change="setOpinionFieldValue(field.key, option)"
                    />
                    {{ option }}
                  </label>
                </div>
                <div v-else-if="field.type === 'CHECKBOX'" class="m-opinion-options">
                  <label
                    v-for="option in field.options ?? []"
                    :key="option"
                    class="m-opinion-option"
                  >
                    <input
                      type="checkbox"
                      :name="`op-${field.key}`"
                      :value="option"
                      :checked="
                        Array.isArray(opinionFieldValue(field)) &&
                        (opinionFieldValue(field) as unknown[]).includes(option)
                      "
                      @change="
                        (e) => {
                          const current = Array.isArray(opinionFieldValue(field))
                            ? [...(opinionFieldValue(field) as unknown[])]
                            : []
                          const target = e.target as HTMLInputElement
                          const next = target.checked
                            ? [...current, option]
                            : current.filter((v) => v !== option)
                          setOpinionFieldValue(field.key, next)
                        }
                      "
                    />
                    {{ option }}
                  </label>
                </div>
                <input
                  v-else
                  :id="`op-${field.key}`"
                  class="m-input"
                  :type="opinionInputType(field)"
                  :value="(opinionFieldValue(field) as string | number) ?? ''"
                  :min="field.min"
                  :max="field.max"
                  :maxlength="field.maxLength"
                  @input="
                    setOpinionFieldValue(
                      field.key,
                      field.type === 'NUMBER'
                        ? Number(($event.target as HTMLInputElement).value)
                        : ($event.target as HTMLInputElement).value,
                    )
                  "
                />
              </template>
            </div>
          </section>

          <div class="m-actions">
            <el-button :disabled="submitting" @click="detailVisible = false">{{
              t('common.cancel')
            }}</el-button>
            <!-- 服务端办理权限门控：已办/只读身份不展示审批动作（V012-BUG-001），后端仍是最终权威 -->
            <template v-if="detail?.canHandle === true">
              <el-button type="danger" :loading="submitting" @click="submitHandle('DISAPPROVE')">
                {{ t('workflow.disapprove') }}
              </el-button>
              <el-button type="primary" :loading="submitting" @click="submitHandle('APPROVE')">{{
                t('common.approve')
              }}</el-button>
            </template>
          </div>
        </template>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
.mobile-workspace {
  max-width: 720px;
  margin: 0 auto;
  padding: 12px 14px;
}
.m-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.m-header :deep(.el-button) {
  min-width: 40px;
  min-height: 40px;
  padding: 10px 12px;
}
.m-title {
  font-size: 20px;
  font-weight: 600;
  color: #303133;
}
.m-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.m-item {
  border: 1px solid #ebeef5;
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 10px;
  background: #fff;
}
.m-item-title {
  font-size: 14px;
  font-weight: 500;
  color: #303133;
}
.m-item-meta {
  display: flex;
  justify-content: space-between;
  margin-top: 6px;
  font-size: 12px;
  color: var(--sw-text-secondary);
}
.m-empty {
  text-align: center;
  color: var(--sw-text-secondary);
}
.m-detail-title {
  font-size: 16px;
  font-weight: 600;
}
.m-detail-body {
  padding-bottom: 12px;
}
.m-section {
  margin-bottom: 16px;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  padding: 10px 12px;
  background: #fff;
}
.m-section-title {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--sw-color-primary);
  border-bottom: 1px solid #ebeef5;
  padding-bottom: 6px;
}
.m-kv {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
  padding: 4px 0;
}
.m-kv span {
  color: var(--sw-text-secondary);
}
.m-kv b {
  color: #303133;
  font-weight: 500;
  text-align: right;
  word-break: break-all;
}
.m-empty-line {
  color: var(--sw-text-secondary);
  font-size: 13px;
}
.m-business-form :deep(.business-form__grid) {
  grid-template-columns: minmax(0, 1fr);
}
.m-business-form :deep(.business-form__field) {
  grid-column: 1 / -1 !important;
}
.m-opinion-field {
  margin-bottom: 10px;
  display: flex;
  flex-direction: column;
}
.m-opinion-label {
  font-size: 13px;
  color: #606266;
  margin-bottom: 4px;
}
.m-required {
  color: var(--sw-danger);
}
.m-input {
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  padding: 8px;
  font-size: 14px;
  width: 100%;
  box-sizing: border-box;
}
.m-opinion-note {
  font-size: 12px;
  color: var(--sw-text-secondary);
}
.m-opinion-options {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.m-opinion-option {
  font-size: 13px;
  color: #303133;
}
.m-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 4px;
}
.m-actions :deep(.el-button) {
  min-height: 40px;
}
</style>
