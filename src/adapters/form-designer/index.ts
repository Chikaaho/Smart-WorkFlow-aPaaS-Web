import { i18n } from '@/locales'
import {
  fieldLabelPositionClass,
  isFieldLabelPosition,
  isFieldTextAlign,
  parseFormFieldOptions,
  type FieldScript,
  type FormFieldOption,
  type FormSchema,
  type FormSchemaField,
  type FieldType,
  type TableSubField,
} from '@/contracts/form-schema'
import { normalizeFormFieldColSpan } from '@/contracts/form-layout'

/**
 * BF20261013-021：字段脚本形状校验（code 必须为非空字符串；onLoad 可选布尔）。
 * 非法形状按“无脚本”处理（不阻塞其余字段解析）。
 */
function parseFieldScript(raw: unknown): FieldScript | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined
  }
  const candidate = raw as { code?: unknown; onLoad?: unknown }
  if (typeof candidate.code !== 'string' || candidate.code.trim() === '') {
    return undefined
  }
  return candidate.onLoad === true
    ? { code: candidate.code, onLoad: true }
    : { code: candidate.code }
}

/**
 * form-designer 防腐层。
 * 后端 definition JSON 和 form-create 原生 schema 只允许在本文件内出现;
 * 业务层只认 @/contracts/form-schema 导出的稳定契约。
 */

const KNOWN_FIELD_TYPES = new Set<string>([
  'TEXT',
  'RICH_TEXT',
  'NUMBER',
  'DATE',
  'BOOL',
  'DICT',
  'REFERENCE',
  'TABLE',
  'MULTISELECT',
  'ATTACHMENT',
  'IMAGE',
  'LABEL',
  'TIME',
  'USER',
  'DEPT',
  'FORMULA',
  'DATASOURCE',
])

interface RawSubFieldDef {
  name: string
  type: string
  label?: string
  required?: boolean
  length?: number
  /** 字段描述（0.1.7 #38 定义契约键透传；纯元数据）。 */
  description?: string
  placeholder?: string
  dictType?: string
  renderAs?: string
  targetFormId?: string
  defaultValue?: unknown
  /** MULTISELECT/选择类候选选项：键值对（新）或 string[]（历史定义，parseFormFieldOptions 兼容）。 */
  options?: FormFieldOption[] | string[]
  /** 选择类字段数据来源（BF20261013-009）：dict / custom。 */
  source?: string
  text?: string
  color?: string
  fontSize?: number
  fontWeight?: string
  textAlign?: string
  expression?: string
  /** P63：USER/DEPT 多选、DATE 日期时间格式（definition 契约键透传）。 */
  multiple?: boolean
  format?: string
  /** BF20261013-021：高级编辑脚本（definition 契约键透传；形状在 mapRawField 校验）。 */
  script?: unknown
  dsBinding?: {
    queryKey: string
    version?: number
    valueField: string
    displayField: string
  }
}

interface RawFieldDef extends RawSubFieldDef {
  subFields?: RawSubFieldDef[]
  colSpan?: unknown
  /** 字段标题位置（主字段专属；子表列头不适用）。 */
  labelPosition?: string
}

interface RawDefinition {
  title: string
  description?: string
  fields: RawFieldDef[]
  schemaVersion?: number
  rules?: Record<string, unknown>
}

function mapRawField(raw: RawFieldDef): FormSchemaField | null {
  if (!KNOWN_FIELD_TYPES.has(raw.type)) {
    console.warn(`[form-designer] unknown field type, skipping: "${raw.name}" (type: ${raw.type})`)
    return null
  }

  const base = {
    name: raw.name,
    ...(raw.label !== undefined ? { label: raw.label } : {}),
    ...(isFieldLabelPosition(raw.labelPosition) ? { labelPosition: raw.labelPosition } : {}),
    required: raw.required ?? false,
    ...(raw.length !== undefined ? { length: raw.length } : {}),
    // 0.1.7 #38：字段描述（定义契约键透传；字段清单可直接维护）
    ...(raw.description !== undefined ? { description: raw.description } : {}),
    ...(raw.placeholder !== undefined ? { placeholder: raw.placeholder } : {}),
    colSpan: normalizeFormFieldColSpan(raw.colSpan, raw.type),
    ...(raw.defaultValue !== undefined ? { defaultValue: raw.defaultValue } : {}),
    // BF20261013-021：高级编辑脚本（形状校验后透传；缺省不携带）
    ...(parseFieldScript(raw.script) !== undefined ? { script: parseFieldScript(raw.script) } : {}),
  }

  const type = raw.type as FieldType

  if (type === 'DICT') {
    return {
      ...base,
      type,
      dictType: raw.dictType ?? '',
      ...(raw.renderAs !== undefined ? { renderAs: raw.renderAs as 'select' | 'radio' } : {}),
      // BF20261013-009：数据来源 + 自定义候选选项 + 下拉多选
      ...(raw.source === 'dict' || raw.source === 'custom' ? { source: raw.source } : {}),
      ...(raw.options !== undefined ? { options: parseFormFieldOptions(raw.options) } : {}),
      ...(raw.multiple !== undefined ? { multiple: raw.multiple } : {}),
    }
  }

  if (type === 'REFERENCE') {
    return {
      ...base,
      type,
      ...(raw.targetFormId !== undefined ? { targetFormId: raw.targetFormId } : {}),
    }
  }

  if (type === 'MULTISELECT') {
    return {
      ...base,
      type,
      // 键值对归一（历史 string[] 定义经 parseFormFieldOptions 兼容，key=value=原字符串）
      ...(raw.options !== undefined ? { options: parseFormFieldOptions(raw.options) } : {}),
      // BF20261013-009：数据来源（custom 缺省/dict 绑定字典）
      ...(raw.source === 'dict' || raw.source === 'custom' ? { source: raw.source } : {}),
      ...(raw.dictType !== undefined ? { dictType: raw.dictType } : {}),
    }
  }

  if (type === 'LABEL') {
    return {
      ...base,
      type,
      ...(raw.text !== undefined ? { text: raw.text } : {}),
      ...(raw.color !== undefined ? { color: raw.color } : {}),
      ...(raw.fontSize !== undefined ? { fontSize: raw.fontSize } : {}),
      ...(raw.fontWeight === 'normal' || raw.fontWeight === 'bold'
        ? { fontWeight: raw.fontWeight }
        : {}),
      ...(isFieldTextAlign(raw.textAlign) ? { textAlign: raw.textAlign } : {}),
    }
  }

  if (type === 'FORMULA') {
    return {
      ...base,
      type,
      expression: raw.expression ?? '',
    }
  }

  if (type === 'USER' || type === 'DEPT') {
    // P63 多选：契约键透传（缺省单选语义不变）
    return {
      ...base,
      type,
      ...(raw.multiple !== undefined ? { multiple: raw.multiple } : {}),
    }
  }

  if (type === 'DATE') {
    // P63 日期时间格式：'datetime' 透传（缺省仅日期语义不变）
    return {
      ...base,
      type,
      ...(raw.format !== undefined ? { format: raw.format } : {}),
    }
  }

  if (type === 'DATASOURCE') {
    return {
      ...base,
      type,
      dsBinding: raw.dsBinding ?? { queryKey: '', valueField: '', displayField: '' },
    }
  }

  if (type === 'TABLE') {
    const subFields: TableSubField[] = (raw.subFields ?? [])
      .filter((sf) => KNOWN_FIELD_TYPES.has(sf.type))
      .map((sf) => ({
        name: sf.name,
        type: sf.type as FieldType,
        ...(sf.label !== undefined ? { label: sf.label } : {}),
        ...(sf.required !== undefined ? { required: sf.required } : {}),
        ...(sf.length !== undefined ? { length: sf.length } : {}),
        // 0.1.7 #38：子表字段描述（字段清单可直接维护）
        ...(sf.description !== undefined ? { description: sf.description } : {}),
        ...(sf.dictType !== undefined ? { dictType: sf.dictType } : {}),
        ...(sf.renderAs !== undefined ? { renderAs: sf.renderAs as 'select' | 'radio' } : {}),
        ...(sf.targetFormId !== undefined ? { targetFormId: sf.targetFormId } : {}),
        ...(sf.multiple !== undefined ? { multiple: sf.multiple } : {}),
        // BF20261013-009：选择类子字段同样支持数据来源与自定义候选选项
        ...(sf.source === 'dict' || sf.source === 'custom' ? { source: sf.source } : {}),
        ...(sf.options !== undefined ? { options: parseFormFieldOptions(sf.options) } : {}),
      }))
    return { ...base, type, subFields }
  }

  // 运行时 KNOWN_FIELD_TYPES gate 保证此处 type ∈ {TEXT,RICH_TEXT,NUMBER,DATE,BOOL}
  return { ...base, type } as FormSchemaField
}

/** 将后端裸 definition JSON 字符串解析并映射为前端稳定的 FormSchema。 */
export function parseDefinition(rawJson: string): FormSchema {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawJson)
  } catch {
    throw new Error('[form-designer] failed to parse definition JSON: invalid format')
  }

  const raw = parsed as RawDefinition
  if (!Array.isArray(raw?.fields)) {
    throw new Error('[form-designer] failed to parse definition JSON: unexpected shape')
  }

  const fields = raw.fields.flatMap<FormSchemaField>((f) => {
    const mapped = mapRawField(f)
    return mapped !== null ? [mapped] : []
  })

  return {
    title: typeof raw.title === 'string' ? raw.title : '',
    ...(typeof raw.description === 'string' ? { description: raw.description } : {}),
    fields,
    ...(raw.schemaVersion !== undefined ? { schemaVersion: raw.schemaVersion } : {}),
    ...(raw.rules !== undefined ? { rules: raw.rules } : {}),
    ...((raw as unknown as { fieldPermissions?: Record<string, unknown> }).fieldPermissions !==
    undefined
      ? {
          fieldPermissions: (raw as unknown as { fieldPermissions: Record<string, unknown> })
            .fieldPermissions as FormSchema['fieldPermissions'],
        }
      : {}),
  }
}

/**
 * seam: FormSchema → form-create 原生 rule 列表。
 * 接口形状已钉死,实现待接入 @form-create/element-ui 渲染引擎。
 * 后续渲染页对着本接口写,不得绕过直引 @form-create。
 *
 * 每条 field 生成一条 form-create rule（plain object），类型映射：
 *   TEXT      → input
 *   RICH_TEXT → input + props.type=textarea（TODO: 接入富文本编辑器）
 *   NUMBER    → inputNumber
 *   DATE      → datePicker（提交 ISO 格式字符串 YYYY-MM-DD）
 *   BOOL      → switch
 *   DICT      → select + options:[] + __dictType__ 元数据
 *   REFERENCE → input + 占位文案（TODO: 接入关联选择器）
 *   TABLE     → group + children（子表）
 */
export function toFormCreateRule(schema: FormSchema): unknown[] {
  const rules: unknown[] = []

  for (const field of schema.fields) {
    const rule = mapFieldToCreateRule(field)
    if (rule !== null) {
      rules.push(rule)
    }
  }

  return rules
}

/* ================================================================
 * 字段映射（模块私有）
 * ================================================================ */

/**
 * 将单个 FormSchemaField 映射为 form-create 规则对象。
 * 返回 null 表示跳过（未知 type），调用方负责过滤。
 */
function mapFieldToCreateRule(field: FormSchemaField): Record<string, unknown> | null {
  // 运行时防御：兼容非契约数据（如测试中 as any 传入的非法 type）
  if (!KNOWN_FIELD_TYPES.has(field.type)) {
    console.warn(
      `[form-designer] unknown field type, skipping toFormCreateRule: "${field.name}" (type: ${field.type})`,
    )
    return null
  }

  const label = field.label ?? field.name

  const rule: Record<string, unknown> = {
    type: '',
    title: label,
    field: field.name,
    value: '',
    wrap: { class: fieldLabelPositionClass(field.labelPosition) },
  }

  if (field.required) {
    // required → validate 数组（form-create/Element Plus 必填校验直通通道）
    rule.validate = [{ required: true, message: i18n.global.t('form.required'), trigger: 'blur' }]
  }

  switch (field.type) {
    case 'TEXT': {
      rule.type = 'input'
      if (field.placeholder) rule.props = { placeholder: field.placeholder }
      break
    }

    case 'RICH_TEXT': {
      // TODO(rich-text): 接入富文本编辑器，当前降级为多行 textarea
      rule.type = 'input'
      rule.props = {
        type: 'textarea',
        rows: 2,
        ...(field.placeholder ? { placeholder: field.placeholder } : {}),
      }
      break
    }

    case 'NUMBER': {
      rule.type = 'inputNumber'
      if (field.placeholder) rule.props = { placeholder: field.placeholder }
      break
    }

    case 'DATE': {
      rule.type = 'datePicker'
      rule.props = {
        valueFormat: 'YYYY-MM-DD',
        ...(field.placeholder ? { placeholder: field.placeholder } : {}),
      }
      // 提交值为 ISO 格式字符串（YYYY-MM-DD）以对齐后端
      break
    }

    case 'BOOL': {
      rule.type = 'switch'
      rule.value = false
      break
    }

    case 'DICT': {
      // BF20261013-009：数据来源 dict=绑字典（__dictType__ 元数据运行时装载）、
      // custom=候选键值对直接映射（展示 value、提交 key）；下拉支持单选/多选，另可渲染单选按钮组。
      const dictField = field as import('@/contracts/form-schema').DictField
      const customSource = dictField.source === 'custom'
      const customOptions = parseFormFieldOptions(dictField.options).filter((o) => o.key !== '')
      const dictBound = !customSource && !!dictField.dictType?.trim()
      const configured = customSource ? customOptions.length > 0 : dictBound
      if (dictField.renderAs === 'radio') {
        // BF20261013-010：未配置数据源的单选框以禁用输入占位提示（radio 组无 placeholder 能力）
        if (!configured) {
          rule.type = 'input'
          rule.value = ''
          rule.props = { disabled: true, placeholder: i18n.global.t('form.configureDataPrompt') }
          break
        }
        rule.type = 'radio'
        rule.value = ''
        rule.options = customSource
          ? customOptions.map((opt) => ({ value: opt.key, label: opt.value || opt.key }))
          : []
        if (!customSource) (rule as Record<string, unknown>).__dictType__ = dictField.dictType
        break
      }
      rule.type = 'select'
      rule.value = dictField.multiple ? [] : ''
      rule.options = customSource
        ? customOptions.map((opt) => ({ value: opt.key, label: opt.value || opt.key }))
        : []
      rule.props = {
        clearable: true,
        ...(dictField.multiple ? { multiple: true } : {}),
        // 未配置数据源时给出明确提示（EP 子 app 无中文本地化，缺省 "Select" 对用户无意义）
        ...(dictField.placeholder
          ? { placeholder: dictField.placeholder }
          : {
              placeholder: configured
                ? i18n.global.t('common.pleaseSelect')
                : i18n.global.t('form.configureDataPrompt'),
            }),
      }
      if (!customSource) (rule as Record<string, unknown>).__dictType__ = dictField.dictType
      break
    }

    case 'REFERENCE': {
      // 统一按钮占位：禁用态输入框，视觉上与普通 TEXT 区分。不查目标数据、不发请求。
      rule.type = 'input'
      rule.props = {
        disabled: true,
        get placeholder() {
          return i18n.global.t('form-designer.referenceFieldSelector')
        },
      }
      break
    }

    case 'MULTISELECT': {
      // 多选：checkbox-group；BF20261013-009 数据来源 dict=绑字典（元数据运行时装载）、
      // custom=候选键值对（展示 value、提交 key）；BF20261013-010 未配置数据源以禁用输入占位提示
      const multiField = field as import('@/contracts/form-schema').MultiSelectField
      const sourceDict = multiField.source === 'dict'
      const customOptions = parseFormFieldOptions(multiField.options).filter(
        (opt) => opt.key !== '',
      )
      const configured = sourceDict ? !!multiField.dictType?.trim() : customOptions.length > 0
      if (!configured) {
        rule.type = 'input'
        rule.value = ''
        rule.props = { disabled: true, placeholder: i18n.global.t('form.configureDataPrompt') }
        break
      }
      rule.type = 'checkbox'
      rule.value = []
      if (sourceDict) {
        rule.options = []
        ;(rule as Record<string, unknown>).__dictType__ = multiField.dictType ?? ''
      } else {
        rule.options = customOptions.map((opt) => ({ value: opt.key, label: opt.value || opt.key }))
      }
      break
    }

    case 'ATTACHMENT':
    case 'IMAGE': {
      // 附件/图片：自定义控件经 form-create 注册（setup.ts），值为 [{storageKey,name}]
      // AttachmentControl 契约要求 field（读 type 区分 image 模式），必须随 props 下发
      rule.type = 'AttachmentPicker'
      rule.value = []
      rule.props = {
        mode: field.type === 'IMAGE' ? 'image' : 'attachment',
        field,
        ...(field.placeholder ? { placeholder: field.placeholder } : {}),
      }
      break
    }

    case 'LABEL': {
      // 文字：纯展示（非输入），不产生业务载荷；不额外渲染字段标题。
      const labelField = field as import('@/contracts/form-schema').LabelField
      rule.type = 'TextDisplay'
      rule.title = { show: false }
      rule.value = ''
      rule.props = { field: labelField }
      break
    }

    case 'TIME': {
      rule.type = 'timePicker'
      rule.props = { valueFormat: 'HH:mm:ss' }
      break
    }

    case 'USER':
    case 'DEPT': {
      // 人员/部门选择：渲染层按 __selector__ 元数据挂真实选择器；
      // 提交值为数字型对象 ID，存在性/租户由服务端 Facade 校验
      rule.type = 'input'
      rule.props = {
        disabled: true,
        placeholder:
          field.type === 'USER'
            ? i18n.global.t('common.userPicker')
            : i18n.global.t('common.deptPicker'),
      }
      ;(rule as Record<string, unknown>).__selector__ = field.type === 'USER' ? 'user' : 'dept'
      break
    }

    case 'FORMULA': {
      // 公式：客户端值不消费；预览值为服务端计算结果（只读展示）
      rule.type = 'input'
      rule.props = { disabled: true, placeholder: i18n.global.t('component.serverCalculated') }
      ;(rule as Record<string, unknown>).__formula__ = true
      break
    }

    case 'DATASOURCE': {
      // 受控外部数据源：渲染层按 __dsBinding__ 元数据经服务端查询入口加载选项
      const dsField = field as import('@/contracts/form-schema').DatasourceField
      rule.type = 'select'
      rule.options = []
      rule.props = { clearable: true }
      ;(rule as Record<string, unknown>).__dsBinding__ = dsField.dsBinding
      break
    }

    case 'TABLE': {
      rule.type = 'group'
      rule.value = []
      rule.children = field.subFields.map(mapSubFieldToCreateRule)
      break
    }
  }

  return rule
}

/**
 * TABLE 子字段 → form-create 子规则。
 *
 * TEXT/RICH_TEXT/NUMBER/DATE/BOOL/DICT 按类型映射；
 * DICT 子字段透传 __dictType__ + renderAs 元数据（P3-1b）。
 * REFERENCE / TABLE 回退为普通文本输入（TABLE 不递归）。
 */
function mapSubFieldToCreateRule(sf: TableSubField): Record<string, unknown> {
  const rule: Record<string, unknown> = {
    type: 'input',
    title: sf.name,
    field: sf.name,
    value: '',
  }

  switch (sf.type) {
    case 'TEXT':
      // 默认 input 即可
      break

    case 'RICH_TEXT':
      rule.props = { type: 'textarea', rows: 3 }
      break

    case 'NUMBER':
      rule.type = 'inputNumber'
      break

    case 'DATE':
      rule.type = 'datePicker'
      rule.props = { valueFormat: 'YYYY-MM-DD' }
      break

    case 'BOOL':
      rule.type = 'switch'
      rule.value = false
      break

    case 'DICT': {
      // BF20261013-009：子字段同样支持自定义候选（展示 value、提交 key）与 dict 绑定
      const customSource = sf.source === 'custom'
      const customOptions = parseFormFieldOptions(sf.options).filter((o) => o.key !== '')
      const configured = customSource ? customOptions.length > 0 : !!sf.dictType?.trim()
      if (sf.renderAs === 'radio' && !configured) {
        // BF20261013-010：未配置数据源的单选框以禁用输入占位提示
        rule.type = 'input'
        rule.value = ''
        rule.props = { disabled: true, placeholder: i18n.global.t('form.configureDataPrompt') }
        break
      }
      if (sf.renderAs === 'radio') {
        rule.type = 'radio'
        rule.value = ''
        rule.options = customSource
          ? customOptions.map((opt) => ({ value: opt.key, label: opt.value || opt.key }))
          : []
        if (!customSource) (rule as Record<string, unknown>).__dictType__ = sf.dictType ?? ''
        break
      }
      rule.type = 'select'
      rule.value = sf.multiple ? [] : ''
      rule.options = customSource
        ? customOptions.map((opt) => ({ value: opt.key, label: opt.value || opt.key }))
        : []
      rule.props = {
        clearable: true,
        ...(sf.multiple ? { multiple: true } : {}),
        ...(configured ? {} : { placeholder: i18n.global.t('form.configureDataPrompt') }),
      }
      if (!customSource) (rule as Record<string, unknown>).__dictType__ = sf.dictType ?? ''
      break
    }

    case 'REFERENCE':
    case 'TABLE':
      // REFERENCE: 子字段无关联上下文，回退文本输入
      // TABLE: 不支持嵌套子表，回退文本输入
      break
  }

  return rule
}

export function mountFormDesigner(_container: HTMLElement, _schema?: FormSchema): void {
  throw new Error('not implemented') // TODO(skeleton): 挂载 @form-create/designer
}
