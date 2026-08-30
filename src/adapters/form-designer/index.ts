import type { FormSchema, FormSchemaField, FieldType, TableSubField } from '@/contracts/form-schema'

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
])

interface RawSubFieldDef {
  name: string
  type: string
  label?: string
  required?: boolean
  length?: number
  dictType?: string
  renderAs?: string
  targetFormId?: string
}

interface RawFieldDef extends RawSubFieldDef {
  subFields?: RawSubFieldDef[]
}

interface RawDefinition {
  title: string
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
    required: raw.required ?? false,
    ...(raw.length !== undefined ? { length: raw.length } : {}),
  }

  const type = raw.type as FieldType

  if (type === 'DICT') {
    return {
      ...base,
      type,
      dictType: raw.dictType ?? '',
      ...(raw.renderAs !== undefined ? { renderAs: raw.renderAs as 'select' | 'radio' } : {}),
    }
  }

  if (type === 'REFERENCE') {
    return {
      ...base,
      type,
      ...(raw.targetFormId !== undefined ? { targetFormId: raw.targetFormId } : {}),
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
        ...(sf.dictType !== undefined ? { dictType: sf.dictType } : {}),
        ...(sf.renderAs !== undefined ? { renderAs: sf.renderAs as 'select' | 'radio' } : {}),
        ...(sf.targetFormId !== undefined ? { targetFormId: sf.targetFormId } : {}),
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
  if (typeof raw?.title !== 'string' || !Array.isArray(raw?.fields)) {
    throw new Error('[form-designer] failed to parse definition JSON: unexpected shape')
  }

  const fields = raw.fields.flatMap<FormSchemaField>((f) => {
    const mapped = mapRawField(f)
    return mapped !== null ? [mapped] : []
  })

  return {
    title: raw.title,
    fields,
    ...(raw.schemaVersion !== undefined ? { schemaVersion: raw.schemaVersion } : {}),
    ...(raw.rules !== undefined ? { rules: raw.rules } : {}),
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
  }

  if (field.required) {
    // required → validate 数组（form-create/Element Plus 必填校验直通通道）
    rule.validate = [{ required: true, message: '必填', trigger: 'blur' }]
  }

  switch (field.type) {
    case 'TEXT': {
      rule.type = 'input'
      break
    }

    case 'RICH_TEXT': {
      // TODO(rich-text): 接入富文本编辑器，当前降级为多行 textarea
      rule.type = 'input'
      rule.props = { type: 'textarea', rows: 4 }
      break
    }

    case 'NUMBER': {
      rule.type = 'inputNumber'
      break
    }

    case 'DATE': {
      rule.type = 'datePicker'
      rule.props = { valueFormat: 'YYYY-MM-DD' }
      // 提交值为 ISO 格式字符串（YYYY-MM-DD）以对齐后端
      break
    }

    case 'BOOL': {
      rule.type = 'switch'
      rule.value = false
      break
    }

    case 'DICT': {
      rule.type = 'select'
      rule.options = []
      rule.props = { clearable: true }
      // __dictType__ 标记供渲染层在运行时通过 useDict 加载字典项并填充 options
      ;(rule as Record<string, unknown>).__dictType__ = field.dictType
      break
    }

    case 'REFERENCE': {
      // 统一按钮占位：禁用态输入框，视觉上与普通 TEXT 区分。不查目标数据、不发请求。
      rule.type = 'input'
      rule.props = { disabled: true, placeholder: '引用字段选择器' }
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

    case 'DICT':
      rule.type = 'select'
      rule.options = []
      rule.props = { clearable: true }
      ;(rule as Record<string, unknown>).__dictType__ = sf.dictType ?? ''
      if (sf.renderAs) {
        ;(rule as Record<string, unknown>).renderAs = sf.renderAs
      }
      break

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
