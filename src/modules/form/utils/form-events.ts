import type {
  FormEventAction,
  FormEventName,
  FormEvents,
  FormSchema,
  FormSchemaField,
  TableField,
} from '@/contracts/form-schema'
import { parseScript, runScript, type ScriptProgram } from './script-interpreter'
import { transpileScriptSugar } from './script-sugar'
import {
  createSupplementalHostFunctions,
  type ScriptOrgContext,
  type ScriptSchemaFieldLike,
} from './script-hosts'

export const FORM_EVENT_NAMES: readonly FormEventName[] = [
  'onLoad',
  'beforeSubmitHandler',
  'afterSubmitHandler',
]

export const FORM_EVENT_ACTION_TIMEOUT_MS = 5_000
export const FORM_EVENT_TOTAL_TIMEOUT_MS = 15_000
export const FORM_EVENT_CONFIRM_TIMEOUT_MS = 60_000

export interface FormEventRunResult {
  ok: boolean
  event: FormEventName
  actionId?: string
  error?: string
  cancelled?: boolean
  timedOut?: boolean
}

export interface FormEventRunOptions {
  /** 提交成功后的稳定提交标识；同一标识重试只执行未成功动作。 */
  submissionId?: string
  /** 只重试该提交中未成功的 afterSubmit 动作。 */
  retryFailedOnly?: boolean
}

export interface FormEventControlOverrides {
  required: Record<string, boolean>
  hidden: Record<string, boolean>
  readonly: Record<string, boolean>
}

export interface FormEventIdentity {
  userId: string
  userName: string
  deptId: string | null
  tenantId?: string | null
  roles?: string[]
}

export interface FormEventRuntimeOptions {
  getSchema: () => FormSchema | null
  model: Record<string, unknown> | (() => Record<string, unknown>)
  controls?: FormEventControlOverrides
  /** 只读详情不开放写字段、控件或集成副作用。 */
  writable?: () => boolean
  /** 提交后页面会转只读，但已确认提交的受控集成仍可执行；查看态必须返回 false。 */
  sideEffectsAllowed?: () => boolean
  identity?: () => FormEventIdentity | null
  processContext?: () => Record<string, unknown>
  /** 当前表单标识、定义版本、最近提交标识等上下文。 */
  formContext?: () => {
    formKey?: string
    version?: number | null
    submissionId?: string
  }
  /** 已授权组织目录快照（当前租户启用用户 + 部门树）；未装载时组织查询明确报错。 */
  orgContext?: () => ScriptOrgContext | null
  /** 已由服务端授权、且当前宿主允许的稳定集成标识集合。 */
  allowedIntegrations?: () => string[]
  callIntegration?: (key: string, input: Record<string, unknown>) => unknown | Promise<unknown>
  confirm?: (message: string, signal: AbortSignal) => Promise<boolean>
  notify?: (kind: 'info' | 'warning' | 'error' | 'success', message: string) => void
}

/** 保存/发布前检查 id 唯一、排序稳定及脚本可解析。 */
export function validateFormEvents(events: FormEvents | undefined): string[] {
  if (!events) return []
  const errors: string[] = []
  for (const eventName of FORM_EVENT_NAMES) {
    const ids = new Set<string>()
    for (const action of events[eventName] ?? []) {
      if (!action.id.trim()) errors.push(`${eventName}: 动作 ID 不能为空`)
      if (ids.has(action.id)) errors.push(`${eventName}: 动作 ID 重复「${action.id}」`)
      ids.add(action.id)
      try {
        parseScript(transpileScriptSugar(action.script))
      } catch (error) {
        errors.push(
          `${eventName}/${action.id}: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }
  }
  return errors
}

export function createFormEvents(options: FormEventRuntimeOptions) {
  const getModel = () => (typeof options.model === 'function' ? options.model() : options.model)
  const writable = () => options.writable?.() ?? true
  const sideEffectsAllowed = () => options.sideEffectsAllowed?.() ?? writable()
  const controls: FormEventControlOverrides = options.controls ?? {
    required: {},
    hidden: {},
    readonly: {},
  }
  const compiled = new Map<string, ScriptProgram>()
  const completedAfterSubmit = new Map<string, Set<string>>()

  const field = (name: unknown): FormSchemaField => {
    const key = typeof name === 'string' ? name : String(name ?? '')
    const found = options.getSchema()?.fields.find((candidate) => candidate.name === key)
    if (!found) throw new Error(`字段不存在「${key}」`)
    return found
  }
  const assertWritable = () => {
    if (!writable()) throw new Error('只读查看状态不允许修改字段或控件')
  }
  const row = (table: unknown, index: unknown): Record<string, unknown> => {
    const tableField = field(table)
    if (tableField.type !== 'TABLE') throw new Error(`字段「${tableField.name}」不是子表`)
    const rows = getModel()[tableField.name]
    const position = Number(index)
    if (
      !Array.isArray(rows) ||
      !Number.isInteger(position) ||
      position < 0 ||
      position >= rows.length
    ) {
      throw new Error(`子表「${tableField.name}」第 ${String(index)} 行不存在`)
    }
    return rows[position] as Record<string, unknown>
  }
  const processContext = () => options.processContext?.() ?? {}
  const formContext = () => options.formContext?.() ?? {}
  const allowedIntegrations = () => new Set(options.allowedIntegrations?.() ?? [])

  const tableField = (name: unknown, fn: string): TableField => {
    const found = field(name)
    if (found.type !== 'TABLE') throw new Error(`${fn}: 字段「${found.name}」不是子表`)
    return found
  }
  const subFieldOf = (table: TableField, name: unknown, fn: string): string => {
    const subName = String(name ?? '')
    if (!table.subFields?.some((sub) => sub.name === subName)) {
      throw new Error(`${fn}: 子表「${table.name}」不存在列「${subName}」`)
    }
    return subName
  }
  const rowsOf = (name: unknown, fn: string): Array<Record<string, unknown>> => {
    const table = tableField(name, fn)
    const rows = getModel()[table.name]
    if (!Array.isArray(rows)) throw new Error(`${fn}: 子表「${table.name}」当前不是数组`)
    return rows as Array<Record<string, unknown>>
  }
  const rowAt = (
    name: unknown,
    index: unknown,
    fn: string,
  ): {
    table: TableField
    rows: Array<Record<string, unknown>>
    row: Record<string, unknown>
    position: number
  } => {
    const table = tableField(name, fn)
    const rows = rowsOf(table.name, fn)
    const position = Number(index)
    if (!Number.isInteger(position) || position < 0 || position >= rows.length) {
      throw new Error(`${fn}: 子表「${table.name}」第 ${String(index)} 行不存在`)
    }
    return { table, rows, row: rows[position], position }
  }
  const emptyValueFor = (target: { type: string }): unknown => {
    switch (target.type) {
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
  const emptySubRow = (table: TableField): Record<string, unknown> => {
    const rowData: Record<string, unknown> = {}
    for (const sub of table.subFields ?? []) rowData[sub.name] = emptyValueFor(sub)
    return rowData
  }
  const applyFieldPairs = (fn: string, args: unknown[]): void => {
    if (args.length % 2 !== 0) throw new Error(`${fn}: 参数必须成对（字段名, 值）`)
    assertWritable()
    for (let index = 0; index < args.length; index += 2) {
      getModel()[field(args[index]).name] = args[index + 1]
    }
  }
  const applySubPairs = (
    table: TableField,
    rowData: Record<string, unknown>,
    fn: string,
    args: unknown[],
  ): void => {
    if (args.length % 2 !== 0) throw new Error(`${fn}: 参数必须成对（列名, 值）`)
    assertWritable()
    for (let index = 0; index < args.length; index += 2) {
      rowData[subFieldOf(table, args[index], fn)] = args[index + 1]
    }
  }

  const hostFunctions: Record<string, (...args: unknown[]) => unknown> = {
    ...createSupplementalHostFunctions(
      () =>
        (options.getSchema() ?? null) as {
          fields: ScriptSchemaFieldLike[]
        } | null,
      options.orgContext,
    ),
    获取字段值: (name) => getModel()[field(name).name],
    getFieldValue: (name) => getModel()[field(name).name],
    设置字段值: (name, value) => {
      assertWritable()
      getModel()[field(name).name] = value
    },
    setFieldValue: (name, value) => {
      assertWritable()
      getModel()[field(name).name] = value
    },
    获取子表字段值: (table, index, name) => {
      const tableField = field(table)
      if (tableField.type !== 'TABLE') throw new Error(`字段「${tableField.name}」不是子表`)
      const subName = String(name ?? '')
      if (!tableField.subFields.some((sub) => sub.name === subName)) {
        throw new Error(`子表「${tableField.name}」不存在列「${subName}」`)
      }
      return row(table, index)[subName]
    },
    getTableRowValue: (table, index, name) => {
      const tableField = field(table)
      if (tableField.type !== 'TABLE') throw new Error(`字段「${tableField.name}」不是子表`)
      const subName = String(name ?? '')
      if (!tableField.subFields.some((sub) => sub.name === subName)) {
        throw new Error(`子表「${tableField.name}」不存在列「${subName}」`)
      }
      return row(table, index)[subName]
    },
    设置子表字段值: (table, index, name, value) => {
      assertWritable()
      const tableField = field(table)
      if (tableField.type !== 'TABLE') throw new Error(`字段「${tableField.name}」不是子表`)
      const subName = String(name ?? '')
      if (!tableField.subFields.some((sub) => sub.name === subName)) {
        throw new Error(`子表「${tableField.name}」不存在列「${subName}」`)
      }
      row(table, index)[subName] = value
    },
    setTableRowValue: (table, index, name, value) => {
      assertWritable()
      const tableField = field(table)
      if (tableField.type !== 'TABLE') throw new Error(`字段「${tableField.name}」不是子表`)
      const subName = String(name ?? '')
      if (!tableField.subFields.some((sub) => sub.name === subName)) {
        throw new Error(`子表「${tableField.name}」不存在列「${subName}」`)
      }
      row(table, index)[subName] = value
    },
    设置必填: (name, value) => {
      assertWritable()
      controls.required[field(name).name] = Boolean(value)
    },
    setRequired: (name, value) => {
      assertWritable()
      controls.required[field(name).name] = Boolean(value)
    },
    设置隐藏: (name, value) => {
      assertWritable()
      controls.hidden[field(name).name] = Boolean(value)
    },
    setHidden: (name, value) => {
      assertWritable()
      controls.hidden[field(name).name] = Boolean(value)
    },
    设置只读: (name, value) => {
      assertWritable()
      controls.readonly[field(name).name] = Boolean(value)
    },
    setReadonly: (name, value) => {
      assertWritable()
      controls.readonly[field(name).name] = Boolean(value)
    },
    获取当前用户: () => options.identity?.()?.userId ?? null,
    currentUser: () => options.identity?.()?.userId ?? null,
    获取当前用户姓名: () => options.identity?.()?.userName ?? null,
    currentUserName: () => options.identity?.()?.userName ?? null,
    获取当前部门: () => options.identity?.()?.deptId ?? null,
    currentDept: () => options.identity?.()?.deptId ?? null,
    获取流程变量: (name) => processContext()[String(name ?? '')],
    getProcessVariable: (name) => processContext()[String(name ?? '')],
    获取流程状态: () => String(processContext().status ?? ''),
    getProcessStatus: () => String(processContext().status ?? ''),
    文本转数字: (value) => Number(value),
    toNumber: (value) => Number(value),
    文本转大写: (value) => String(value ?? '').toUpperCase(),
    toUpper: (value) => String(value ?? '').toUpperCase(),
    文本转小写: (value) => String(value ?? '').toLowerCase(),
    toLower: (value) => String(value ?? '').toLowerCase(),
    去除首尾空格: (value) => String(value ?? '').trim(),
    trim: (value) => String(value ?? '').trim(),
    提示消息: (value) => options.notify?.('info', String(value ?? '')),
    showMessage: (value) => options.notify?.('info', String(value ?? '')),
    调用集成: (key, input) => {
      if (!sideEffectsAllowed()) throw new Error('只读查看状态不允许执行表单事件副作用')
      const identity = String(key ?? '')
      if (!allowedIntegrations().has(identity)) throw new Error(`集成能力未授权「${identity}」`)
      const payload =
        input && typeof input === 'object' && !Array.isArray(input)
          ? (input as Record<string, unknown>)
          : {}
      return options.callIntegration?.(identity, payload)
    },
    callIntegration: (key, input) => {
      if (!sideEffectsAllowed()) throw new Error('只读查看状态不允许执行表单事件副作用')
      const identity = String(key ?? '')
      if (!allowedIntegrations().has(identity)) throw new Error(`集成能力未授权「${identity}」`)
      const payload =
        input && typeof input === 'object' && !Array.isArray(input)
          ? (input as Record<string, unknown>)
          : {}
      return options.callIntegration?.(identity, payload)
    },

    // ── 主表批量/清空与字段元信息 ──
    批量设置字段值: (...args) => {
      applyFieldPairs('批量设置字段值', args)
    },
    setFieldValues: (...args) => {
      applyFieldPairs('批量设置字段值', args)
    },
    清空字段: (name) => {
      assertWritable()
      const found = field(name)
      getModel()[found.name] = emptyValueFor(found)
    },
    clearField: (name) => {
      assertWritable()
      const found = field(name)
      getModel()[found.name] = emptyValueFor(found)
    },
    获取字段类型: (name) => field(name).type,
    getFieldType: (name) => field(name).type,
    获取字段标题: (name) => field(name).label ?? field(name).name,
    getFieldLabel: (name) => field(name).label ?? field(name).name,
    获取字段选项: (name) => {
      const found = field(name)
      const candidates = 'options' in found ? found.options : undefined
      return (candidates ?? []).map((option) => option.value || option.key)
    },
    getFieldOptions: (name) => {
      const found = field(name)
      const candidates = 'options' in found ? found.options : undefined
      return (candidates ?? []).map((option) => option.value || option.key)
    },
    获取字段列表: () => (options.getSchema()?.fields ?? []).map((item) => item.name),
    getFieldNames: () => (options.getSchema()?.fields ?? []).map((item) => item.name),

    // ── 明细：行级读写、增删、批量、汇总 ──
    获取子表行数: (name) => rowsOf(name, '获取子表行数').length,
    getTableRowCount: (name) => rowsOf(name, '获取子表行数').length,
    获取子表行标识: (name, index) => {
      const { row: rowData, position } = rowAt(name, index, '获取子表行标识')
      return rowData.id ?? rowData._rowId ?? position
    },
    getTableRowId: (name, index) => {
      const { row: rowData, position } = rowAt(name, index, '获取子表行标识')
      return rowData.id ?? rowData._rowId ?? position
    },
    新增子表行: (name, ...pairs) => {
      assertWritable()
      const table = tableField(name, '新增子表行')
      const rows = rowsOf(table.name, '新增子表行')
      const rowData = emptySubRow(table)
      applySubPairs(table, rowData, '新增子表行', pairs)
      rows.push(rowData)
      return rows.length - 1
    },
    addTableRow: (name, ...pairs) => {
      assertWritable()
      const table = tableField(name, '新增子表行')
      const rows = rowsOf(table.name, '新增子表行')
      const rowData = emptySubRow(table)
      applySubPairs(table, rowData, '新增子表行', pairs)
      rows.push(rowData)
      return rows.length - 1
    },
    删除子表行: (name, index) => {
      assertWritable()
      const { rows, position } = rowAt(name, index, '删除子表行')
      rows.splice(position, 1)
    },
    removeTableRow: (name, index) => {
      assertWritable()
      const { rows, position } = rowAt(name, index, '删除子表行')
      rows.splice(position, 1)
    },
    批量设置子表字段值: (name, subName, value) => {
      assertWritable()
      const table = tableField(name, '批量设置子表字段值')
      const column = subFieldOf(table, subName, '批量设置子表字段值')
      for (const rowData of rowsOf(table.name, '批量设置子表字段值')) rowData[column] = value
    },
    setTableColumnValue: (name, subName, value) => {
      assertWritable()
      const table = tableField(name, '批量设置子表字段值')
      const column = subFieldOf(table, subName, '批量设置子表字段值')
      for (const rowData of rowsOf(table.name, '批量设置子表字段值')) rowData[column] = value
    },
    汇总子表列: (name, subName) => {
      const table = tableField(name, '汇总子表列')
      const column = subFieldOf(table, subName, '汇总子表列')
      let total = 0
      for (const rowData of rowsOf(table.name, '汇总子表列')) {
        const value = Number(rowData[column])
        if (Number.isFinite(value)) total += value
      }
      return total
    },
    sumTableColumn: (name, subName) => {
      const table = tableField(name, '汇总子表列')
      const column = subFieldOf(table, subName, '汇总子表列')
      let total = 0
      for (const rowData of rowsOf(table.name, '汇总子表列')) {
        const value = Number(rowData[column])
        if (Number.isFinite(value)) total += value
      }
      return total
    },

    // ── 表单上下文（无流程时返回有类型的空值） ──
    获取表单标识: () => String(formContext().formKey ?? ''),
    getFormKey: () => String(formContext().formKey ?? ''),
    获取表单版本: () => formContext().version ?? null,
    getFormVersion: () => formContext().version ?? null,
    获取当前提交结果: () => String(formContext().submissionId ?? ''),
    getSubmissionResult: () => String(formContext().submissionId ?? ''),
    获取当前租户: () => options.identity?.()?.tenantId ?? null,
    currentTenant: () => options.identity?.()?.tenantId ?? null,
    获取当前用户角色: () => options.identity?.()?.roles ?? [],
    currentRoles: () => options.identity?.()?.roles ?? [],
  }

  function programFor(action: FormEventAction): ScriptProgram {
    const cacheKey = `${action.id}\n${action.script}`
    const cached = compiled.get(cacheKey)
    if (cached) return cached
    const program = parseScript(transpileScriptSugar(action.script))
    compiled.set(cacheKey, program)
    return program
  }

  async function awaitBounded<T>(task: Promise<T>, ms: number, message: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        task,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(message)), Math.max(1, ms))
        }),
      ])
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  async function run(eventName: FormEventName, runOptions: FormEventRunOptions = {}) {
    const started = Date.now()
    const actions = [...(options.getSchema()?.events?.[eventName] ?? [])]
      .filter((action) => action.enabled && action.script.trim())
      .sort((left, right) => left.order - right.order)
    const done =
      eventName === 'afterSubmitHandler' && runOptions.submissionId
        ? (completedAfterSubmit.get(runOptions.submissionId) ?? new Set<string>())
        : undefined

    for (const action of actions) {
      if (done?.has(action.id)) continue
      const remaining = FORM_EVENT_TOTAL_TIMEOUT_MS - (Date.now() - started)
      if (remaining <= 0) {
        return {
          ok: false,
          event: eventName,
          actionId: action.id,
          error: '表单事件总执行时间超过 15 秒',
          timedOut: true,
        }
      }
      if (action.confirmMessage && options.confirm) {
        const controller = new AbortController()
        let confirmed: boolean
        try {
          confirmed = await awaitBounded(
            options.confirm(action.confirmMessage, controller.signal),
            FORM_EVENT_CONFIRM_TIMEOUT_MS,
            '用户确认超时',
          )
        } catch (error) {
          controller.abort()
          return {
            ok: false,
            event: eventName,
            actionId: action.id,
            error: error instanceof Error ? error.message : String(error),
            cancelled: true,
          }
        }
        if (!confirmed) {
          return {
            ok: false,
            event: eventName,
            actionId: action.id,
            error: '用户取消操作',
            cancelled: true,
          }
        }
      }
      try {
        const program = programFor(action)
        let result: unknown
        await awaitBounded(
          Promise.resolve().then(() => {
            result = runScript(program, { hostFunctions, budget: 2_000 })
            return result
          }),
          Math.min(
            FORM_EVENT_ACTION_TIMEOUT_MS,
            FORM_EVENT_TOTAL_TIMEOUT_MS - (Date.now() - started),
          ),
          '动作执行超过 5 秒',
        )
        if (result && typeof (result as { then?: unknown }).then === 'function') {
          result = await awaitBounded(
            Promise.resolve(result),
            Math.min(
              FORM_EVENT_ACTION_TIMEOUT_MS,
              FORM_EVENT_TOTAL_TIMEOUT_MS - (Date.now() - started),
            ),
            '异步宿主调用超过 5 秒',
          )
        }
        if (eventName === 'beforeSubmitHandler' && result === false) {
          return {
            ok: false,
            event: eventName,
            actionId: action.id,
            error: '提交前动作返回 false，已取消提交',
          }
        }
        done?.add(action.id)
        if (done && runOptions.submissionId) {
          completedAfterSubmit.set(runOptions.submissionId, done)
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        options.notify?.('error', message)
        return {
          ok: false,
          event: eventName,
          actionId: action.id,
          error: message,
          timedOut: /超时|超过/.test(message),
        }
      }
    }
    if (done && runOptions.submissionId) completedAfterSubmit.set(runOptions.submissionId, done)
    return { ok: true, event: eventName }
  }

  return {
    run,
    runOnLoad: () => run('onLoad'),
    runBeforeSubmit: () => run('beforeSubmitHandler'),
    runAfterSubmit: (submissionId: string, retryFailedOnly = false) =>
      run('afterSubmitHandler', { submissionId, retryFailedOnly }),
  }
}
