import { i18n } from '@/locales'

/**
 * 图执行失败分类线值 → 权威文案键（P70/B4）。
 *
 * 线值与服务端 AgentGraphInterpreter ERROR_CATEGORY_* 及生命周期服务写入的分类同源；
 * 列表列宽放不下原值（如 KNOWLEDGE_RETRIEVAL_FAILED），按中文名称展示、悬浮显示原值。
 * 未登记线值回落为线值本身，与全局枚举口径一致。
 */
const FAILURE_CATEGORY_KEYS: Record<string, string> = {
  STEP_LIMIT: 'agent.failureCategoryStepLimit',
  GRAPH_TIMEOUT: 'agent.failureCategoryGraphTimeout',
  LOOP_LIMIT: 'agent.failureCategoryLoopLimit',
  UNDEFINED_VARIABLE: 'agent.failureCategoryUndefinedVariable',
  INPUT_MISSING: 'agent.failureCategoryInputMissing',
  HUMAN_PAUSE: 'agent.failureCategoryHumanPause',
  HUMAN_TIMEOUT: 'agent.failureCategoryHumanTimeout',
  CONDITION_NO_MATCH: 'agent.failureCategoryConditionNoMatch',
  TOPOLOGY_INVALID: 'agent.failureCategoryTopologyInvalid',
  MODEL_CALL_FAILED: 'agent.failureCategoryModelCallFailed',
  TOOL_CALL_FAILED: 'agent.failureCategoryToolCallFailed',
  KNOWLEDGE_RETRIEVAL_FAILED: 'agent.failureCategoryKnowledgeRetrievalFailed',
  CAPACITY_REJECTED: 'agent.failureCategoryCapacityRejected',
  GRAPH_EXECUTION_FAILED: 'agent.failureCategoryGraphExecutionFailed',
  SERVICE_RESTART: 'agent.failureCategoryServiceRestart',
  UNKNOWN: 'agent.failureCategoryUnknown',
}

/**
 * 取失败分类的展示文案。
 * 返回原值本身时表示该分类未登记中文名，调用方可据此关闭悬浮提示（悬浮展示的原值与文案相同）。
 */
export function failureCategoryLabel(category: string): string {
  const key = FAILURE_CATEGORY_KEYS[category]
  if (!key) return category
  return i18n.global.t(key)
}
