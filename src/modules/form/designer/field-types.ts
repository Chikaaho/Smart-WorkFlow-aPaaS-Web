import { i18n } from '@/locales'
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
import OaFieldConfig from './config/OaFieldConfig.vue'
import FormulaConfig from './config/FormulaConfig.vue'
import DatasourceConfig from './config/DatasourceConfig.vue'

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
    get label() {
      return i18n.global.t('form.fieldTypeText')
    },
    icon: 'EditPen',
    createDefault: (name) =>
      ({ ...baseField('TEXT', name, i18n.global.t('form.fieldTypeText')) }) as FormSchemaField,
    configComponent: TextConfig,
  },
  {
    type: 'RICH_TEXT',
    get label() {
      return i18n.global.t('form.fieldTypeRichText')
    },
    icon: 'Document',
    createDefault: (name) =>
      ({
        ...baseField('RICH_TEXT', name, i18n.global.t('form.fieldTypeRichText')),
      }) as FormSchemaField,
    configComponent: RichTextConfig,
  },
  {
    type: 'NUMBER',
    get label() {
      return i18n.global.t('form.fieldTypeNumber')
    },
    icon: 'Histogram',
    createDefault: (name) =>
      ({ ...baseField('NUMBER', name, i18n.global.t('form.fieldTypeNumber')) }) as FormSchemaField,
    configComponent: NumberConfig,
  },
  {
    type: 'DATE',
    get label() {
      return i18n.global.t('form.fieldTypeDate')
    },
    icon: 'Calendar',
    createDefault: (name) =>
      ({ ...baseField('DATE', name, i18n.global.t('form.fieldTypeDate')) }) as FormSchemaField,
    configComponent: DateConfig,
  },
  {
    type: 'BOOL',
    get label() {
      return i18n.global.t('form.fieldTypeSwitch')
    },
    icon: 'Switch',
    createDefault: (name) =>
      ({ ...baseField('BOOL', name, i18n.global.t('form.fieldTypeSwitch')) }) as FormSchemaField,
    configComponent: BoolConfig,
  },
  {
    type: 'DICT',
    get label() {
      return i18n.global.t('form.fieldTypeDict')
    },
    icon: 'List',
    // DICT 必带 dictType（DictField 契约要求），初值空串，配置面板再选具体字典。
    createDefault: (name) =>
      ({
        ...baseField('DICT', name, i18n.global.t('form.fieldTypeDict')),
        dictType: '',
      }) as FormSchemaField,
    configComponent: DictConfig,
  },
  {
    type: 'REFERENCE',
    get label() {
      return i18n.global.t('form.fieldTypeReference')
    },
    icon: 'Connection',
    // REFERENCE 的 targetFormId 可选，配置面板再选目标表单。
    createDefault: (name) =>
      ({
        ...baseField('REFERENCE', name, i18n.global.t('form.fieldTypeReference')),
      }) as FormSchemaField,
    configComponent: ReferenceConfig,
  },
  {
    type: 'TABLE',
    get label() {
      return i18n.global.t('form.fieldTypeTable')
    },
    icon: 'Grid',
    // TABLE 必带 subFields（TableField 契约要求），初值空数组，子字段编辑是后面的刀。
    createDefault: (name) =>
      ({
        ...baseField('TABLE', name, i18n.global.t('form.fieldTypeTable')),
        subFields: [],
      }) as FormSchemaField,
    configComponent: null,
  },
  // ══════ v0.0.2 OA（P2 表单子集） ══════
  {
    type: 'MULTISELECT',
    get label() {
      return i18n.global.t('form.fieldTypeMultiSelect')
    },
    icon: 'Finished',
    createDefault: (name) =>
      ({
        ...baseField('MULTISELECT', name, i18n.global.t('form.fieldTypeMultiSelect')),
        options: [],
      }) as FormSchemaField,
    configComponent: OaFieldConfig,
  },
  {
    type: 'ATTACHMENT',
    get label() {
      return i18n.global.t('form.fieldTypeAttachment')
    },
    icon: 'Paperclip',
    createDefault: (name) =>
      ({
        ...baseField('ATTACHMENT', name, i18n.global.t('form.fieldTypeAttachment')),
      }) as FormSchemaField,
    configComponent: OaFieldConfig,
  },
  {
    type: 'IMAGE',
    get label() {
      return i18n.global.t('form.fieldTypeImage')
    },
    icon: 'Picture',
    createDefault: (name) =>
      ({ ...baseField('IMAGE', name, i18n.global.t('form.fieldTypeImage')) }) as FormSchemaField,
    configComponent: OaFieldConfig,
  },
  {
    type: 'LABEL',
    get label() {
      return i18n.global.t('form.fieldTypeLabel')
    },
    icon: 'InfoFilled',
    // 文字组件：正文 + 颜色/字号/粗细三项样式属性（契约 LabelField）。
    createDefault: (name) =>
      ({
        ...baseField('LABEL', name, i18n.global.t('form.fieldTypeLabel')),
        text: '',
        color: '',
        fontSize: 14,
        fontWeight: 'normal',
        textAlign: 'left',
      }) as FormSchemaField,
    configComponent: OaFieldConfig,
  },
  // ══════ I2 低代码表单收口 ══════
  {
    type: 'TIME',
    get label() {
      return i18n.global.t('common.time')
    },
    icon: 'Clock',
    createDefault: (name) =>
      ({ ...baseField('TIME', name, i18n.global.t('common.time')) }) as FormSchemaField,
    configComponent: OaFieldConfig,
  },
  {
    type: 'USER',
    get label() {
      return i18n.global.t('common.userPicker')
    },
    icon: 'User',
    createDefault: (name) =>
      ({ ...baseField('USER', name, i18n.global.t('common.userPicker')) }) as FormSchemaField,
    configComponent: OaFieldConfig,
  },
  {
    type: 'DEPT',
    get label() {
      return i18n.global.t('common.deptPicker')
    },
    icon: 'OfficeBuilding',
    createDefault: (name) =>
      ({ ...baseField('DEPT', name, i18n.global.t('common.deptPicker')) }) as FormSchemaField,
    configComponent: OaFieldConfig,
  },
  {
    type: 'FORMULA',
    get label() {
      return i18n.global.t('form.fieldTypeFormula')
    },
    icon: 'Coin',
    // FORMULA 必带 expression；正式值由服务端重算，客户端值不消费。
    createDefault: (name) =>
      ({
        ...baseField('FORMULA', name, i18n.global.t('form.fieldTypeFormula')),
        expression: '',
      }) as FormSchemaField,
    configComponent: FormulaConfig,
  },
  {
    type: 'DATASOURCE',
    get label() {
      return i18n.global.t('form.fieldTypeDatasource')
    },
    icon: 'Link',
    // DATASOURCE 必带 dsBinding 稳定标识；SQL/密钥只存服务端契约注册表。
    createDefault: (name) =>
      ({
        ...baseField('DATASOURCE', name, i18n.global.t('form.fieldTypeDatasource')),
        dsBinding: { queryKey: '', valueField: '', displayField: '' },
      }) as FormSchemaField,
    configComponent: DatasourceConfig,
  },
]

/** 按 type 取描述符；取不到返回 undefined（消费方负责兜底）。 */
export function getFieldTypeDescriptor(type: FieldType): FieldTypeDescriptor | undefined {
  return FIELD_TYPE_REGISTRY.find((d) => d.type === type)
}

/**
 * 字段类型 → 存储列类型族（P53 展示语义，描述存储形态而非具体 DDL）。
 * 配置面板与字段属性清单共用同一映射，禁止消费方各写一套。
 */
const FIELD_STORAGE_FAMILY: Record<string, string> = {
  TEXT: 'VARCHAR',
  NUMBER: 'NUMERIC',
  DATE: 'DATETIME',
  TIME: 'DATETIME',
  BOOL: 'BOOLEAN',
  DICT: 'VARCHAR',
  USER: 'BIGINT',
  DEPT: 'BIGINT',
  REFERENCE: 'BIGINT',
  RICH_TEXT: 'TEXT',
  ATTACHMENT: 'JSON',
  IMAGE: 'JSON',
  TABLE: 'JSON',
  FORMULA: 'COMPUTED',
  DATASOURCE: 'VARCHAR',
  LABEL: 'TEXT',
  MULTISELECT: 'JSON',
}

/** 取存储类型族展示名；未知类型回落 VARCHAR。 */
export function getFieldTypeStorage(type: string): string {
  return FIELD_STORAGE_FAMILY[type] ?? 'VARCHAR'
}
