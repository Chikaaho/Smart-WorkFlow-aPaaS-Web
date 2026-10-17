/**
 * 实例详情关系接缝：form 渲染页（0.1.7 #30 统一详情）查询当前用户与流程实例
 * 关系、内联审批动作与命令轮询的唯一跨模块出口。
 *
 * modules 间禁止横向 import（ESLint import/no-restricted-paths 强制）；运行时值
 * 走动态 import（保持懒加载、不建立静态跨模块依赖），类型按具名契约转出。
 */
import type { CommandAcceptResp, WorkflowCommandStatus } from '@/contracts/bpm'
import type {
  CommandPollOptions,
  InstanceRelation,
  TaskActionSegment,
} from '@/modules/workflow/api'

export type { InstanceRelation }

/** 查询当前用户与 formKey+businessKey 实例的关系（APPROVER/PARTICIPANT/NONE）。 */
export async function getInstanceRelation(
  formKey: string,
  businessKey: string,
): Promise<InstanceRelation> {
  const { getInstanceRelation: load } = await import('@/modules/workflow/api')
  return load(formKey, businessKey)
}

/** 审批动作受理（complete/reject），返回命令受理回执。 */
export async function acceptTaskAction(
  taskId: string,
  action: TaskActionSegment,
  data?: Record<string, unknown>,
): Promise<CommandAcceptResp> {
  const { acceptTaskAction: accept } = await import('@/modules/workflow/api')
  return accept(taskId, action, data as never)
}

/**
 * 创建通过/驳回控制面实例（唯一控制面在 workflow 模块 use-task-approval；
 * 统一详情页经本接缝消费，不得自行复制受理/轮询链路）。
 */
export async function createTaskApproval(handlers: {
  taskId: () => string | null | undefined
  buildPayload?: (action: 'APPROVE' | 'REJECT') => Record<string, unknown> | undefined
  onCompleted?: (action: 'APPROVE' | 'REJECT') => void | Promise<void>
}): Promise<{
  submitting: import('vue').Ref<'' | 'approve' | 'reject'>
  submit: (action: 'APPROVE' | 'REJECT') => Promise<void>
}> {
  const { useTaskApproval } = await import('@/modules/workflow/composables/use-task-approval')
  return useTaskApproval({
    taskId: handlers.taskId,
    buildPayload: handlers.buildPayload as never,
    onCompleted: handlers.onCompleted,
  })
}

/** 轮询审批命令状态到终态；超过次数仍未终态时返回 null（调用方如实提示处理中）。 */
export async function pollCommandStatus(
  commandId: string,
  options?: CommandPollOptions,
): Promise<WorkflowCommandStatus | null> {
  const { pollCommandStatus: poll } = await import('@/modules/workflow/api')
  return poll(commandId, options)
}
