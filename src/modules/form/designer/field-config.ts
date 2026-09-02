import type { FormSchemaField } from '@/contracts/form-schema'

/**
 * 配置面板回写补丁（红线：禁自造键）。
 *
 * 这里用类型把「允许写回的键」收死成 FormSchemaField **已有键的子集**：
 * label / name / required / length / colSpan / dictType / renderAs。
 * 占位提示、默认值、min/max、步长/精度、日期格式等配置项在当前契约里**没有落点键**，
 * 故一律不在本补丁内——编译期即挡住自造键写回（第二刀决策：只填有契约键的项）。
 * 将来契约扩展出对应键后，只需在此追加键，配置面板与宿主消费方零改。
 */
export interface FieldPatch {
  label?: string
  name?: string
  required?: boolean
  length?: number
  /** 24 列布局中的合法横向列数。 */
  colSpan?: number
  dictType?: string
  renderAs?: 'select' | 'radio'
  /** REFERENCE 字段的目标表单 formKey（非 id）。红线：存 formKey，禁存 UUID。 */
  targetFormId?: string
}

/**
 * 就地把补丁合并进选中字段（单一数据源：直接改画布持有的那个 field 对象，不另存第二份）。
 * 只接受 FieldPatch（受契约键约束），因此不可能引入脏键。
 */
export function applyFieldPatch(field: FormSchemaField, patch: FieldPatch): void {
  Object.assign(field, patch)
}
