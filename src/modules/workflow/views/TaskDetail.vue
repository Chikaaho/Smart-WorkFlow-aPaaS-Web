<script setup lang="ts">
/* global window */
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
import { Paperclip } from '@element-plus/icons-vue'
import { useUserStore } from '@/stores/user'
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
import { deriveProcessTrace } from '../utils/process-trace'

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

async function loadDetail() {
  loading.value = true
  errorMsg.value = ''
  try {
    detail.value = await queryTaskDetail(taskId)
    initializeOpinionData(detail.value)
    void loadFormRecord()
    void loadGraph()
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
  // 已办入口（source=processed）回已办列表，不再落回待办（V012-BUG-001）
  if (route.query?.source === 'processed') {
    router.push({ name: 'ProcessedList' })
    return
  }
  router.push({ name: 'TodoList' })
}

/** 返回按钮文案：与来源列表一致。 */
const backLabel = computed(() =>
  route.query?.source === 'processed' ? t('workflow.backToProcessed') : t('workflow.backToTodo'),
)

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

const userStore = useUserStore()
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
        return t('common.resultAgreed')
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
  // 设计（节点20/16）：列表与详情中已同意/待处理作为结果词，进行中仅用于节点态
  if (!result) return t('common.resultPending')
  return APPROVAL_RESULT_MAP[result]?.label ?? result
}

function getApprovalResultType(result: string | null): 'success' | 'danger' | 'info' {
  if (!result) return 'info'
  return APPROVAL_RESULT_MAP[result]?.type ?? 'info'
}

/** 附件型表单值：常见文档扩展名按设计呈现为附件链接样式（图标+主色文字）。 */
function isAttachmentValue(value: unknown): boolean {
  return (
    typeof value === 'string' && /\.(pdf|docx?|xlsx?|pptx?|png|jpe?g|zip|txt)$/i.test(value.trim())
  )
}

function opinionInputType(field: NonNullable<ApprovalOpinionConfig['fields']>[number]): string {
  if (field.type === 'DATETIME') return 'datetime-local'
  if (field.type === 'NUMBER') return 'number'
  return 'text'
}

// ═════════ 详情页设计重组（布局与只读弹窗，审批逻辑不变） ═════════

// ─── 底部 tab ───
const activeTab = ref<'records' | 'graph' | 'people'>('records')

/** 流转记录四列视图（时间/流转节点/操作人/事件·结果）：行数据完全由真实审批历史派生。 */
const flowRecordRows = computed(() => {
  const d = detail.value
  if (!d) return []
  return d.approvalHistory.map((row) => ({
    key: row.taskId,
    time: row.createTime ? row.createTime.slice(5, 16).replace('T', ' ') : '-',
    node: row.taskName,
    operator: row.assigneeName ?? row.assignee ?? '-',
    event:
      [
        row.approvalResult ? getApprovalResultLabel(row.approvalResult) : (row.action ?? null),
        typeof row.opinionData?.comment === 'string' && row.opinionData.comment
          ? row.opinionData.comment
          : null,
      ]
        .filter(Boolean)
        .join(' · ') || '-',
  }))
})

// ─── 流程图：定义图 + 真实轨迹高亮，切 tab 懒加载 ───
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
    // 轨迹高亮只使用真实可得数据（与 TaskGraphView 共用同一派生规则）。
    detailTrace.value = deriveProcessTrace({
      approvalHistory: detail.value.approvalHistory,
      currentNodeKey: detail.value.nodeKey ?? '',
      currentNodeName: currentRailEntry.value?.name ?? '',
      elements: detailGraph.value?.elements ?? [],
    })
  } catch (err) {
    graphError.value = err instanceof ApiError ? err.msg : t('taskDetailUi.graphUnavailable')
  } finally {
    graphLoading.value = false
  }
}

function onTabChange(tab: string | number) {
  if (tab === 'graph') void loadGraph()
}

// ─── 流程状态卡（右栏）：仅渲染真实可得的已完成/当前节点 ───
interface FlowRailEntry {
  key: string
  name: string
  state: 'done' | 'current'
  kicker: string
  who: string
  when: string
  result: string | null
  isSign: boolean
  doneCount: number
  total: number
  pendingNames: string
  row: ApprovalHistoryItem | null
}

/** 展示层时间格式：真实时间戳 → MM-DD HH:mm（设计15-18 右栏，仅显示不改数据） */
function formatWhen(value: string | null): string {
  if (!value) return ''
  const d = new Date(String(value).replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 16)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${mm}-${dd} ${hh}:${mi}`
}

const flowRail = computed<FlowRailEntry[]>(() => {
  const d = detail.value
  if (!d) return []
  const groups = new Map<
    string,
    { name: string; rows: ApprovalHistoryItem[]; createTime: string }
  >()
  for (const row of d.approvalHistory) {
    // 提交动作不是审批节点（设计右栏不呈现），仅保留审批组
    if (typeof row.nodeKey !== 'string' || !row.nodeKey) continue
    const g = groups.get(row.nodeKey) ?? {
      name: row.taskName,
      rows: [],
      createTime: row.createTime,
    }
    g.rows.push(row)
    groups.set(row.nodeKey, g)
  }
  const done: FlowRailEntry[] = []
  const current: FlowRailEntry[] = []
  for (const [key, g] of groups) {
    // 派发通知行：无结果但有完成时间——不计入会签进度
    const real = g.rows.filter((r) => !(r.approvalResult == null && r.endTime != null))
    const approved = real.filter((r) => r.approvalResult === 'APPROVED')
    const pending = real.filter((r) => r.approvalResult == null && r.endTime == null)
    if (pending.length === 0 && approved.length > 0) {
      const lastApproved = approved.at(-1) ?? g.rows[0]
      done.push({
        key,
        name: g.name,
        state: 'done',
        kicker: '前一节点 · 已完成',
        who: lastApproved.assigneeName ?? lastApproved.assignee ?? '-',
        when: formatWhen(lastApproved.endTime ?? ''),
        result: lastApproved.approvalResult ?? null,
        isSign: real.length > 1,
        doneCount: approved.length,
        total: real.length,
        pendingNames: '',
        row: lastApproved,
      })
    } else if (pending.length > 0) {
      current.push({
        key,
        name: g.name,
        state: 'current',
        kicker: `当前节点 · 进行中 · ${approved.length} / ${g.rows.length}`,
        who: pending
          .map((r) => r.assigneeName)
          .filter(Boolean)
          .join('、'),
        when: formatWhen(g.rows[0]?.createTime ?? ''),
        result: null,
        isSign: real.length > 1,
        doneCount: approved.length,
        total: real.length,
        pendingNames: pending
          .map((r) => r.assigneeName)
          .filter(Boolean)
          .join('、'),
        row: real[0] ?? g.rows[0] ?? null,
      })
    }
  }
  const rail: FlowRailEntry[] = []
  if (done.length > 0) rail.push(done.at(-1)!)
  rail.push(...current)
  return rail
})

/** 流程图右侧状态卡数据源：仅真实进行中的节点；无进行中节点时不渲染。 */
const currentRailEntry = computed(() => flowRail.value.find((e) => e.state === 'current') ?? null)

/** 业务流程变量：formKey 属页头元信息，其余变量才以表格呈现。 */
const hasBusinessVariables = computed(() => {
  const vars = detail.value?.processVariables
  if (!vars) return false
  return Object.keys(vars).some((k) => k !== 'formKey')
})

/** 图画布高度：默认 740；高视口（长页基线 1512）下 800。 */
const graphCanvasHeight = computed(() =>
  typeof window !== 'undefined' && window.innerHeight >= 1100 ? 784 : 740,
)

/** 流程状态卡脚部快捷审批：仅普通意见模式显示；自定义意见表单走底部完整操作卡。已办历史任务不呈现。 */
const quickActionsVisible = computed(
  () =>
    detail.value != null &&
    detail.value.taskStatus !== 'FINISHED' &&
    opinionFields.value.length === 0,
)

/** 已办历史任务（后端 taskStatus=FINISHED）：详情整体只读，不含任何办理动作。 */
const isFinishedTask = computed(() => detail.value?.taskStatus === 'FINISHED')

/**
 * 服务端办理权限（canHandle）：仅待办且当前用户可办理时呈现审批动作，
 * 监控/发起人等只读身份不再展示通过/驳回按钮；后端动作接口仍是最终权威。
 */
const canAct = computed(
  () => detail.value?.taskStatus !== 'FINISHED' && detail.value?.canHandle === true,
)

/** 页头状态标签：统一由真实实例状态驱动。后端 TaskDetailRespDTO 无 nodeKey 字段，
 *  旧 nodeKey 推断在真实接口下恒走"已通过"分支、运行中任务误显示已通过，故改为
 *  instanceStatus 优先（V012-BUG-001），nodeKey 仅作旧 mock 契约后备，均缺失时
 *  待办显示进行中、已办显示已终止。 */
const headerTagType = computed<'primary' | 'success' | 'danger' | 'info'>(() => {
  const status = detail.value?.instanceStatus
  if (status === 'APPROVED') return 'success'
  if (status === 'REJECTED') return 'danger'
  if (status === 'RUNNING') return 'primary'
  if (isFinishedTask.value) return 'info'
  return detail.value?.nodeKey ? 'primary' : 'success'
})

const headerTagLabel = computed(() => {
  const status = detail.value?.instanceStatus
  if (status === 'APPROVED') return t('common.statusApproved')
  if (status === 'REJECTED') return t('common.statusRejected')
  if (status === 'RUNNING') return t('common.statusInProgress')
  if (isFinishedTask.value) return t('common.statusTerminated')
  return detail.value?.nodeKey ? t('common.statusInProgress') : t('common.statusApproved')
})

/** 催办仅对流程发起人呈现（真实契约：POST /workflow/my/instances/{id}/urge）。 */
const isInitiator = computed(() => {
  const d = detail.value
  const uid = userStore.user?.id
  return d != null && uid != null && String(d.initiatorId ?? '') === String(uid)
})

async function onUrge(): Promise<void> {
  const d = detail.value
  if (!d?.processInstanceId) return
  try {
    const { urgeMyInstance } = await import('@/modules/workflow/api/oa')
    const resp = await urgeMyInstance(Number(d.processInstanceId))
    void resp
    ElMessage.success(t('workflow.urgeSent'))
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('workflow.urgeFailed'))
  }
}

/** 快捷同意/驳回：复用既有确认弹窗与 handler（真实审批链路不变）。 */
async function quickApprove(): Promise<void> {
  await handleApprove()
}
async function quickReject(): Promise<void> {
  await handleReject()
}

// ─── 意见详情弹窗：展示该行真实可得字段 ───
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

/** 附件类字段的键名约定：只有真实记录带这类键时才渲染附件区块，否则留白。 */
const OPINION_ATTACHMENT_KEY = /^(attachments?|files?|附录|附件)/i

const opinionDetailEntries = computed(() => {
  const row = opinionDetailRow.value
  if (!row?.opinionData) return []
  return Object.entries(row.opinionData)
    .filter(
      ([key, value]) =>
        key !== 'comment' &&
        !Array.isArray(value) &&
        !OPINION_ATTACHMENT_KEY.test(key) &&
        value != null &&
        value !== '',
    )
    .map(([key, value]) => ({ key, value: String(value) }))
})

/** 设计（意见详情）的已确认检查项区块：仅当字段值为非空数组时按检查项芯片渲染。 */
const opinionDetailCheckEntries = computed(() => {
  const row = opinionDetailRow.value
  if (!row?.opinionData) return []
  return Object.entries(row.opinionData).filter(
    ([key, value]) => key !== 'comment' && Array.isArray(value) && value.length > 0,
  )
})

/** 设计（意见详情）的附件区块：仅当键名命中附件约定且值非空时渲染。 */
const opinionDetailAttachmentEntries = computed(() => {
  const row = opinionDetailRow.value
  if (!row?.opinionData) return []
  return Object.entries(row.opinionData)
    .filter(([key]) => key !== 'comment' && OPINION_ATTACHMENT_KEY.test(key))
    .map(([key, value]) => ({
      key,
      value: Array.isArray(value) ? value.map((item) => String(item)).join('、') : String(value),
    }))
    .filter((entry) => entry.value !== '')
})

// ─── 会签聚合：同一节点的多条历史聚合为真实统计 ───
const signGroupVisible = ref(false)
const signGroupKey = ref('')

const signGroupRows = computed(() => {
  const d = detail.value
  if (!d) return []
  const key = signGroupKey.value
  return d.approvalHistory.filter(
    (row) =>
      ((typeof row.nodeKey === 'string' && row.nodeKey) || row.taskName) === key &&
      // 会签派发通知行（无结果但有完成时间）不计入参与人
      !(row.approvalResult == null && row.endTime != null),
  )
})

/** 会签弹窗标题中的节点名：取该组真实历史的任务名，取不到回退分组键。 */
const signGroupName = computed(() => signGroupRows.value[0]?.taskName ?? '')

/** 审批详情列表：仅审批人行（排除提交动作与会签派发通知行） */
const peopleRows = computed(() => {
  const d = detail.value
  if (!d) return []
  return d.approvalHistory.filter(
    (r) =>
      typeof r.nodeKey === 'string' &&
      !!r.nodeKey &&
      !(r.approvalResult == null && r.endTime != null),
  )
})

const signGroupStats = computed(() => {
  const rows = signGroupRows.value
  const agreed = rows.filter((row) => row.approvalResult === 'APPROVED').length
  const rejected = rows.filter((row) => row.approvalResult === 'REJECTED').length
  const pending = rows.filter((row) => row.approvalResult == null).length
  return { total: rows.length, agreed, rejected, pending }
})

function formatSignTime(value: string | null | undefined): string {
  if (!value) return '-'
  const match = value.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/)
  return match ? `${match[1]}\n${match[2]}` : value
}

function openSignGroup(nodeKey: string) {
  signGroupKey.value = nodeKey
  signGroupVisible.value = true
}

onMounted(loadDetail)

/** 后继节点（设计右栏第三块）：由真实流程图推导；仅在图可达时呈现。 */
const nextRailNode = computed<{ name: string; hint: string } | null>(() => {
  const g = detailGraph.value
  const currentName = currentRailEntry.value?.name
  if (!g || !currentName) return null
  const byName = (n: { kind: string; type?: string; config?: { name?: string } }) =>
    n.kind === 'node' && n.config?.name === currentName
  const start = g.elements.find(byName)
  if (!start) return null
  const outgoing = (id: string) =>
    g.elements.filter((e) => e.kind === 'edge' && e.source === id).map((e) => e.target)
  let frontier = outgoing(String(start.id))
  const seen = new Set<string>([String(start.id)])
  // 穿过网关找首个后继节点；无后继审批节点时回退结束节点
  let endFallback: { name: string; hint: string } | null = null
  while (frontier.length > 0) {
    const next = frontier.shift()!
    if (seen.has(next)) continue
    seen.add(next)
    const el = g.elements.find((e) => e.kind === 'node' && String(e.id) === next)
    if (!el) continue
    if (el.type === 'GATEWAY') {
      frontier.push(...outgoing(next))
      continue
    }
    const nodeName = String((el.config as { name?: unknown } | undefined)?.name ?? '')
    if (el.type === 'END') {
      endFallback = {
        name: nodeName || t('taskDetailUi.endNode'),
        hint: t('taskDetailUi.nextNodeEndHint'),
      }
      continue
    }
    if (el.type === 'APPROVAL') {
      return { name: nodeName, hint: t('taskDetailUi.nextNodeHint') }
    }
  }
  return endFallback
})
</script>

<template>
  <div
    v-loading="loading"
    class="task-detail"
    :class="{ 'task-detail--people-active': activeTab === 'people' }"
  >
    <!-- 页头：返回 + 标题 + 状态 + 元信息 -->
    <div class="detail-header">
      <el-button class="detail-header__back" @click="goBack">{{ backLabel }}</el-button>
      <div class="detail-header__body">
        <div class="detail-header__title-row">
          <h2 class="detail-header__title">
            {{ detail?.processName ?? t('workflow.taskDetail') }}
          </h2>
          <el-tag v-if="detail" :type="headerTagType" size="small" class="detail-header__status">
            {{ headerTagLabel }}
          </el-tag>
        </div>
        <p v-if="detail" class="detail-header__meta">
          {{ t('common.processNo') }} {{ detail.businessKey }} · {{ t('common.initiator') }}
          {{ detail.initiatorName ?? detail.initiatorId }} ·
          {{ detail.createTime?.slice(0, 16)?.replace('T', ' ') }}
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

    <!-- 主区双栏：左=数据表单/流程变量；右=流程状态+审批操作 -->
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
                <span class="data-row__value">
                  <span v-if="isAttachmentValue(row.value)" class="data-row__file">
                    <el-icon :size="14"><Paperclip /></el-icon>{{ row.value }}
                  </span>
                  <template v-else>{{ row.value }}</template>
                </span>
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
        <el-card v-if="hasBusinessVariables" class="detail-card">
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
              v-for="entry in flowRail"
              :key="entry.key"
              class="flow-node"
              :class="{ 'flow-node--current': entry.state === 'current' }"
            >
              <p class="flow-node__kicker">
                <span
                  class="flow-node__state"
                  :class="
                    entry.state === 'current'
                      ? 'flow-node__state--current'
                      : 'flow-node__state--done'
                  "
                >
                  {{
                    entry.state === 'current'
                      ? t('taskDetailUi.current')
                      : t('taskDetailUi.prevNodeDone')
                  }}
                </span>
                <span v-if="entry.state === 'current'" class="flow-node__prog">
                  {{
                    t('taskDetailUi.currentProgress', { done: entry.doneCount, total: entry.total })
                  }}
                </span>
              </p>
              <div class="flow-node__head">
                <span class="flow-node__name">{{ entry.name }}</span>
              </div>
              <p v-if="entry.isSign" class="flow-node__sub">
                {{ t('taskDetailUi.parallelSignRule') }}
              </p>
              <p v-if="entry.state === 'current'" class="flow-node__sub">
                {{
                  t('taskDetailUi.signDoneProgress', { done: entry.doneCount, total: entry.total })
                }}<template v-if="entry.pendingNames">
                  · {{ t('taskDetailUi.pendingNamesPrefix') }}{{ entry.pendingNames }}</template
                >
              </p>
              <div v-else class="flow-node__meta-row">
                <p class="flow-node__meta">
                  {{ entry.who }} · {{ getApprovalResultLabel(entry.result) }} · {{ entry.when }}
                </p>
                <el-button
                  size="small"
                  type="primary"
                  plain
                  @click="openOpinionDetailRow(entry.row)"
                >
                  {{ t('taskDetailUi.viewDetail') }}
                </el-button>
              </div>
              <el-button
                v-if="entry.state === 'current' && entry.isSign"
                size="small"
                class="flow-node__allbtn"
                @click="openSignGroup(entry.key)"
              >
                {{ t('taskDetailUi.viewAllSignRecords') }}
              </el-button>
            </div>
            <div v-if="nextRailNode" class="flow-node flow-node--next">
              <p class="flow-node__kicker">
                <span class="flow-node__state flow-node__state--next">
                  {{ t('taskDetailUi.nextNodePending') }}
                </span>
              </p>
              <div class="flow-node__head">
                <span class="flow-node__name">{{ nextRailNode.name }}</span>
              </div>
              <p class="flow-node__sub">{{ nextRailNode.hint }}</p>
            </div>
            <div v-if="quickActionsVisible" class="flow-actions">
              <el-button
                v-if="isInitiator"
                class="flow-actions__urge"
                :disabled="acting !== null"
                @click="onUrge"
              >
                {{ t('taskDetailUi.urgeAction') }}
              </el-button>
              <el-button
                v-if="canAct"
                type="success"
                :loading="acting === 'approve'"
                :disabled="acting !== null"
                @click="quickApprove"
              >
                {{ t('common.approve') }}
              </el-button>
              <el-button
                v-if="canAct"
                class="p53-reject-action"
                type="danger"
                plain
                :loading="acting === 'reject'"
                :disabled="acting !== null"
                @click="quickReject"
              >
                {{ t('common.reject') }}
              </el-button>
            </div>
            <el-alert
              v-if="flowRail.length === 0"
              :title="t('workflow.noApprovalHistory')"
              type="info"
              :closable="false"
              show-icon
            />
          </div>
        </el-card>
      </div>
    </div>

    <!-- 底部 tab：流转记录 / 流程图 / 审批详情列表 -->
    <el-card v-if="detail" class="detail-card detail-card--tabs">
      <el-tabs v-model="activeTab" @tab-change="onTabChange">
        <!-- 流转记录：四列设计版式，行数据来自真实审批历史 -->
        <el-tab-pane name="records">
          <template #label
            ><span class="detail-tab-label">{{ t('taskDetailUi.tabRecords') }}</span></template
          >
          <el-alert
            v-if="detail.approvalHistory.length === 0"
            :title="t('workflow.noApprovalHistory')"
            type="info"
            :closable="false"
            show-icon
          />
          <div v-else class="p53-records-table">
            <div class="p53-records-table__head">
              <span>{{ t('taskDetailUi.recordTime') }}</span>
              <span>{{ t('taskDetailUi.recordNode') }}</span>
              <span>{{ t('taskDetailUi.operatorLabel') }}</span>
              <span>{{ t('taskDetailUi.recordEvent') }}</span>
            </div>
            <div v-for="row in flowRecordRows" :key="row.key" class="p53-records-table__row">
              <span>{{ row.time }}</span>
              <span>{{ row.node }}</span>
              <span>{{ row.operator }}</span>
              <span>{{ row.event }}</span>
            </div>
          </div>
        </el-tab-pane>

        <!-- 流程图：定义图 + 真实轨迹高亮，切 tab 懒加载；图内容由 ProcessGraphView 内核输出 -->
        <el-tab-pane name="graph">
          <template #label
            ><span class="detail-tab-label">{{ t('taskDetailUi.tabGraph') }}</span></template
          >
          <div v-loading="graphLoading" class="p53-graph-shell">
            <el-alert
              v-if="graphError"
              :title="graphError"
              type="warning"
              :closable="false"
              show-icon
            />
            <div v-if="detailGraph" class="p53-graph-canvas">
              <ProcessGraphView
                :graph="detailGraph"
                :trace="detailTrace"
                :height="graphCanvasHeight"
                :fit-margins="{ left: 135, top: 24, right: 241, bottom: -232 }"
              />
              <aside v-if="currentRailEntry" class="p53-graph-rail">
                <div class="p53-graph-status">
                  <small>{{ t('taskDetailUi.current') }}</small>
                  <strong>{{ currentRailEntry.name }}</strong>
                  <span v-if="currentRailEntry.total > 0">
                    {{
                      t('taskDetailUi.signDoneProgress', {
                        done: currentRailEntry.doneCount,
                        total: currentRailEntry.total,
                      })
                    }}
                  </span>
                  <span v-if="currentRailEntry.pendingNames">
                    {{ t('taskDetailUi.pendingNamesPrefix') }}{{ currentRailEntry.pendingNames }}
                  </span>
                </div>
                <div class="p53-graph-legend">
                  <strong>{{ t('taskDetailUi.nodeStatus') }}</strong>
                  <span class="p53-graph-legend__chip p53-graph-legend__chip--completed">{{
                    t('common.statusCompleted')
                  }}</span>
                  <span class="p53-graph-legend__chip p53-graph-legend__chip--current">{{
                    t('common.statusInProgress')
                  }}</span>
                  <span class="p53-graph-legend__chip p53-graph-legend__chip--pending">{{
                    t('workflow.notArrived')
                  }}</span>
                </div>
              </aside>
            </div>
          </div>
        </el-tab-pane>

        <!-- 审批详情列表：按真实历史逐人一行；已处理行可打开意见详情弹窗，会签节点可开聚合记录 -->
        <el-tab-pane name="people">
          <template #label
            ><span class="detail-tab-label">{{ t('taskDetailUi.tabPeople') }}</span></template
          >
          <el-table :data="peopleRows" stripe>
            <el-table-column prop="taskName" :label="t('workflow.approvalNode')" min-width="260" />
            <el-table-column :label="t('workflow.approver')" width="120">
              <template #default="{ row }">
                {{ row.assigneeName ?? row.assignee ?? '-' }}
              </template>
            </el-table-column>
            <el-table-column :label="t('common.status')" width="120">
              <template #default="{ row }">
                <span
                  class="people-status"
                  :class="`people-status--${getApprovalResultType(row.approvalResult)}`"
                >
                  {{ getApprovalResultLabel(row.approvalResult) }}
                </span>
              </template>
            </el-table-column>
            <el-table-column :label="t('workflow.actionOpinion')" min-width="432">
              <template #default="{ row }">
                {{
                  row.opinionFormId
                    ? t('taskDetailUi.customFormLabel')
                    : (row.opinionData?.comment ?? row.action ?? '-')
                }}
                ·
                {{ row.endTime ?? row.createTime }}
              </template>
            </el-table-column>
            <el-table-column :label="t('common.actions')" width="172" fixed="right">
              <template #default="{ row }">
                <el-button
                  v-if="row.approvalResult != null"
                  size="small"
                  type="primary"
                  plain
                  round
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
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <!-- 操作区（原操作栏移入右栏，审批逻辑不变）：置于记录卡之后，主审批入口在流程状态卡脚部；
     仅待办且当前用户可办理（canHandle）时呈现，已办/只读身份不渲染任何办理动作 -->
    <el-card v-if="detail && canAct" class="detail-card detail-card--actions">
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
          :placeholder="t('workflow.remarkOptional')"
        />
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

    <!-- 意见详情弹窗：仅渲染该行真实可得字段；无对应数据时区块留白，不虚构 -->
    <el-dialog v-model="opinionDetailVisible" width="780px" top="12vh" class="p53-opinion-dialog">
      <template #header>
        <div v-if="opinionDetailRow" class="p53-opinion-dialog__head">
          <h2>{{ t('taskDetailUi.opinionDetailTitle') }}</h2>
          <b>
            {{ opinionDetailRow.taskName }} ·
            {{ opinionDetailRow.assigneeName ?? opinionDetailRow.assignee ?? '-'
            }}<template v-if="opinionDetailRow.assigneeDept">
              · {{ opinionDetailRow.assigneeDept }}
            </template>
          </b>
          <p>
            {{ getApprovalResultLabel(opinionDetailRow.approvalResult) }} ·
            {{ opinionDetailRow.endTime ?? opinionDetailRow.createTime }}
            <template v-if="opinionDetailRow.opinionFormVersion">
              · {{ t('taskDetailUi.formVersionLabel') }} v{{ opinionDetailRow.opinionFormVersion }}
            </template>
          </p>
        </div>
      </template>
      <div v-if="opinionDetailRow" class="p53-opinion-panel">
        <h3 v-if="opinionDetailRow.opinionFormId">
          {{ opinionDetailRow.opinionFormId }}
        </h3>
        <div v-if="opinionDetailEntries.length > 0" class="p53-opinion-grid">
          <div v-for="entry in opinionDetailEntries" :key="entry.key">
            <label>{{ entry.key }}</label>
            <b>{{ entry.value }}</b>
          </div>
        </div>
        <label>{{ t('taskDetailUi.opinionCommentLabel') }}</label>
        <div class="p53-opinion-comment">
          {{ opinionDetailRow.opinionData?.comment ?? t('taskDetailUi.opinionEmpty') }}
        </div>
        <template v-for="entry in opinionDetailCheckEntries" :key="entry[0]">
          <label>{{ entry[0] }}</label>
          <div class="p53-opinion-checks">
            <b v-for="item in entry[1]" :key="String(item)">✓ {{ item }}</b>
          </div>
        </template>
        <template v-for="entry in opinionDetailAttachmentEntries" :key="entry.key">
          <div class="p53-opinion-attachment-row">
            <label>{{ entry.key }}</label>
            <div class="p53-opinion-attachment">{{ entry.value }}</div>
          </div>
        </template>
      </div>
      <template #footer>
        <small class="p53-opinion-dialog__note">
          {{ t('taskDetailUi.opinionReadonlyNote') }}
        </small>
        <el-button type="primary" class="p53-dialog-close" @click="opinionDetailVisible = false">
          {{ t('common.close') }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 会签聚合弹窗：统计与逐人记录均来自当前实例真实历史 -->
    <el-dialog v-model="signGroupVisible" width="1018px" top="10vh" class="p53-sign-dialog">
      <template #header>
        <div class="p53-sign-dialog__head">
          <h2>
            <template v-if="signGroupName">{{ signGroupName }} · </template
            >{{ t('taskDetailUi.signGroupTitle') }}
          </h2>
          <p v-if="signGroupKey && signGroupKey !== signGroupName">
            {{ t('taskDetailUi.nodeKeyLabel') }} {{ signGroupKey }}
          </p>
        </div>
      </template>
      <p class="p53-sign-summary">
        {{ signGroupStats.total }} {{ t('taskDetailUi.signParticipants') }}
        {{ signGroupStats.agreed }} {{ t('taskDetailUi.signAgreed') }} {{ signGroupStats.pending }}
        {{ t('taskDetailUi.signPending') }} {{ signGroupStats.rejected }}
        {{ t('taskDetailUi.signRejected') }}
      </p>
      <el-table :data="signGroupRows" stripe class="p53-sign-table">
        <el-table-column :label="t('workflow.approver')" width="112">
          <template #default="{ row }">
            <b>{{ row.assigneeName ?? row.assignee ?? '-' }}</b>
          </template>
        </el-table-column>
        <el-table-column :label="t('taskDetailUi.deptLabel')" width="168">
          <template #default="{ row }">
            {{ row.assigneeDept ?? '-' }}
          </template>
        </el-table-column>
        <el-table-column :label="t('common.status')" width="114">
          <template #default="{ row }">
            <span
              class="people-status"
              :class="`people-status--${getApprovalResultType(row.approvalResult)}`"
            >
              {{ getApprovalResultLabel(row.approvalResult) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column width="198" :label="t('taskDetailUi.sentAt')">
          <template #default="{ row }">
            <span class="p53-sign-time">{{ formatSignTime(row.createTime) }}</span>
          </template>
        </el-table-column>
        <el-table-column width="198" :label="t('taskDetailUi.processedAt')">
          <template #default="{ row }">
            <span class="p53-sign-time">{{ formatSignTime(row.endTime) }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('taskDetailUi.opinionCommentLabel')" width="174" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="row.approvalResult != null"
              size="small"
              type="primary"
              plain
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
      <p v-if="signGroupStats.pending > 0" class="p53-sign-note">
        {{ t('taskDetailUi.signGroupNote') }}
      </p>
      <template #footer>
        <el-button type="primary" class="p53-dialog-close" @click="signGroupVisible = false">
          {{ t('common.close') }}
        </el-button>
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
  max-width: 1216px;
  padding: 6px 32px 24px;
}
.detail-header {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 2px;
  margin-bottom: 19px;
}
.detail-header__back {
  align-self: flex-start;
  box-sizing: border-box;
  width: 140px;
  height: 24px;
  padding: 0 31px;
  font-size: 12px;
}
.detail-header__body {
  min-width: 0;
}
.detail-header__title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
}
.detail-header__title {
  margin: 0;
  position: relative;
  top: -6px;
  font-size: 26px;
  line-height: 30px;
  font-weight: 700;
  color: var(--sw-text-primary);
}
.detail-header__status {
  flex: 0 0 auto;
}
.detail-header__meta {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--sw-text-secondary);
}
/* 主区双栏：左数据卡 / 右状态+操作 */
/* 设计（节点10）：短视口下流程图 tab 聚焦呈现——隐藏双栏区，图区全宽加高（方向 §5.10 真实组件改造） */
@media (max-height: 1099px) {
  .task-main--graph-focus {
    display: none;
  }
}
.task-main {
  display: grid;
  grid-template-columns: 784px minmax(0, 1fr);
  gap: 0;
  align-items: start;
  margin-bottom: 15px;
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
.detail-card :deep(.el-card__body) {
  padding: 28px 24px 24px;
}

.task-main__left > .detail-card:first-child :deep(.el-card__header) {
  box-sizing: border-box;
  padding: 23px 24px 13px;
}
/* 设计（数据详情）：主区两卡基线高度；真实内容超出时自然伸展，不裁切 */
.task-main__left > .detail-card:first-child,
.task-main__right > .detail-card:first-child {
  box-sizing: border-box;
  min-height: 476px;
}

/* 节点19/03：数据表单卡底部 11px（设计实测 kv 卡底 645/646） */
.task-main__left > .detail-card:first-child :deep(.el-card__body) {
  padding-right: 22px;
  padding-bottom: 11px;
}
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 0;
}
.card-head__hint {
  font-size: 12px;
  font-weight: 400;
  color: var(--sw-text-secondary);
}
/* 数据表单行式展示（横排 label/value） */
.data-rows {
  margin-top: -26px;
  display: flex;
  flex-direction: column;
}
.data-row {
  box-sizing: border-box;
  display: grid;
  grid-template-columns: 128px minmax(0, 1fr);
  align-items: center;
  min-height: 48px;
  margin-bottom: 8px;
  padding: 6px 12px 6px 12px;
  border: 1px solid #eef1f7;
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
/* 设计（节点20）：附件值呈现为图标+主色链接样式 */
.data-row__file {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--sw-color-primary);
}
/* 设计（节点20）：标题行状态标签为品牌紫底 */
.detail-header__status.el-tag {
  --el-tag-bg-color: var(--sw-color-primary-soft);
  --el-tag-border-color: transparent;
  --el-tag-text-color: var(--sw-color-primary);
}
/* 流程状态卡（真实可得节点）；设计（节点20）：prev 90 / current 152 / next 80 / gap 16 */
.flow-status {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.flow-node {
  box-sizing: border-box;
  padding: 9px 5px 6px 11px;
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-base);
  background: #f7fafc;
}
.flow-status .flow-node:nth-of-type(1) {
  min-height: 96px;
}
.flow-actions {
  display: flex;
  gap: 10px;
  margin-top: -6px;
  height: 34px;
}
.flow-actions .el-button {
  flex: 1;
  height: 34px;
  margin: 0;
}
.flow-actions__urge {
  --el-button-bg-color: #fff6e7;
  --el-button-border-color: #f5d38e;
  --el-button-text-color: #e89a19;
}
.flow-status .flow-node--next {
  min-height: 92px;
}
.flow-node--current .flow-node__head {
  margin-bottom: 4px;
}
.flow-node:nth-of-type(1) .flow-node__meta-row {
  transform: translateY(-1px);
}
.flow-node--current .flow-node__kicker {
  transform: translateY(-1px);
}
.flow-node--current .flow-node__sub {
  transform: translateY(2px);
}
.flow-node--current .flow-node__allbtn {
  width: 180px;
  transform: translateY(6px);
}
.flow-node--next .flow-node__head,
.flow-node--next .flow-node__sub {
  transform: translateY(-1px);
}
.flow-node__head {
  margin-bottom: 8px;
}
.flow-node__sub + .flow-node__sub {
  margin-top: 10px;
}
.flow-node--current .flow-node__allbtn {
  margin-top: 10px;
  width: 180px;
  height: 24px;
  padding: 0 12px;
  justify-content: center;
  font-size: 12px;
  color: var(--sw-color-primary);
  background: #fff;
  border-color: var(--sw-color-primary-soft, #ece9ff);
  border-radius: 6px;
}
.flow-node__state--next {
  color: var(--sw-text-secondary);
  background: var(--sw-fill-base);
}
.flow-status .flow-node--current {
  min-height: 150px;
}
/* 设计（节点20）：右栏卡头部 40 / 内容区 13..25 对位 */
.task-main__right > .detail-card :deep(.el-card__header) {
  box-sizing: border-box;
  padding: 18px 22px 2px 24px;
}
.task-main__right > .detail-card :deep(.el-card__body) {
  padding: 14px 22px 23px 24px;
}
.flow-node--current {
  border-color: #d9caff;
  background: #fcfaff;
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
  color: #19233b;
}
.flow-node__kicker {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0 0 3px;
  font-size: 12px;
}
.flow-node__state--done {
  color: #12aa83;
}
.flow-node__state--current {
  color: var(--sw-color-primary);
  font-weight: 600;
}
.flow-node__meta-row .el-button {
  box-sizing: border-box;
  width: 76px;
}
.flow-node__prog {
  color: var(--sw-color-primary);
}
.flow-node__sub {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--sw-text-secondary);
}
.flow-node__meta-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.flow-node__meta-row .flow-node__meta {
  margin: 0;
}
.flow-node__allbtn {
  margin: 8px 0 0;
}
.flow-node__meta {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--sw-text-secondary);
}
.detail-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
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
/* 审批详情列表：按节点分组 */
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
  color: #a5adbe;
}

.p53-reject-action,
.p53-reject-action :deep(span) {
  color: #ef5d71 !important;
  --el-button-text-color: #ef5d71;
}
.task-detail :deep(.el-dialog .people-group__pending) {
  color: #a0a9bb;
}
/* ─── 意见详情弹窗：设计几何（780 宽 / 圆角 14 / 头部 meta / 意见面板 / 底部注脚） ─── */
.task-detail :deep(.p53-opinion-dialog) {
  margin-top: 182px !important;
  margin-bottom: auto;
}
.task-detail :deep(.p53-opinion-dialog.el-dialog) {
  height: 660px;
  padding: 0;
  display: flex;
  flex-direction: column;
}
.task-detail :deep(.p53-opinion-dialog .el-dialog__body) {
  flex: 1 1 auto;
  overflow: auto;
}
.task-detail :deep(.p53-opinion-dialog) {
  border-radius: 14px;
  box-shadow: 0 12px 32px rgba(19, 31, 58, 0.18);
}
.task-detail :deep(.p53-opinion-dialog .el-dialog__header) {
  box-sizing: border-box;
  height: 122px;
  padding: 20px 28px;
  margin-right: 0;
  border-bottom: 1px solid var(--sw-border-light);
}
.p53-opinion-dialog__head h2 {
  margin: 0 0 12px;
  font-size: 22px;
  line-height: 1.2;
  color: var(--sw-text-primary);
}
.p53-opinion-dialog__head b {
  font-size: 13px;
  color: var(--sw-text-primary);
}
.p53-opinion-dialog__head p {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--sw-text-secondary);
}
.task-detail :deep(.p53-opinion-dialog .el-dialog__body) {
  max-height: 484px;
  padding: 4px 28px 0;
  overflow: auto;
}
.p53-opinion-panel {
  box-sizing: border-box;
  height: 438px;
  padding: 15px 19px 10px;
  border: 1px solid var(--sw-border-light);
  border-radius: 10px;
  background: var(--sw-fill-base);
}
.p53-opinion-panel h3 {
  margin: 0 0 17px;
  font-size: 16px;
  color: var(--sw-text-primary);
}
.p53-opinion-grid {
  row-gap: 25px;
}
.p53-opinion-panel > label {
  display: block;
  margin: 14px 0 8px;
  font-size: 12px;
  color: var(--sw-text-secondary);
}
.p53-opinion-grid + label {
  margin-top: 19px;
  margin-bottom: 7px;
}
.p53-opinion-comment + label {
  margin-top: 16px;
  margin-bottom: 6px;
}
.p53-opinion-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 25px 80px;
}
.p53-opinion-grid label {
  display: block;
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--sw-text-secondary);
}
.p53-opinion-grid b {
  font-size: 14px;
  color: var(--sw-text-primary);
}
.p53-opinion-comment {
  min-height: 46px;
  padding: 14px;
  border: 1px solid var(--sw-border-light);
  border-radius: 8px;
  background: #fff;
  font-size: 13px;
  line-height: 1.7;
  color: var(--sw-text-primary);
  white-space: pre-wrap;
}
.p53-opinion-checks {
  display: grid;
  grid-template-columns: repeat(3, 210px);
  gap: 18px;
}
.p53-opinion-checks b {
  box-sizing: border-box;
  height: 24px;
  padding: 4px 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: #eaf8f2;
  color: var(--sw-success, #08a879);
  font-size: 12px;
  font-weight: 400;
  text-align: center;
  word-break: break-all;
}
.p53-opinion-attachment-row {
  display: flex;
  align-items: flex-start;
  gap: 20px;
  height: 36px;
  margin-top: 17px;
}
.p53-opinion-attachment-row > label {
  width: 58px;
  margin-top: 6px;
  font-size: 12px;
  color: var(--sw-text-secondary);
}
.p53-opinion-attachment {
  display: inline-flex;
  width: 280px;
  height: 36px;
  box-sizing: border-box;
  align-items: center;
  justify-content: center;
  padding: 10px 18px;
  border-radius: 7px;
  background: #f0ecff;
  color: var(--sw-color-primary, #6f2dff);
  font-size: 12px;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.task-detail :deep(.p53-opinion-dialog .el-dialog__footer) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-sizing: border-box;
  height: 68px;
  padding: 0 28px;
  border-top: 1px solid var(--sw-border-light);
}
.task-detail :deep(.p53-opinion-dialog .el-dialog__footer > .p53-opinion-dialog__note),
.task-detail :deep(.p53-opinion-dialog .el-dialog__footer > .p53-dialog-close) {
  position: relative;
  top: -16px;
}
.p53-opinion-dialog__note {
  font-size: 12px;
  color: var(--sw-text-secondary);
}
/* 弹窗关闭按钮（设计 108×42） */
.task-detail :deep(.el-dialog__footer .p53-dialog-close) {
  min-width: 108px;
  height: 42px;
  margin: 0;
}
/* ─── 会签记录弹窗：设计几何（1018 宽 / 头部 88 / 汇总行 / 行高 72 / 右对齐关闭） ─── */
.task-detail :deep(.p53-sign-dialog) {
  margin-top: 207px !important;
  border-radius: 14px;
}
.task-detail :deep(.p53-sign-dialog.el-dialog) {
  padding: 0;
}
.task-detail :deep(.p53-sign-dialog .el-dialog__header) {
  box-sizing: border-box;
  min-height: 88px;
  padding: 22px 27px 12px;
  margin-right: 0;
  border-bottom: 1px solid var(--sw-border-light);
}
.p53-sign-dialog__head h2 {
  margin: 0;
  font-size: 20px;
  color: var(--sw-text-primary);
}
.p53-sign-dialog__head p {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--sw-text-secondary);
}
.task-detail :deep(.p53-sign-dialog .el-dialog__body) {
  max-height: 460px;
  padding: 17px 27px 0;
  overflow: auto;
}
.p53-sign-summary {
  margin: 0 0 27px;
  font-size: 15px;
  color: var(--sw-color-primary);
}
.p53-sign-table :deep(.el-table__header-wrapper th) {
  height: 50px;
  background: var(--sw-fill-base);
  color: var(--sw-text-secondary);
  font-weight: 400;
}
.p53-sign-table :deep(.el-table__header-wrapper .cell) {
  padding-left: 21px;
  line-height: 20px;
  transform: translateY(4px);
}
.p53-sign-table :deep(.el-table__body td) {
  height: 74px;
}
.p53-sign-table :deep(.p53-sign-time) {
  display: block;
  white-space: pre-line;
  line-height: 20px;
}
.p53-sign-table :deep(.el-button) {
  width: 76px;
  height: 26px;
  padding: 0;
}
.task-detail :deep(.p53-sign-dialog .el-dialog__footer) {
  display: flex;
  justify-content: flex-end;
  padding: 0 27px 23px;
}
.p53-sign-note {
  margin: 27px 0 0;
  font-size: 12px;
  color: var(--sw-text-secondary);
}
/* ─── 流程图 tab：设计壳层（网格底 / 圆角画布 / 右侧当前节点状态卡） ─── */
.p53-graph-shell {
  min-height: 320px;
}
.p53-graph-shell > .el-alert {
  margin-bottom: 12px;
}
.p53-graph-canvas {
  position: relative;
}
.p53-graph-canvas :deep(.pg-view) {
  border-color: var(--sw-border-lighter);
  border-radius: 10px;
  background: #fbfdff;
}
.p53-graph-canvas :deep(.pg-view)::before {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  content: '';
  background-image:
    linear-gradient(#e8edf6 1px, transparent 1px),
    linear-gradient(90deg, #e8edf6 1px, transparent 1px);
  background-size: 24px 24px;
}
.p53-graph-canvas :deep(.pg-svg),
.p53-graph-canvas :deep(.pg-legend),
.p53-graph-canvas :deep(.pg-zoom),
.p53-graph-canvas :deep(.pg-compat-alert) {
  z-index: 1;
}
.p53-graph-canvas :deep(.pg-zoom) {
  box-sizing: border-box;
  width: 183px;
  height: 78px;
  right: 22px;
  bottom: 38px;
  padding: 11px 18px 15px;
}
.p53-graph-canvas :deep(.pg-zoom__row) {
  width: 151px;
  justify-content: flex-start;
}
.p53-graph-canvas :deep(.pg-zoom__row:last-child) {
  transform: translateY(4px);
}
.p53-graph-canvas :deep(.pg-zoom__locate) {
  padding-left: 0;
  padding-right: 0;
}
.p53-graph-canvas :deep(.pg-node-label) {
  transform: translateX(2.25px);
}
/* 设计（节点19）：画布右侧双卡（当前节点 / 节点状态） */
.p53-graph-rail {
  position: absolute;
  top: 50px;
  right: 23px;
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: 44px;
  width: 182px;
}
.p53-graph-status {
  box-sizing: border-box;
  width: 100%;
  padding: 16px;
  border: 1px solid var(--sw-border-light);
  border-radius: 10px;
  background: #fff;
}
.p53-graph-status small {
  display: block;
  font-size: 12px;
  color: var(--sw-text-secondary);
}
.p53-graph-status strong {
  display: block;
  margin-top: 14px;
  font-size: 16px;
  color: var(--sw-color-primary);
}
.p53-graph-status span {
  display: block;
  margin-top: 16px;
  font-size: 12px;
  color: var(--sw-text-primary);
}
.p53-graph-status span + span {
  color: var(--sw-text-secondary);
}
.p53-graph-legend {
  box-sizing: border-box;
  width: 100%;
  padding: 16px;
  border: 1px solid var(--sw-border-light);
  border-radius: 10px;
  background: #fff;
}
.p53-graph-legend strong {
  display: block;
  margin-bottom: 12px;
  font-size: 14px;
  color: var(--sw-text-primary);
}
.p53-graph-legend__chip {
  display: inline-block;
  box-sizing: border-box;
  width: 104px;
  padding: 4px 0;
  border-radius: 4px;
  font-size: 12px;
  text-align: center;
}
.p53-graph-legend__chip + .p53-graph-legend__chip {
  margin-top: 10px;
}
.p53-graph-legend__chip--completed {
  background: #e6f8f2;
  color: #15a77f;
}
.p53-graph-legend__chip--current {
  background: #f0eaff;
  color: #6f2dff;
}
.p53-graph-legend__chip--pending {
  background: #f0f3f9;
  color: #8a96ad;
}
/* ─── 底部记录卡页签几何（48px 页签 / 150px 页签宽） ─── */
.detail-card--tabs {
  box-sizing: border-box;
  min-height: 332px;
}
.detail-card--tabs :deep(.el-card__body) {
  padding: 0 0 24px;
}
.detail-card--tabs :deep(.el-tabs__header) {
  height: 48px;
  margin-bottom: 0;
  background: #fafbfe;
}
.detail-card--tabs :deep(.el-tabs__nav-wrap),
.detail-card--tabs :deep(.el-tabs__nav-scroll),
.detail-card--tabs :deep(.el-tabs__nav) {
  height: 48px;
}
.detail-card--tabs :deep(.el-tabs__nav) {
  padding-left: 24px;
}
.detail-card--tabs :deep(.el-tabs__item) {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 150px;
  height: 48px;
  padding: 0;
  line-height: 19px;
  text-align: center;
}
.detail-card--tabs :deep(.detail-tab-label) {
  display: inline-block;
  line-height: 19px;
}
/* 审批详情列表页签（设计行高 24 表头 / 44 行；表格 270..1386） */
.task-detail--people-active
  > .detail-card--tabs
  :deep(.el-tabs__content > .el-tab-pane[aria-hidden='false'] > .el-table) {
  box-sizing: border-box;
  width: calc(100% - 46px) !important;
  margin: 12px 22px 0 24px;
}
.task-detail--people-active > .detail-card--tabs :deep(.el-table__header-wrapper tr),
.task-detail--people-active > .detail-card--tabs :deep(.el-table__header-wrapper th) {
  height: 32px !important;
}
.task-detail--people-active > .detail-card--tabs :deep(.el-table__body-wrapper tr),
.task-detail--people-active > .detail-card--tabs :deep(.el-table__body-wrapper td) {
  height: 44px;
}
.task-detail--people-active > .detail-card--tabs :deep(.el-table .cell) {
  line-height: 20px;
  padding-left: 1px;
  padding-right: 0;
}
.task-detail--people-active > .detail-card--tabs :deep(.el-table__header-wrapper .cell) {
  transform: translateY(-2.5px);
}
.task-detail--people-active
  > .detail-card--tabs
  :deep(.el-table__body-wrapper td:not(:last-child) .cell) {
  transform: translateY(-6px);
}
.task-detail--people-active
  > .detail-card--tabs
  :deep(.el-table__body-wrapper td:last-child .cell) {
  transform: translateY(-1px);
}
/* 设计：状态列为彩色文字（非胶囊） */
.people-status {
  font-size: 13px;
}
.people-status--success {
  color: #12aa83;
}
.people-status--danger {
  color: #ef5d71;
}
.people-status--info {
  color: var(--sw-text-secondary);
}
/* ─── 流转记录四列表（行数据来自真实审批历史） ─── */
.p53-records-table {
  box-sizing: border-box;
  width: calc(100% - 46px);
  margin: 12px 22px 0 24px;
  border: 1px solid var(--sw-border-lighter);
  color: var(--sw-text-primary);
  font-size: 13px;
}
.p53-records-table__head,
.p53-records-table__row {
  display: grid;
  grid-template-columns: 152px 252px 144px minmax(0, 1fr);
  align-items: center;
}
.p53-records-table__head {
  min-height: 32px;
  background: var(--sw-fill-base);
  color: var(--sw-text-secondary);
  font-size: 12px;
}
.p53-records-table__row {
  box-sizing: border-box;
  min-height: 44px;
  border-top: 1px solid var(--sw-border-lighter);
}
.p53-records-table__head span,
.p53-records-table__row span {
  min-width: 0;
  padding: 0 12px 0 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.p53-records-table__head span {
  transform: translateY(-4px);
}
.p53-records-table__row span {
  transform: translateY(-8px);
}
/* 窄屏双栏退化为单列（方向 §4.5：不留裁切） */
@media (max-width: 991px) {
  .task-main {
    grid-template-columns: 1fr;
  }
}
</style>
