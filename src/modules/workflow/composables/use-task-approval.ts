import { ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from '@/locales'
import { ApiError } from '@/foundation/request'
import { acceptTaskAction, pollCommandStatus } from '../api'
import type { ApprovalActionRequest } from '@/contracts/bpm-node'

/**
 * 0.1.7 #30：通过/驳回的唯一控制面（确认 → 受理 → 轮询 → 结果消息）。
 *
 * 任务详情页（完整处理）与统一数据详情页（内联轻量审批）共用本组合式函数；
 * 调用方只提供任务号、前置校验、负载组装与完成回调，不得到处复制受理/轮询链路。
 */
export interface TaskApprovalHandlers {
  /** 目标任务号（响应式取值）。 */
  taskId: () => string | null | undefined
  /** 提交前置校验（意见必填/节点表单预检等）；返回 false 中止。 */
  preCheck?: (action: 'APPROVE' | 'REJECT' | 'DISAPPROVE') => boolean
  /** 组装动作负载（意见表单/节点表单数据等）；缺省仅带 action。 */
  buildPayload?: (
    action: 'APPROVE' | 'REJECT' | 'DISAPPROVE',
  ) => Partial<ApprovalActionRequest> | undefined
  /** 命令 COMPLETED 后回调（导航/刷新关系等）。 */
  onCompleted?: (action: 'APPROVE' | 'REJECT' | 'DISAPPROVE') => void | Promise<void>
}

export function useTaskApproval(handlers: TaskApprovalHandlers) {
  const { t } = useI18n()
  const submitting = ref<'' | 'approve' | 'reject'>('')

  async function submit(
    action: 'APPROVE' | 'REJECT' | 'DISAPPROVE',
    opts?: { skipConfirm?: boolean },
  ): Promise<void> {
    const taskId = handlers.taskId()
    if (!taskId || submitting.value) return
    if (handlers.preCheck && !handlers.preCheck(action)) return

    // 设计 272:1746：驳回改走专用弹窗（驳回原因输入），调用方确认后 skipConfirm 直提；
    // 同意仍用通用确认。
    if (!opts?.skipConfirm) {
      const confirmText =
        action === 'APPROVE'
          ? t('workflow.confirmApprove')
          : action === 'DISAPPROVE'
            ? t('workflow.confirmDisapprove')
            : t('workflow.confirmReject')
      try {
        await ElMessageBox.confirm(confirmText, t('workflow.approveConfirmTitle'), {
          type: 'info',
          get confirmButtonText() {
            return t(action === 'APPROVE' ? 'common.approve' : 'common.reject')
          },
          get cancelButtonText() {
            return t('common.cancel')
          },
        })
      } catch {
        return
      }
    }

    submitting.value = action === 'APPROVE' ? 'approve' : 'reject'
    try {
      const payload = handlers.buildPayload ? handlers.buildPayload(action) : { action }
      const accept = await acceptTaskAction(
        taskId,
        action === 'APPROVE' ? 'complete' : action === 'DISAPPROVE' ? 'disapprove' : 'reject',
        payload,
      )
      const final = await pollCommandStatus(accept.commandId)
      if (final?.status === 'COMPLETED') {
        ElMessage.success(
          action === 'APPROVE'
            ? t('common.statusApproved')
            : action === 'DISAPPROVE'
              ? t('workflow.statusDisapproved')
              : t('common.statusRejected'),
        )
        await handlers.onCompleted?.(action)
      } else if (final?.status === 'FAILED') {
        ElMessage.error(final.failureReason || t('common.operationFailed'))
      } else {
        ElMessage.warning(t('workflow.actionProcessing'))
      }
    } catch (err) {
      ElMessage.error(err instanceof ApiError ? err.msg : t('common.operationFailed'))
    } finally {
      submitting.value = ''
    }
  }

  return { submitting, submit }
}
