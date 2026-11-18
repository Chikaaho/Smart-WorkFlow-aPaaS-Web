import { computed, onUnmounted, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from '@/locales'
import { ApiError } from '@/foundation/request'
import { getTaskNodeForm, saveTaskNodeFormDraft } from '../api/p64'
import { createFieldScripts, loadScriptOrgContext } from '@/adapters/form-runtime'
import type { ScriptOrgContext } from '@/adapters/form-runtime'
import type { TaskDetail } from '@/contracts/bpm'
import type { FormSchema } from '@/contracts/form-schema'
import type { TaskNodeFormView } from '@/contracts/p64'

/** useTaskNodeForm 入参。 */
export interface TaskNodeFormOptions {
  /** 目标任务号。 */
  taskId: string
  /** 任务详情（响应式，脚本上下文取实例状态/流程变量）。 */
  detail: Ref<TaskDetail | null>
  /** 本次提交的表单记录（表格字段预填来源）。 */
  formRecord: Ref<Record<string, unknown> | null>
}

/**
 * P64 阶段Ⅰ：节点业务表单（绑定任务可填报；草稿/最终提交/已提交回看）。
 * TaskDetail 页拆分：装载/草稿/脚本/必填校验集中于此，页面只做编排。
 */
export function useTaskNodeForm(options: TaskNodeFormOptions) {
  const { t } = useI18n()
  const { taskId, detail, formRecord } = options

  const nodeForm = ref<TaskNodeFormView | null>(null)
  const nodeFormModel = ref<Record<string, unknown>>({})
  const nodeFormErrors = ref<string[]>([])
  const nodeFormSavingDraft = ref(false)

  const nodeFormFields = computed(
    () => (nodeForm.value?.definition?.fields ?? []) as unknown as FormSchema['fields'],
  )
  const nodeFormBound = computed(() => Boolean(nodeForm.value?.bound))
  const nodeFormSubmitted = computed(() => nodeForm.value?.status === 'SUBMITTED')
  /** 待办且未最终提交时可编辑；已提交或历史任务只读回看。 */
  const nodeFormEditable = computed(() => nodeFormBound.value && !nodeFormSubmitted.value)

  /** 组织目录快照：复用选择器的同一授权查询，供节点表单脚本组织函数同步读取。 */
  const scriptOrgContext = ref<ScriptOrgContext | null>(null)

  // BF20261013-021：节点表单字段脚本（值变更触发；onLoad 在装载后执行；只读回看不执行）
  const nodeFieldScripts = createFieldScripts({
    getSchema: () =>
      nodeForm.value
        ? ({ title: '', fields: nodeFormFields.value } as unknown as FormSchema)
        : null,
    model: () => nodeFormModel.value,
    enabled: () => nodeFormEditable.value,
    processContext: () => ({
      status: detail.value?.instanceStatus ?? '',
      taskId: detail.value?.taskId ?? '',
      ...(detail.value?.processVariables ?? {}),
    }),
    formContext: () => ({
      formKey: detail.value?.formKey ?? '',
      version: null,
      submissionId: detail.value?.businessKey ?? '',
    }),
    orgContext: () => scriptOrgContext.value,
  })
  onUnmounted(() => nodeFieldScripts.dispose())

  /** 脚本隐藏的节点字段集合（隐藏不渲染、不参与必填校验、最终提交不携带）。 */
  const nodeFormHiddenAll = computed(() => {
    const hidden = new Set<string>()
    for (const [name, flag] of Object.entries(nodeFieldScripts.overrides.hidden)) {
      if (flag) hidden.add(name)
    }
    return hidden
  })

  /** 渲染用节点字段（脚本隐藏过滤 + 必填覆盖写回，星标/校验同源）。 */
  const nodeFormRenderFields = computed(() =>
    nodeFormFields.value
      .filter((f) => !nodeFormHiddenAll.value.has(f.name))
      .map((f) => {
        const required = nodeFieldScripts.overrides.required[f.name] ?? f.required ?? false
        return required === (f.required ?? false)
          ? f
          : ({ ...f, required } as FormSchema['fields'][number])
      }),
  )

  function nodeFieldRequired(field: FormSchema['fields'][number]): boolean {
    return nodeFieldScripts.overrides.required[field.name] ?? field.required ?? false
  }

  function nodeFieldReadonly(field: FormSchema['fields'][number]): boolean {
    return !nodeFormEditable.value || (nodeFieldScripts.overrides.readonly[field.name] ?? false)
  }

  async function loadNodeForm() {
    try {
      const view = await getTaskNodeForm(taskId)
      nodeForm.value = view
      nodeFormModel.value = { ...(view.data ?? {}) }
      // 装载整体替换模型：重置基线避免装载被当作“值变更”，随后执行 onLoad 脚本
      nodeFieldScripts.resetBaseline()
      if (nodeFormFields.value.some((f) => !!f.script?.code)) {
        try {
          scriptOrgContext.value = await loadScriptOrgContext()
        } catch {
          scriptOrgContext.value = null
        }
      }
      nodeFieldScripts.runOnLoad()
    } catch {
      nodeForm.value = null
    }
  }

  /**
   * 节点表单表格预填（P64 阶段Ⅱ A06）：节点表格字段尚无值时以业务记录现值初始化。
   * 子流程办理人因此只看到本实例授权来源行（行标识随派发冻结），无需手工录入；
   * 记录表为空或节点表单已有值时保持原值（用户编辑不回退）。
   */
  function prefillNodeFormTables() {
    if (!nodeFormEditable.value) return
    const record = formRecord.value as Record<string, unknown> | null
    if (!record) return
    for (const field of nodeFormFields.value) {
      if (field.type !== 'TABLE') continue
      const current = nodeFormModel.value[field.name]
      if (Array.isArray(current) && current.length > 0) continue
      const source = record[field.name]
      if (!Array.isArray(source) || source.length === 0) continue
      nodeFormModel.value = {
        ...nodeFormModel.value,
        [field.name]: source.map((row) => {
          const clean = { ...((row ?? {}) as Record<string, unknown>) }
          delete clean._rowId
          delete clean._rowAction
          return clean
        }),
      }
    }
  }

  watch([nodeForm, formRecord], () => {
    prefillNodeFormTables()
  })

  /** 节点表单必填缺失字段名（单一判定源；内联错误与校验弹窗共用）。 */
  function collectNodeFormMissingLabels(): string[] {
    if (!nodeFormBound.value || nodeFormSubmitted.value) return []
    const missing: string[] = []
    for (const field of nodeFormFields.value) {
      if (nodeFormHiddenAll.value.has(field.name)) continue
      if (!nodeFieldRequired(field)) continue
      const value = nodeFormModel.value[field.name]
      const empty =
        value == null ||
        (typeof value === 'string' && value.trim() === '') ||
        (Array.isArray(value) && value.length === 0)
      if (empty) missing.push(field.label || field.name)
    }
    return missing
  }

  /** 节点表单必填校验（客户端 UX 提示；服务端提交仍全量校验，1401/2433 为权威口径）。 */
  function validateNodeFormRequired(): boolean {
    nodeFormErrors.value = collectNodeFormMissingLabels().map((label) => `${label}: 必填`)
    return nodeFormErrors.value.length === 0
  }

  function nodeFormMissingItems(): string[] {
    return collectNodeFormMissingLabels().map((label) => t('workflow.validationFillPrefix') + label)
  }

  async function handleNodeFormDraft() {
    if (!nodeFormEditable.value || nodeFormSavingDraft.value) return
    nodeFormSavingDraft.value = true
    try {
      await saveTaskNodeFormDraft(taskId, nodeFormModel.value)
      ElMessage.success(t('workflow.taskFormSaved'))
      await loadNodeForm()
    } catch (err) {
      ElMessage.error(err instanceof ApiError ? err.msg : t('workflow.taskFormSaveFailed'))
    } finally {
      nodeFormSavingDraft.value = false
    }
  }

  return {
    nodeFormModel,
    nodeFormErrors,
    nodeFormSavingDraft,
    nodeFormBound,
    nodeFormSubmitted,
    nodeFormEditable,
    nodeFormHiddenAll,
    nodeFormRenderFields,
    nodeFieldReadonly,
    loadNodeForm,
    validateNodeFormRequired,
    nodeFormMissingItems,
    handleNodeFormDraft,
  }
}
