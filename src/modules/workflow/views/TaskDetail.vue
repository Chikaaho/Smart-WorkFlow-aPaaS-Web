<script setup lang="ts">
/**
 * TaskDetail — 任务详情页。
 *
 * 展示任务详情信息、流程变量、审批历史，提供通过/驳回操作。
 * 路由参数：taskId
 */
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  queryTaskDetail,
  acceptTaskAction,
  pollCommandStatus,
  transferTask,
  delegateTask,
  communicateTask,
  addSignTask,
  supplementSignInstance,
  type TaskActionSegment,
} from '@/modules/workflow/api'
import { ApiError } from '@/foundation/request'
import type { ApprovalHistoryItem, TaskDetail } from '@/contracts/bpm'
import type { ApprovalActionRequest, ApprovalOpinionConfig } from '@/contracts/bpm-node'
import type { FormSchema } from '@/contracts/form-schema'

const router = useRouter()
const route = useRoute()

const taskId = route.params.taskId as string

// ─── 页面状态 ───
const detail = ref<TaskDetail | null>(null)
const loading = ref(false)
const errorMsg = ref('')
const acting = ref<string | null>(null) // 'approve' | 'reject' | null
const opinionComment = ref('')
const opinionData = ref<Record<string, unknown>>({})
const returnTargetNodeId = ref('')
/** 本次提交的表单记录数据（businessKey = 表单记录 ID，经 form 模块只读接口回查） */
const formRecord = ref<Record<string, unknown> | null>(null)
const formRecordLoading = ref(false)
/** 表单定义（用于把内部字段名映射为业务字段标签） */
const formSchema = ref<FormSchema | null>(null)
/** REFERENCE 字段显示名缓存（id→可读关联对象信息，授权单查解析，取不到回退 id）。 */
const refDisplayMap = ref<Record<string, string>>({})

/** 表单宽表的系统列：与业务数据无关，不在审批详情展示 */
const SYSTEM_COLUMNS = new Set([
  'id',
  'create_by',
  'create_time',
  'update_by',
  'update_time',
  'del_flag',
  'tenant_id',
  'version',
])

/** 表单数据行：按 schema 字段顺序输出业务标签，系统列与未定义字段不展示 */
const formFieldRows = computed(() => {
  if (!formRecord.value) return []
  const rows: { key: string; label: string; value: string }[] = []
  const seen = new Set<string>()
  if (formSchema.value) {
    for (const field of formSchema.value.fields) {
      const recordKey = field.type === 'REFERENCE' ? 'ref_' + field.name + '_id' : field.name
      if (SYSTEM_COLUMNS.has(field.name) || !(recordKey in formRecord.value)) continue
      seen.add(field.name)
      const v = formRecord.value[recordKey]
      rows.push({
        key: field.name,
        label: field.label || field.name,
        value:
          v == null || v === ''
            ? '-'
            : field.type === 'REFERENCE'
              ? (refDisplayMap.value[field.name] ?? String(v))
              : String(v),
      })
    }
  }
  for (const [k, v] of Object.entries(formRecord.value)) {
    if (SYSTEM_COLUMNS.has(k) || seen.has(k)) continue
    rows.push({ key: k, label: k, value: v == null || v === '' ? '-' : String(v) })
  }
  return rows
})

function formatTaskId(id: string): string {
  return id.length > 8 ? `...${id.slice(-8)}` : id
}

async function loadDetail() {
  loading.value = true
  errorMsg.value = ''
  try {
    detail.value = await queryTaskDetail(taskId)
    initializeOpinionData(detail.value)
    void loadFormRecord()
  } catch (err) {
    if (err instanceof ApiError) {
      errorMsg.value = err.msg
    } else {
      errorMsg.value = '加载任务详情失败'
    }
  } finally {
    loading.value = false
  }
}

/** 按 formKey + businessKey 回查本次提交的表单数据；失败不阻断审批主链 */
async function resolveRefDisplays() {
  refDisplayMap.value = {}
  if (!formSchema.value || !formRecord.value) return
  const { resolveReferenceDisplay } = await import('@/modules/form/utils/resolve-reference-display')
  for (const field of formSchema.value.fields) {
    if (field.type !== 'REFERENCE') continue
    const refId = formRecord.value['ref_' + field.name + '_id']
    if (refId == null || refId === '') continue
    try {
      refDisplayMap.value[field.name] = await resolveReferenceDisplay(
        String(field.targetFormId ?? ''),
        String(refId),
      )
    } catch {
      refDisplayMap.value[field.name] = String(refId)
    }
  }
}

async function loadFormRecord() {
  const d = detail.value
  if (!d?.formKey || !d.businessKey) return
  formRecordLoading.value = true
  try {
    const { getFormData, getFormDefinition } = await import('@/modules/form/api/form')
    formRecord.value = await getFormData(d.formKey, d.businessKey)
    try {
      formSchema.value = await getFormDefinition(d.formKey)
    } catch {
      formSchema.value = null
    }
    await resolveRefDisplays()
  } catch {
    formRecord.value = null
  } finally {
    formRecordLoading.value = false
  }
}

function goBack() {
  router.push({ name: 'TodoList' })
}

/**
 * 审批 API 已成功提交后，页面导航失败不应被误报为审批失败。
 * 例如重复导航、守卫竞态或目标页面刷新都可能让 router.push reject，
 * 但此时业务动作已经落库，不能再显示相反的错误提示。
 */
async function navigateAfterAction() {
  try {
    await router.push({ name: 'TodoList' })
  } catch {
    // 业务动作已完成，导航失败不影响动作结果。
  }
}

const returnTargets = computed(() =>
  (detail.value?.approvalHistory ?? []).filter(
    (item): item is ApprovalHistoryItem & { nodeKey: string } =>
      typeof item.nodeKey === 'string' &&
      item.nodeKey.length > 0 &&
      item.nodeKey !== detail.value?.taskId,
  ),
)

function actionPayload(
  action: ApprovalActionRequest['action'],
): Partial<ApprovalActionRequest> | undefined {
  const form = detail.value?.opinionForm
  const comment = opinionComment.value.trim()
  if (!form || !form.formId || !form.version) {
    return comment ? { action, comment, opinionData: { comment } } : undefined
  }
  const data = { ...opinionData.value }
  if (comment && data.comment == null) data.comment = comment
  return {
    action,
    opinionFormId: form.formId,
    opinionFormVersion: form.version,
    comment: typeof data.comment === 'string' ? data.comment : undefined,
    opinionData: data,
  }
}

const opinionFields = computed(() => detail.value?.opinionForm?.fields ?? [])

/** 前端只做显示/初始值计算，后端 ApprovalOpinionValidator 仍是最终权威。 */
function resolveOpinionVariable(path: string): unknown {
  const normalized = path.trim().replace(/^form\./, '')
  let current: unknown = detail.value?.processVariables?.formData
  for (const part of normalized.split('.')) {
    if (!part || typeof current !== 'object' || current === null) return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

function opinionExpressionMatches(expression: string): boolean {
  const text = expression.trim()
  const match = text.match(
    /^([\w.]+)\s*(===|==|!=|>=|<=|>|<)\s*(?:['"]([^'"]*)['"]|(-?\d+(?:\.\d+)?)|(true|false))$/,
  )
  if (!match) return false
  const left = resolveOpinionVariable(match[1])
  const right: unknown =
    match[3] ?? (match[4] !== undefined ? Number(match[4]) : match[5] === 'true')
  if (match[2] === '==' || match[2] === '===') return String(left) === String(right)
  if (match[2] === '!=') return String(left) !== String(right)
  if (typeof left !== 'number' || typeof right !== 'number') return false
  return match[2] === '>'
    ? left > right
    : match[2] === '>='
      ? left >= right
      : match[2] === '<'
        ? left < right
        : left <= right
}

function isOpinionFieldVisible(
  field: NonNullable<ApprovalOpinionConfig['fields']>[number],
): boolean {
  return !field.visibleWhen || opinionExpressionMatches(field.visibleWhen)
}

const visibleOpinionFields = computed(() => opinionFields.value.filter(isOpinionFieldVisible))

function initializeOpinionData(task: TaskDetail) {
  const initial: Record<string, unknown> = {}
  for (const field of task.opinionForm?.fields ?? []) {
    if (!field.initialExpression || !isOpinionFieldVisible(field)) continue
    const value = resolveOpinionVariable(field.initialExpression)
    if (value !== undefined) initial[field.key] = value
  }
  opinionData.value = { ...initial }
}

function opinionFieldValue(field: NonNullable<ApprovalOpinionConfig['fields']>[number]): unknown {
  return opinionData.value[field.key]
}

function opinionTextValue(
  field: NonNullable<ApprovalOpinionConfig['fields']>[number],
): string | undefined {
  const value = opinionFieldValue(field)
  return value == null ? undefined : String(value)
}

function opinionInputValue(
  field: NonNullable<ApprovalOpinionConfig['fields']>[number],
): string | number | undefined {
  const value = opinionFieldValue(field)
  return typeof value === 'number' || typeof value === 'string' ? value : undefined
}

function setOpinionFieldValue(key: string, value: unknown) {
  opinionData.value[key] = value
}

function opinionFieldRequiredMissing(): boolean {
  return visibleOpinionFields.value.some((field) => {
    if (!field.required || field.type === 'NOTE') return false
    const value = opinionData.value[field.key]
    return value == null || (typeof value === 'string' && value.trim() === '')
  })
}

function ensureOpinionData(): boolean {
  if (!opinionFieldRequiredMissing()) return true
  ElMessage.warning('请填写必填审批意见')
  return false
}

/**
 * 异步命令通道公共链路：受理（ACCEPTED ≠ 成功）→ 轮询命令状态到终态。
 * COMPLETED → 成功并导航；FAILED → 展示失败原因；超时 → 如实提示「处理中」。
 */
async function runAction(
  actionSegment: TaskActionSegment,
  payload: Partial<ApprovalActionRequest> | undefined,
  successMsg: string,
  failMsg: string,
): Promise<void> {
  try {
    const accept = await acceptTaskAction(taskId, actionSegment, payload)
    const finalStatus = await pollCommandStatus(accept.commandId)
    if (finalStatus?.status === 'COMPLETED') {
      ElMessage.success(successMsg)
      await navigateAfterAction()
    } else if (finalStatus?.status === 'FAILED') {
      ElMessage.error(finalStatus.failureReason ?? failMsg)
      acting.value = null
    } else {
      ElMessage.warning('处理中，可稍后在结果中查看')
      acting.value = null
    }
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : failMsg)
    acting.value = null
  }
}

async function handleApprove() {
  if (acting.value) return
  if (!ensureOpinionData()) return
  acting.value = 'approve'

  let confirmed = false
  try {
    await ElMessageBox.confirm('确认审批通过此任务？', '审批确认', {
      confirmButtonText: '通过',
      cancelButtonText: '取消',
      type: 'info',
    })
    confirmed = true
  } catch {
    return
  } finally {
    if (!confirmed) acting.value = null
  }
  await runAction('complete', actionPayload('APPROVE'), '审批通过', '审批操作失败')
}

async function handleReject() {
  if (acting.value) return
  if (!ensureOpinionData()) return
  acting.value = 'reject'

  let confirmed = false
  try {
    await ElMessageBox.confirm('确认驳回此任务？', '驳回确认', {
      confirmButtonText: '驳回',
      cancelButtonText: '取消',
      type: 'warning',
    })
    confirmed = true
  } catch {
    return
  } finally {
    if (!confirmed) acting.value = null
  }
  await runAction('reject', actionPayload('REJECT'), '已驳回', '驳回操作失败')
}

async function handleReturn() {
  if (acting.value) return
  const target = returnTargetNodeId.value || returnTargets.value[0]?.nodeKey
  if (!target) {
    ElMessage.warning('当前没有可退回的已通过人工节点')
    return
  }
  try {
    await ElMessageBox.confirm('确认将流程退回所选人工节点？', '退回确认', {
      confirmButtonText: '退回',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }
  acting.value = 'return'
  await runAction(
    'return',
    { action: 'RETURN', returnTargetNodeId: target, ...actionPayload('RETURN') },
    '已退回',
    '退回操作失败',
  )
}

// ═════════ I3 生命周期动作（转办/委托/沟通/加签/补签） ═══════════════════

const lifecycleDialogVisible = computed({
  get: () => lifecycleDialog.value !== null,
  set: (value: boolean) => {
    if (!value) lifecycleDialog.value = null
  },
})

const lifecycleDialog = ref<null | {
  kind: 'TRANSFER' | 'DELEGATE' | 'COMMUNICATE' | 'ADD_SIGN' | 'SUPPLEMENT_SIGN'
  targetUserId?: number
  message?: string
  receivers?: string
  participants?: string
  mode?: 'SERIAL' | 'PARALLEL'
}>(null)
const lifecycleSubmitting = ref(false)

const LIFECYCLE_META: Record<string, { title: string; confirm: string }> = {
  TRANSFER: { title: '转办任务', confirm: '确认转办？转出人失去当前办理权' },
  DELEGATE: { title: '委托任务', confirm: '确认委托？受托人完成后回到原责任人' },
  COMMUNICATE: { title: '沟通征询', confirm: '确认发起沟通？接收人不获得审批权' },
  ADD_SIGN: { title: '加签', confirm: '确认向所选人员追加签批？' },
  SUPPLEMENT_SIGN: { title: '补签', confirm: '确认对原实例/原节点补充确认？补签不改写原终态' },
}

function openLifecycle(
  kind: 'TRANSFER' | 'DELEGATE' | 'COMMUNICATE' | 'ADD_SIGN' | 'SUPPLEMENT_SIGN',
) {
  if (acting.value) return
  lifecycleDialog.value = { kind, mode: 'PARALLEL' }
}

async function submitLifecycle() {
  const dialog = lifecycleDialog.value
  if (!dialog || !detail.value) return
  const meta = LIFECYCLE_META[dialog.kind]
  let payload: Partial<ApprovalActionRequest>
  if (dialog.kind === 'TRANSFER' || dialog.kind === 'DELEGATE') {
    const target = Number(dialog.targetUserId)
    if (!target || target <= 0) {
      ElMessage.warning('请填写有效的目标用户 ID')
      return
    }
    payload = { targetUserId: target, reason: opinionComment.value || undefined }
  } else if (dialog.kind === 'COMMUNICATE') {
    const receivers = (dialog.receivers ?? '')
      .split(',')
      .map((item) => Number(item.trim()))
      .filter((item) => Number.isInteger(item) && item > 0)
    if (receivers.length === 0) {
      ElMessage.warning('请填写至少一个沟通接收人用户 ID（逗号分隔）')
      return
    }
    payload = { receivers, message: dialog.message ?? '' }
  } else {
    const raw = (dialog.participants ?? '')
      .split(',')
      .map((item) => Number(item.trim()))
      .filter((item) => Number.isInteger(item) && item > 0)
    if (raw.length === 0) {
      ElMessage.warning('请填写至少一个参与人用户 ID（逗号分隔）')
      return
    }
    if (dialog.kind === 'ADD_SIGN') {
      payload = {
        participants: raw,
        mode: dialog.mode ?? 'PARALLEL',
        comment: opinionComment.value || undefined,
      }
    } else {
      payload = { participants: raw, nodeKey: detail.value.processDefinitionKey ?? undefined }
    }
  }
  lifecycleSubmitting.value = true
  try {
    if (dialog.kind === 'TRANSFER') {
      await transferTask(taskId, payload)
    } else if (dialog.kind === 'DELEGATE') {
      await delegateTask(taskId, payload)
    } else if (dialog.kind === 'COMMUNICATE') {
      await communicateTask(taskId, payload)
    } else if (dialog.kind === 'ADD_SIGN') {
      await addSignTask(taskId, payload)
    } else {
      await supplementSignInstance(detail.value.processInstanceId, payload)
    }
    ElMessage.success(meta.title + '已提交')
    lifecycleDialog.value = null
    await navigateAfterAction()
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : meta.title + '操作失败')
  } finally {
    lifecycleSubmitting.value = false
  }
}

function formatVariables(vars: Record<string, unknown>): [string, string][] {
  return Object.entries(vars).map(([k, v]) => [k, String(v)])
}

// ─── 审批结果映射 ───
const APPROVAL_RESULT_MAP: Record<string, { label: string; type: 'success' | 'danger' | 'info' }> =
  {
    APPROVED: { label: '通过', type: 'success' },
    REJECTED: { label: '驳回', type: 'danger' },
  }

function getApprovalResultLabel(result: string | null): string {
  if (!result) return '进行中'
  return APPROVAL_RESULT_MAP[result]?.label ?? result
}

function getApprovalResultType(result: string | null): 'success' | 'danger' | 'info' {
  if (!result) return 'info'
  return APPROVAL_RESULT_MAP[result]?.type ?? 'info'
}

function opinionInputType(field: NonNullable<ApprovalOpinionConfig['fields']>[number]): string {
  if (field.type === 'DATETIME') return 'datetime-local'
  if (field.type === 'NUMBER') return 'number'
  return 'text'
}

onMounted(loadDetail)
</script>

<template>
  <div v-loading="loading" class="task-detail">
    <!-- 顶栏 -->
    <div class="detail-header">
      <el-button @click="goBack">← 返回待办</el-button>
      <h2>任务详情</h2>
    </div>

    <!-- 错误提示 -->
    <el-alert
      v-if="errorMsg"
      :title="errorMsg"
      type="error"
      :closable="false"
      show-icon
      style="margin-bottom: 16px"
    />

    <!-- 任务信息 -->
    <el-card v-if="detail" class="detail-card">
      <template #header><span>基本信息</span></template>
      <el-descriptions :column="2" border>
        <el-descriptions-item label="任务名称">{{ detail.taskName }}</el-descriptions-item>
        <el-descriptions-item label="任务编号">
          <span :title="detail.taskId">{{ formatTaskId(detail.taskId) }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="流程名称">{{
          detail.processName ?? '-'
        }}</el-descriptions-item>
        <el-descriptions-item label="流程标识">{{
          detail.processDefinitionKey
        }}</el-descriptions-item>
        <el-descriptions-item label="表单标识">{{ detail.formKey }}</el-descriptions-item>
        <el-descriptions-item label="业务单号">{{ detail.businessKey }}</el-descriptions-item>
        <el-descriptions-item label="当前审批人">
          {{ detail.assigneeName ?? detail.assignee }}
        </el-descriptions-item>
        <el-descriptions-item label="发起人">
          {{ detail.initiatorName ?? detail.initiatorId }}
        </el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ detail.createTime }}</el-descriptions-item>
      </el-descriptions>
    </el-card>

    <!-- 本次提交的表单数据 -->
    <el-card v-if="detail?.formKey && detail?.businessKey" class="detail-card">
      <template #header><span>表单数据（本次提交）</span></template>
      <div v-loading="formRecordLoading">
        <el-alert
          v-if="!formRecordLoading && !formRecord"
          title="表单记录加载失败或已不存在"
          type="warning"
          :closable="false"
          show-icon
        />
        <el-descriptions v-else-if="formFieldRows.length > 0" :column="2" border>
          <el-descriptions-item v-for="row in formFieldRows" :key="row.key" :label="row.label">
            {{ row.value }}
          </el-descriptions-item>
        </el-descriptions>
        <el-descriptions v-else-if="formRecord" :column="2" border>
          <el-descriptions-item label="说明">该表单无可展示业务字段</el-descriptions-item>
        </el-descriptions>
      </div>
    </el-card>

    <!-- 流程变量 -->
    <el-card v-if="detail && Object.keys(detail.processVariables).length > 0" class="detail-card">
      <template #header><span>流程变量</span></template>
      <el-table :data="formatVariables(detail.processVariables)" stripe>
        <el-table-column prop="0" label="变量名" min-width="180" />
        <el-table-column prop="1" label="变量值" min-width="280" />
      </el-table>
    </el-card>

    <!-- 审批历史 -->
    <el-card v-if="detail" class="detail-card">
      <template #header><span>审批历史</span></template>
      <el-alert
        v-if="detail.approvalHistory.length === 0"
        title="暂无审批历史"
        type="info"
        :closable="false"
        show-icon
      />
      <el-table v-else :data="detail.approvalHistory" stripe>
        <el-table-column label="任务编号" min-width="140">
          <template #default="{ row }">
            <span :title="row.taskId">{{ formatTaskId(row.taskId) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="taskName" label="任务名称" min-width="120" />
        <el-table-column label="审批人" min-width="120">
          <template #default="{ row }">
            {{ row.assigneeName ?? row.assignee ?? '-' }}
          </template>
        </el-table-column>
        <el-table-column label="审批结果" min-width="100">
          <template #default="{ row }">
            <el-tag :type="getApprovalResultType(row.approvalResult)" size="small">
              {{ getApprovalResultLabel(row.approvalResult) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="动作/意见" min-width="180">
          <template #default="{ row }">
            {{ row.action ?? '-'
            }}{{ row.opinionData?.comment ? `：${row.opinionData.comment}` : '' }}
          </template>
        </el-table-column>
        <el-table-column prop="createTime" label="创建时间" min-width="170" />
        <el-table-column label="完成时间" min-width="170">
          <template #default="{ row }">
            {{ row.endTime ?? '-' }}
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 操作栏 -->
    <div v-if="detail" class="detail-actions">
      <div v-if="returnTargets.length > 0" class="return-config">
        <span>退回到</span>
        <el-select v-model="returnTargetNodeId" placeholder="选择已通过节点" style="width: 180px">
          <el-option
            v-for="target in returnTargets"
            :key="target.nodeKey"
            :label="target.taskName"
            :value="target.nodeKey"
          />
        </el-select>
        <el-button
          type="warning"
          size="large"
          :loading="acting === 'return'"
          :disabled="acting !== null"
          @click="handleReturn"
        >
          退回
        </el-button>
      </div>
      <div v-if="opinionFields.length > 0" class="opinion-form">
        <div class="opinion-form__title">
          审批意见{{
            detail.opinionForm?.formId
              ? `（${detail.opinionForm.formId} v${detail.opinionForm.version}）`
              : ''
          }}
        </div>
        <div v-for="field in visibleOpinionFields" :key="field.key" class="opinion-field">
          <template v-if="field.type === 'NOTE'">
            <span class="opinion-note">{{ field.label }}</span>
          </template>
          <template v-else>
            <label :for="`opinion-${field.key}`">
              {{ field.label || field.key
              }}<span v-if="field.required" class="required-mark"> *</span>
            </label>
            <textarea
              v-if="field.type === 'TEXTAREA'"
              :id="`opinion-${field.key}`"
              :value="opinionTextValue(field)"
              :maxlength="field.maxLength"
              rows="3"
              @input="setOpinionFieldValue(field.key, ($event.target as HTMLTextAreaElement).value)"
            />
            <select
              v-else-if="field.type === 'SELECT'"
              :id="`opinion-${field.key}`"
              :value="String(opinionFieldValue(field) ?? '')"
              @change="setOpinionFieldValue(field.key, ($event.target as HTMLSelectElement).value)"
            >
              <option value="">请选择</option>
              <option v-for="option in field.options ?? []" :key="option" :value="option">
                {{ option }}
              </option>
            </select>
            <div v-else-if="field.type === 'RADIO'" class="opinion-options">
              <label v-for="option in field.options ?? []" :key="option" class="opinion-option">
                <input
                  :name="`opinion-${field.key}`"
                  type="radio"
                  :value="option"
                  :checked="opinionFieldValue(field) === option"
                  @change="setOpinionFieldValue(field.key, option)"
                />
                {{ option }}
              </label>
            </div>
            <input
              v-else
              :id="`opinion-${field.key}`"
              :type="opinionInputType(field)"
              :value="opinionInputValue(field)"
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
      </div>
      <textarea
        v-if="opinionFields.length === 0"
        v-model="opinionComment"
        class="opinion-input"
        rows="3"
        placeholder="备注（可选）"
      />
      <el-button
        type="primary"
        size="large"
        :loading="acting === 'approve'"
        :disabled="acting !== null"
        @click="handleApprove"
      >
        审批通过
      </el-button>
      <el-button
        type="danger"
        size="large"
        :loading="acting === 'reject'"
        :disabled="acting !== null"
        @click="handleReject"
      >
        驳回
      </el-button>
      <el-divider direction="vertical" />
      <el-button size="large" :disabled="acting !== null" @click="openLifecycle('TRANSFER')">
        转办
      </el-button>
      <el-button size="large" :disabled="acting !== null" @click="openLifecycle('DELEGATE')">
        委托
      </el-button>
      <el-button size="large" :disabled="acting !== null" @click="openLifecycle('COMMUNICATE')">
        沟通
      </el-button>
      <el-button size="large" :disabled="acting !== null" @click="openLifecycle('ADD_SIGN')">
        加签
      </el-button>
      <el-button size="large" :disabled="acting !== null" @click="openLifecycle('SUPPLEMENT_SIGN')">
        补签
      </el-button>
    </div>

    <!-- I3 生命周期动作弹窗 -->
    <el-dialog
      v-model="lifecycleDialogVisible"
      :title="lifecycleDialog ? LIFECYCLE_META[lifecycleDialog.kind].title : ''"
      width="420px"
      :close-on-click-modal="false"
    >
      <el-form label-position="top" size="small">
        <template
          v-if="lifecycleDialog?.kind === 'TRANSFER' || lifecycleDialog?.kind === 'DELEGATE'"
        >
          <el-form-item label="目标用户 ID">
            <el-input v-model.number="lifecycleDialog.targetUserId" placeholder="正整数用户 ID" />
          </el-form-item>
        </template>
        <template v-if="lifecycleDialog?.kind === 'COMMUNICATE'">
          <el-form-item label="接收人用户 ID（逗号分隔）">
            <el-input v-model="lifecycleDialog.receivers" placeholder="如 1,2,3" />
          </el-form-item>
          <el-form-item label="征询内容">
            <el-input v-model="lifecycleDialog.message" type="textarea" :rows="3" />
          </el-form-item>
        </template>
        <template v-if="lifecycleDialog?.kind === 'ADD_SIGN'">
          <el-form-item label="参与人用户 ID（逗号分隔）">
            <el-input v-model="lifecycleDialog.participants" placeholder="如 2,3" />
          </el-form-item>
          <el-form-item label="顺序">
            <el-radio-group v-model="lifecycleDialog.mode">
              <el-radio value="PARALLEL">并行</el-radio>
              <el-radio value="SERIAL">串行</el-radio>
            </el-radio-group>
          </el-form-item>
        </template>
        <template v-if="lifecycleDialog?.kind === 'SUPPLEMENT_SIGN'">
          <el-form-item label="补充确认人用户 ID（逗号分隔）">
            <el-input v-model="lifecycleDialog.participants" placeholder="如 2,3" />
          </el-form-item>
          <el-form-item label="说明">
            <el-input
              v-model="lifecycleDialog.message"
              placeholder="补签是否触发受控业务动作的说明（默认仅审计补充）"
            />
          </el-form-item>
        </template>
        <el-form-item
          v-if="
            lifecycleDialog?.kind === 'TRANSFER' ||
            lifecycleDialog?.kind === 'DELEGATE' ||
            lifecycleDialog?.kind === 'ADD_SIGN'
          "
          label="备注"
        >
          <el-input v-model="opinionComment" placeholder="可选" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="lifecycleDialog = null">取消</el-button>
        <el-button type="primary" :loading="lifecycleSubmitting" @click="submitLifecycle">
          确认
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.task-detail {
  padding: 16px;
}
.detail-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
}
.detail-header h2 {
  margin: 0;
}
.detail-card {
  margin-bottom: 16px;
}
.detail-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: center;
  padding: 24px 0;
}
.return-config {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.opinion-input {
  width: min(520px, 100%);
  padding: 8px;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  resize: vertical;
}
.opinion-form {
  width: min(520px, 100%);
  padding: 12px;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
}
.opinion-form__title {
  margin-bottom: 12px;
  font-weight: 600;
}
.opinion-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}
.opinion-field input,
.opinion-field textarea,
.opinion-field select {
  box-sizing: border-box;
  width: 100%;
  padding: 8px;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
}
.opinion-options {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.opinion-option {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.required-mark {
  color: var(--el-color-danger);
}
.opinion-note {
  color: var(--el-text-color-secondary);
}
</style>
