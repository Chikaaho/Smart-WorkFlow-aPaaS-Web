/**
 * 前端自有表单契约,与后端 definition JSON 及 form-create 原生 schema 解耦。
 * 后端 definition 经 adapters/form-designer/parseDefinition 映射进来;
 * form-create 原生 schema 经 adapters/form-designer/toFormCreateRule 转出。
 * 业务层只认本文件导出的类型,不认后端原生 JSON。
 */

export type FieldType =
  /* ── 启用类型 ── */
  | 'TEXT'
  | 'RICH_TEXT'
  | 'NUMBER'
  | 'DATE'
  | 'BOOL'
  | 'DICT'
  | 'REFERENCE'
  | 'TABLE'
  /* ── 占位成员（对齐后端 FieldType 全集;前端不渲染,仅类型承载,遇则 warn+skip） ── */
  | 'MULTISELECT'
  | 'ATTACHMENT'
  | 'IMAGE'
  | 'LABEL'
  | 'EMAIL'
  | 'PHONE'
  | 'URL'
  | 'RATE'
  | 'SLIDER'

/** TABLE 子字段:与 FieldDef 同规格（不含 subFields,不递归）。 */
export interface TableSubField {
  name: string
  type: FieldType
  label?: string
  required?: boolean
  length?: number
  dictType?: string
  renderAs?: 'select' | 'radio'
  targetFormId?: string
}

interface BaseField {
  name: string
  label?: string
  required?: boolean
  length?: number
  /** 24 列网格中的横向占用列数，合法值为 1—24。 */
  colSpan?: number
}

export interface TextField extends BaseField {
  type: 'TEXT'
}

export interface RichTextField extends BaseField {
  type: 'RICH_TEXT'
}

export interface NumberField extends BaseField {
  type: 'NUMBER'
}

export interface DateField extends BaseField {
  type: 'DATE'
}

export interface BoolField extends BaseField {
  type: 'BOOL'
}

export interface DictField extends BaseField {
  type: 'DICT'
  dictType: string
  renderAs?: 'select' | 'radio'
}

export interface ReferenceField extends BaseField {
  type: 'REFERENCE'
  targetFormId?: string
}

export interface TableField extends BaseField {
  type: 'TABLE'
  subFields: TableSubField[]
}

/** 判别式联合——type 字面量为判别子,TypeScript 可在 if/switch 中自动收窄。 */
export type FormSchemaField =
  | TextField
  | RichTextField
  | NumberField
  | DateField
  | BoolField
  | DictField
  | ReferenceField
  | TableField

export interface FormSchema {
  title: string
  fields: FormSchemaField[]
  /** 定义 schema 版本号,后端下发,前端承载但不消费。 */
  schemaVersion?: number
  /** 校验规则预留,后端下发,前端承载但不消费。 */
  rules?: Record<string, unknown>
}

/** REFERENCE 选择器回填值：id 存库、value 展示。 */
export interface IdValueProperty {
  /** 目标记录的主键 id（提交时进入 ref_{name}_id 列）。 */
  id: string
  /** 目标记录的显示字段值（供 UI 展示）。 */
  value: string
}
