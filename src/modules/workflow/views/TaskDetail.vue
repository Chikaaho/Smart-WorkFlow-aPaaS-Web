<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
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
import ProcessGraphView from './ProcessGraphView.vue'

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
      errorMsg.value = t('workflow.mobileTaskDetailLoadFailed')
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
  ElMessage.warning(t('workflow.commentRequired'))
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
      ElMessage.warning(t('common.processingCheckLater'))
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
    await ElMessageBox.confirm(t('workflow.confirmApprove'), t('workflow.approveConfirmTitle'), {
      get confirmButtonText() {
        return t('common.approve')
      },
      get cancelButtonText() {
        return t('common.cancel')
      },
      type: 'info',
    })
    confirmed = true
  } catch {
    return
  } finally {
    if (!confirmed) acting.value = null
  }
  await runAction(
    'complete',
    actionPayload('APPROVE'),
    t('common.statusApproved'),
    t('workflow.approveActionFailed'),
  )
}

async function handleReject() {
  if (acting.value) return
  if (!ensureOpinionData()) return
  acting.value = 'reject'

  let confirmed = false
  try {
    await ElMessageBox.confirm(t('workflow.confirmReject'), t('workflow.rejectConfirmTitle'), {
      get confirmButtonText() {
        return t('common.reject')
      },
      get cancelButtonText() {
        return t('common.cancel')
      },
      type: 'warning',
    })
    confirmed = true
  } catch {
    return
  } finally {
    if (!confirmed) acting.value = null
  }
  await runAction(
    'reject',
    actionPayload('REJECT'),
    t('common.statusRejected'),
    t('workflow.rejectActionFailed'),
  )
}

async function handleReturn() {
  if (acting.value) return
  const target = returnTargetNodeId.value || returnTargets.value[0]?.nodeKey
  if (!target) {
    ElMessage.warning(t('workflow.noReturnTargets'))
    return
  }
  try {
    await ElMessageBox.confirm(t('workflow.confirmReturn'), t('workflow.returnConfirmTitle'), {
      get confirmButtonText() {
        return t('common.returnBack')
      },
      get cancelButtonText() {
        return t('common.cancel')
      },
      type: 'warning',
    })
  } catch {
    return
  }
  acting.value = 'return'
  await runAction(
    'return',
    { action: 'RETURN', returnTargetNodeId: target, ...actionPayload('RETURN') },
    t('common.statusReturned'),
    t('workflow.returnFailed'),
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
  targetUserId?: string
  message?: string
  receivers?: string
  participants?: string
  mode?: 'SERIAL' | 'PARALLEL'
}>(null)
const lifecycleSubmitting = ref(false)

const LIFECYCLE_META: Record<string, { title: string; confirm: string }> = {
  TRANSFER: {
    get title() {
      return t('workflow.transferTask')
    },
    confirm: t('workflow.transferConfirm'),
  },
  DELEGATE: {
    get title() {
      return t('workflow.delegateTask')
    },
    confirm: t('workflow.delegateConfirm'),
  },
  COMMUNICATE: {
    get title() {
      return t('workflow.consult')
    },
    confirm: t('workflow.consultConfirm'),
  },
  ADD_SIGN: {
    get title() {
      return t('workflow.addSign')
    },
    confirm: t('workflow.addSignConfirm'),
  },
  SUPPLEMENT_SIGN: {
    get title() {
      return t('workflow.supplementSign')
    },
    get confirm() {
      return t('workflow.supplementSignConfirm')
    },
  },
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
    const target = String(dialog.targetUserId ?? '').trim()
    if (!/^\d+$/.test(target) || /^0+$/.test(target)) {
      ElMessage.warning(t('workflow.targetUserIdInvalid'))
      return
    }
    payload = { targetUserId: target, reason: opinionComment.value || undefined }
  } else if (dialog.kind === 'COMMUNICATE') {
    const receivers = (dialog.receivers ?? '')
      .split(',')
      .map((item) => Number(item.trim()))
      .filter((item) => Number.isInteger(item) && item > 0)
    if (receivers.length === 0) {
      ElMessage.warning(t('workflow.consultReceiversRequired'))
      return
    }
    payload = { receivers, message: dialog.message ?? '' }
  } else {
    const raw = (dialog.participants ?? '')
      .split(',')
      .map((item) => Number(item.trim()))
      .filter((item) => Number.isInteger(item) && item > 0)
    if (raw.length === 0) {
      ElMessage.warning(t('workflow.participantsRequired'))
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
    ElMessage.success(meta.title + t('common.statusSubmitted'))
    lifecycleDialog.value = null
    await navigateAfterAction()
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : meta.title + t('common.operationFailed'))
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
    APPROVED: {
      get label() {
        return t('common.approve')
      },
      type: 'success',
    },
    REJECTED: {
      get label() {
        return t('common.reject')
      },
      type: 'danger',
    },
  }

function getApprovalResultLabel(result: string | null): string {
  if (!result) return t('common.statusInProgress')
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

// ═════════ P53 节点 03/10/15-18/20：详情重组（布局与只读弹窗，审批逻辑不变） ═════════

// ─── 底部 tab ───
const activeTab = ref<'records' | 'graph' | 'people'>('records')

// ─── 流程图（节点 10/19）：定义图 + 真实轨迹高亮，切 tab 懒加载 ───
const detailGraph = ref<import('@/contracts/process-graph').ProcessGraphDocument | null>(null)
const detailTrace = ref<{ activeNodeIds: string[]; completedNodeIds: string[] } | null>(null)
const graphLoading = ref(false)
const graphError = ref('')

async function loadGraph() {
  if (detailGraph.value || graphLoading.value || !detail.value) return
  graphLoading.value = true
  graphError.value = ''
  try {
    const { getProcessDefDefinitionByKey } = await import('@/modules/workflow/api')
    const definition = await getProcessDefDefinitionByKey(detail.value.processDefinitionKey)
    detailGraph.value = {
      processKey: definition.processKey,
      name: definition.name ?? '',
      formKey: definition.formKey ?? '',
      version: definition.version,
      contractVersion: (definition as { contractVersion?: number }).contractVersion,
      elements: (definition.elements ??
        []) as import('@/contracts/process-graph').ProcessGraphElement[],
      canvas: definition.canvas ?? {},
    }
    // 轨迹高亮只使用真实可得数据：已完成=历史中已完结行的 nodeKey；活跃=当前任务节点
    const completedNodeIds = [
      ...new Set(
        detail.value.approvalHistory
          .filter((row) => row.endTime != null && typeof row.nodeKey === 'string' && row.nodeKey)
          .map((row) => row.nodeKey as string),
      ),
    ]
    detailTrace.value = {
      activeNodeIds: detail.value.nodeKey ? [detail.value.nodeKey] : [],
      completedNodeIds,
    }
  } catch (err) {
    graphError.value = err instanceof ApiError ? err.msg : t('taskDetailUi.graphUnavailable')
  } finally {
    graphLoading.value = false
  }
}

function onTabChange(tab: string | number) {
  if (tab === 'graph') void loadGraph()
}

// ─── 流程状态卡（节点 03 右栏）：仅渲染真实可得的已完成/当前节点 ───
interface FlowStatusEntry {
  key: string
  name: string
  state: 'done' | 'current'
  who: string
  when: string
  result: string | null
}

const flowStatus = computed<FlowStatusEntry[]>(() => {
  const d = detail.value
  if (!d) return []
  const doneByKey = new Map<string, FlowStatusEntry>()
  for (const row of d.approvalHistory) {
    if (row.endTime == null || row.approvalResult == null) continue
    const key = (typeof row.nodeKey === 'string' && row.nodeKey) || row.taskName
    const entry: FlowStatusEntry = {
      key,
      name: row.taskName,
      state: 'done',
      who: row.assigneeName ?? row.assignee ?? '-',
      when: row.endTime,
      result: row.approvalResult,
    }
    const prev = doneByKey.get(key)
    if (!prev || prev.when < entry.when) doneByKey.set(key, entry)
  }
  const entries = [...doneByKey.values()].sort((a, b) => (a.when < b.when ? -1 : 1))
  if (d.nodeKey) {
    entries.push({
      key: d.nodeKey,
      name: d.taskName,
      state: 'current',
      who: d.assigneeName ?? d.assignee ?? '-',
      when: d.createTime,
      result: null,
    })
  }
  return entries
})

// ─── 意见详情弹窗（节点 15/17/18 状态变体）：展示该行真实可得字段 ───
const opinionDetailVisible = ref(false)
const opinionDetailRow = ref<ApprovalHistoryItem | null>(null)

function openOpinionDetail(row: ApprovalHistoryItem) {
  opinionDetailRow.value = row
  opinionDetailVisible.value = true
}

// el-table row slot 的 DefaultRow 类型不兼容，桥接函数（对齐 MyInstances 写法）
function openOpinionDetailRow(r: unknown) {
  openOpinionDetail(r as ApprovalHistoryItem)
}

const opinionDetailEntries = computed(() => {
  const row = opinionDetailRow.value
  if (!row?.opinionData) return []
  return Object.entries(row.opinionData)
    .filter(([key]) => key !== 'comment')
    .map(([key, value]) => ({ key, value: value == null ? '-' : String(value) }))
})

// ─── 会签聚合（节点 16）：同一节点的多条历史聚合为真实统计 ───
const signGroupVisible = ref(false)
const signGroupKey = ref('')

const historyGroups = computed(() => {
  const d = detail.value
  if (!d) return []
  const byNode = new Map<string, ApprovalHistoryItem[]>()
  for (const row of d.approvalHistory) {
    const key = (typeof row.nodeKey === 'string' && row.nodeKey) || row.taskName
    const list = byNode.get(key) ?? []
    list.push(row)
    byNode.set(key, list)
  }
  return [...byNode.entries()]
    .map(([nodeKey, rows]) => ({
      nodeKey,
      taskName: rows[0]?.taskName ?? nodeKey,
      rows,
      isSign: rows.length > 1,
    }))
    .sort((a, b) => ((a.rows[0]?.createTime ?? '') < (b.rows[0]?.createTime ?? '') ? -1 : 1))
})

const signGroupRows = computed(() => {
  const d = detail.value
  if (!d) return []
  const key = signGroupKey.value
  return d.approvalHistory.filter(
    (row) => ((typeof row.nodeKey === 'string' && row.nodeKey) || row.taskName) === key,
  )
})

const signGroupStats = computed(() => {
  const rows = signGroupRows.value
  const agreed = rows.filter((row) => row.approvalResult === 'APPROVED').length
  const rejected = rows.filter((row) => row.approvalResult === 'REJECTED').length
  const pending = rows.filter((row) => row.approvalResult == null).length
  return { total: rows.length, agreed, rejected, pending }
})

function openSignGroup(nodeKey: string) {
  signGroupKey.value = nodeKey
  signGroupVisible.value = true
}

onMounted(loadDetail)
</script>

<template>
  <div v-loading="loading" class="task-detail">
    <!-- 页头（节点 03）：返回 + 标题 + 状态 + 元信息 -->
    <div class="detail-header">
      <el-button @click="goBack">{{ t('workflow.backToTodo') }}</el-button>
      <div class="detail-header__body">
        <div class="detail-header__title-row">
          <h2 class="detail-header__title">
            {{ detail?.processName ?? t('workflow.taskDetail') }}
          </h2>
          <el-tag
            v-if="detail"
            :type="detail.nodeKey ? 'primary' : 'success'"
            size="small"
            class="detail-header__status"
          >
            {{ detail.nodeKey ? t('common.statusInProgress') : t('common.statusApproved') }}
          </el-tag>
        </div>
        <p v-if="detail" class="detail-header__meta">
          {{ t('common.processKey') }} {{ detail.processDefinitionKey }} ·
          {{ t('common.initiator') }} {{ detail.initiatorName ?? detail.initiatorId }} ·
          {{ detail.createTime }}
        </p>
      </div>
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

    <!-- 主区双栏：左=数据表单/流程变量；右=流程状态+审批操作（节点 03） -->
    <div v-if="detail" class="task-main">
      <div class="task-main__left">
        <!-- 本次提交的表单数据 -->
        <el-card v-if="detail.formKey && detail.businessKey" class="detail-card">
          <template #header>
            <span>{{ t('taskDetailUi.dataForm') }}</span>
          </template>
          <div v-loading="formRecordLoading">
            <el-alert
              v-if="!formRecordLoading && !formRecord"
              :title="t('workflow.formRecordUnavailable')"
              type="warning"
              :closable="false"
              show-icon
            />
            <div v-else-if="formFieldRows.length > 0" class="data-rows">
              <div v-for="row in formFieldRows" :key="row.key" class="data-row">
                <span class="data-row__label">{{ row.label }}</span>
                <span class="data-row__value">{{ row.value }}</span>
              </div>
            </div>
            <el-descriptions v-else-if="formRecord" :column="1" border>
              <el-descriptions-item :label="t('common.description')">{{
                t('workflow.noDisplayableFields')
              }}</el-descriptions-item>
            </el-descriptions>
          </div>
        </el-card>

        <!-- 流程变量 -->
        <el-card v-if="Object.keys(detail.processVariables).length > 0" class="detail-card">
          <template #header>
            <span>{{ t('common.processVariable') }}</span>
          </template>
          <el-table :data="formatVariables(detail.processVariables)" stripe>
            <el-table-column prop="0" :label="t('workflow.variableName')" min-width="180" />
            <el-table-column prop="1" :label="t('workflow.variableValue')" min-width="280" />
          </el-table>
        </el-card>
      </div>

      <div class="task-main__right">
        <!-- 流程状态卡：仅渲染真实可得的已完成/当前节点 -->
        <el-card class="detail-card">
          <template #header>
            <div class="card-head">
              <span>{{ t('taskDetailUi.flowStatus') }}</span>
              <span class="card-head__hint">{{ t('taskDetailUi.byFlowPath') }}</span>
            </div>
          </template>
          <div class="flow-status">
            <div
              v-for="entry in flowStatus"
              :key="entry.key + entry.state"
              class="flow-node"
              :class="{ 'flow-node--current': entry.state === 'current' }"
            >
              <div class="flow-node__head">
                <span class="flow-node__name">{{ entry.name }}</span>
                <el-tag
                  size="small"
                  :type="
                    entry.state === 'current' ? 'primary' : getApprovalResultType(entry.result)
                  "
                >
                  {{
                    entry.state === 'current'
                      ? t('taskDetailUi.current')
                      : getApprovalResultLabel(entry.result)
                  }}
                </el-tag>
              </div>
              <p class="flow-node__meta">{{ entry.who }} · {{ entry.when }}</p>
            </div>
            <el-alert
              v-if="flowStatus.length === 0"
              :title="t('workflow.noApprovalHistory')"
              type="info"
              :closable="false"
              show-icon
            />
          </div>
        </el-card>

        <!-- 操作区（原操作栏移入右栏，审批逻辑不变） -->
        <el-card class="detail-card">
          <template #header>
            <span>{{ t('workflow.taskDetail') }}</span>
          </template>
          <div class="detail-actions">
            <div v-if="returnTargets.length > 0" class="return-config">
              <span>{{ t('workflow.returnToLabel') }}</span>
              <el-select
                v-model="returnTargetNodeId"
                :placeholder="t('workflow.selectApprovedNode')"
                style="width: 180px"
              >
                <el-option
                  v-for="target in returnTargets"
                  :key="target.nodeKey"
                  :label="target.taskName"
                  :value="target.nodeKey"
                />
              </el-select>
              <el-button
                type="warning"
                :loading="acting === 'return'"
                :disabled="acting !== null"
                @click="handleReturn"
                >{{ t('common.returnBack') }}</el-button
              >
            </div>
            <div v-if="opinionFields.length > 0" class="opinion-form">
              <div class="opinion-form__title">
                审批意见{{
                  detail.opinionForm?.formId
                    ? t('workflow.opinionFormSuffix', {
                        formId: detail.opinionForm.formId,
                        version: detail.opinionForm.version,
                      })
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
                    @input="
                      setOpinionFieldValue(field.key, ($event.target as HTMLTextAreaElement).value)
                    "
                  />
                  <select
                    v-else-if="field.type === 'SELECT'"
                    :id="`opinion-${field.key}`"
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
                  <div v-else-if="field.type === 'RADIO'" class="opinion-options">
                    <label
                      v-for="option in field.options ?? []"
                      :key="option"
                      class="opinion-option"
                    >
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
              :placeholder="t('workflow.remarkOptional')"
            />
            <div class="detail-actions__row">
              <el-button
                type="primary"
                :loading="acting === 'approve'"
                :disabled="acting !== null"
                @click="handleApprove"
              >
                {{ t('common.statusApproved') }}
              </el-button>
              <el-button
                type="danger"
                :loading="acting === 'reject'"
                :disabled="acting !== null"
                @click="handleReject"
                >{{ t('common.reject') }}</el-button
              >
            </div>
            <div class="detail-actions__row detail-actions__row--lifecycle">
              <el-button :disabled="acting !== null" @click="openLifecycle('TRANSFER')">
                {{ t('workflow.transferOwnTask') }}
              </el-button>
              <el-button :disabled="acting !== null" @click="openLifecycle('DELEGATE')">
                {{ t('workflow.delegateAction') }}
              </el-button>
              <el-button :disabled="acting !== null" @click="openLifecycle('COMMUNICATE')">
                {{ t('workflow.consultTask') }}
              </el-button>
              <el-button :disabled="acting !== null" @click="openLifecycle('ADD_SIGN')">
                {{ t('workflow.addSign') }}
              </el-button>
              <el-button :disabled="acting !== null" @click="openLifecycle('SUPPLEMENT_SIGN')">
                {{ t('workflow.supplementSign') }}
              </el-button>
            </div>
          </div>
        </el-card>
      </div>
    </div>

    <!-- 底部 tab（节点 03/10/15-20）：流转记录 / 流程图 / 审批详情列表 -->
    <el-card v-if="detail" class="detail-card">
      <el-tabs v-model="activeTab" @tab-change="onTabChange">
        <!-- 流转记录：原审批历史表格，逻辑不变 -->
        <el-tab-pane :label="t('taskDetailUi.tabRecords')" name="records">
          <el-alert
            v-if="detail.approvalHistory.length === 0"
            :title="t('workflow.noApprovalHistory')"
            type="info"
            :closable="false"
            show-icon
          />
          <el-table v-else :data="detail.approvalHistory" stripe>
            <el-table-column :label="t('common.taskNo')" min-width="140">
              <template #default="{ row }">
                <span :title="row.taskId">{{ formatTaskId(row.taskId) }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="taskName" :label="t('common.taskName')" min-width="120" />
            <el-table-column :label="t('workflow.approver')" min-width="120">
              <template #default="{ row }">
                {{ row.assigneeName ?? row.assignee ?? '-' }}
              </template>
            </el-table-column>
            <el-table-column :label="t('workflow.approvalResult')" min-width="100">
              <template #default="{ row }">
                <el-tag :type="getApprovalResultType(row.approvalResult)" size="small">
                  {{ getApprovalResultLabel(row.approvalResult) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column :label="t('workflow.actionOpinion')" min-width="180">
              <template #default="{ row }">
                {{ row.action ?? '-'
                }}{{
                  row.opinionData?.comment
                    ? t('workflow.opinionCommentSuffix', { comment: row.opinionData.comment })
                    : ''
                }}
              </template>
            </el-table-column>
            <el-table-column prop="createTime" :label="t('common.createTime')" min-width="170" />
            <el-table-column :label="t('workflow.completedAt')" min-width="170">
              <template #default="{ row }">
                {{ row.endTime ?? '-' }}
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <!-- 流程图：定义图 + 真实轨迹高亮（节点 10/19），切 tab 懒加载 -->
        <el-tab-pane :label="t('taskDetailUi.tabGraph')" name="graph">
          <div v-loading="graphLoading">
            <el-alert
              v-if="graphError"
              :title="graphError"
              type="warning"
              :closable="false"
              show-icon
            />
            <ProcessGraphView
              v-else-if="detailGraph"
              :graph="detailGraph"
              :trace="detailTrace"
              :height="480"
            />
          </div>
        </el-tab-pane>

        <!-- 审批详情列表（节点 20）：按节点分组；会签节点可开聚合记录（16）；
             每行查看详情打开意见详情弹窗（15/17/18） -->
        <el-tab-pane :label="t('taskDetailUi.tabPeople')" name="people">
          <div v-for="group in historyGroups" :key="group.nodeKey" class="people-group">
            <div class="people-group__head">
              <span class="people-group__name">{{ group.taskName }}</span>
              <el-button
                v-if="group.isSign"
                size="small"
                link
                type="primary"
                @click="openSignGroup(group.nodeKey)"
              >
                {{ t('taskDetailUi.signGroupTitle') }}
              </el-button>
            </div>
            <el-table :data="group.rows" size="small">
              <el-table-column :label="t('workflow.approver')" min-width="120">
                <template #default="{ row }">
                  {{ row.assigneeName ?? row.assignee ?? '-' }}
                </template>
              </el-table-column>
              <el-table-column :label="t('common.status')" width="100">
                <template #default="{ row }">
                  <el-tag :type="getApprovalResultType(row.approvalResult)" size="small">
                    {{ getApprovalResultLabel(row.approvalResult) }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column :label="t('workflow.actionOpinion')" min-width="200">
                <template #default="{ row }">
                  {{ row.opinionData?.comment ?? row.action ?? '-' }}
                </template>
              </el-table-column>
              <el-table-column :label="t('common.actions')" width="110" fixed="right">
                <template #default="{ row }">
                  <el-button
                    v-if="row.approvalResult != null"
                    size="small"
                    type="primary"
                    link
                    @click="openOpinionDetailRow(row)"
                  >
                    {{ t('taskDetailUi.viewDetail') }}
                  </el-button>
                  <span v-else class="people-group__pending">{{
                    t('taskDetailUi.viewDetailPending')
                  }}</span>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <!-- 意见详情弹窗（节点 15/17/18 状态变体）：仅真实可得字段；无快照版本数据时不虚构 -->
    <el-dialog
      v-model="opinionDetailVisible"
      :title="t('taskDetailUi.opinionDetailTitle')"
      width="560px"
    >
      <template v-if="opinionDetailRow">
        <p class="opinion-detail__meta">
          {{ opinionDetailRow.taskName }} ·
          {{ opinionDetailRow.assigneeName ?? opinionDetailRow.assignee ?? '-' }} ·
          {{ opinionDetailRow.endTime ?? opinionDetailRow.createTime }}
          <template v-if="opinionDetailRow.opinionFormVersion">
            · {{ t('taskDetailUi.formVersionLabel') }} v{{ opinionDetailRow.opinionFormVersion }}
          </template>
        </p>
        <div class="opinion-detail__comment">
          {{ opinionDetailRow.opinionData?.comment ?? t('taskDetailUi.opinionEmpty') }}
        </div>
        <div v-if="opinionDetailEntries.length > 0" class="opinion-detail__fields">
          <div v-for="entry in opinionDetailEntries" :key="entry.key" class="data-row">
            <span class="data-row__label">{{ entry.key }}</span>
            <span class="data-row__value">{{ entry.value }}</span>
          </div>
        </div>
      </template>
      <template #footer>
        <el-button type="primary" @click="opinionDetailVisible = false">{{
          t('common.close')
        }}</el-button>
      </template>
    </el-dialog>

    <!-- 会签聚合弹窗（节点 16）：统计与逐人记录均来自当前实例真实历史 -->
    <el-dialog v-model="signGroupVisible" :title="t('taskDetailUi.signGroupTitle')" width="720px">
      <p class="sign-group__meta">
        {{ t('taskDetailUi.nodeLabel') }} {{ signGroupKey }} · {{ signGroupStats.total }}
        {{ t('taskDetailUi.signParticipants') }} {{ signGroupStats.agreed }}
        {{ t('taskDetailUi.signAgreed') }} {{ signGroupStats.pending }}
        {{ t('taskDetailUi.signPending') }}
      </p>
      <el-table :data="signGroupRows" size="small" stripe>
        <el-table-column :label="t('workflow.approver')" min-width="110">
          <template #default="{ row }">
            {{ row.assigneeName ?? row.assignee ?? '-' }}
          </template>
        </el-table-column>
        <el-table-column :label="t('common.status')" width="90">
          <template #default="{ row }">
            <el-tag :type="getApprovalResultType(row.approvalResult)" size="small">
              {{ getApprovalResultLabel(row.approvalResult) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createTime" :label="t('workflow.arrivedAt')" min-width="150" />
        <el-table-column :label="t('workflow.handledAt')" min-width="150">
          <template #default="{ row }">
            {{ row.endTime ?? '-' }}
          </template>
        </el-table-column>
        <el-table-column :label="t('common.actions')" width="100" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="row.approvalResult != null"
              size="small"
              type="primary"
              link
              @click="openOpinionDetailRow(row)"
            >
              {{ t('taskDetailUi.viewDetail') }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <el-button type="primary" @click="signGroupVisible = false">{{
          t('common.close')
        }}</el-button>
      </template>
    </el-dialog>

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
          <el-form-item :label="t('workflow.targetUserId')">
            <el-input
              v-model="lifecycleDialog.targetUserId"
              :placeholder="t('workflow.targetUserIdPlaceholder')"
            />
          </el-form-item>
        </template>
        <template v-if="lifecycleDialog?.kind === 'COMMUNICATE'">
          <el-form-item :label="t('workflow.receiverIdsLabel')">
            <el-input
              v-model="lifecycleDialog.receivers"
              :placeholder="t('workflow.receiverIdsExample')"
            />
          </el-form-item>
          <el-form-item :label="t('workflow.consultContent')">
            <el-input v-model="lifecycleDialog.message" type="textarea" :rows="3" />
          </el-form-item>
        </template>
        <template v-if="lifecycleDialog?.kind === 'ADD_SIGN'">
          <el-form-item :label="t('workflow.participantIdsLabel')">
            <el-input
              v-model="lifecycleDialog.participants"
              :placeholder="t('workflow.participantIdsExample')"
            />
          </el-form-item>
          <el-form-item :label="t('workflow.signOrder')">
            <el-radio-group v-model="lifecycleDialog.mode">
              <el-radio value="PARALLEL">{{ t('workflow.parallel') }}</el-radio>
              <el-radio value="SERIAL">{{ t('workflow.serial') }}</el-radio>
            </el-radio-group>
          </el-form-item>
        </template>
        <template v-if="lifecycleDialog?.kind === 'SUPPLEMENT_SIGN'">
          <el-form-item :label="t('workflow.supplementConfirmerIdsLabel')">
            <el-input
              v-model="lifecycleDialog.participants"
              :placeholder="t('workflow.participantIdsExample')"
            />
          </el-form-item>
          <el-form-item :label="t('common.description')">
            <el-input
              v-model="lifecycleDialog.message"
              :placeholder="t('workflow.supplementTriggerNote')"
            />
          </el-form-item>
        </template>
        <el-form-item
          v-if="
            lifecycleDialog?.kind === 'TRANSFER' ||
            lifecycleDialog?.kind === 'DELEGATE' ||
            lifecycleDialog?.kind === 'ADD_SIGN'
          "
          :label="t('common.remark')"
        >
          <el-input v-model="opinionComment" :placeholder="t('notify.optionalTag')" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="lifecycleDialog = null">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="lifecycleSubmitting" @click="submitLifecycle">
          {{ t('common.confirm') }}
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
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 16px;
}
.detail-header__body {
  min-width: 0;
}
.detail-header__title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.detail-header__title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: var(--sw-text-primary);
}
.detail-header__status {
  flex: 0 0 auto;
}
.detail-header__meta {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--sw-text-secondary);
}
/* 主区双栏（节点 03）：左数据卡 / 右状态+操作 */
.task-main {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(320px, 1fr);
  gap: 16px;
  align-items: start;
  margin-bottom: 16px;
}
.task-main__left,
.task-main__right {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}
.detail-card {
  margin-bottom: 0;
}
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.card-head__hint {
  font-size: 12px;
  font-weight: 400;
  color: var(--sw-text-secondary);
}
/* 数据表单行式展示（设计 03：横排 label/value） */
.data-rows {
  display: flex;
  flex-direction: column;
}
.data-row {
  display: grid;
  grid-template-columns: 140px minmax(0, 1fr);
  gap: 12px;
  padding: 10px 4px;
  border-bottom: 1px solid var(--sw-border-lighter);
  font-size: 13px;
}
.data-row:last-child {
  border-bottom: none;
}
.data-row__label {
  color: var(--sw-text-secondary);
}
.data-row__value {
  color: var(--sw-text-primary);
  word-break: break-all;
  white-space: pre-wrap;
}
/* 流程状态卡（真实可得节点） */
.flow-status {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.flow-node {
  padding: 12px 14px;
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-base);
}
.flow-node--current {
  border-color: var(--sw-color-primary);
  background: var(--sw-color-primary-soft);
}
.flow-node__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.flow-node__name {
  font-size: 14px;
  font-weight: 600;
  color: var(--sw-text-primary);
}
.flow-node__meta {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--sw-text-secondary);
}
.detail-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.detail-actions__row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.detail-actions__row--lifecycle {
  border-top: 1px dashed var(--sw-border-lighter);
  padding-top: 10px;
}
.return-config {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 13px;
  color: var(--sw-text-regular);
}
.opinion-input {
  box-sizing: border-box;
  width: 100%;
  padding: 8px;
  border: 1px solid var(--sw-border-base);
  border-radius: var(--sw-radius-base);
  resize: vertical;
}
.opinion-form {
  padding: 12px;
  border: 1px solid var(--sw-border-base);
  border-radius: var(--sw-radius-base);
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
  border: 1px solid var(--sw-border-base);
  border-radius: var(--sw-radius-base);
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
  color: var(--sw-text-secondary);
}
/* 审批详情列表（节点 20）：按节点分组 */
.people-group {
  margin-bottom: 18px;
}
.people-group__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
  padding: 8px 12px;
  border-radius: var(--sw-radius-base);
  background: var(--sw-fill-base);
}
.people-group__name {
  font-size: 13px;
  font-weight: 600;
  color: var(--sw-text-primary);
}
.people-group__pending {
  font-size: 12px;
  color: var(--sw-text-secondary);
}
/* 意见详情弹窗（15/17/18） */
.opinion-detail__meta {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--sw-text-secondary);
}
.opinion-detail__comment {
  padding: 14px;
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-base);
  background: var(--sw-fill-base);
  font-size: 14px;
  line-height: 1.7;
  color: var(--sw-text-primary);
  white-space: pre-wrap;
}
.opinion-detail__fields {
  margin-top: 12px;
}
.sign-group__meta {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--sw-text-secondary);
}
/* 窄屏双栏退化为单列（方向 §4.5：不留裁切） */
@media (max-width: 991px) {
  .task-main {
    grid-template-columns: 1fr;
  }
}
</style>
