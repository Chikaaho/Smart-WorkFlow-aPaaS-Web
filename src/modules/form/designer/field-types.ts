import type { Component } from 'vue'
import type { FieldType, FormSchemaField } from '@/contracts/form-schema'
import { defaultFormFieldColSpan } from '@/contracts/form-layout'
import TextConfig from './config/TextConfig.vue'
import RichTextConfig from './config/RichTextConfig.vue'
import NumberConfig from './config/NumberConfig.vue'
import DateConfig from './config/DateConfig.vue'
import BoolConfig from './config/BoolConfig.vue'
import DictConfig from './config/DictConfig.vue'
import ReferenceConfig from './config/ReferenceConfig.vue'

/**
 * 字段类型注册表（设计器扩展插槽 · 单一数据源）。
 *
 * 控件库 / 画布 / 配置区一律读这份注册表派生行为，**任何消费方禁止写死 8 类的
 * if/switch**。新增一类字段 = 往 `FIELD_TYPE_REGISTRY` 加一条描述符，别处零改。
 *
 * 每条描述符声明三样：
 *  1. 控件库怎么显示（label 中文名 + icon 图标白名单键）；
 *  2. 拖进画布时产出的默认字段对象（createDefault，键名严格对齐 FormSchemaField，禁自造键）；
 *  3. 配置面板挂载位（configComponent，按 type 派生，禁消费方写死 switch）。6 类简单字段（TEXT/RICH_TEXT/NUMBER/DATE/BOOL/DICT）
 *     第二刀已填入各自配置面板；REFERENCE/TABLE 仍留空（null）→ FieldConfigPanel 渲染
 *     「待接入」占位，后续刀填入，消费方零改。
 */
export interface FieldTypeDescriptor {
  /** 判别子，对齐 @/contracts/form-schema 的 FieldType。 */
  type: FieldType
  /** 控件库显示名（中文）。 */
  label: string
  /** 图标白名单键（在 FieldPalette 的本地 icon map 内解析，注册表不直引图标组件）。 */
  icon: string
  /**
   * 拖入画布时产出的默认字段对象。
   * 入参 name = 已生成好的合法列名（见 column-name.ts），此处只负责按 type 装配契约形状。
   */
  createDefault: (name: string) => FormSchemaField
  /**
   * 配置面板组件挂载位。本刀一律 null（占位）；第二刀填入对应 type 的配置面板，
   * FieldConfigPanel 据此动态挂载，无需改动消费方。
   */
  configComponent: Component | null
}

/** 字段默认 label：以中文类型名作初值，作者可在配置面板（第二刀）改。 */
function baseField(type: FieldType, name: string, label: string) {
  return { name, type, label, required: false, colSpan: defaultFormFieldColSpan(type) }
}

export const FIELD_TYPE_REGISTRY: readonly FieldTypeDescriptor[] = [
  {
    type: 'TEXT',
    label: '单行文本',
    icon: 'EditPen',
    createDefault: (name) => ({ ...baseField('TEXT', name, '单行文本') }) as FormSchemaField,
    configComponent: TextConfig,
  },
  {
    type: 'RICH_TEXT',
    label: '多行文本',
    icon: 'Document',
    createDefault: (name) => ({ ...baseField('RICH_TEXT', name, '多行文本') }) as FormSchemaField,
    configComponent: RichTextConfig,
  },
  {
    type: 'NUMBER',
    label: '数字',
    icon: 'Histogram',
    createDefault: (name) => ({ ...baseField('NUMBER', name, '数字') }) as FormSchemaField,
    configComponent: NumberConfig,
  },
  {
    type: 'DATE',
    label: '日期',
    icon: 'Calendar',
    createDefault: (name) => ({ ...baseField('DATE', name, '日期') }) as FormSchemaField,
    configComponent: DateConfig,
  },
  {
    type: 'BOOL',
    label: '开关',
    icon: 'Switch',
    createDefault: (name) => ({ ...baseField('BOOL', name, '开关') }) as FormSchemaField,
    configComponent: BoolConfig,
  },
  {
    type: 'DICT',
    label: '字典选择',
    icon: 'List',
    // DICT 必带 dictType（DictField 契约要求），初值空串，配置面板再选具体字典。
    createDefault: (name) =>
      ({ ...baseField('DICT', name, '字典选择'), dictType: '' }) as FormSchemaField,
    configComponent: DictConfig,
  },
  {
    type: 'REFERENCE',
    label: '引用',
    icon: 'Connection',
    // REFERENCE 的 targetFormId 可选，配置面板再选目标表单。
    createDefault: (name) => ({ ...baseField('REFERENCE', name, '引用') }) as FormSchemaField,
    configComponent: ReferenceConfig,
  },
  {
    type: 'TABLE',
    label: '子表格',
    icon: 'Grid',
    // TABLE 必带 subFields（TableField 契约要求），初值空数组，子字段编辑是后面的刀。
    createDefault: (name) =>
      ({ ...baseField('TABLE', name, '子表格'), subFields: [] }) as FormSchemaField,
    configComponent: null,
  },
]

/** 按 type 取描述符；取不到返回 undefined（消费方负责兜底）。 */
export function getFieldTypeDescriptor(type: FieldType): FieldTypeDescriptor | undefined {
  return FIELD_TYPE_REGISTRY.find((d) => d.type === type)
}
