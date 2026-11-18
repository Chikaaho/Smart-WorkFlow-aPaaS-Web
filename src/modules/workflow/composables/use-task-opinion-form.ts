import { computed, ref } from 'vue'
import type { Ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from '@/locales'
import { ApiError } from '@/foundation/request'
import { getApprovalOpinionDraft, saveApprovalOpinionDraft } from '../api'
import type { TaskDetail } from '@/contracts/bpm'
import type { ApprovalOpinionConfig } from '@/contracts/bpm-node'

/** 意见字段（ApprovalOpinionConfig.fields 元素）。 */
export type OpinionField = NonNullable<ApprovalOpinionConfig['fields']>[number]

/**
 * 意见字段渲染 API：TaskOpinionFields 子组件经此访问字段值/写入/校验，
 * 与页面（含直接调用的必填校验）共用同一份实现，不自建副本。
 */
export interface OpinionFieldRenderApi {
  valueOf(field: OpinionField): unknown
  textOf(field: OpinionField): string | undefined
  inputOf(field: OpinionField): string | number | undefined
  inputTypeOf(field: OpinionField): string
  isInvalid(key: string): boolean
  set(key: string, value: unknown): void
}

/** useTaskOpinionForm 入参。 */
export interface TaskOpinionFormOptions {
  /** 目标任务号。 */
  taskId: string
  /** 任务详情（响应式）。 */
  detail: Ref<TaskDetail | null>
  /** 校验提示弹窗（空清单返回 true 不弹窗）。 */
  openValidationDialog: (items: string[]) => boolean
}

/**
 * 审批意见表单（TaskDetail 页拆分）：意见草稿读写、字段显隐表达式、
 * 值访问与必填校验。
 */
export function useTaskOpinionForm(options: TaskOpinionFormOptions) {
  const { t } = useI18n()
  const { taskId, detail, openValidationDialog } = options

  const opinionComment = ref('')
  const opinionData = ref<Record<string, unknown>>({})
  const opinionDraftSaving = ref(false)
  const opinionDraftRestored = ref(false)

  async function loadOpinionDraft() {
    if (!detail.value?.canHandle) return
    try {
      const draft = await getApprovalOpinionDraft(taskId)
      const form = detail.value.opinionForm
      if (
        draft &&
        (!form?.formId || draft.opinionFormId === form.formId) &&
        (!form?.version || draft.opinionFormVersion === form.version)
      ) {
        opinionComment.value = draft.comment ?? ''
        opinionData.value = { ...draft.opinionData }
        opinionDraftRestored.value = true
      }
    } catch {
      // 暂存读取失败不阻断正式办理，页面给出可重试的保存入口。
    }
  }

  async function saveOpinionDraft() {
    if (opinionDraftSaving.value || !detail.value?.canHandle) return
    opinionDraftSaving.value = true
    try {
      const form = detail.value.opinionForm
      await saveApprovalOpinionDraft(taskId, {
        opinionFormId: form?.formId,
        opinionFormVersion: form?.version,
        comment: opinionComment.value,
        opinionData: { ...opinionData.value },
      })
      // 保存成功仅更新草稿，不代表本次打开时已从服务器恢复。
      opinionDraftRestored.value = false
      ElMessage.success(t('workflow.opinionDraftSaved'))
    } catch (error) {
      ElMessage.error(error instanceof ApiError ? error.msg : t('workflow.opinionDraftSaveFailed'))
    } finally {
      opinionDraftSaving.value = false
    }
  }

  const opinionFields = computed(() => detail.value?.opinionForm?.fields ?? [])

  /** 前端只做显示/初始值计算，后端 ApprovalOpinionValidator 仍是最终权威。 */
  function resolveOpinionVariable(path: string): unknown {
    const normalized = path.trim().replace(/^form\./, '')
    let current: unknown = detail.value?.processVariables?.formData
    for (const part of normalized.split('.')) {
      if (!part || typeof current !== 'object' || current === null) return undefined
      current = (current as Record<string, unknown>)[part]
    }
    return current
  }

  function opinionExpressionMatches(expression: string): boolean {
    const text = expression.trim()
    const match = text.match(
      /^([\w.]+)\s*(===|==|!=|>=|<=|>|<)\s*(?:['"]([^'"]*)['"]|(-?\d+(?:\.\d+)?)|(true|false))$/,
    )
    if (!match) return false
    const left = resolveOpinionVariable(match[1])
    const right: unknown =
      match[3] ?? (match[4] !== undefined ? Number(match[4]) : match[5] === 'true')
    if (match[2] === '==' || match[2] === '===') return String(left) === String(right)
    if (match[2] === '!=') return String(left) !== String(right)
    if (typeof left !== 'number' || typeof right !== 'number') return false
    return match[2] === '>'
      ? left > right
      : match[2] === '>='
        ? left >= right
        : match[2] === '<'
          ? left < right
          : left <= right
  }

  function isOpinionFieldVisible(field: OpinionField): boolean {
    return !field.visibleWhen || opinionExpressionMatches(field.visibleWhen)
  }

  const visibleOpinionFields = computed(() => opinionFields.value.filter(isOpinionFieldVisible))

  function initializeOpinionData(task: TaskDetail) {
    const initial: Record<string, unknown> = {}
    for (const field of task.opinionForm?.fields ?? []) {
      if (!field.initialExpression || !isOpinionFieldVisible(field)) continue
      const value = resolveOpinionVariable(field.initialExpression)
      if (value !== undefined) initial[field.key] = value
    }
    opinionData.value = { ...initial }
  }

  function opinionFieldValue(field: OpinionField): unknown {
    return opinionData.value[field.key]
  }

  function opinionTextValue(field: OpinionField): string | undefined {
    const value = opinionFieldValue(field)
    return value == null ? undefined : String(value)
  }

  function opinionInputValue(field: OpinionField): string | number | undefined {
    const value = opinionFieldValue(field)
    return typeof value === 'number' || typeof value === 'string' ? value : undefined
  }

  function setOpinionFieldValue(key: string, value: unknown) {
    opinionData.value[key] = value
  }

  function opinionInputType(field: OpinionField): string {
    if (field.type === 'DATETIME') return 'datetime-local'
    if (field.type === 'NUMBER') return 'number'
    return 'text'
  }

  function opinionMissingFields() {
    return visibleOpinionFields.value.filter((field) => {
      if (!field.required || field.type === 'NOTE') return false
      const value = opinionData.value[field.key]
      return value == null || (typeof value === 'string' && value.trim() === '')
    })
  }

  const opinionErrorKeys = ref<string[]>([])

  function opinionFieldInvalid(key: string): boolean {
    return (
      opinionErrorKeys.value.includes(key) &&
      opinionMissingFields().some((field) => field.key === key)
    )
  }

  function opinionMissingItems(): string[] {
    return opinionMissingFields().map(
      (field) => t('workflow.validationFillPrefix') + (field.label || field.key),
    )
  }

  function ensureOpinionData(): boolean {
    const missing = opinionMissingFields()
    opinionErrorKeys.value = missing.map((field) => field.key)
    return openValidationDialog(opinionMissingItems())
  }

  return {
    opinionComment,
    opinionData,
    opinionDraftSaving,
    opinionDraftRestored,
    loadOpinionDraft,
    saveOpinionDraft,
    initializeOpinionData,
    visibleOpinionFields,
    opinionFieldValue,
    opinionTextValue,
    opinionInputValue,
    opinionInputType,
    setOpinionFieldValue,
    opinionFieldInvalid,
    ensureOpinionData,
  }
}
