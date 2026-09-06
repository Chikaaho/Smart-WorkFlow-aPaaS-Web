import type { FormSchema, VisibilityRule, VisibilityCondition } from '@/contracts/form-schema'

/**
 * 显隐联动前端求值（v0.0.2 P2）——与后端 FormVisibilityRules 同语义的渲染侧镜像：
 * 隐藏字段实时不渲染；提交载荷剔除隐藏字段（服务端在正式提交时复算并过滤为准）。
 * 限制为同表单字段值的 EQ/NE/EMPTY/NOT_EMPTY + ALL/ANY 组合，无循环依赖（后端发布门校验）。
 */
export function parseVisibilityRules(schema: FormSchema): VisibilityRule[] {
  return schema.rules?.visibility ?? []
}

function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  return false
}

function matchCondition(condition: VisibilityCondition, data: Record<string, unknown>): boolean {
  const raw = data[condition.field]
  const empty = isEmptyValue(raw)
  // 多选字段（数组值）的 EQ/NE 采用包含语义：选中项包含/不包含给定值（与服务端一致）
  if (Array.isArray(raw)) {
    const contains = condition.value !== undefined && raw.some((v) => String(v) === condition.value)
    if (condition.op === 'EQ') return contains
    if (condition.op === 'NE') return !contains
  }
  switch (condition.op) {
    case 'EMPTY':
      return empty
    case 'NOT_EMPTY':
      return !empty
    case 'EQ':
      return !empty && condition.value !== undefined && String(raw) === condition.value
    case 'NE':
      return empty || condition.value === undefined || String(raw) !== condition.value
    default:
      return false
  }
}

/** 计算当前载荷下应隐藏的字段名集合。 */
export function hiddenFieldNames(
  rules: VisibilityRule[],
  data: Record<string, unknown>,
): Set<string> {
  const hidden = new Set<string>()
  for (const rule of rules) {
    const isAll = rule.logic === 'ALL'
    let result = isAll
    for (const condition of rule.conditions) {
      const matched = matchCondition(condition, data)
      if (isAll) {
        result = result && matched
        if (!result) break
      } else {
        result = result || matched
        if (result) break
      }
    }
    if (!result) {
      hidden.add(rule.target)
    }
  }
  return hidden
}
