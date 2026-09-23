import type { FormSchemaField } from '@/contracts/form-schema'

/**
 * 配置面板回写补丁（红线：禁自造键）。
 *
 * 这里用类型把「允许写回的键」收死成 FormSchemaField **已有键的子集**：
 * label / name / required / length / placeholder / colSpan / dictType / renderAs 等。
 * min/max、步长/精度、日期格式等配置项在当前契约里**没有落点键**，
 * 故一律不在本补丁内——编译期即挡住自造键写回（第二刀决策：只填有契约键的项）。
 * 将来契约扩展出对应键后，只需在此追加键，配置面板与宿主消费方零改。
 */
export interface FieldPatch {
  label?: string
  /** 字段标题位置（契约 BaseField.labelPosition）。 */
  labelPosition?: import('@/contracts/form-schema').FieldLabelPosition
  name?: string
  required?: boolean
  length?: number
  /** 占位提示（P53 契约已落 BaseField.placeholder）。 */
  placeholder?: string
  /** 24 列布局中的合法横向列数。 */
  colSpan?: number
  dictType?: string
  renderAs?: 'select' | 'radio'
  /** REFERENCE 字段的目标表单 formKey（非 id）。红线：存 formKey，禁存 UUID。 */
  targetFormId?: string
  /** 静态默认值（v0.0.2 契约已落 BaseField.defaultValue）。 */
  defaultValue?: unknown
  /** MULTISELECT 候选选项（v0.0.2 契约已落 MultiSelectField.options）。 */
  options?: string[]
  /** LABEL 说明正文（v0.0.2 契约已落 LabelField.text）。 */
  text?: string
  /** LABEL 文字颜色（契约 LabelField.color）。 */
  color?: string
  /** LABEL 字号 px（契约 LabelField.fontSize）。 */
  fontSize?: number
  /** LABEL 字重（契约 LabelField.fontWeight）。 */
  fontWeight?: 'normal' | 'bold'
  /** LABEL 正文对齐（契约 LabelField.textAlign）。 */
  textAlign?: import('@/contracts/form-schema').FieldTextAlign
  /** I2 FORMULA 表达式（服务端重算，客户端值不消费）。 */
  expression?: string
  /** I2 DATASOURCE 稳定绑定标识（SQL/密钥只存服务端契约注册表）。 */
  dsBinding?: import('@/contracts/form-schema').DatasourceField['dsBinding']
}

/**
 * 就地把补丁合并进选中字段（单一数据源：直接改画布持有的那个 field 对象，不另存第二份）。
 * 只接受 FieldPatch（受契约键约束），因此不可能引入脏键。
 */
export function applyFieldPatch(field: FormSchemaField, patch: FieldPatch): void {
  Object.assign(field, patch)
}
