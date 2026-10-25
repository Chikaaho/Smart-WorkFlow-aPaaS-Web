/**
 * BF20261013-021：表单字段脚本运行时（设计器「高级编辑」脚本的解释器 + 触发编排）。
 *
 * 字段脚本 = 挂在某字段上的 JS 片段（`field.script.code`，支持 `#函数名` 语法糖），
 * 该字段值变化时执行；`field.script.onLoad` 为真时表单加载/回显完成后也执行一次。
 * 脚本可读写同表单字段值、切换 必填/隐藏/只读，可提示消息与取当前用户信息。
 *
 * 约束：
 * - 只读查看态（enabled() = false）不执行脚本；
 * - 级联（脚本改值再触发别的脚本）有 12 步上限，防止互写死循环；
 * - 脚本错误不打断填报：捕获后提示并记录（表单本身继续可用）。
 */
import { reactive, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { transpileScriptSugar } from './script-sugar'
import { checkScriptSyntax, parseScript, runScript, type ScriptProgram } from './script-interpreter'
import { useUserStore } from '@/stores/user'
import type { FormSchema, FormSchemaField } from '@/contracts/form-schema'

/** 脚本引发的字段状态覆盖（与声明式规则/静态属性并存，由渲染侧合并）。 */
export interface FieldScriptOverrides {
  required: Record<string, boolean>
  hidden: Record<string, boolean>
  readonly: Record<string, boolean>
}

export interface FieldScriptsOptions {
  /** 当前 schema（取值函数，支持响应式）。 */
  getSchema: () => FormSchema | null
  /**
   * 表单数据模型：reactive 对象，或返回当前模型的取值函数
   * （节点表单等整体替换模型的场景用函数形态）。
   */
  model: Record<string, unknown> | (() => Record<string, unknown>)
  /** 是否可写（缺省 true；只读查看态传 () => false 停用脚本）。 */
  enabled?: () => boolean
  /** 当前办理上下文的只读流程变量/状态；无流程时返回空对象。 */
  processContext?: () => Record<string, unknown>
  /** 当前表单标识、定义版本、最近提交标识等上下文。 */
  formContext?: () => {
    formKey?: string
    version?: number | null
    submissionId?: string
  }
  /** 已由服务端授权、当前宿主允许的稳定集成标识集合。 */
  allowedIntegrations?: () => string[]
  /** 受控集成执行器；未提供时调用会明确报“执行器不可用”。 */
  callIntegration?: (key: string) => unknown
}

export interface FieldScriptsRuntime {
  overrides: FieldScriptOverrides
  /** 表单加载/回显完成后调用：执行 onLoad = true 的字段脚本。 */
  runOnLoad: () => void
  /** 模型整体替换（装载/回显）后调用：把当前值记为基线，避免装载本身被当作“值变更”触发脚本。 */
  resetBaseline: () => void
  /** 停止侦听。 */
  dispose: () => void
  /** 最近一次脚本错误（调试/测试用）。 */
  lastError: () => string
}

const CASCADE_LIMIT = 12

/** 宿主函数名清单（中文为主 + 英文别名）；渲染侧与校验侧共用同一份。 */
export const FIELD_SCRIPT_FUNCTION_NAMES = [
  '获取字段值',
  'getFieldValue',
  '设置字段值',
  'setFieldValue',
  '批量设置字段值',
  'setFieldValues',
  '清空字段',
  'clearField',
  '获取字段类型',
  'getFieldType',
  '获取字段标题',
  'getFieldLabel',
  '获取字段选项',
  'getFieldOptions',
  '获取字段列表',
  'getFieldNames',
  '设置必填',
  'setRequired',
  '设置隐藏',
  'setHidden',
  '设置只读',
  'setReadonly',
  '提示消息',
  'showMessage',
  '获取当前用户',
  'currentUser',
  '获取当前用户姓名',
  'currentUserName',
  '获取当前部门',
  'currentDept',
  '获取当前租户',
  'currentTenant',
  '获取当前用户角色',
  'currentRoles',
  '获取子表字段值',
  'getTableRowValue',
  '设置子表字段值',
  'setTableRowValue',
  '获取子表行数',
  'getTableRowCount',
  '获取子表行标识',
  'getTableRowId',
  '新增子表行',
  'addTableRow',
  '删除子表行',
  'removeTableRow',
  '批量设置子表字段值',
  'setTableColumnValue',
  '汇总子表列',
  'sumTableColumn',
  '获取流程变量',
  'getProcessVariable',
  '获取流程状态',
  'getProcessStatus',
  '获取表单标识',
  'getFormKey',
  '获取表单版本',
  'getFormVersion',
  '获取当前提交结果',
  'getSubmissionResult',
  '文本转大写',
  'toUpper',
  '文本转小写',
  'toLower',
  '去除首尾空格',
  'trim',
  '文本转数字',
  'toNumber',
  '调用集成',
  'callIntegration',
] as const

/** 语法校验：编译（不执行）。返回 null = 通过；否则为可读错误。 */
export function validateFieldScript(code: string): string | null {
  try {
    const transpiled = transpileScriptSugar(code)
    // CSP 禁 eval：语法校验 = 语法糖编译 + 解释器解析（两者都通过才可用于运行）
    return checkScriptSyntax(transpiled)
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}

export function createFieldScripts(options: FieldScriptsOptions): FieldScriptsRuntime {
  const overrides = reactive<FieldScriptOverrides>({ required: {}, hidden: {}, readonly: {} })
  let lastErrorText = ''
  let cascadeCount = 0
  let cascadeResetTimer: ReturnType<typeof setTimeout> | null = null
  let warnedCascade = false

  const getModel = (): Record<string, unknown> =>
    typeof options.model === 'function' ? options.model() : options.model

  /**
   * 当前用户信息（懒取；无 Pinia 上下文时返回 null——
   * 组件挂载/单测环境未装 pinia 不应让脚本运行时整体不可用）。
   */
  let userStoreCache: ReturnType<typeof useUserStore> | null | undefined
  function currentUser(): {
    id: string
    displayName: string
    deptId: string | null
    tenantId: string | null
    roles: string[]
  } | null {
    if (userStoreCache === undefined) {
      try {
        userStoreCache = useUserStore()
      } catch {
        userStoreCache = null
      }
    }
    return userStoreCache?.user
      ? {
          id: userStoreCache.user.id,
          displayName: userStoreCache.user.displayName,
          deptId: userStoreCache.user.deptId,
          tenantId: userStoreCache.user.tenantId,
          roles: Array.from(userStoreCache.roles ?? []),
        }
      : null
  }

  function fieldByName(name: string): FormSchemaField | undefined {
    return options.getSchema()?.fields.find((f) => f.name === name)
  }

  function requireField(fieldName: unknown, fn: string): string {
    const name = typeof fieldName === 'string' ? fieldName : String(fieldName ?? '')
    if (!name || !fieldByName(name)) {
      throw new Error(`${fn}: 字段不存在「${name}」`)
    }
    return name
  }

  const assertWritable = (): void => {
    if (options.enabled && !options.enabled()) {
      throw new Error('只读查看状态不允许修改字段、子表或控件')
    }
  }

  function requireTable(fieldName: unknown, fn: string): FormSchemaField {
    const name = requireField(fieldName, fn)
    const table = fieldByName(name)
    if (!table || table.type !== 'TABLE') {
      throw new Error(`${fn}: 字段「${name}」不是子表`)
    }
    return table
  }

  function requireSubField(table: FormSchemaField, subName: unknown, fn: string): string {
    const name = String(subName ?? '')
    if (!table.subFields?.some((sub) => sub.name === name)) {
      throw new Error(`${fn}: 子表「${table.name}」不存在列「${name}」`)
    }
    return name
  }

  function rowsOf(tableName: unknown, fn: string): Array<Record<string, unknown>> {
    const table = requireTable(tableName, fn)
    const rows = getModel()[table.name]
    if (!Array.isArray(rows)) {
      throw new Error(`${fn}: 子表「${table.name}」当前不是数组`)
    }
    return rows as Array<Record<string, unknown>>
  }

  function rowAt(
    tableName: unknown,
    index: unknown,
    fn: string,
  ): {
    table: FormSchemaField
    rows: Array<Record<string, unknown>>
    row: Record<string, unknown>
    position: number
  } {
    const table = requireTable(tableName, fn)
    const rows = rowsOf(table.name, fn)
    const position = Number(index)
    if (!Number.isInteger(position) || position < 0 || position >= rows.length) {
      throw new Error(`${fn}: 子表「${table.name}」第 ${String(index)} 行不存在`)
    }
    return { table, rows, row: rows[position], position }
  }

  function emptyValueFor(field: FormSchemaField): unknown {
    switch (field.type) {
      case 'TABLE':
      case 'MULTISELECT':
      case 'ATTACHMENT':
      case 'IMAGE':
        return []
      case 'BOOL':
        return false
      case 'NUMBER':
        return null
      default:
        return ''
    }
  }

  function emptySubRow(table: FormSchemaField): Record<string, unknown> {
    const row: Record<string, unknown> = {}
    for (const sub of table.subFields ?? []) {
      row[sub.name] = emptyValueFor(sub)
    }
    return row
  }

  function applyFieldPairs(fn: string, args: unknown[]): void {
    if (args.length % 2 !== 0) {
      throw new Error(`${fn}: 参数必须成对（字段名, 值）`)
    }
    assertWritable()
    for (let index = 0; index < args.length; index += 2) {
      getModel()[requireField(args[index], fn)] = args[index + 1]
    }
  }

  function applySubFieldPairs(
    table: FormSchemaField,
    row: Record<string, unknown>,
    fn: string,
    args: unknown[],
  ): void {
    if (args.length % 2 !== 0) {
      throw new Error(`${fn}: 参数必须成对（列名, 值）`)
    }
    assertWritable()
    for (let index = 0; index < args.length; index += 2) {
      row[requireSubField(table, args[index], fn)] = args[index + 1]
    }
  }

  const processContext = (): Record<string, unknown> => options.processContext?.() ?? {}
  const formContext = () => options.formContext?.() ?? {}

  const hostFunctions: Record<string, (...args: unknown[]) => unknown> = {
    获取字段值: (fieldName) => getModel()[requireField(fieldName, '获取字段值')],
    getFieldValue: (fieldName) => getModel()[requireField(fieldName, '获取字段值')],
    设置字段值: (fieldName, value) => {
      getModel()[requireField(fieldName, '设置字段值')] = value
      return undefined
    },
    setFieldValue: (fieldName, value) => {
      getModel()[requireField(fieldName, '设置字段值')] = value
      return undefined
    },
    设置必填: (fieldName, flag) => {
      overrides.required[requireField(fieldName, '设置必填')] = Boolean(flag)
      return undefined
    },
    setRequired: (fieldName, flag) => {
      overrides.required[requireField(fieldName, '设置必填')] = Boolean(flag)
      return undefined
    },
    设置隐藏: (fieldName, flag) => {
      overrides.hidden[requireField(fieldName, '设置隐藏')] = Boolean(flag)
      return undefined
    },
    setHidden: (fieldName, flag) => {
      overrides.hidden[requireField(fieldName, '设置隐藏')] = Boolean(flag)
      return undefined
    },
    设置只读: (fieldName, flag) => {
      overrides.readonly[requireField(fieldName, '设置只读')] = Boolean(flag)
      return undefined
    },
    setReadonly: (fieldName, flag) => {
      overrides.readonly[requireField(fieldName, '设置只读')] = Boolean(flag)
      return undefined
    },
    提示消息: (text) => {
      ElMessage.info(String(text ?? ''))
      return undefined
    },
    showMessage: (text) => {
      ElMessage.info(String(text ?? ''))
      return undefined
    },
    获取当前用户: () => currentUser()?.id ?? null,
    currentUser: () => currentUser()?.id ?? null,
    获取当前用户姓名: () => currentUser()?.displayName ?? null,
    currentUserName: () => currentUser()?.displayName ?? null,
    获取当前部门: () => currentUser()?.deptId ?? null,
    currentDept: () => currentUser()?.deptId ?? null,
    获取当前租户: () => currentUser()?.tenantId ?? null,
    currentTenant: () => currentUser()?.tenantId ?? null,
    获取当前用户角色: () => currentUser()?.roles ?? [],
    currentRoles: () => currentUser()?.roles ?? [],

    // ── 主表批量/清空与字段元信息 ──
    批量设置字段值: (...args) => {
      applyFieldPairs('批量设置字段值', args)
      return undefined
    },
    setFieldValues: (...args) => {
      applyFieldPairs('批量设置字段值', args)
      return undefined
    },
    清空字段: (fieldName) => {
      assertWritable()
      const name = requireField(fieldName, '清空字段')
      const field = fieldByName(name)
      if (field) getModel()[name] = emptyValueFor(field)
      return undefined
    },
    clearField: (fieldName) => {
      assertWritable()
      const name = requireField(fieldName, '清空字段')
      const field = fieldByName(name)
      if (field) getModel()[name] = emptyValueFor(field)
      return undefined
    },
    获取字段类型: (fieldName) => fieldByName(requireField(fieldName, '获取字段类型'))?.type ?? '',
    getFieldType: (fieldName) => fieldByName(requireField(fieldName, '获取字段类型'))?.type ?? '',
    获取字段标题: (fieldName) => {
      const field = fieldByName(requireField(fieldName, '获取字段标题'))
      return field?.label ?? field?.name ?? ''
    },
    getFieldLabel: (fieldName) => {
      const field = fieldByName(requireField(fieldName, '获取字段标题'))
      return field?.label ?? field?.name ?? ''
    },
    获取字段选项: (fieldName) => {
      const field = fieldByName(requireField(fieldName, '获取字段选项'))
      return (field?.options ?? []).map((option) => option.value || option.key)
    },
    getFieldOptions: (fieldName) => {
      const field = fieldByName(requireField(fieldName, '获取字段选项'))
      return (field?.options ?? []).map((option) => option.value || option.key)
    },
    获取字段列表: () => (options.getSchema()?.fields ?? []).map((field) => field.name),
    getFieldNames: () => (options.getSchema()?.fields ?? []).map((field) => field.name),

    // ── 明细：行级读写、增删、批量、汇总 ──
    获取子表行数: (table) => rowsOf(table, '获取子表行数').length,
    getTableRowCount: (table) => rowsOf(table, '获取子表行数').length,
    获取子表字段值: (table, index, subName) => {
      const { table: tableField, row } = rowAt(table, index, '获取子表字段值')
      return row[requireSubField(tableField, subName, '获取子表字段值')]
    },
    getTableRowValue: (table, index, subName) => {
      const { table: tableField, row } = rowAt(table, index, '获取子表字段值')
      return row[requireSubField(tableField, subName, '获取子表字段值')]
    },
    设置子表字段值: (table, index, subName, value) => {
      const { table: tableField, row } = rowAt(table, index, '设置子表字段值')
      assertWritable()
      row[requireSubField(tableField, subName, '设置子表字段值')] = value
      return undefined
    },
    setTableRowValue: (table, index, subName, value) => {
      const { table: tableField, row } = rowAt(table, index, '设置子表字段值')
      assertWritable()
      row[requireSubField(tableField, subName, '设置子表字段值')] = value
      return undefined
    },
    获取子表行标识: (table, index) => {
      const { row, position } = rowAt(table, index, '获取子表行标识')
      return row.id ?? row._rowId ?? position
    },
    getTableRowId: (table, index) => {
      const { row, position } = rowAt(table, index, '获取子表行标识')
      return row.id ?? row._rowId ?? position
    },
    新增子表行: (table, ...pairs) => {
      assertWritable()
      const tableField = requireTable(table, '新增子表行')
      const rows = rowsOf(tableField.name, '新增子表行')
      const row = emptySubRow(tableField)
      applySubFieldPairs(tableField, row, '新增子表行', pairs)
      rows.push(row)
      return rows.length - 1
    },
    addTableRow: (table, ...pairs) => {
      assertWritable()
      const tableField = requireTable(table, '新增子表行')
      const rows = rowsOf(tableField.name, '新增子表行')
      const row = emptySubRow(tableField)
      applySubFieldPairs(tableField, row, '新增子表行', pairs)
      rows.push(row)
      return rows.length - 1
    },
    删除子表行: (table, index) => {
      assertWritable()
      const { rows, position } = rowAt(table, index, '删除子表行')
      rows.splice(position, 1)
      return undefined
    },
    removeTableRow: (table, index) => {
      assertWritable()
      const { rows, position } = rowAt(table, index, '删除子表行')
      rows.splice(position, 1)
      return undefined
    },
    批量设置子表字段值: (table, subName, value) => {
      assertWritable()
      const tableField = requireTable(table, '批量设置子表字段值')
      const name = requireSubField(tableField, subName, '批量设置子表字段值')
      for (const row of rowsOf(tableField.name, '批量设置子表字段值')) {
        row[name] = value
      }
      return undefined
    },
    setTableColumnValue: (table, subName, value) => {
      assertWritable()
      const tableField = requireTable(table, '批量设置子表字段值')
      const name = requireSubField(tableField, subName, '批量设置子表字段值')
      for (const row of rowsOf(tableField.name, '批量设置子表字段值')) {
        row[name] = value
      }
      return undefined
    },
    汇总子表列: (table, subName) => {
      const tableField = requireTable(table, '汇总子表列')
      const name = requireSubField(tableField, subName, '汇总子表列')
      let total = 0
      for (const row of rowsOf(tableField.name, '汇总子表列')) {
        const value = Number(row[name])
        if (Number.isFinite(value)) total += value
      }
      return total
    },
    sumTableColumn: (table, subName) => {
      const tableField = requireTable(table, '汇总子表列')
      const name = requireSubField(tableField, subName, '汇总子表列')
      let total = 0
      for (const row of rowsOf(tableField.name, '汇总子表列')) {
        const value = Number(row[name])
        if (Number.isFinite(value)) total += value
      }
      return total
    },

    // ── 流程与表单上下文（无流程时返回有类型的空值） ──
    获取流程变量: (name) => processContext()[String(name ?? '')] ?? null,
    getProcessVariable: (name) => processContext()[String(name ?? '')] ?? null,
    获取流程状态: () => String(processContext().status ?? ''),
    getProcessStatus: () => String(processContext().status ?? ''),
    获取表单标识: () => String(formContext().formKey ?? ''),
    getFormKey: () => String(formContext().formKey ?? ''),
    获取表单版本: () => formContext().version ?? null,
    getFormVersion: () => formContext().version ?? null,
    获取当前提交结果: () => String(formContext().submissionId ?? ''),
    getSubmissionResult: () => String(formContext().submissionId ?? ''),

    // ── 通用转换 ──
    文本转大写: (value) => String(value ?? '').toUpperCase(),
    toUpper: (value) => String(value ?? '').toUpperCase(),
    文本转小写: (value) => String(value ?? '').toLowerCase(),
    toLower: (value) => String(value ?? '').toLowerCase(),
    去除首尾空格: (value) => String(value ?? '').trim(),
    trim: (value) => String(value ?? '').trim(),
    文本转数字: (value) => Number(value),
    toNumber: (value) => Number(value),

    // ── 受控集成：只允许已授权稳定标识；无执行器明确报错 ──
    调用集成: (key) => {
      const identity = String(key ?? '')
      if (!(options.allowedIntegrations?.() ?? []).includes(identity)) {
        throw new Error(`集成能力未授权「${identity}」`)
      }
      if (!options.callIntegration) {
        throw new Error('集成执行器不可用')
      }
      return options.callIntegration(identity)
    },
    callIntegration: (key) => {
      const identity = String(key ?? '')
      if (!(options.allowedIntegrations?.() ?? []).includes(identity)) {
        throw new Error(`集成能力未授权「${identity}」`)
      }
      if (!options.callIntegration) {
        throw new Error('集成执行器不可用')
      }
      return options.callIntegration(identity)
    },
  }

  const compiledCache = new Map<string, ScriptProgram>()

  /** 编译 = 语法糖编译 + 解释器解析（CSP 禁 eval，不生成真实函数）。 */
  function compile(code: string): ScriptProgram {
    const cached = compiledCache.get(code)
    if (cached) {
      return cached
    }
    const program = parseScript(transpileScriptSugar(code))
    compiledCache.set(code, program)
    return program
  }

  function runScriptFor(field: FormSchemaField): void {
    const code = field.script?.code
    if (!code || !code.trim()) {
      return
    }
    if (options.enabled && !options.enabled()) {
      return
    }
    try {
      const program = compile(code)
      runScript(program, { hostFunctions })
    } catch (e) {
      lastErrorText = e instanceof Error ? e.message : String(e)
      console.warn(`[表单脚本] 字段「${field.label || field.name}」执行出错: ${lastErrorText}`)
      ElMessage.error(`字段脚本出错：${lastErrorText}`)
    }
  }

  /** 触发一次脚本并记账级联深度（超限停跑，防互写死循环）。 */
  function runFieldScript(name: string): void {
    if (cascadeCount >= CASCADE_LIMIT) {
      if (!warnedCascade) {
        warnedCascade = true
        console.warn(`[表单脚本] 级联超过 ${CASCADE_LIMIT} 步，已暂停后续脚本执行（疑似互写循环）`)
        ElMessage.warning('脚本联动次数过多，已暂停（请检查脚本是否互相改值）')
      }
      return
    }
    const field = fieldByName(name)
    if (!field) {
      return
    }
    cascadeCount++
    if (cascadeResetTimer) {
      clearTimeout(cascadeResetTimer)
    }
    cascadeResetTimer = setTimeout(() => {
      cascadeCount = 0
      warnedCascade = false
    }, 0)
    runScriptFor(field)
  }

  const snapshot = (): Record<string, unknown> => {
    const model = getModel()
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(model)) {
      const value = model[key]
      try {
        out[key] = value === undefined ? undefined : JSON.parse(JSON.stringify(value))
      } catch {
        out[key] = value
      }
    }
    return out
  }

  let prev = snapshot()
  let running = false

  function flushChanges(): void {
    const next = snapshot()
    const changed = Object.keys(next).filter(
      (key) => JSON.stringify(prev[key]) !== JSON.stringify(next[key]),
    )
    prev = next
    if (running) {
      return
    }
    running = true
    try {
      for (const name of changed) {
        const field = fieldByName(name)
        if (field?.script?.code) {
          runFieldScript(name)
        }
      }
    } finally {
      running = false
    }
  }

  const stop = watch(
    () => getModel(),
    () => flushChanges(),
    { deep: true },
  )

  function runOnLoad(): void {
    if (options.enabled && !options.enabled()) {
      return
    }
    running = true
    try {
      for (const field of options.getSchema()?.fields ?? []) {
        if (field.script?.onLoad && field.script.code) {
          runScriptFor(field)
        }
      }
    } finally {
      running = false
      prev = snapshot()
    }
  }

  function resetBaseline(): void {
    prev = snapshot()
  }

  function dispose(): void {
    stop()
    if (cascadeResetTimer) {
      clearTimeout(cascadeResetTimer)
    }
  }

  return {
    overrides,
    runOnLoad,
    resetBaseline,
    dispose,
    lastError: () => lastErrorText,
  }
}
