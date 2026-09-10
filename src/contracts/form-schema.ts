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
  /* ── v0.0.2 OA 启用（P2 表单子集） ── */
  | 'MULTISELECT'
  | 'ATTACHMENT'
  | 'IMAGE'
  | 'LABEL'
  /* ── I2 低代码表单收口启用 ── */
  | 'TIME'
  | 'USER'
  | 'DEPT'
  | 'FORMULA'
  | 'DATASOURCE'
  /* ── 占位成员（对齐后端 FieldType 全集;前端不渲染,仅类型承载,遇则 warn+skip） ── */
  | 'EMAIL'
  | 'PHONE'
  | 'URL'
  | 'RATE'
  | 'SLIDER'

/** 附件/图片字段值条目：storageKey 关联存储对象，name 为展示名。 */
export interface AttachmentItem {
  storageKey: string
  name: string
}

/** 显隐联动条件（v0.0.2 P2；服务端在正式提交时复算并过滤隐藏字段）。 */
export interface VisibilityCondition {
  field: string
  op: 'EQ' | 'NE' | 'EMPTY' | 'NOT_EMPTY'
  /** EQ/NE 必填；EMPTY/NOT_EMPTY 忽略。 */
  value?: string
}

/** 显隐规则：target 仅在条件满足时可见（每字段至多一条）。 */
export interface VisibilityRule {
  target: string
  logic: 'ALL' | 'ANY'
  conditions: VisibilityCondition[]
}

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
  defaultValue?: unknown
}

interface BaseField {
  name: string
  label?: string
  required?: boolean
  length?: number
  /** 24 列网格中的横向占用列数，合法值为 1—24。 */
  colSpan?: number
  /**
   * 静态默认值（v0.0.2）：仅新建填报且无已有值时应用；
   * 恢复草稿及编辑已有数据不覆盖原值。
   */
  defaultValue?: unknown
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

/** 多选：候选选项（字符串列表），提交值为选中的字符串数组。 */
export interface MultiSelectField extends BaseField {
  type: 'MULTISELECT'
  options?: string[]
}

/** 附件：值 = AttachmentItem[]（[{storageKey,name}]）。 */
export interface AttachmentField extends BaseField {
  type: 'ATTACHMENT'
}

/** 图片：值 = AttachmentItem[]（[{storageKey,name}]）。 */
export interface ImageField extends BaseField {
  type: 'IMAGE'
}

/** 说明文字：非输入字段，不产生业务载荷。 */
export interface LabelField extends BaseField {
  type: 'LABEL'
  /** 说明正文（默认复用 label）。 */
  text?: string
}

/* ══════ I2 低代码表单收口 ══════ */

/** 时间：值 HH:mm / HH:mm:ss。 */
export interface TimeField extends BaseField {
  type: 'TIME'
}

/** 人员选择：值 = 当前租户内启用用户 ID（服务端经 Facade 校验）。 */
export interface UserField extends BaseField {
  type: 'USER'
}

/** 部门选择：值 = 当前租户内正常状态部门 ID（服务端经 Facade 校验）。 */
export interface DeptField extends BaseField {
  type: 'DEPT'
}

/** 外部数据源绑定（稳定标识；SQL/密钥只存服务端契约注册表）。 */
export interface DatasourceBinding {
  queryKey: string
  version?: number
  valueField: string
  displayField: string
}

/**
 * 受控外部数据源字段：填报值 = 稳定对象标识；
 * 正式提交由服务端按版本化契约解析并冻结 {value,display,queryKey,version}。
 */
export interface DatasourceField extends BaseField {
  type: 'DATASOURCE'
  dsBinding: DatasourceBinding
}

/**
 * 公式字段：expression 只允许已登记字段引用（${name}）、四则、括号与
 * 白名单函数 ABS/ROUND/MIN/MAX/DAYS；正式值由服务端重算，客户端值不消费。
 */
export interface FormulaField extends BaseField {
  type: 'FORMULA'
  expression: string
}

/** 字段权限主体：role:<code> / user:<id> / dept:<id>；列表为空 = 不设限。 */
export interface FieldPermissionRule {
  view?: string[]
  edit?: string[]
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
  | MultiSelectField
  | AttachmentField
  | ImageField
  | LabelField
  | TimeField
  | UserField
  | DeptField
  | FormulaField
  | DatasourceField

export interface FormSchema {
  title: string
  fields: FormSchemaField[]
  /** 定义 schema 版本号,后端下发,前端承载但不消费。 */
  schemaVersion?: number
  /** 显隐联动规则（v0.0.2）：服务端发布门校验 + 正式提交复算过滤。 */
  rules?: { visibility?: VisibilityRule[] }
  /**
   * 字段查看/编辑权限（I2）：服务端权威；查询投影在服务端剔除无 view 权字段，
   * 构造请求携带无 edit 权字段被整请求拒绝。前端仅用于 UX 显隐提示。
   */
  fieldPermissions?: Record<string, FieldPermissionRule>
}

/** REFERENCE 选择器回填值：id 存库、value 展示。 */
export interface IdValueProperty {
  /** 目标记录的主键 id（提交时进入 ref_{name}_id 列）。 */
  id: string
  /** 目标记录的显示字段值（供 UI 展示）。 */
  value: string
}
