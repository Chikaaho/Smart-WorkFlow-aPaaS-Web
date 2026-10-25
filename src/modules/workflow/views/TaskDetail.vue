<script setup lang="ts">
/* global window */
import { useTaskApproval } from '../composables/use-task-approval'
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * TaskDetail — 任务详情页。
 *
 * 展示任务详情信息、流程变量、审批历史，提供通过/驳回操作。
 * 路由参数：taskId
 */
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowDown, ArrowLeft } from '@element-plus/icons-vue'
import { useUserStore } from '@/stores/user'
import {
  queryTaskDetail,
  acceptTaskAction,
  latestTaskCommand,
  pollCommandStatus,
  myInstances,
  transferTask,
  delegateTask,
  communicateTask,
  addSignTask,
  getApprovalOpinionDraft,
  saveApprovalOpinionDraft,
  type TaskActionSegment,
} from '@/modules/workflow/api'
import { ApiError } from '@/foundation/request'
import { hasPerm } from '@/foundation/permission'
import UserRemoteSelect from '@/components/UserRemoteSelect.vue'
import type { ApprovalHistoryItem, TaskDetail } from '@/contracts/bpm'
import type { ApprovalActionRequest, ApprovalOpinionConfig } from '@/contracts/bpm-node'
import type { FormSchema } from '@/contracts/form-schema'
import type { TaskNodeFormView } from '@/contracts/p64'
import { getTaskNodeForm, saveTaskNodeFormDraft } from '@/modules/workflow/api/p64'
import DynamicField from '@/components/DynamicField.vue'
import HintTip from '@/components/HintTip.vue'
import { createFieldScripts } from '@/adapters/form-runtime'
import InstanceFlowPanel from '../components/InstanceFlowPanel.vue'
import BusinessFormReadonly from '@/components/business-detail/BusinessFormReadonly.vue'

const router = useRouter()
const route = useRoute()

/**
 * 同一套任务详情既作为独立办理页，也嵌入统一详情弹窗：
 * 列表传入 taskId；路由直达时回退读取路由参数。
 */
const props = withDefaults(
  defineProps<{
    taskId?: string
    embedded?: boolean
  }>(),
  { taskId: '', embedded: false },
)
const emit = defineEmits<{ completed: [] }>()

const taskId = props.taskId || (route.params.taskId as string)

// ─── 页面状态 ───
const detail = ref<TaskDetail | null>(null)
const loading = ref(false)
const errorMsg = ref('')
const acting = ref<string | null>(null) // 'approve' | 'reject' | null
// P63 G05b：本人上次动作的过期终态（任务加载即呈现，可重试恢复）
const lastExpired = ref<{ reason: string } | null>(null)
const opinionComment = ref('')
const opinionData = ref<Record<string, unknown>>({})
const opinionDraftSaving = ref(false)
const opinionDraftRestored = ref(false)
const returnTargetNodeId = ref('')
/** 本次提交的表单记录数据（businessKey = 表单记录 ID，经 form 模块只读接口回查） */
const formRecord = ref<Record<string, unknown> | null>(null)
const formRecordLoading = ref(false)

async function loadDetail() {
  loading.value = true
  errorMsg.value = ''
  opinionDraftRestored.value = false
  try {
    detail.value = await queryTaskDetail(taskId)
    initializeOpinionData(detail.value)
    void loadOpinionDraft()
    void loadFormRecord()
    void loadReservations()
    void loadLastExpired()
    void loadNodeForm()
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

async function loadOpinionDraft() {
  if (!detail.value?.canHandle) return
  try {
    const draft = await getApprovalOpinionDraft(taskId)
    const form = detail.value.opinionForm
    if (
      draft &&
      (!form?.formId || draft.opinionFormId === form.formId) &&
      (!form?.version || draft.opinionFormVersion === form.version)
    ) {
      opinionComment.value = draft.comment ?? ''
      opinionData.value = { ...draft.opinionData }
      opinionDraftRestored.value = true
    }
  } catch {
    // 暂存读取失败不阻断正式办理，页面给出可重试的保存入口。
  }
}

async function saveOpinionDraft() {
  if (opinionDraftSaving.value || !detail.value?.canHandle) return
  opinionDraftSaving.value = true
  try {
    const form = detail.value.opinionForm
    await saveApprovalOpinionDraft(taskId, {
      opinionFormId: form?.formId,
      opinionFormVersion: form?.version,
      comment: opinionComment.value,
      opinionData: { ...opinionData.value },
    })
    // 保存成功仅更新草稿，不代表本次打开时已从服务器恢复。
    opinionDraftRestored.value = false
    ElMessage.success(t('workflow.opinionDraftSaved'))
  } catch (error) {
    ElMessage.error(error instanceof ApiError ? error.msg : t('workflow.opinionDraftSaveFailed'))
  } finally {
    opinionDraftSaving.value = false
  }
}

/** 按 formKey + businessKey 回查本次提交的表单数据；失败不阻断审批主链 */
async function loadFormRecord() {
  const d = detail.value
  if (!d?.formKey || !d.businessKey) return
  formRecordLoading.value = true
  try {
    const { getFormData } = await import('@/adapters/form-runtime')
    formRecord.value = await getFormData(d.formKey, d.businessKey)
  } catch {
    formRecord.value = null
  } finally {
    formRecordLoading.value = false
  }
}

// ═════════ P64 阶段Ⅰ：节点业务表单（绑定任务可填报；草稿/最终提交/已提交回看） ═════════

const nodeForm = ref<TaskNodeFormView | null>(null)
const nodeFormModel = ref<Record<string, unknown>>({})
const nodeFormErrors = ref<string[]>([])
const nodeFormSavingDraft = ref(false)

const nodeFormFields = computed(
  () => (nodeForm.value?.definition?.fields ?? []) as unknown as FormSchema['fields'],
)
const nodeFormBound = computed(() => Boolean(nodeForm.value?.bound))
const nodeFormSubmitted = computed(() => nodeForm.value?.status === 'SUBMITTED')
/** 待办且未最终提交时可编辑；已提交或历史任务只读回看。 */
const nodeFormEditable = computed(() => nodeFormBound.value && !nodeFormSubmitted.value)

// BF20261013-021：节点表单字段脚本（值变更触发；onLoad 在装载后执行；只读回看不执行）
const nodeFieldScripts = createFieldScripts({
  getSchema: () =>
    nodeForm.value ? ({ title: '', fields: nodeFormFields.value } as unknown as FormSchema) : null,
  model: () => nodeFormModel.value,
  enabled: () => nodeFormEditable.value,
})
onUnmounted(() => nodeFieldScripts.dispose())

/** 脚本隐藏的节点字段集合（隐藏不渲染、不参与必填校验、最终提交不携带）。 */
const nodeFormHiddenAll = computed(() => {
  const hidden = new Set<string>()
  for (const [name, flag] of Object.entries(nodeFieldScripts.overrides.hidden)) {
    if (flag) hidden.add(name)
  }
  return hidden
})

/** 渲染用节点字段（脚本隐藏过滤 + 必填覆盖写回，星标/校验同源）。 */
const nodeFormRenderFields = computed(() =>
  nodeFormFields.value
    .filter((f) => !nodeFormHiddenAll.value.has(f.name))
    .map((f) => {
      const required = nodeFieldScripts.overrides.required[f.name] ?? f.required ?? false
      return required === (f.required ?? false)
        ? f
        : ({ ...f, required } as FormSchema['fields'][number])
    }),
)

function nodeFieldRequired(field: FormSchema['fields'][number]): boolean {
  return nodeFieldScripts.overrides.required[field.name] ?? field.required ?? false
}

function nodeFieldReadonly(field: FormSchema['fields'][number]): boolean {
  return !nodeFormEditable.value || (nodeFieldScripts.overrides.readonly[field.name] ?? false)
}

async function loadNodeForm() {
  try {
    const view = await getTaskNodeForm(taskId)
    nodeForm.value = view
    nodeFormModel.value = { ...(view.data ?? {}) }
    // 装载整体替换模型：重置基线避免装载被当作“值变更”，随后执行 onLoad 脚本
    nodeFieldScripts.resetBaseline()
    nodeFieldScripts.runOnLoad()
  } catch {
    nodeForm.value = null
  }
}

/**
 * 节点表单表格预填（P64 阶段Ⅱ A06）：节点表格字段尚无值时以业务记录现值初始化。
 * 子流程办理人因此只看到本实例授权来源行（行标识随派发冻结），无需手工录入；
 * 记录表为空或节点表单已有值时保持原值（用户编辑不回退）。
 */
function prefillNodeFormTables() {
  if (!nodeFormEditable.value) return
  const record = formRecord.value as Record<string, unknown> | null
  if (!record) return
  for (const field of nodeFormFields.value) {
    if (field.type !== 'TABLE') continue
    const current = nodeFormModel.value[field.name]
    if (Array.isArray(current) && current.length > 0) continue
    const source = record[field.name]
    if (!Array.isArray(source) || source.length === 0) continue
    nodeFormModel.value = {
      ...nodeFormModel.value,
      [field.name]: source.map((row) => {
        const clean = { ...((row ?? {}) as Record<string, unknown>) }
        delete clean._rowId
        delete clean._rowAction
        return clean
      }),
    }
  }
}

watch([nodeForm, formRecord], () => {
  prefillNodeFormTables()
})

/** 节点表单必填缺失字段名（单一判定源；内联错误与校验弹窗共用）。 */
function collectNodeFormMissingLabels(): string[] {
  if (!nodeFormBound.value || nodeFormSubmitted.value) return []
  const missing: string[] = []
  for (const field of nodeFormFields.value) {
    if (nodeFormHiddenAll.value.has(field.name)) continue
    if (!nodeFieldRequired(field)) continue
    const value = nodeFormModel.value[field.name]
    const empty =
      value == null ||
      (typeof value === 'string' && value.trim() === '') ||
      (Array.isArray(value) && value.length === 0)
    if (empty) missing.push(field.label || field.name)
  }
  return missing
}

/** 节点表单必填校验（客户端 UX 提示；服务端提交仍全量校验，1401/2433 为权威口径）。 */
function validateNodeFormRequired(): boolean {
  nodeFormErrors.value = collectNodeFormMissingLabels().map((label) => `${label}: 必填`)
  return nodeFormErrors.value.length === 0
}

function nodeFormMissingItems(): string[] {
  return collectNodeFormMissingLabels().map((label) => t('workflow.validationFillPrefix') + label)
}

async function handleNodeFormDraft() {
  if (!nodeFormEditable.value || nodeFormSavingDraft.value) return
  nodeFormSavingDraft.value = true
  try {
    await saveTaskNodeFormDraft(taskId, nodeFormModel.value)
    ElMessage.success(t('workflow.taskFormSaved'))
    await loadNodeForm()
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('workflow.taskFormSaveFailed'))
  } finally {
    nodeFormSavingDraft.value = false
  }
}

// ═════════ P63 IoT 预约信息（实例维度；跨模块沿用动态 import，失败不阻断审批主链） ═════════

/** 预约单视图类型（iot 模块 API 契约；类型查询不建立运行时依赖）。 */
type IotReservationView = import('@/adapters/iot-reservation').IotReservationView

const reservations = ref<IotReservationView[]>([])
const reservationsLoading = ref(false)

/** 预约状态中文标签与标签色：待触发/下发处理中/已下发/已取消/已过期/下发失败。 */
const RESERVATION_STATUS_META: Record<
  string,
  { label: string; tag: 'primary' | 'success' | 'info' | 'warning' | 'danger' }
> = {
  PENDING: { label: '待触发', tag: 'warning' },
  DISPATCHING: { label: '下发处理中', tag: 'primary' },
  DISPATCHED: { label: '已下发', tag: 'success' },
  CANCELED: { label: '已取消', tag: 'info' },
  EXPIRED: { label: '已过期', tag: 'info' },
  FAILED: { label: '下发失败', tag: 'danger' },
}

function reservationStatusLabel(status: string): string {
  return RESERVATION_STATUS_META[status]?.label ?? status
}

function reservationStatusTag(
  status: string,
): 'primary' | 'success' | 'info' | 'warning' | 'danger' {
  return RESERVATION_STATUS_META[status]?.tag ?? 'info'
}

/** 实例维度查询一次；失败/为空时区块整体隐藏，普通审批场景零打扰。 */
async function loadReservations() {
  const processInstanceId = detail.value?.processInstanceId
  if (!processInstanceId) return
  reservationsLoading.value = true
  try {
    const { listReservationsByInstance } = await import('@/adapters/iot-reservation')
    reservations.value = (await listReservationsByInstance(processInstanceId)) ?? []
  } catch {
    // 查询失败按无预约处理（区块隐藏），不打断审批详情主链
    reservations.value = []
  } finally {
    reservationsLoading.value = false
  }
}

// ─── 取消预约：入口按 v-perm（iot:reservation:cancel）显隐，服务端仍是最终权威 ───
const cancelDialogVisible = ref(false)
const cancelTarget = ref<IotReservationView | null>(null)
const cancelReason = ref('')
const cancelSubmitting = ref(false)

function openCancelReservation(row: IotReservationView) {
  cancelTarget.value = row
  cancelReason.value = ''
  cancelDialogVisible.value = true
}

async function submitCancelReservation() {
  const target = cancelTarget.value
  if (!target) return
  if (!cancelReason.value.trim()) {
    ElMessage.warning('请填写取消原因')
    return
  }
  cancelSubmitting.value = true
  try {
    const { cancelReservation } = await import('@/adapters/iot-reservation')
    const outcome = await cancelReservation(target.id, cancelReason.value.trim())
    if (outcome === 'CANCELED') {
      ElMessage.success('预约已取消')
      cancelDialogVisible.value = false
    } else {
      // 幂等不可取消（已被触发/已取消/已过期等）：提示后刷新到最新状态
      ElMessage.warning('当前预约状态不可取消')
    }
    await loadReservations()
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : '取消预约失败')
  } finally {
    cancelSubmitting.value = false
  }
}

/**
 * 0.1.7 #20：返回上一页。vue-router 4 在 history.state.back 记录应用内来源，
 * 有来源即 router.back()（待办/已办/我发起的等入口天然各自回自己的列表）；
 * 直达打开无历史时兜底回工作台待办。
 */
function hasInAppHistory(): boolean {
  const back = window.history.state?.back
  return typeof back === 'string' && back !== ''
}

function goBack() {
  if (hasInAppHistory()) {
    router.back()
    return
  }
  void router.push({ name: 'workspace-todo' })
}

/** 返回按钮文案：V012-BUG-013 精简为「返回」。 */
const backLabel = computed(() => t('common.backShort'))

/**
 * 审批 API 已成功提交后，页面导航失败不应被误报为审批失败。
 * 例如重复导航、守卫竞态或目标页面刷新都可能让 router.push reject，
 * 但此时业务动作已经落库，不能再显示相反的错误提示。
 * 0.1.7 #20：审批结束（通过/驳回及转办委托等完成动作）后返回上一页。
 */
async function navigateAfterAction() {
  // 弹窗内办理完成后关闭弹窗并由列表刷新，不触发整页导航。
  if (props.embedded) {
    emit('completed')
    return
  }
  try {
    if (hasInAppHistory()) {
      router.back()
    } else {
      await router.push({ name: 'workspace-todo' })
    }
  } catch {
    // 业务动作已完成，导航失败不影响动作结果。
  }
}

/**
 * 0.1.7 #30：通过/驳回唯一控制面（use-task-approval）。
 * 本页注入完整处理的特权：意见表单/节点表单预检 + actionPayload 负载 + 完成后导航。
 */
const taskApproval = useTaskApproval({
  taskId: () => taskId,
  preCheck: (action) => {
    if (!ensureOpinionData()) return false
    if (
      action === 'APPROVE' &&
      nodeFormBound.value &&
      !nodeFormSubmitted.value &&
      !validateNodeFormRequired()
    ) {
      openValidationDialog(nodeFormMissingItems())
      return false
    }
    return true
  },
  buildPayload: (action) => actionPayload(action),
  onCompleted: () => navigateAfterAction(),
})

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
  const base = (() => {
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
  })()
  // P64 阶段Ⅰ：任务绑定节点业务表单时，最终提交随合法动作同事务生效。
  // 无意见表单且无备注时 base 为 undefined，节点表单数据仍必须随动作提交
  // （否则后端读不到节点表单值 → 节点数据丢失/触发变量缺失）。
  if (action === 'APPROVE' && nodeFormBound.value && !nodeFormSubmitted.value) {
    // BF021：脚本隐藏字段不进入最终提交载荷（草稿保存仍保留全部数据）
    const nodeFormData: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(nodeFormModel.value)) {
      if (!nodeFormHiddenAll.value.has(key)) nodeFormData[key] = value
    }
    return { ...(base ?? { action }), nodeFormData }
  }
  return base
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

// ── 设计 300:1808 校验提示弹窗：提交前必填缺失聚合为清单（红条目 + 说明行） ──
const validationDialogVisible = ref(false)
const validationItems = ref<string[]>([])

function openValidationDialog(items: string[]): boolean {
  if (items.length === 0) return true
  validationItems.value = items
  validationDialogVisible.value = true
  return false
}

function opinionMissingItems(): string[] {
  return visibleOpinionFields.value
    .filter((field) => {
      if (!field.required || field.type === 'NOTE') return false
      const value = opinionData.value[field.key]
      return value == null || (typeof value === 'string' && value.trim() === '')
    })
    .map((field) => t('workflow.validationFillPrefix') + (field.label || field.key))
}

function ensureOpinionData(): boolean {
  return openValidationDialog(opinionMissingItems())
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
    } else if (finalStatus?.status === 'EXPIRED') {
      // P63 G05b：过期=效果未发生，明确呈现原因与下一动作（原用户可直接重试，重提交即恢复）
      ElMessage.error(
        (finalStatus.failureReason ?? failMsg) + '；可直接重试本次操作（将重新提交审批命令）',
      )
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
  if (acting.value || !canApprove.value) return
  if (!ensureOpinionData()) return
  // P64 阶段Ⅰ：节点表单必填客户端预检（服务端 2433 为权威口径）
  if (nodeFormBound.value && !nodeFormSubmitted.value && !validateNodeFormRequired()) {
    openValidationDialog(nodeFormMissingItems())
    return
  }
  acting.value = 'approve'
  try {
    await taskApproval.submit('APPROVE')
  } finally {
    acting.value = null
  }
}

// ── 设计 272:1746 驳回申请弹窗：驳回原因（可选）收进弹窗，确认后直提 ──
const rejectDialogVisible = ref(false)
const rejectReason = ref('')
const rejectSubmitting = ref(false)

function handleReject() {
  if (acting.value || !canReject.value) return
  if (!ensureOpinionData()) return
  rejectReason.value = ''
  rejectDialogVisible.value = true
}

async function confirmReject(): Promise<void> {
  if (rejectSubmitting.value) return
  if (!ensureOpinionData()) return
  const reason = rejectReason.value.trim()
  if (reason) {
    if (visibleOpinionFields.value.length === 0) {
      opinionComment.value = reason
    } else if (typeof opinionData.value.comment !== 'string' || !opinionData.value.comment) {
      opinionData.value = { ...opinionData.value, comment: reason }
    }
  }
  rejectSubmitting.value = true
  acting.value = 'reject'
  try {
    await taskApproval.submit('REJECT', { skipConfirm: true })
    rejectDialogVisible.value = false
  } finally {
    rejectSubmitting.value = false
    acting.value = null
  }
}

// ── 设计 273:2001 退回申请弹窗：退回目标选择收进弹窗（说明行 + 取消/确定） ──
const returnDialogVisible = ref(false)
const returnSubmitting = ref(false)

function handleReturn() {
  if (acting.value || !canReturn.value) return
  if (!returnTargetNodeId.value) returnTargetNodeId.value = returnTargets.value[0]?.nodeKey ?? ''
  if (!returnTargetNodeId.value) {
    ElMessage.warning(t('workflow.noReturnTargets'))
    return
  }
  returnDialogVisible.value = true
}

async function confirmReturn(): Promise<void> {
  if (returnSubmitting.value) return
  const target = returnTargetNodeId.value || returnTargets.value[0]?.nodeKey
  if (!target) {
    ElMessage.warning(t('workflow.noReturnTargets'))
    return
  }
  returnSubmitting.value = true
  acting.value = 'return'
  try {
    returnDialogVisible.value = false
    await runAction(
      'return',
      { action: 'RETURN', returnTargetNodeId: target, ...actionPayload('RETURN') },
      t('common.statusReturned'),
      t('workflow.returnFailed'),
    )
  } finally {
    returnSubmitting.value = false
    acting.value = null
  }
}

// ═════════ I3 生命周期动作（转办/委托/沟通/加签） ═══════════════════════

// V012-BUG-019：生命周期弹窗用户输入改选择器；仍以 CSV 字符串承载提交契约
function csvToIds(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((id) => /^\d+$/.test(id) && !/^0+$/.test(id))
}
function idsToCsv(ids: Array<number | string> | null | undefined): string {
  return (ids ?? []).map(String).join(',')
}

const lifecycleDialogVisible = computed({
  get: () => lifecycleDialog.value !== null,
  set: (value: boolean) => {
    if (!value) lifecycleDialog.value = null
  },
})

type LifecycleKind = 'TRANSFER' | 'DELEGATE' | 'COMMUNICATE' | 'ADD_SIGN'

const lifecycleDialog = ref<null | {
  kind: LifecycleKind
  targetUserId?: string
  message?: string
  receivers?: string
  participants?: string
  mode?: 'SERIAL' | 'PARALLEL'
  signPosition?: 'BEFORE' | 'AFTER'
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
}

function openLifecycle(kind: LifecycleKind) {
  if (acting.value) return
  lifecycleDialog.value = { kind, mode: 'PARALLEL', signPosition: 'BEFORE' }
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
    const receivers = csvToIds(dialog.receivers)
    if (receivers.length === 0) {
      ElMessage.warning(t('workflow.consultReceiversRequired'))
      return
    }
    payload = { receivers, message: dialog.message ?? '' }
  } else {
    const raw = csvToIds(dialog.participants)
    if (raw.length === 0) {
      ElMessage.warning(t('workflow.participantsRequired'))
      return
    }
    payload = {
      ...(actionPayload('ADD_SIGN') ?? { action: 'ADD_SIGN' }),
      participants: raw,
      mode: dialog.mode ?? 'PARALLEL',
      signPosition: dialog.signPosition ?? 'BEFORE',
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
    } else {
      await addSignTask(taskId, payload)
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

// ─── 审批结果映射（流转记录/审批详情在 InstanceFlowPanel 内共享同一份派生） ───

function opinionInputType(field: NonNullable<ApprovalOpinionConfig['fields']>[number]): string {
  if (field.type === 'DATETIME') return 'datetime-local'
  if (field.type === 'NUMBER') return 'number'
  return 'text'
}

/**
 * 服务端办理权限（canHandle）：仅待办且当前用户可办理时呈现审批动作，
 * 监控/发起人等只读身份不再展示通过/驳回按钮；后端动作接口仍是最终权威。
 */
const canAct = computed(
  () => detail.value?.taskStatus !== 'FINISHED' && detail.value?.canHandle === true,
)

type NodeActionCode =
  | 'APPROVE'
  | 'DISAPPROVE'
  | 'REJECT'
  | 'RETURN'
  | 'TRANSFER'
  | 'DELEGATE'
  | 'COMMUNICATE'
  | 'ADD_SIGN'

/** Missing metadata keeps legacy behavior; an explicit array is the node policy boundary. */
function nodeAllows(action: NodeActionCode): boolean {
  const allowed = detail.value?.allowedActions
  return !Array.isArray(allowed) || allowed.includes(action)
}

const canApprove = computed(() => canAct.value && nodeAllows('APPROVE'))
const canReject = computed(() => canAct.value && nodeAllows('REJECT'))
const canReturn = computed(() => canAct.value && nodeAllows('RETURN'))

/** 催办仅对流程发起人呈现（真实契约：POST /workflow/my/instances/{id}/urge）。 */
const isInitiator = computed(() => {
  const d = detail.value
  const uid = userStore.user?.id
  return d != null && uid != null && String(d.initiatorId ?? '') === String(uid)
})

/** 已结束/失败/终止的流程只读：发起人也不能再催办。 */
const flowActive = computed(() => {
  const d = detail.value
  if (!d) return false
  if (d.instanceStatus != null) return d.instanceStatus === 'RUNNING'
  return d.taskStatus === 'RUNNING'
})

const canUrge = computed(() => isInitiator.value && flowActive.value && hasPerm('workflow:urge'))

type ApprovalMoreCommand = LifecycleKind | 'URGE'
interface ApprovalMoreAction {
  command: ApprovalMoreCommand
  label: string
  divided?: boolean
}

const LIFECYCLE_PERMISSIONS: Record<LifecycleKind, string> = {
  TRANSFER: 'workflow:task:transfer',
  DELEGATE: 'workflow:task:delegate',
  COMMUNICATE: 'workflow:task:communicate',
  ADD_SIGN: 'workflow:task:add-sign',
}

/** Permission, task state and server-supplied node policy form the UI intersection. */
function lifecycleVisible(command: LifecycleKind): boolean {
  if (!canAct.value || !hasPerm(LIFECYCLE_PERMISSIONS[command])) return false
  return nodeAllows(command)
}

const approvalMoreActions = computed<ApprovalMoreAction[]>(() => {
  const actions: ApprovalMoreAction[] = []
  if (lifecycleVisible('TRANSFER')) {
    actions.push({ command: 'TRANSFER', label: t('workflow.transferOwnTask') })
  }
  if (lifecycleVisible('DELEGATE')) {
    actions.push({ command: 'DELEGATE', label: t('workflow.delegateAction') })
  }
  if (lifecycleVisible('COMMUNICATE')) {
    actions.push({ command: 'COMMUNICATE', label: t('workflow.consultTask') })
  }
  if (lifecycleVisible('ADD_SIGN')) {
    actions.push({ command: 'ADD_SIGN', label: t('workflow.addSign') })
  }
  if (canUrge.value) {
    actions.push({
      command: 'URGE',
      label: t('taskDetailUi.urgeAction'),
      divided: actions.length > 0,
    })
  }
  return actions
})
const hasApprovalMoreActions = computed(() => approvalMoreActions.value.length > 0)

function isLifecycleKind(value: string): value is LifecycleKind {
  return ['TRANSFER', 'DELEGATE', 'COMMUNICATE', 'ADD_SIGN'].includes(value)
}

function handleApprovalMore(command: string): void {
  if (acting.value) return
  if (command === 'URGE') {
    openUrgeDialog()
    return
  }
  if (isLifecycleKind(command) && lifecycleVisible(command)) openLifecycle(command)
}

// ── 设计 273:2025 催办弹窗：说明 + 催办留言（可空，服务端限 200 字） ──
const urgeDialogVisible = ref(false)
const urgeMessage = ref('')

function openUrgeDialog(): void {
  if (acting.value || !canUrge.value) return
  urgeMessage.value = ''
  urgeDialogVisible.value = true
}

async function confirmUrge(): Promise<void> {
  await onUrge(urgeMessage.value.trim())
  urgeDialogVisible.value = false
}

async function onUrge(message?: string): Promise<void> {
  const d = detail.value
  if (!d?.processInstanceId || !canUrge.value) return
  try {
    const page = await myInstances(
      { pageNum: 1, pageSize: 100 },
      d.businessKey ? { keyword: d.businessKey } : undefined,
    )
    const instance = page.list.find(
      (item) =>
        item.processInstanceId === d.processInstanceId &&
        String(item.initiatorId) === String(d.initiatorId),
    )
    if (!instance) {
      ElMessage.info(t('workflow.urgeNotAvailable'))
      return
    }
    const { urgeMyInstance } = await import('@/modules/workflow/api/oa')
    const resp = await urgeMyInstance(instance.id, message)
    if (resp.result === 'ACCEPTED') {
      ElMessage.success(resp.detail || t('workflow.urgeSent'))
    } else if (resp.result === 'COOLDOWN') {
      ElMessage.warning(resp.detail || t('workflow.urgeCoolingDown'))
    } else {
      ElMessage.info(resp.detail || t('workflow.urgeNotAvailable'))
    }
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

/** P63 G05b：任务加载时回查本人最新命令，EXPIRED 则持久呈现原因与重试提示。 */
async function loadLastExpired() {
  try {
    const latest = await latestTaskCommand(taskId)
    lastExpired.value =
      latest && latest.status === 'EXPIRED' ? { reason: latest.failureReason ?? '' } : null
  } catch {
    lastExpired.value = null
  }
}

onMounted(loadDetail)
</script>

<template>
  <div v-loading="loading" class="task-detail" :class="{ 'task-detail--embedded': embedded }">
    <!-- 0.1.7 #18：页头只留左上角返回箭头，标题/状态/发起人等噪音全部去掉 -->
    <div v-if="!embedded" class="detail-header">
      <button
        type="button"
        class="detail-header__arrow"
        data-testid="task-detail-back"
        :title="backLabel"
        @click="goBack"
      >
        <el-icon><ArrowLeft /></el-icon>
      </button>
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

    <!-- 0.1.7 #18：去掉右侧流程状态轨，主区单列——表单画布铺满，设计器里有什么就展示什么 -->
    <div v-if="detail" class="task-main">
      <el-alert
        v-if="lastExpired"
        class="g05b-expired-alert"
        type="warning"
        :closable="false"
        show-icon
      >
        <p>
          {{
            t('workflow.approvalExpired', {
              reason: lastExpired.reason || t('workflow.approvalExpiredDefault'),
            })
          }}
        </p>
        <p>{{ t('workflow.approvalExpiredRetry') }}</p>
      </el-alert>

      <!-- 本次提交的表单数据：与抄送详情共用同一套业务表单只读展示 -->
      <BusinessFormReadonly
        v-if="detail.formKey && detail.businessKey"
        :form-key="detail.formKey"
        :record-id="detail.businessKey"
        :record="formRecord"
        :loading="formRecordLoading"
      />

      <!-- P63 IoT 预约（实例维度）：有数据才渲染；取消入口按 v-perm 显隐，服务端仍是最终权威 -->
      <el-card v-if="reservations.length > 0" class="detail-card detail-card--iot-reservations">
        <template #header>
          <div class="card-head">
            <span>IoT 预约</span>
          </div>
        </template>
        <div v-loading="reservationsLoading" class="iot-reservations">
          <div v-for="row in reservations" :key="row.id" class="iot-reservation">
            <div class="iot-reservation__head">
              <span class="iot-reservation__device">{{
                row.deviceName || row.deviceKey || '-'
              }}</span>
              <el-tag :type="reservationStatusTag(row.status)" size="small">
                {{ reservationStatusLabel(row.status) }}
              </el-tag>
            </div>
            <div class="iot-reservation__row">
              <span class="iot-reservation__label">预约时间</span>
              <span class="iot-reservation__value"
                >{{ row.dueLocalText || row.dueAtUtc }}（{{ row.timezoneId }}）</span
              >
            </div>
            <div class="iot-reservation__row">
              <span class="iot-reservation__label">迟到窗口</span>
              <span class="iot-reservation__value">{{ row.lateWindowSeconds }} 秒</span>
            </div>
            <div class="iot-reservation__row">
              <span class="iot-reservation__label">设备能力</span>
              <span class="iot-reservation__value"
                >{{ row.commandKey || '-' }}（{{ row.commandType || '-' }}）</span
              >
            </div>
            <div v-if="row.commandId != null" class="iot-reservation__row">
              <span class="iot-reservation__label">命令记录</span>
              <span class="iot-reservation__value"
                >命令 #{{ row.commandId }}（执行结果见「IoT 运行记录 · 设备命令」）</span
              >
            </div>
            <div v-if="row.rejectReason" class="iot-reservation__row">
              <span class="iot-reservation__label">失败原因</span>
              <span class="iot-reservation__value">{{ row.rejectReason }}</span>
            </div>
            <div v-if="row.status === 'CANCELED'" class="iot-reservation__row">
              <span class="iot-reservation__label">取消信息</span>
              <span class="iot-reservation__value">
                {{ row.cancelBy || '-'
                }}<template v-if="row.cancelTime"> · {{ row.cancelTime }}</template
                ><template v-if="row.cancelReason"> · {{ row.cancelReason }}</template>
              </span>
            </div>
            <div v-if="row.status === 'PENDING'" class="iot-reservation__actions">
              <el-button
                v-perm="'iot:reservation:cancel'"
                size="small"
                type="danger"
                plain
                @click="openCancelReservation(row)"
              >
                取消预约
              </el-button>
            </div>
          </div>
        </div>
      </el-card>
    </div>

    <!-- 流程信息作为表单详情的外挂组件：与表单详情/任务详情共用同一控制面 -->
    <InstanceFlowPanel
      v-if="detail"
      :approval-history="detail.approvalHistory"
      :process-definition-key="detail.processDefinitionKey"
      :current-node-key="detail.nodeKey"
    />

    <!-- 0.1.7 #18：审批意见在下方，全部操作按钮右下角；发起人常驻催办入口 -->
    <el-card v-if="detail && (canAct || canUrge)" class="detail-card detail-card--actions">
      <template v-if="canAct" #header>
        <span class="detail-actions__title">{{ t('workflow.approvalSection') }}</span>
      </template>
      <div class="detail-actions">
        <!-- P64 节点审批表单：并入审批区，只呈现字段组件，不显示表单名称 -->
        <div v-if="canAct && nodeFormBound" class="approval-form">
          <div class="nodeform-fields">
            <div v-for="field in nodeFormRenderFields" :key="field.name" class="nodeform-field">
              <DynamicField
                :field="field"
                :model-value="nodeFormModel[field.name]"
                :readonly="nodeFieldReadonly(field)"
                @update:model-value="nodeFormModel[field.name] = $event"
              />
            </div>
          </div>
          <div v-if="nodeFormErrors.length > 0" class="nodeform-errors" role="alert">
            <p v-for="item in nodeFormErrors" :key="item">{{ item }}</p>
          </div>
          <div v-if="nodeFormEditable" class="nodeform-actions">
            <el-button
              size="small"
              :loading="nodeFormSavingDraft"
              :disabled="acting !== null"
              @click="handleNodeFormDraft"
            >
              保存草稿
            </el-button>
            <span class="nodeform-meta">{{ t('workflow.taskFormSubmitNote') }}</span>
          </div>
        </div>
        <div v-if="canAct && visibleOpinionFields.length > 0" class="opinion-form">
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
          v-if="canAct && !nodeFormBound && visibleOpinionFields.length === 0"
          v-model="opinionComment"
          class="opinion-input"
          rows="3"
          :placeholder="t('workflow.remarkOptional')"
        />
        <div v-if="canAct" class="opinion-draft-actions">
          <el-button size="small" :loading="opinionDraftSaving" @click="saveOpinionDraft">
            {{ t('workflow.saveOpinionDraft') }}
          </el-button>
          <span v-if="opinionDraftRestored">{{ t('workflow.opinionDraftRestored') }}</span>
          <HintTip :content="t('workflow.opinionDraftNote')" />
        </div>
        <!-- 主操作保持直达；有权限且被节点策略允许的转办/委托/沟通/加签与催办统一收进“更多”。 -->
        <div class="detail-actions__bar">
          <div v-if="canReturn && returnTargets.length > 0" class="return-config">
            <el-button
              type="warning"
              :loading="acting === 'return'"
              :disabled="acting !== null"
              data-testid="return-open-dialog"
              @click="handleReturn"
              >{{ t('common.returnBack') }}</el-button
            >
          </div>
          <div class="detail-actions__btns">
            <el-dropdown
              v-if="hasApprovalMoreActions"
              class="detail-actions__more"
              trigger="click"
              :disabled="acting !== null"
              @command="handleApprovalMore"
            >
              <el-button
                class="detail-actions__more-trigger"
                :disabled="acting !== null"
                data-testid="approval-more-trigger"
              >
                {{ t('common.moreActions') }}
                <el-icon><ArrowDown /></el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu class="detail-actions__more-menu">
                  <el-dropdown-item
                    v-for="action in approvalMoreActions"
                    :key="action.command"
                    :command="action.command"
                    :divided="action.divided"
                    :disabled="acting !== null"
                    :data-testid="`approval-more-${action.command.toLowerCase()}`"
                  >
                    {{ action.label }}
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
            <template v-if="canAct">
              <el-button
                v-if="canReject"
                type="danger"
                plain
                :loading="acting === 'reject'"
                :disabled="acting !== null"
                @click="quickReject"
              >
                {{ t('common.reject') }}
              </el-button>
              <el-button
                v-if="canApprove"
                type="primary"
                :loading="acting === 'approve'"
                :disabled="acting !== null"
                @click="quickApprove"
              >
                {{ t('workflow.approveTask') }}
              </el-button>
            </template>
          </div>
        </div>
      </div>
    </el-card>

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
          <el-form-item :label="t('workflow.targetUser')">
            <!-- V012-BUG-019：目标用户改选择器（存 id 显示姓名） -->
            <UserRemoteSelect
              :model-value="lifecycleDialog.targetUserId || undefined"
              :placeholder="t('workflow.pickTargetUser')"
              style="width: 100%"
              @update:model-value="
                (v: string | string[] | null) => {
                  if (!lifecycleDialog) return
                  lifecycleDialog.targetUserId = v == null || Array.isArray(v) ? '' : String(v)
                }
              "
            />
          </el-form-item>
        </template>
        <template v-if="lifecycleDialog?.kind === 'COMMUNICATE'">
          <el-form-item :label="t('workflow.receiversLabel')">
            <!-- V012-BUG-019：接收人改选择器（存 id 显示姓名） -->
            <UserRemoteSelect
              :model-value="csvToIds(lifecycleDialog.receivers)"
              multiple
              :placeholder="t('workflow.pickReceivers')"
              style="width: 100%"
              @update:model-value="
                (v: string | string[] | null) => {
                  if (!lifecycleDialog) return
                  lifecycleDialog.receivers = Array.isArray(v) ? idsToCsv(v) : ''
                }
              "
            />
          </el-form-item>
          <el-form-item :label="t('workflow.consultContent')">
            <el-input v-model="lifecycleDialog.message" type="textarea" :rows="3" />
          </el-form-item>
        </template>
        <template v-if="lifecycleDialog?.kind === 'ADD_SIGN'">
          <el-form-item :label="t('workflow.participantsLabel')">
            <!-- V012-BUG-019：参与人改选择器（存 id 显示姓名） -->
            <UserRemoteSelect
              :model-value="csvToIds(lifecycleDialog.participants)"
              multiple
              :placeholder="t('workflow.pickParticipants')"
              style="width: 100%"
              @update:model-value="
                (v: string | string[] | null) => {
                  if (!lifecycleDialog) return
                  lifecycleDialog.participants = Array.isArray(v) ? idsToCsv(v) : ''
                }
              "
            />
          </el-form-item>
          <el-form-item :label="t('workflow.signOrder')">
            <el-radio-group v-model="lifecycleDialog.mode">
              <el-radio value="PARALLEL">{{ t('workflow.parallel') }}</el-radio>
              <el-radio value="SERIAL">{{ t('workflow.serial') }}</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item :label="t('workflow.signPosition')">
            <el-radio-group v-model="lifecycleDialog.signPosition">
              <el-radio value="BEFORE">{{ t('workflow.signBefore') }}</el-radio>
              <el-radio value="AFTER">{{ t('workflow.signAfter') }}</el-radio>
            </el-radio-group>
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

    <!-- P63 取消预约弹窗：填原因 → 取消 → 按 outcome 提示成功/不可取消并刷新 -->
    <el-dialog
      v-model="cancelDialogVisible"
      title="取消 IoT 预约"
      width="420px"
      :close-on-click-modal="false"
    >
      <el-form label-position="top" size="small">
        <el-form-item label="取消原因" required>
          <el-input v-model="cancelReason" type="textarea" :rows="3" placeholder="请填写取消原因" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="cancelDialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="cancelSubmitting" @click="submitCancelReservation">
          确认取消
        </el-button>
      </template>
    </el-dialog>

    <!-- 驳回申请弹窗（设计 272:1746）：驳回原因可选，确认后直提 REJECT -->
    <el-dialog
      v-model="rejectDialogVisible"
      :title="t('workflow.rejectDialogTitle')"
      width="550px"
      :close-on-click-modal="false"
      data-testid="reject-dialog"
    >
      <el-form label-position="top" size="small" @submit.prevent>
        <el-form-item :label="t('workflow.rejectReasonLabel')">
          <el-input
            v-model="rejectReason"
            :placeholder="t('workflow.rejectReasonPlaceholder')"
            data-testid="reject-reason-input"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button :disabled="rejectSubmitting" @click="rejectDialogVisible = false">
          {{ t('common.cancel') }}
        </el-button>
        <el-button
          type="primary"
          :loading="rejectSubmitting"
          data-testid="reject-confirm"
          @click="confirmReject"
        >
          {{ t('common.confirm') }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 退回申请弹窗（设计 273:2001）：退回目标选择 + 轮次说明 -->
    <el-dialog
      v-model="returnDialogVisible"
      :title="t('workflow.returnDialogTitle')"
      width="550px"
      :close-on-click-modal="false"
      data-testid="return-dialog"
    >
      <el-form label-position="top" size="small" @submit.prevent>
        <el-form-item :label="t('workflow.returnTargetLabel')">
          <el-select
            v-model="returnTargetNodeId"
            :placeholder="t('workflow.selectApprovedNode')"
            style="width: 100%"
            data-testid="return-target-select"
          >
            <el-option
              v-for="target in returnTargets"
              :key="target.nodeKey"
              :label="target.taskName"
              :value="target.nodeKey"
            />
          </el-select>
          <span class="return-dialog__hint">{{ t('workflow.returnRoundHint') }}</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button :disabled="returnSubmitting" @click="returnDialogVisible = false">
          {{ t('common.cancel') }}
        </el-button>
        <el-button
          type="primary"
          :loading="returnSubmitting"
          data-testid="return-confirm"
          @click="confirmReturn"
        >
          {{ t('common.confirm') }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 催办弹窗（设计 273:2025）：说明 + 催办留言（可空） -->
    <el-dialog
      v-model="urgeDialogVisible"
      :title="t('workflow.urgeDialogTitle')"
      width="480px"
      :close-on-click-modal="false"
      data-testid="urge-dialog"
    >
      <p class="urge-dialog__hint">{{ t('workflow.urgeDialogHint') }}</p>
      <el-form label-position="top" size="small" @submit.prevent>
        <el-form-item :label="t('workflow.urgeMessageLabel')">
          <el-input
            v-model="urgeMessage"
            type="textarea"
            :rows="3"
            maxlength="200"
            :placeholder="t('workflow.urgeMessagePlaceholder')"
            data-testid="urge-message-input"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="urgeDialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" data-testid="urge-confirm" @click="confirmUrge">
          {{ t('common.confirm') }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 校验提示弹窗（设计 300:1808）：必填缺失清单（红条目 + 说明行） -->
    <el-dialog
      v-model="validationDialogVisible"
      :title="t('workflow.validationDialogTitle')"
      width="480px"
      data-testid="validation-dialog"
    >
      <p class="validation-dialog__hint">{{ t('workflow.validationDialogHint') }}</p>
      <ul class="validation-dialog__list">
        <li
          v-for="(item, index) in validationItems"
          :key="index"
          class="validation-dialog__item"
          data-testid="validation-item"
        >
          <span class="validation-dialog__icon" aria-hidden="true">!</span>
          <span>{{ item }}</span>
        </li>
      </ul>
      <template #footer>
        <el-button type="primary" @click="validationDialogVisible = false">
          {{ t('common.confirm') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
/* 0.1.7 #18：全屏数据表单画布——不渲染通用侧边栏与页面自有顶栏，只留左上角返回箭头 */
.task-detail {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  overflow-y: auto;
  padding: 12px 24px 24px;
  background: var(--sw-surface-page, #f5f7fa);
}
.detail-header {
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  padding: 4px 0 10px;
  background: var(--sw-surface-page, #f5f7fa);
}
/* 嵌入统一详情弹窗：取消整页定位，由弹窗正文滚动；操作栏仍吸底靠右。 */
.task-detail--embedded {
  position: static;
  inset: auto;
  z-index: auto;
  overflow: visible;
  padding: 0;
  background: transparent;
}
.detail-header__arrow {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--sw-border-base, #dcdfe6);
  border-radius: 50%;
  background: #fff;
  color: var(--sw-text-regular, #606266);
  cursor: pointer;
}
.detail-header__arrow:hover {
  color: var(--el-color-primary);
  border-color: var(--el-color-primary-light-7, #c6e2ff);
  background: var(--el-color-primary-light-9, #ecf5ff);
}
/* 0.1.7 #30 回归：内容按自然高度自上而下排列——表单卡不撑高，
   流程信息面板紧贴表单（12px），不出现中间大块空白。 */
.task-main {
  display: flex;
  flex-direction: column;
  gap: 16px;
  flex: 0 0 auto;
}
.task-detail :deep(.instance-flow-panel),
.task-detail :deep(.detail-card--actions) {
  margin-top: 12px;
}
.detail-card {
  margin-bottom: 0;
}
.detail-card :deep(.el-card__body) {
  padding: 28px 24px 24px;
}
/* 数据表单画布：24 栅格与设计器同构（0.1.7 #18） */
.form-canvas {
  min-height: 120px;
}
.form-canvas__grid {
  display: grid;
  grid-template-columns: repeat(24, minmax(0, 1fr));
  gap: 12px 16px;
}
.form-canvas__field {
  min-width: 0;
}
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 0;
}
/* 数据表单与发起页同款（V012-BUG-013）：字段名在上，值落入带边框灰底只读盒 */
.data-rows {
  margin-top: -10px;
  display: flex;
  flex-direction: column;
}
.data-row {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 14px;
  padding: 0;
  font-size: 13px;
}
.data-row:last-child {
  margin-bottom: 0;
}
.data-row__label {
  color: var(--sw-text-secondary);
}
.data-row__value {
  box-sizing: border-box;
  min-height: 40px;
  padding: 9px 12px;
  border: 1px solid var(--sw-border-light);
  border-radius: 4px;
  background: #f3f4f8;
  color: #17213a;
  line-height: 20px;
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
/* 0.1.7 #18：操作卡吸底，按钮统一右下角 */
.detail-card--actions {
  position: sticky;
  bottom: 0;
  z-index: 5;
  box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.06);
}
.detail-actions__title {
  color: var(--sw-color-primary);
  font-size: 13px;
  font-weight: 600;
}
/* 审批操作栏收敛为紧凑尺寸；按钮宽度跟随文字，整体靠右。 */
.detail-card--actions :deep(.el-button) {
  flex: 0 0 auto;
  width: auto;
  min-width: 0;
  height: 30px;
  padding: 0 12px;
  font-size: 13px;
  justify-content: center;
}
.detail-card--actions :deep(.el-select__wrapper) {
  min-height: 30px;
}
.detail-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.approval-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}
.detail-actions__bar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 12px;
  border-top: 1px dashed var(--sw-border-lighter);
  padding-top: 10px;
}
.detail-actions__btns {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  margin-left: auto;
}
.detail-actions__more {
  flex: 0 0 auto;
}
.detail-actions__more-trigger :deep(.el-icon) {
  margin-left: 4px;
}
.return-config {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-right: auto;
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
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}
.opinion-draft-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 4px 0 12px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.opinion-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 0;
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
/* 窄屏双栏退化为单列（方向 §4.5：不留裁切） */
@media (max-width: 991px) {
  .task-main {
    grid-template-columns: 1fr;
  }
}
/* ─── P63 IoT 预约卡（实例维度）：行式只读布局；双栏窄屏已随上方规则退化单列 ─── */
.iot-reservations {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.iot-reservation {
  padding: 10px 12px;
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-base);
  background: #f7fafc;
}
.iot-reservation__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}
.iot-reservation__device {
  font-size: 14px;
  font-weight: 600;
  color: #19233b;
  word-break: break-all;
}
.iot-reservation__row {
  display: flex;
  gap: 8px;
  font-size: 12px;
  line-height: 20px;
}
.iot-reservation__label {
  flex: 0 0 64px;
  color: var(--sw-text-secondary);
}
.iot-reservation__value {
  flex: 1 1 auto;
  min-width: 0;
  color: var(--sw-text-primary);
  word-break: break-all;
  white-space: pre-wrap;
}
.iot-reservation__actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
}
/* 窄屏（<768px）：标签与值纵向堆叠，避免长文本横向裁切 */
@media (max-width: 767px) {
  .iot-reservation__row {
    flex-direction: column;
    gap: 2px;
  }
  .iot-reservation__label {
    flex-basis: auto;
  }
}

/* ─────────── P64 阶段Ⅰ：节点审批表单（并入审批区） ─────────── */
.nodeform-meta {
  color: var(--el-text-color-secondary, #909399);
  font-size: 12px;
}
.nodeform-fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  column-gap: 28px;
  row-gap: 14px;
}
.nodeform-errors {
  color: var(--el-color-danger, #f56c6c);
  font-size: 12px;
}
.nodeform-errors p {
  margin: 2px 0;
}
.nodeform-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.validation-dialog__hint {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--sw-text-secondary, #909399);
}
.validation-dialog__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.validation-dialog__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  background: #fef0f0;
  color: #ef5d71;
  font-size: 13px;
}
.validation-dialog__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1px solid currentColor;
  font-size: 11px;
  font-weight: 600;
  flex: 0 0 auto;
}
.return-dialog__hint {
  display: block;
  margin-top: 6px;
  font-size: 12px;
  color: var(--sw-text-secondary, #909399);
}
.urge-dialog__hint {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--sw-text-secondary, #909399);
}
</style>
