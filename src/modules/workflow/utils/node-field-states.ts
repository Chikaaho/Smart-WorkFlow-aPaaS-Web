/**
 * BF20261013-013：流程节点字段三态（必填 / 编辑 / 隐藏）。
 *
 * 存储：节点 config.fieldStates = { [字段名]: { required, editable, hidden } }。
 * 语义：字段未配置时继承表单定义（必填=表单必填、编辑=开、隐藏=关）；
 * 任一维度被勾选调整即三维一并固化为显式值（该节点此后不随表单默认漂移）。
 */
export interface NodeFieldState {
  required: boolean
  editable: boolean
  hidden: boolean
}

export type NodeFieldStates = Record<string, NodeFieldState>

export interface NodeFieldRef {
  name: string
  required?: boolean
}

/** 读取字段在该节点的生效三态（未配置项继承表单定义）。 */
export function effectiveFieldState(
  states: NodeFieldStates | undefined,
  field: NodeFieldRef,
): NodeFieldState {
  const configured = states?.[field.name]
  return {
    required: configured?.required ?? Boolean(field.required),
    editable: configured?.editable ?? true,
    hidden: configured?.hidden ?? false,
  }
}

/** 调整某字段某一维状态：返回新的 states（三维一并固化，不就地修改入参）。 */
export function setFieldState(
  states: NodeFieldStates | undefined,
  field: NodeFieldRef,
  key: keyof NodeFieldState,
  value: boolean,
): NodeFieldStates {
  const current = effectiveFieldState(states, field)
  return { ...(states ?? {}), [field.name]: { ...current, [key]: value } }
}
