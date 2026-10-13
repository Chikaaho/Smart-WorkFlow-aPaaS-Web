/**
 * P64 阶段Ⅰ API：节点业务表单 / Trigger 预览与回查 / 动作意图。
 * 与后端 BpmNodeFormController / BpmTriggerController 对齐（ADR-P64-001）。
 */
import { request } from '@/foundation/request'
import type {
  ActionRefView,
  ChildBatchView,
  TaskNodeFormView,
  TriggerExecView,
} from '@/contracts/p64'

/** GET /workflow/tasks/{taskId}/node-form → 绑定 + definition + 当前数据（草稿/已提交） */
export async function getTaskNodeForm(taskId: number | string): Promise<TaskNodeFormView> {
  return request<TaskNodeFormView>({ method: 'GET', url: `/workflow/tasks/${taskId}/node-form` })
}

/** POST /workflow/tasks/{taskId}/node-form/draft → 保存草稿（已最终提交任务拒绝改写） */
export async function saveTaskNodeFormDraft(
  taskId: number | string,
  data: Record<string, unknown>,
): Promise<number> {
  return request<number>({
    method: 'POST',
    url: `/workflow/tasks/${taskId}/node-form/draft`,
    data: { data },
  })
}

/** GET /workflow/instances/{instanceId}/node-form-data → 实例节点表单数据历史 */
export async function listInstanceNodeFormData(
  instanceId: number | string,
): Promise<Array<Record<string, unknown>>> {
  return request<Array<Record<string, unknown>>>({
    method: 'GET',
    url: `/workflow/instances/${instanceId}/node-form-data`,
  })
}

/** POST /workflow/triggers/preview → 受控预览（真实实例上下文只读评估，无副作用） */
export async function previewTrigger(
  instanceId: number | string,
  triggerId: string,
): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>({
    method: 'POST',
    url: '/workflow/triggers/preview',
    data: { instanceId: String(instanceId), triggerId },
  })
}

/** GET /workflow/instances/{instanceId}/trigger-execs → 触发执行记录 */
export async function listTriggerExecs(instanceId: number | string): Promise<TriggerExecView[]> {
  return request<TriggerExecView[]>({
    method: 'GET',
    url: `/workflow/instances/${instanceId}/trigger-execs`,
  })
}

/** GET /workflow/instances/{instanceId}/action-refs → 动作意图与目标关联 */
export async function listActionRefs(instanceId: number | string): Promise<ActionRefView[]> {
  return request<ActionRefView[]>({
    method: 'GET',
    url: `/workflow/instances/${instanceId}/action-refs`,
  })
}

/** POST /workflow/action-refs/{refId}/retry → 失败意图重试（复用同键命令） */
export async function retryActionRef(refId: number | string): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>({
    method: 'POST',
    url: `/workflow/action-refs/${refId}/retry`,
  })
}

/** GET /workflow/instances/{id}/child-batches → 子流程批次/项/回写与等待结果（P64 阶段Ⅱ） */
export async function listChildBatches(instanceId: number | string): Promise<ChildBatchView[]> {
  return request<ChildBatchView[]>({
    method: 'GET',
    url: `/workflow/instances/${instanceId}/child-batches`,
  })
}

/** POST /workflow/child-items/{itemId}/retry-writeback → 回写冲突受控恢复（按当前权威版本重放） */
export async function retryChildWriteback(
  itemId: number | string,
): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>({
    method: 'POST',
    url: `/workflow/child-items/${itemId}/retry-writeback`,
  })
}
