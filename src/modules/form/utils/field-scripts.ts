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
  function currentUser(): { id: string; displayName: string; deptId: string | null } | null {
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
