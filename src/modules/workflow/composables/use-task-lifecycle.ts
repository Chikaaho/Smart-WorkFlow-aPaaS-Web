import { computed, ref } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from '@/locales'
import { ApiError } from '@/foundation/request'
import { hasPerm } from '@/foundation/permission'
import { transferTask, delegateTask, communicateTask, addSignTask } from '../api'
import type { TaskDetail } from '@/contracts/bpm'
import type { ApprovalActionRequest } from '@/contracts/bpm-node'
import type { NodeActionCode } from './use-task-approval-actions'

/** 生命周期动作种类（I3：转办/委托/沟通/加签）。 */
export type LifecycleKind = 'TRANSFER' | 'DELEGATE' | 'COMMUNICATE' | 'ADD_SIGN'

/** 「更多」菜单命令（催办 + 生命周期动作）。 */
export type ApprovalMoreCommand = LifecycleKind | 'URGE'

/** 「更多」菜单项。 */
export interface ApprovalMoreAction {
  command: ApprovalMoreCommand
  label: string
  divided?: boolean
}

// V012-BUG-019：生命周期弹窗用户输入改选择器；仍以 CSV 字符串承载提交契约
export function csvToIds(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((id) => /^\d+$/.test(id) && !/^0+$/.test(id))
}
export function idsToCsv(ids: Array<number | string> | null | undefined): string {
  return (ids ?? []).map(String).join(',')
}

/** useTaskLifecycle 入参。 */
export interface TaskLifecycleOptions {
  /** 目标任务号。 */
  taskId: string
  /** 任务详情（响应式）。 */
  detail: Ref<TaskDetail | null>
  /** 页面动作互斥标记。 */
  acting: Ref<string | null>
  /** 意见备注（转办/委托理由）。 */
  opinionComment: Ref<string>
  /** 动作负载组装（意见/节点表单数据并入加签等动作）。 */
  actionPayload: (
    action: ApprovalActionRequest['action'],
  ) => Partial<ApprovalActionRequest> | undefined
  /** 动作完成后的导航。 */
  navigateAfterAction: () => void | Promise<void>
  /** 是否可办理。 */
  canAct: ComputedRef<boolean>
  /** 节点策略校验。 */
  nodeAllows: (action: NodeActionCode) => boolean
  /** 催办入口是否可见。 */
  canUrge: ComputedRef<boolean>
  /** 打开催办弹窗。 */
  openUrgeDialog: () => void
}

/**
 * I3 生命周期动作与「更多」菜单（TaskDetail 页拆分）：
 * 转办/委托/沟通/加签弹窗与提交、催办/生命周期菜单项的权限 × 节点策略交集。
 */
export function useTaskLifecycle(options: TaskLifecycleOptions) {
  const { t } = useI18n()
  const {
    taskId,
    detail,
    acting,
    opinionComment,
    actionPayload,
    navigateAfterAction,
    canAct,
    nodeAllows,
    canUrge,
    openUrgeDialog,
  } = options

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

  const lifecycleDialogVisible = computed({
    get: () => lifecycleDialog.value !== null,
    set: (value: boolean) => {
      if (!value) lifecycleDialog.value = null
    },
  })

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

  /** 弹窗标题：转办沿用「转办我的任务」文案，其余取动作名。 */
  const lifecycleDialogTitle = computed(() =>
    lifecycleDialog.value
      ? lifecycleDialog.value.kind === 'TRANSFER'
        ? t('workflow.transferOwnTask')
        : LIFECYCLE_META[lifecycleDialog.value.kind].title
      : '',
  )

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

  /* 设计 299:1725 顺序：催办置顶，其后为转办/委托/沟通/加签（补签随权限与节点策略合法出现）；
     分隔语义保留：催办组与生命周期组仍以 divided 标记（落在首个生命周期项上），
     原图两项间无可见分隔线，样式层由浮层样式统一行距。 */
  const approvalMoreActions = computed<ApprovalMoreAction[]>(() => {
    const actions: ApprovalMoreAction[] = []
    if (canUrge.value) {
      actions.push({ command: 'URGE', label: t('taskDetailUi.urgeAction'), divided: false })
    }
    const lifecycleActions: ApprovalMoreAction[] = []
    if (lifecycleVisible('TRANSFER')) {
      lifecycleActions.push({ command: 'TRANSFER', label: t('workflow.transferOwnTask') })
    }
    if (lifecycleVisible('DELEGATE')) {
      lifecycleActions.push({ command: 'DELEGATE', label: t('workflow.delegateAction') })
    }
    if (lifecycleVisible('COMMUNICATE')) {
      lifecycleActions.push({ command: 'COMMUNICATE', label: t('workflow.consultTask') })
    }
    if (lifecycleVisible('ADD_SIGN')) {
      lifecycleActions.push({ command: 'ADD_SIGN', label: t('workflow.addSign') })
    }
    if (actions.length > 0 && lifecycleActions.length > 0) {
      lifecycleActions[0].divided = true
    }
    actions.push(...lifecycleActions)
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

  // 子组件回写：弹窗字段保持页面单一数据源（lifecycleDialog 由页面与测试直接读写）
  function setLifecycleTargetUserId(value: string): void {
    if (lifecycleDialog.value) lifecycleDialog.value.targetUserId = value
  }
  function setLifecycleReceivers(value: string): void {
    if (lifecycleDialog.value) lifecycleDialog.value.receivers = value
  }
  function setLifecycleParticipants(value: string): void {
    if (lifecycleDialog.value) lifecycleDialog.value.participants = value
  }
  function setLifecycleMessage(value: string): void {
    if (lifecycleDialog.value) lifecycleDialog.value.message = value
  }
  function setLifecycleMode(value: 'SERIAL' | 'PARALLEL'): void {
    if (lifecycleDialog.value) lifecycleDialog.value.mode = value
  }
  function setLifecycleSignPosition(value: 'BEFORE' | 'AFTER'): void {
    if (lifecycleDialog.value) lifecycleDialog.value.signPosition = value
  }

  return {
    lifecycleDialog,
    lifecycleDialogVisible,
    lifecycleDialogTitle,
    lifecycleSubmitting,
    LIFECYCLE_META,
    openLifecycle,
    submitLifecycle,
    approvalMoreActions,
    hasApprovalMoreActions,
    handleApprovalMore,
    setLifecycleTargetUserId,
    setLifecycleReceivers,
    setLifecycleParticipants,
    setLifecycleMessage,
    setLifecycleMode,
    setLifecycleSignPosition,
  }
}
