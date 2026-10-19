/**
 * 流程运行期接缝：form 模块读取流程定义图与探测流程实例创建状态的唯一跨模块出口。
 *
 * modules 间禁止横向 import（ESLint import/no-restricted-paths 强制）；运行时值走动态
 * import（保持懒加载、不建立静态跨模块依赖），类型按具名契约转出。
 */
import type { ProcessGraphPayload } from '@/modules/workflow/api'

/**
 * 按 processKey 读取当前流程定义图（表单下方流程图渲染数据源）。
 */
export async function getProcessDefDefinitionByKey(
  processKey: string,
): Promise<ProcessGraphPayload> {
  const { getProcessDefDefinitionByKey: load } = await import('@/modules/workflow/api')
  return load(processKey)
}

/**
 * 按表单键 + 业务键（表单记录 ID）计数「本人发起」的流程实例：0 = 尚未创建。
 * 表单提交后实例为 AFTER_COMMIT 异步创建，调用方按需重试到超限即可。
 *
 * 走用户态端点（发起人=当前用户），**不经**流程监控权限：
 * `/workflow/instances` 需要 workflow:monitor:view，普通发起人取到 403 会把
 * 「已发起」误判为「仅保存数据」。
 */
export async function countProcessInstancesByBusinessKey(
  formKey: string,
  businessKey: string,
): Promise<number> {
  const { countMyInstancesByBusinessKey } = await import('@/modules/workflow/api')
  return countMyInstancesByBusinessKey(formKey, businessKey)
}
