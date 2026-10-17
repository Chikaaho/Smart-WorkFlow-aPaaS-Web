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
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft } from '@element-plus/icons-vue'
import { useUserStore } from '@/stores/user'
import {
  queryTaskDetail,
  acceptTaskAction,
  latestTaskCommand,
  pollCommandStatus,
  transferTask,
  delegateTask,
  communicateTask,
  addSignTask,
  supplementSignInstance,
  type TaskActionSegment,
} from '@/modules/workflow/api'
import { ApiError } from '@/foundation/request'
import UserRemoteSelect from '@/components/UserRemoteSelect.vue'
import type { ApprovalHistoryItem, TaskDetail } from '@/contracts/bpm'
import type { ApprovalActionRequest, ApprovalOpinionConfig } from '@/contracts/bpm-node'
import type { FormSchema } from '@/contracts/form-schema'
import type { TaskNodeFormView } from '@/contracts/p64'
import { getTaskNodeForm, saveTaskNodeFormDraft } from '@/modules/workflow/api/p64'
import DynamicField from '@/components/DynamicField.vue'
import ProcessGraphView from '@/components/ProcessGraphView.vue'
import { createFieldScripts } from '@/adapters/form-runtime'
import { deriveProcessTrace } from '../utils/process-trace'
import { normalizeFormFieldColSpan } from '@/contracts/form-layout'

const router = useRouter()
const route = useRoute()

const taskId = route.params.taskId as string

// ─── 页面状态 ───
const detail = ref<TaskDetail | null>(null)
const loading = ref(false)
const errorMsg = ref('')
const acting = ref<string | null>(null) // 'approve' | 'reject' | null
// P63 G05b：本人上次动作的过期终态（任务加载即呈现，可重试恢复）
const lastExpired = ref<{ reason: string } | null>(null)
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
/** P63 G01：USER/DEPT 字段可读显示缓存（字段名→姓名/部门名，多选顿号连接，取不到回退原值）。 */
const userDeptDisplays = ref<Record<string, string>>({})

/**
 * 0.1.7 #18：数据表单按设计器栅格直出——字段清单来自表单定义（LABEL 文字也展示），
 * 值取本次提交记录；REFERENCE/USER/DEPT 用既有显示名缓存。设计器里有什么就展示什么。
 */
const formGridItems = computed(() => {
  if (!formSchema.value) return []
  return formSchema.value.fields.map((field) => {
    const recordKey = field.type === 'REFERENCE' ? 'ref_' + field.name + '_id' : field.name
    return {
      field,
      colSpan: normalizeFormFieldColSpan(field.colSpan, field.type),
      value: formRecord.value?.[recordKey],
      referenceLabel: field.type === 'REFERENCE' ? (refDisplayMap.value[field.name] ?? '') : '',
    }
  })
})

async function loadDetail() {
  loading.value = true
  errorMsg.value = ''
  try {
    detail.value = await queryTaskDetail(taskId)
    initializeOpinionData(detail.value)
    void loadFormRecord()
    void loadGraph()
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

/** 按 formKey + businessKey 回查本次提交的表单数据；失败不阻断审批主链 */
async function resolveRefDisplays() {
  refDisplayMap.value = {}
  if (!formSchema.value || !formRecord.value) return
  const { resolveReferenceDisplay } = await import('@/adapters/form-runtime')
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
    const { getFormData, getFormDefinition } = await import('@/adapters/form-runtime')
    formRecord.value = await getFormData(d.formKey, d.businessKey)
    try {
      formSchema.value = await getFormDefinition(d.formKey)
    } catch {
      formSchema.value = null
    }
    // P63 G01：USER/DEPT 字段保存回读显示为可读姓名/部门名（解析失败回退原值不阻断）
    if (formSchema.value && formRecord.value) {
      const { buildUserDeptDisplays } = await import('@/adapters/form-runtime')
      userDeptDisplays.value = await buildUserDeptDisplays(
        formSchema.value,
        formRecord.value,
      ).catch(() => ({}))
    }
    await resolveRefDisplays()
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

/** 节点表单必填校验（客户端 UX 提示；服务端提交仍全量校验，1401/2433 为权威口径）。 */
function validateNodeFormRequired(): boolean {
  nodeFormErrors.value = []
  if (!nodeFormBound.value || nodeFormSubmitted.value) return true
  for (const field of nodeFormFields.value) {
    if (nodeFormHiddenAll.value.has(field.name)) continue
    if (!nodeFieldRequired(field)) continue
    const value = nodeFormModel.value[field.name]
    const empty =
      value == null ||
      (typeof value === 'string' && value.trim() === '') ||
      (Array.isArray(value) && value.length === 0)
    if (empty) nodeFormErrors.value.push(`${field.label || field.name}: 必填`)
  }
  return nodeFormErrors.value.length === 0
}

async function handleNodeFormDraft() {
  if (!nodeFormEditable.value || nodeFormSavingDraft.value) return
  nodeFormSavingDraft.value = true
  try {
    await saveTaskNodeFormDraft(taskId, nodeFormModel.value)
    ElMessage.success('节点表单草稿已保存')
    await loadNodeForm()
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : '节点表单草稿保存失败')
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
      ElMessage.error(nodeFormErrors.value[0] ?? '节点业务表单校验未通过')
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
  if (acting.value) return
  if (!ensureOpinionData()) return
  // P64 阶段Ⅰ：节点表单必填客户端预检（服务端 2433 为权威口径）
  if (nodeFormBound.value && !nodeFormSubmitted.value && !validateNodeFormRequired()) {
    ElMessage.error(nodeFormErrors.value[0] ?? '节点业务表单校验未通过')
    return
  }
  acting.value = 'approve'
  try {
    await taskApproval.submit('APPROVE')
  } finally {
    acting.value = null
  }
}

async function handleReject() {
  if (acting.value) return
  if (!ensureOpinionData()) return
  acting.value = 'reject'
  try {
    await taskApproval.submit('REJECT')
  } finally {
    acting.value = null
  }
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

// V012-BUG-019：生命周期弹窗用户输入改选择器；仍以 CSV 字符串承载提交契约
function csvToIds(value: string | undefined): number[] {
  return (value ?? '')
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((id) => Number.isInteger(id) && id > 0)
}
function idsToCsv(ids: number[] | null | undefined): string {
  return (ids ?? []).join(',')
}

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

/** 图画布高度：默认 740；高视口（长页基线 1512）下 800。 */
const graphCanvasHeight = computed(() =>
  typeof window !== 'undefined' && window.innerHeight >= 1100 ? 784 : 740,
)

/**
 * 服务端办理权限（canHandle）：仅待办且当前用户可办理时呈现审批动作，
 * 监控/发起人等只读身份不再展示通过/驳回按钮；后端动作接口仍是最终权威。
 */
const canAct = computed(
  () => detail.value?.taskStatus !== 'FINISHED' && detail.value?.canHandle === true,
)

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
  <div
    v-loading="loading"
    class="task-detail"
    :class="{ 'task-detail--people-active': activeTab === 'people' }"
  >
    <!-- 0.1.7 #18：页头只留左上角返回箭头，标题/状态/发起人等噪音全部去掉 -->
    <div class="detail-header">
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
          上次提交的审批命令已过期：{{ lastExpired.reason || '准入截止到期且未执行（效果未发生）' }}
        </p>
        <p>可直接重试本次操作（将重新提交审批命令，原过期记录保留可查）。</p>
      </el-alert>

      <!-- 本次提交的表单数据：按设计器栅格渲染（LABEL 文字也展示） -->
      <el-card v-if="detail.formKey && detail.businessKey" class="detail-card detail-card--form">
        <div v-loading="formRecordLoading" class="form-canvas">
          <el-alert
            v-if="!formRecordLoading && !formRecord"
            :title="t('workflow.formRecordUnavailable')"
            type="warning"
            :closable="false"
            show-icon
          />
          <div v-else-if="formGridItems.length > 0" class="form-canvas__grid">
            <div
              v-for="item in formGridItems"
              :key="item.field.name"
              class="form-canvas__field"
              :style="{ gridColumn: `span ${item.colSpan}` }"
            >
              <DynamicField
                :field="item.field"
                :model-value="item.value"
                readonly
                :reference-label="item.referenceLabel"
              />
            </div>
          </div>
          <el-descriptions v-else-if="formRecord" :column="1" border>
            <el-descriptions-item :label="t('common.description')">{{
              t('workflow.noDisplayableFields')
            }}</el-descriptions-item>
          </el-descriptions>
        </div>
      </el-card>

      <!-- P64 阶段Ⅰ：节点业务表单（绑定节点可填报；草稿可存，最终提交随审批动作同事务生效；已提交只读回看） -->
      <el-card v-if="nodeForm && nodeFormBound" class="detail-card detail-card--node-form">
        <template #header>
          <span>
            节点业务表单
            <el-tag v-if="nodeFormSubmitted" size="small" type="success" class="nodeform-tag"
              >已最终提交</el-tag
            >
            <el-tag v-else size="small" type="info" class="nodeform-tag">草稿</el-tag>
          </span>
        </template>
        <div class="nodeform-body">
          <small class="nodeform-meta">
            {{ nodeForm.formName
            }}<template v-if="nodeForm.formVersion"> · v{{ nodeForm.formVersion }}</template>
            <template v-if="nodeForm.roundNo"> · 第 {{ nodeForm.roundNo }} 轮</template>
            <template v-if="nodeFormSubmitted"> · 数据已生效，可读变量与历史回看</template>
          </small>
          <div class="nodeform-fields">
            <div v-for="field in nodeFormRenderFields" :key="field.name" class="nodeform-field">
              <div class="nodeform-field__label">
                <span
                  v-if="nodeFieldRequired(field) && nodeFormEditable"
                  class="nodeform-field__required"
                  >*</span
                >
                {{ field.label || field.name }}
              </div>
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
            <span class="nodeform-meta">最终提交与「同意」动作一并在服务端事务生效</span>
          </div>
        </div>
      </el-card>

      <!-- P63 IoT 预约（实例维度）：有数据才渲染；取消入口按 v-perm 显隐，服务端仍是最终权威 -->
      <el-card v-if="reservations.length > 0" class="detail-card detail-card--iot-reservations">
        <template #header>
          <div class="card-head">
            <span>IoT 预约</span>
            <span class="card-head__hint">设备动作预约下发记录</span>
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

    <!-- 0.1.7 #18：审批意见在下方，全部操作按钮右下角；发起人常驻催办入口 -->
    <el-card v-if="detail && (canAct || isInitiator)" class="detail-card detail-card--actions">
      <div class="detail-actions">
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
          v-if="opinionFields.length === 0 && canAct"
          v-model="opinionComment"
          class="opinion-input"
          rows="3"
          :placeholder="t('workflow.remarkOptional')"
        />
        <!-- 0.1.7 #18：所有操作按钮统一放右下角（退回/转办/委托/沟通/加签/补签/驳回/同意/催办） -->
        <div class="detail-actions__bar">
          <div v-if="canAct && returnTargets.length > 0" class="return-config">
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
          <div class="detail-actions__btns">
            <el-button v-if="isInitiator" :disabled="acting !== null" @click="onUrge">
              {{ t('taskDetailUi.urgeAction') }}
            </el-button>
            <template v-if="canAct">
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
              <el-button
                type="danger"
                plain
                :loading="acting === 'reject'"
                :disabled="acting !== null"
                @click="quickReject"
              >
                {{ t('common.reject') }}
              </el-button>
              <el-button
                type="success"
                :loading="acting === 'approve'"
                :disabled="acting !== null"
                @click="quickApprove"
              >
                {{ t('common.approve') }}
              </el-button>
            </template>
          </div>
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
        <el-button type="primary" class="p53-dialog-close" @click="opinionDetailVisible = false">
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
          <el-form-item :label="t('workflow.targetUser')">
            <!-- V012-BUG-019：目标用户改选择器（存 id 显示姓名） -->
            <UserRemoteSelect
              :model-value="
                lifecycleDialog.targetUserId ? Number(lifecycleDialog.targetUserId) : undefined
              "
              :placeholder="t('workflow.pickTargetUser')"
              style="width: 100%"
              @update:model-value="
                (v: number | number[] | null) => {
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
                (v: number | number[] | null) => {
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
                (v: number | number[] | null) => {
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
        </template>
        <template v-if="lifecycleDialog?.kind === 'SUPPLEMENT_SIGN'">
          <el-form-item :label="t('workflow.supplementConfirmerLabel')">
            <!-- V012-BUG-019：补充确认人改选择器（存 id 显示姓名） -->
            <UserRemoteSelect
              :model-value="csvToIds(lifecycleDialog.participants)"
              multiple
              :placeholder="t('workflow.pickConfirmers')"
              style="width: 100%"
              @update:model-value="
                (v: number | number[] | null) => {
                  if (!lifecycleDialog) return
                  lifecycleDialog.participants = Array.isArray(v) ? idsToCsv(v) : ''
                }
              "
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
.task-main {
  display: flex;
  flex-direction: column;
  gap: 16px;
  flex: 1;
  min-height: 0;
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
.card-head__hint {
  font-size: 12px;
  font-weight: 400;
  color: var(--sw-text-secondary);
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
.detail-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
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
  flex-wrap: wrap;
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
/* ─── 底部记录卡页签几何（48px 页签 / 150px 页签宽）；flex 撑满页面剩余高度 ─── */
.detail-card--tabs {
  box-sizing: border-box;
  flex: 1 1 auto;
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

/* ─────────── P64 阶段Ⅰ：节点业务表单 ─────────── */
.nodeform-tag {
  margin-left: 8px;
}
.nodeform-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
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
.nodeform-field__label {
  font-size: 14px;
  margin-bottom: 6px;
  color: var(--el-text-color-primary, #303133);
}
.nodeform-field__required {
  color: var(--el-color-danger, #f56c6c);
  margin-right: 2px;
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
</style>
