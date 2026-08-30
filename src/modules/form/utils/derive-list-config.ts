/**
 * 表单数据列表页配置推导 —— 从 FormSchema definition 自动列/筛选配置。
 *
 * ## 设计定位
 * 这两个纯函数是「将来列表视图配置元数据」的唯一接入点：
 * 数据源从 definition 切换到配置时，只换此函数内部实现，页面/模板不动。
 *
 * ## 物理列名规则
 * REFERENCE 字段在后端按 `ref_{name}_id` 落库并返回，必须与后端
 * ColumnValidation.physicalColumnName 口径一致，否则 records Map 的 key 对不上。
 *
 * ## 筛选 op×type 矩阵
 * | type     | op                    | 控件       |
 * |----------|-----------------------|------------|
 * | TEXT     | LIKE                  | input      |
 * | NUMBER   | EQ                    | input      |
 * | DATE     | GE + LE（日期范围）   | datePicker |
 * | BOOL     | EQ                    | select     |
 * | DICT     | EQ                    | select     |
 * | REFERENCE| —（排除）            | —          |
 * | RICH_TEXT| —（排除）            | —          |
 * | TABLE    | —（排除）            | —          |
 *
 * v1 限取前 3 个可筛字段。
 */
import type { FormSchema, FieldType } from '@/contracts/form-schema'

/** 列配置：供 StandardListTemplate 的 el-table-column 渲染。 */
export interface ColumnConfig {
  /** 物理列名，与后端 records Map 的 key 一致。REFERENCE → `ref_{name}_id`。 */
  prop: string
  /** 列标题。 */
  label: string
  /** 字段类型，供值显示格式判断（BOOL→是/否、DICT→label 查找等）。 */
  type: FieldType
  /** DICT 字段的字典类型编码，供 DictTag/useDict 使用。 */
  dictType?: string
}

/** 筛选字段配置：供列表页动态生成筛选栏。 */
export interface FilterFieldConfig {
  /** 字段名（定义中的 name）。 */
  field: string
  /** 筛选标签。 */
  label: string
  /** 字段类型，决定控件类型。 */
  type: FieldType
  /** 查询操作符（后端 op 枚举）。 */
  op: 'EQ' | 'LIKE' | 'GE' | 'LE'
  /** DICT 字段的字典类型编码，供 useDict 加载选项。 */
  dictType?: string
}

/**
 * 从 FormSchema 推导表格列配置。
 *
 * - 取 fields 中 type≠TABLE 的字段
 * - REFERENCE 字段的 prop 映射为 ref_{name}_id（对齐后端物理列名）
 * - 末尾追加固定列「创建时间」(prop=create_time)
 *
 * TODO(列表配置): 数据源 definition→配置时，只换本函数内部逻辑，页面/模板不动。
 */
export function deriveColumns(schema: FormSchema): ColumnConfig[] {
  const columns: ColumnConfig[] = []

  for (const field of schema.fields) {
    if (field.type === 'TABLE') continue // TABLE 子表不在主表格列展示

    const prop = field.type === 'REFERENCE' ? `ref_${field.name}_id` : field.name
    const label = field.label ?? field.name

    const col: ColumnConfig = { prop, label, type: field.type }
    if (field.type === 'DICT') {
      col.dictType = field.dictType
    }
    columns.push(col)
  }

  // 末尾固定追加创建时间列
  columns.push({ prop: 'create_time', label: '创建时间', type: 'DATE' })

  return columns
}

/**
 * 从 FormSchema 推导筛选字段配置。
 *
 * - 排除 REFERENCE / RICH_TEXT / TABLE 类型
 * - DICT 字段携带 dictType 供 useDict 通道加载选项
 * - TEXT → op=LIKE；NUMBER/BOOL/DICT → op=EQ
 * - DATE → op=GE+LE（日期范围，由页面组件拆成两条 filter）
 * - v1 限取前 3 个可筛字段
 *
 * TODO(列表配置): 数据源 definition→配置时，只换本函数内部逻辑，页面/模板不动。
 * TODO(enabled): 将来后端 definition 追加 enabled 字段后，在此处排除 enabled=false 的字段。
 */
export function deriveFilterFields(schema: FormSchema): FilterFieldConfig[] {
  const FILTERABLE_TYPES = new Set<FieldType>(['TEXT', 'NUMBER', 'DATE', 'BOOL', 'DICT'])
  const OP_MAP: Record<string, 'EQ' | 'LIKE'> = {
    TEXT: 'LIKE',
    NUMBER: 'EQ',
    DATE: 'EQ',
    BOOL: 'EQ',
    DICT: 'EQ',
  }

  const filters: FilterFieldConfig[] = []

  for (const field of schema.fields) {
    if (!FILTERABLE_TYPES.has(field.type)) continue
    // v1 限 3 个
    if (filters.length >= 3) break

    const f: FilterFieldConfig = {
      field: field.name,
      label: field.label ?? field.name,
      type: field.type,
      op: OP_MAP[field.type] ?? 'EQ',
    }
    if (field.type === 'DICT') {
      f.dictType = field.dictType
    }
    filters.push(f)
  }

  return filters
}

/**
 * TODO(设计时自定义入口): 数据源 definition→配置时，只换此函数，组件不动。
 *
 * 从目标表单 definition 推导 REFERENCE 选择器弹窗的表格列配置。
 * v1 = 复用 deriveColumns（全业务列 + create_time），
 *      将来「设计时定义弹窗哪些列、顺序」换此函数内部实现。
 */
export function deriveReferenceColumns(definition: FormSchema): ColumnConfig[] {
  return deriveColumns(definition)
}

/**
 * TODO(设计时自定义入口): 将来设计时指定 displayField 时，换此函数内部逻辑。
 *
 * 从目标表单 definition 推导 REFERENCE 选择器的显示字段名。
 * v1 = definition.fields 中第一个 type==='TEXT' 的字段 name；
 *      无 TEXT 字段时兜底返回 'id'。
 */
export function deriveDisplayField(definition: FormSchema): string {
  for (const field of definition.fields) {
    if (field.type === 'TEXT') return field.name
  }
  return 'id'
}

/**
 * TODO(设计时自定义入口): 将来设计时自定义搜索字段时，换此函数内部逻辑。
 *
 * 从目标表单 definition 推导 REFERENCE 选择器的搜索字段列表。
 * v1 = [deriveDisplayField(definition)]（只搜显示字段）。
 */
export function deriveSearchFields(definition: FormSchema): string[] {
  return [deriveDisplayField(definition)]
}
