/**
 * DynamicField 控件注册表（扩展插槽 · 单一数据源）。
 *
 * DynamicField.vue 主渲染链与 TABLE 子表单元格渲染链共用这一份注册表，
 * **任何消费方禁止写死 8 类的 if/switch**。新增一类控件 = 往 `DYNAMIC_FIELD_REGISTRY`
 * 加一条描述符（或调用 `registerDynamicFieldDescriptor`），消费方零改。
 *
 * 每条描述符声明两样：
 *  1. `component`：主渲染组件（普通字段）。props 收 DynamicFieldControlProps
 *     （field/modelValue/readonly/subField/referenceLabel），emit `update:modelValue`；
 *  2. `subFieldComponent`：TABLE 子表单元格组件（同上契约，subField=true 时渲染
 *     size=small 变体）。null = 子表内无专用控件，降级为占位输入框
 *     （REFERENCE 文本占位 / TABLE 不递归 / 未知类型兜底），由 `getSubFieldComponent`
 *     统一决议。
 *
 * 设计对齐先例 `modules/form/designer/field-types.ts` 的 FIELD_TYPE_REGISTRY：
 * 描述符 + 查找函数 + 消费方 `<component :is>` 动态挂载。
 */
import type { Component } from 'vue'
import type { FormSchemaField, TableSubField } from '@/contracts/form-schema'
import TextControl from './dynamic-field-controls/TextControl.vue'
import RichTextControl from './dynamic-field-controls/RichTextControl.vue'
import NumberControl from './dynamic-field-controls/NumberControl.vue'
import DateControl from './dynamic-field-controls/DateControl.vue'
import BoolControl from './dynamic-field-controls/BoolControl.vue'
import DictControl from './dynamic-field-controls/DictControl.vue'
import ReferenceControl from './dynamic-field-controls/ReferenceControl.vue'
import TableControl from './dynamic-field-controls/TableControl.vue'
import PlaceholderControl from './dynamic-field-controls/PlaceholderControl.vue'

/** 控件渲染入参：主渲染传 FormSchemaField，子表单元格传 TableSubField（宽度对齐）。 */
export type DynamicFieldSchema = FormSchemaField | TableSubField

export interface DynamicFieldControlProps {
  /** 字段定义（子表单元格场景传 TableSubField）。 */
  field: DynamicFieldSchema
  /** 外部数据（外部进，更新经 emit 出）。 */
  modelValue: unknown
  /**
   * 只读模式（语义随控件类型，与重构前一致）：
   * TEXT/RICH_TEXT → readonly；NUMBER/DATE/BOOL/DICT → disabled；
   * REFERENCE → 输入框只读 + 禁用「选择」；TABLE → 隐藏行操作按钮。
   */
  readonly?: boolean
  /** 子表单元格模式：仅尺寸差异（size=small），语义不变。 */
  subField?: boolean
  /** REFERENCE 回显标签（仅影响显示，底层 v-model 仍为 id）。 */
  referenceLabel?: string
}

export interface DynamicFieldDescriptor {
  /** 判别子（对齐 @/contracts/form-schema 的 FieldType，注册表不限定枚举以保扩展性）。 */
  type: string
  /** 主渲染组件。 */
  component: Component
  /**
   * 子表单元格组件（subField=true 变体）；null = 子表内降级为占位输入框
   * （REFERENCE 文本占位 / TABLE 不递归 / 未知类型兜底）。
   */
  subFieldComponent: Component | null
}

export const DYNAMIC_FIELD_REGISTRY: DynamicFieldDescriptor[] = [
  { type: 'TEXT', component: TextControl, subFieldComponent: TextControl },
  { type: 'RICH_TEXT', component: RichTextControl, subFieldComponent: RichTextControl },
  { type: 'NUMBER', component: NumberControl, subFieldComponent: NumberControl },
  { type: 'DATE', component: DateControl, subFieldComponent: DateControl },
  { type: 'BOOL', component: BoolControl, subFieldComponent: BoolControl },
  { type: 'DICT', component: DictControl, subFieldComponent: DictControl },
  { type: 'REFERENCE', component: ReferenceControl, subFieldComponent: null },
  { type: 'TABLE', component: TableControl, subFieldComponent: null },
]

/** 按 type 取描述符；取不到返回 undefined（主渲染链不渲染 = 消费方兜底）。 */
export function getDynamicFieldDescriptor(type: string): DynamicFieldDescriptor | undefined {
  return DYNAMIC_FIELD_REGISTRY.find((d) => d.type === type)
}

/** 子表单元格组件：按 type 查表，缺失 / 显式 null → 降级占位输入框。 */
export function getSubFieldComponent(type: string): Component {
  return getDynamicFieldDescriptor(type)?.subFieldComponent ?? PlaceholderControl
}

/**
 * 注册新控件（编译期静态注册位；同 type 覆盖式注册，幂等）。
 * 运行时热插拔（DB/OSGi 驱动）在方向文档中明确为非目标——此函数仅为
 * 静态注册与测试型注册（可插拔性证明）提供入口。
 */
export function registerDynamicFieldDescriptor(descriptor: DynamicFieldDescriptor): void {
  const idx = DYNAMIC_FIELD_REGISTRY.findIndex((d) => d.type === descriptor.type)
  if (idx >= 0) DYNAMIC_FIELD_REGISTRY.splice(idx, 1, descriptor)
  else DYNAMIC_FIELD_REGISTRY.push(descriptor)
}
