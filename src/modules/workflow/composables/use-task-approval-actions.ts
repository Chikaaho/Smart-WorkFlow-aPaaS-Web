import { computed, ref } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from '@/locales'
import { ApiError } from '@/foundation/request'
import { acceptTaskAction, pollCommandStatus, latestTaskCommand } from '../api'
import type { TaskActionSegment } from '../api'
import type { ApprovalHistoryItem, TaskDetail } from '@/contracts/bpm'
import type { ApprovalActionRequest } from '@/contracts/bpm-node'
import { useTaskApproval } from './use-task-approval'
import type { OpinionField } from './use-task-opinion-form'

/** 节点策略允许的动作码（服务端 allowedActions）。 */
export type NodeActionCode =
  | 'APPROVE'
  | 'DISAPPROVE'
  | 'REJECT'
  | 'RETURN'
  | 'TRANSFER'
  | 'DELEGATE'
  | 'COMMUNICATE'
  | 'ADD_SIGN'

/** useTaskApprovalActions 入参。 */
export interface TaskApprovalActionsOptions {
  /** 目标任务号。 */
  taskId: string
  /** 任务详情（响应式）。 */
  detail: Ref<TaskDetail | null>
  /** 动作完成后的导航（embedded 场景发 completed 关闭弹窗）。 */
  navigateAfterAction: () => void | Promise<void>
  /** 校验提示弹窗（空清单返回 true 不弹窗）。 */
  openValidationDialog: (items: string[]) => boolean
  /** 意见必填预检（失败时已呈现校验弹窗）。 */
  ensureOpinionData: () => boolean
  /** 意见备注（转办/委托理由随动作提交）。 */
  opinionComment: Ref<string>
  /** 意见数据（随动作提交）。 */
  opinionData: Ref<Record<string, unknown>>
  /** 可见意见字段（驳回原因回填策略依据）。 */
  visibleOpinionFields: ComputedRef<OpinionField[]>
  /** 节点表单是否绑定任务。 */
  nodeFormBound: ComputedRef<boolean>
  /** 节点表单是否已最终提交。 */
  nodeFormSubmitted: ComputedRef<boolean>
  /** 节点表单脚本隐藏字段集合（不进入最终提交载荷）。 */
  nodeFormHiddenAll: ComputedRef<Set<string>>
  /** 节点表单数据模型。 */
  nodeFormModel: Ref<Record<string, unknown>>
  /** 节点表单必填客户端预检。 */
  validateNodeFormRequired: () => boolean
  /** 节点表单必填缺失清单（校验弹窗条目）。 */
  nodeFormMissingItems: () => string[]
}

/**
 * 通过/驳回/退回动作控制面（TaskDetail 页拆分）：动作可见性（权限 × 节点策略）、
 * 意见/节点表单负载组装、确认弹窗与异步命令轮询链路。
 */
export function useTaskApprovalActions(options: TaskApprovalActionsOptions) {
  const { t } = useI18n()
  const {
    taskId,
    detail,
    navigateAfterAction,
    openValidationDialog,
    ensureOpinionData,
    opinionComment,
    opinionData,
    visibleOpinionFields,
    nodeFormBound,
    nodeFormSubmitted,
    nodeFormHiddenAll,
    nodeFormModel,
    validateNodeFormRequired,
    nodeFormMissingItems,
  } = options

  const acting = ref<string | null>(null) // 'approve' | 'reject' | null

  /**
   * 服务端办理权限（canHandle）：仅待办且当前用户可办理时呈现审批动作，
   * 监控/发起人等只读身份不再展示通过/驳回按钮；后端动作接口仍是最终权威。
   */
  const canAct = computed(
    () => detail.value?.taskStatus !== 'FINISHED' && detail.value?.canHandle === true,
  )

  /** Missing metadata keeps legacy behavior; an explicit array is the node policy boundary. */
  function nodeAllows(action: NodeActionCode): boolean {
    const allowed = detail.value?.allowedActions
    return !Array.isArray(allowed) || allowed.includes(action)
  }

  const canApprove = computed(() => canAct.value && nodeAllows('APPROVE'))
  const canReject = computed(() => canAct.value && nodeAllows('REJECT'))
  const canReturn = computed(() => canAct.value && nodeAllows('RETURN'))
  const canDisapprove = computed(() => canAct.value && nodeAllows('DISAPPROVE'))
  /** 负向动作按节点策略路由：REJECT=流程级终态优先；仅允许 DISAPPROVE 时呈现「不通过」（节点结算）。 */
  const negativeAction = computed<'REJECT' | 'DISAPPROVE' | null>(() => {
    if (canReject.value) return 'REJECT'
    if (canDisapprove.value) return 'DISAPPROVE'
    return null
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

  // ── 设计 272:1767 同意申请弹窗：独立 560 宽确认窗（取消/确定 80×32） ──
  // 当前节点没有"办理时选人"条件，弹窗只承接确认语义，不额外造选人控件。
  const agreeDialogVisible = ref(false)
  const agreeSubmitting = ref(false)

  function handleApprove() {
    if (acting.value || !canApprove.value) return
    if (!ensureOpinionData()) return
    // P64 阶段Ⅰ：节点表单必填客户端预检（服务端 2433 为权威口径）
    if (nodeFormBound.value && !nodeFormSubmitted.value && !validateNodeFormRequired()) {
      openValidationDialog(nodeFormMissingItems())
      return
    }
    agreeDialogVisible.value = true
  }

  /** 弹窗内确认后才提交；取消关闭不触发任何审批请求。 */
  async function confirmAgree(): Promise<void> {
    if (agreeSubmitting.value) return
    agreeSubmitting.value = true
    acting.value = 'approve'
    try {
      await taskApproval.submit('APPROVE', { skipConfirm: true })
      agreeDialogVisible.value = false
    } finally {
      agreeSubmitting.value = false
      acting.value = null
    }
  }

  // ── 设计 272:1746 驳回申请弹窗：驳回原因（可选）收进弹窗，确认后直提 ──
  const rejectDialogVisible = ref(false)
  const rejectReason = ref('')
  const rejectSubmitting = ref(false)

  function handleReject() {
    if (acting.value || !negativeAction.value) return
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
      await taskApproval.submit(negativeAction.value ?? 'REJECT', { skipConfirm: true })
      rejectDialogVisible.value = false
    } finally {
      rejectSubmitting.value = false
      acting.value = null
    }
  }

  // ── 设计 273:2001 退回申请弹窗：退回目标选择收进弹窗（说明行 + 取消/确定） ──
  const returnDialogVisible = ref(false)
  const returnSubmitting = ref(false)
  const returnComment = ref('')
  const returnTargetNodeId = ref('')

  function handleReturn() {
    if (acting.value || !canReturn.value) return
    if (!returnTargetNodeId.value) returnTargetNodeId.value = returnTargets.value[0]?.nodeKey ?? ''
    if (!returnTargetNodeId.value) {
      ElMessage.warning(t('workflow.noReturnTargets'))
      return
    }
    returnComment.value = ''
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
      const base = actionPayload('RETURN')
      const comment = returnComment.value.trim()
      const payload = comment
        ? {
            ...(base ?? { action: 'RETURN' as const }),
            comment,
            opinionData: { ...(base?.opinionData ?? {}), comment },
          }
        : base
      await runAction(
        'return',
        { action: 'RETURN', returnTargetNodeId: target, ...payload },
        t('common.statusReturned'),
        t('workflow.returnFailed'),
      )
    } finally {
      returnSubmitting.value = false
      acting.value = null
    }
  }

  /** 快捷同意/驳回：复用既有确认弹窗与 handler（真实审批链路不变）。 */
  async function quickApprove(): Promise<void> {
    await handleApprove()
  }
  async function quickReject(): Promise<void> {
    await handleReject()
  }

  // P63 G05b：本人上次动作的过期终态（任务加载即呈现，可重试恢复）
  const lastExpired = ref<{ reason: string } | null>(null)

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

  return {
    acting,
    canAct,
    nodeAllows,
    canApprove,
    canReject,
    canReturn,
    canDisapprove,
    negativeAction,
    returnTargets,
    actionPayload,
    agreeDialogVisible,
    agreeSubmitting,
    handleApprove,
    confirmAgree,
    rejectDialogVisible,
    rejectReason,
    rejectSubmitting,
    handleReject,
    confirmReject,
    returnDialogVisible,
    returnSubmitting,
    returnComment,
    returnTargetNodeId,
    handleReturn,
    confirmReturn,
    quickApprove,
    quickReject,
    lastExpired,
    loadLastExpired,
  }
}
