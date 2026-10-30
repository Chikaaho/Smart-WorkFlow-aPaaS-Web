import type { ProcessNotificationConfigPayload } from '../api'

/** 设计器加载后保留的文档级配置；画布 serialize() 不携带这些字段。 */
export interface DesignerGraphDocumentState {
  variables?: unknown[]
  triggers?: unknown[]
  notification?: ProcessNotificationConfigPayload | null
}

/**
 * 合并画布契约与文档级配置。
 *
 * 结束通知由 50:88 独立页维护，设计器保存/发布不得把它覆盖为空；
 * 旧定义没有 notification 时不新造字段，保持原有行为。
 */
export function buildDesignerGraphPayload(
  serialized: Record<string, unknown>,
  graph: DesignerGraphDocumentState | null,
): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...serialized }
  payload.variables = graph?.variables ?? []
  payload.triggers = graph?.triggers ?? []
  if (graph?.notification) payload.notification = graph.notification
  return payload
}
