/**
 * 流程填报草稿接缝：form 渲染页的草稿读取/保存/提交与提交命令态轮询的唯一跨模块出口。
 *
 * modules 间禁止横向 import（ESLint import/no-restricted-paths 强制）；运行时值走动态
 * import（保持懒加载、不建立静态跨模块依赖），类型按具名契约转出。
 */
import type {
  BpmDraft,
  CommandAcceptResp,
  DraftCreateReq,
  DraftUpdateReq,
  WorkflowCommandStatus,
} from '@/contracts/bpm'
import type { CommandPollOptions } from '@/modules/workflow/api'

export type { BpmDraft }

/** 读取草稿（payload/title/绑定表单）。 */
export async function getDraft(id: number | string): Promise<BpmDraft> {
  const { getDraft: load } = await import('@/modules/workflow/api')
  return load(id)
}

/** 新建草稿。 */
export async function createDraft(data: DraftCreateReq): Promise<BpmDraft> {
  const { createDraft: create } = await import('@/modules/workflow/api')
  return create(data)
}

/** 更新草稿（保存控件值）。 */
export async function updateDraft(id: number | string, data: DraftUpdateReq): Promise<BpmDraft> {
  const { updateDraft: update } = await import('@/modules/workflow/api')
  return update(id, data)
}

/** 提交草稿（发起流程，返回受理命令）。 */
export async function submitDraft(id: number | string): Promise<CommandAcceptResp> {
  const { submitDraft: submit } = await import('@/modules/workflow/api')
  return submit(id)
}

/** 轮询提交命令状态到终态；超过次数仍未终态时返回 null（调用方如实提示「处理中」）。 */
export async function pollCommandStatus(
  commandId: string,
  options?: CommandPollOptions,
): Promise<WorkflowCommandStatus | null> {
  const { pollCommandStatus: poll } = await import('@/modules/workflow/api')
  return poll(commandId, options)
}
