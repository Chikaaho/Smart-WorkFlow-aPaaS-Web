import { computed, ref, watch } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import { ElMessage } from 'element-plus'
import { pageProcessDefs } from '@/modules/workflow/api'
import type { ListAction } from '@/components/page-layout/ListActionsColumn.vue'
import type { ProcessDef } from '@/contracts/bpm'
import {
  buildTriggerConfig,
  buildVariableDef,
  emptyActionDraft,
  emptyBranchDraft,
  emptyTriggerDraft,
  emptyVariableDraft,
  toTriggerDraft,
  toVariableDraft,
  validateTriggerDraft,
  validateVariableDraft,
  compatibleVariableTypes,
} from '@/modules/workflow/utils/p64-orchestration'
import type { TriggerDraft, VariableDraft } from '@/modules/workflow/utils/p64-orchestration'
import { pageFormDefs } from '@/adapters/form-catalog'
import type { DesignerGraph } from './designer-graph'

/** useDesignerVariablesTriggers 入参。 */
export interface DesignerVariablesTriggersOptions {
  /** 设计器图文档（变量/触发器随图保存）。 */
  graph: Ref<DesignerGraph | null>
  /** 模型变更（文档级配置变更）回调。 */
  onModelChanged: () => void
  /** 主表单字段（MAIN_FORM 来源候选）。 */
  mainFormFields: () => Array<{
    name: string
    type: string
    label?: string
    multiple?: boolean
    required?: boolean
  }>
  /** 节点业务表单绑定清单（NODE_FORM 来源候选）。 */
  nodeFormBindings: ComputedRef<Array<{ nodeKey: string; formKey: string; nodeName: string }>>
  /** 表单字段缓存装载。 */
  ensureFormFields: (formKey?: string) => Promise<void>
  /** 表单字段候选。 */
  formFieldOptions: (formKey?: string) => Array<{ name: string; type: string; label?: string }>
  /** 表单字段展示名。 */
  formFieldLabel: (field: { name: string; label?: string }) => string
  /** 图节点清单（触发器源节点校验）。 */
  graphNodes: ComputedRef<Array<{ id: string; type: string; name: string }>>
}

/**
 * P64 阶段Ⅰ：流程变量 / 触发规则配置（弹窗草稿 + 文档级落库）
 * （自 ProcessDesigner.vue 原地迁出，行为不变）。
 */
export function useDesignerVariablesTriggers(options: DesignerVariablesTriggersOptions) {
  const {
    graph,
    onModelChanged,
    mainFormFields,
    nodeFormBindings,
    ensureFormFields,
    formFieldOptions,
    formFieldLabel,
    graphNodes,
  } = options

  const variablesVisible = ref(false)
  const triggersVisible = ref(false)
  const variableDraft = ref<VariableDraft>(emptyVariableDraft())
  const variableEditIndex = ref<number | null>(null)
  const variableErrors = ref<string[]>([])

  function openVariables() {
    variablesVisible.value = true
    resetVariableDraft()
  }

  function resetVariableDraft() {
    variableDraft.value = emptyVariableDraft()
    variableEditIndex.value = null
    variableErrors.value = []
  }

  function editVariable(index: number) {
    const def = graph.value?.variables?.[index]
    if (!def) return
    variableDraft.value = toVariableDraft(def)
    variableEditIndex.value = index
    variableErrors.value = []
  }

  function saveVariable() {
    // BF20261013-022⑦：变量固定 var_ 开头（未输入前缀时自动补齐）
    if (variableDraft.value.varId && !variableDraft.value.varId.startsWith('var_')) {
      variableDraft.value.varId = `var_${variableDraft.value.varId}`
    }
    const existing = (graph.value?.variables ?? []).map((item) => item.varId)
    const pool =
      variableEditIndex.value === null
        ? existing
        : existing.filter((_varId, index) => index !== variableEditIndex.value)
    const errors = validateVariableDraft(variableDraft.value, pool)
    if (errors.length > 0) {
      variableErrors.value = errors
      ElMessage.error(errors[0])
      return
    }
    const list = [...(graph.value?.variables ?? [])]
    const def = buildVariableDef(variableDraft.value)
    if (variableEditIndex.value === null) {
      list.push(def)
    } else {
      list.splice(variableEditIndex.value, 1, def)
    }
    graph.value = { ...(graph.value ?? {}), variables: list } as DesignerGraph
    resetVariableDraft()
    onModelChanged()
  }

  function removeVariable(index: number) {
    const list = [...(graph.value?.variables ?? [])]
    list.splice(index, 1)
    graph.value = { ...(graph.value ?? {}), variables: list } as DesignerGraph
    onModelChanged()
  }

  /* P64 变量创建：来源/字段/类型/聚合必须与校验器同口径，不能只填标识和名称。 */
  const VARIABLE_TYPE_LABELS: Record<string, string> = {
    NUMBER: '数字',
    STRING: '文本',
    BOOLEAN: '布尔',
    USER: '用户',
    DEPT: '部门',
    USER_SET: '用户集合',
    DEPT_SET: '部门集合',
    ROWS: '明细行',
  }
  const VARIABLE_SOURCE_LABELS: Record<string, string> = {
    MAIN_FORM: '主表字段',
    NODE_FORM: '节点表单',
    SYSTEM: '系统字段',
  }
  const VARIABLE_AGGREGATION_LABELS: Record<string, string> = {
    NONE: '不聚合',
    UNION: '并集去重',
    CONCAT: '拼接',
  }

  const variableSourceFormKey = computed(() => {
    const nodeKey = variableDraft.value.sourceNodeKey
    return nodeFormBindings.value.find((item) => item.nodeKey === nodeKey)?.formKey ?? ''
  })

  function onVariableSourceFieldChange(fieldName: string) {
    const field = mainFormFields().find((item) => item.name === fieldName)
    if (!field) return
    const type = compatibleVariableTypes(field.type, Boolean(field.multiple))[0]
    if (type) variableDraft.value.type = type
    if (!variableDraft.value.name.trim()) variableDraft.value.name = field.label || field.name
  }

  function onVariableSourceChange() {
    variableDraft.value.sourceField = ''
    variableDraft.value.sourceNodeKey = ''
    variableDraft.value.sourceFormField = ''
  }

  function onVariableSourceNodeChange(nodeKey: string) {
    variableDraft.value.sourceFormField = ''
    const binding = nodeFormBindings.value.find((item) => item.nodeKey === nodeKey)
    if (binding) void ensureFormFields(binding.formKey)
  }

  function onVariableNodeFieldChange(fieldName: string) {
    const field = formFieldOptions(variableSourceFormKey.value).find(
      (item) => item.name === fieldName,
    )
    if (!field) return
    const type = compatibleVariableTypes(field.type, false)[0]
    if (type) variableDraft.value.type = type
    if (!variableDraft.value.name.trim()) variableDraft.value.name = field.label || field.name
  }

  /* ─── BF20261013-018：P64 配置面板业务化文案（枚举值不变，仅展示中文化） ─── */

  /** 触发时机展示名。 */
  const TRIGGER_EVENT_LABELS: Record<string, string> = {
    TASK_SUBMITTED: '任务提交时',
    NODE_ROUND_COMPLETED: '节点结束',
    PROCESS_COMPLETED: '流程结束',
    NODE_ENTERING: '节点开始前',
    PROCESS_START: '流程发起',
  }

  /** 判断结果类型展示名。 */
  const MATCH_TYPE_LABELS: Record<string, string> = {
    NUMBER: '数字',
    STRING: '文本',
    BOOLEAN: '是/否',
  }

  /** 动作发起方式展示名。 */
  const ACTION_TYPE_LABELS: Record<string, string> = {
    START_SINGLE: '发起一个流程',
    START_EACH: '按集合逐条发起',
    START_GROUPED: '按分组批量发起',
  }

  /** 子流程继续条件展示名。 */
  const WAIT_POLICY_LABELS: Record<string, string> = {
    ALL: '全部子流程完成',
    ANY: '任一子流程完成',
    COUNT: '完成数量达到设定值',
    NONE: '不等待（立即继续）',
  }

  /** 枚举值 → 展示名（缺映射回退原值，保证未知枚举可诊断）。 */
  function labelOf(labels: Record<string, string>, value: string | undefined): string {
    if (!value) return ''
    return labels[value] ?? value
  }

  const triggerDraft = ref<TriggerDraft>(emptyTriggerDraft())
  const triggerEditIndex = ref<number | null>(null)
  const triggerErrors = ref<string[]>([])
  /**
   * P64 审查01 P1-03：触发动作目标按业务名称选择已发布流程/表单；
   * allow-create 保留手输 defKey/formKey 的可选逃生口。
   */
  const publishedTargetOptions = ref<{
    defs: Array<{ key: string; name: string; formKey?: string }>
    forms: Array<{ key: string; name: string }>
  }>({ defs: [], forms: [] })

  /** BF20261013-019：目标选项进程内只装载一次（触发器弹窗与审批节点面板共用）。 */
  let publishedTargetsLoaded = false

  async function loadPublishedTargetOptions() {
    try {
      const [defsPage, formsPage] = await Promise.all([
        pageProcessDefs({ pageNum: 1, pageSize: 200 }),
        // BF20261013-020：触发动作目标是业务表单——审批意见表单归流程管理，不进入候选
        pageFormDefs({ pageNum: 1, pageSize: 200 }, undefined, 'BUSINESS'),
      ])
      // 后端分页实际承载字段为 records（PageResult.list 兼容别名），此处按运行时形态归一
      const defRows = ((defsPage as unknown as { records?: ProcessDef[] }).records ??
        defsPage.list ??
        []) as ProcessDef[]
      publishedTargetOptions.value = {
        defs: defRows
          .filter((def) => def.status === 'PUBLISHED')
          .map((def) => ({
            key: String(def.processKey ?? ''),
            name: def.name,
            formKey: String(def.formKey ?? ''),
          })),
        forms: (formsPage.list ?? [])
          .filter((form) => form.status === 'PUBLISHED')
          .map((form) => ({ key: form.formKey, name: form.name ?? form.formKey })),
      }
    } catch {
      // 目标选项加载失败不阻断面板：保留 allow-create 手输路径
      publishedTargetOptions.value = { defs: [], forms: [] }
    }
  }

  /** 审批节点面板装载目标选项（进程内一次；BF20261013-019/027）。 */
  function ensurePublishedTargets() {
    if (!publishedTargetsLoaded) {
      publishedTargetsLoaded = true
      void loadPublishedTargetOptions()
    }
  }

  function openTriggers() {
    triggersVisible.value = true
    resetTriggerDraft()
    void loadPublishedTargetOptions()
  }

  /** 动作目标表单字段随选择加载（目标字段按业务字段选择，非手写内部名）。 */
  watch(
    () =>
      (triggerDraft.value.branches ?? [])
        .flatMap((branch) => branch.actions ?? [])
        .map((action) => action.targetFormKey),
    (keys) => {
      for (const key of keys) void ensureFormFields(key)
    },
    { immediate: true },
  )

  function resetTriggerDraft() {
    triggerDraft.value = emptyTriggerDraft()
    triggerEditIndex.value = null
    triggerErrors.value = []
  }

  function editTrigger(index: number) {
    const config = graph.value?.triggers?.[index]
    if (!config) return
    triggerDraft.value = toTriggerDraft(config)
    triggerEditIndex.value = index
    triggerErrors.value = []
  }

  function knownVarIds(): string[] {
    return (graph.value?.variables ?? []).map((item) => item.varId)
  }

  function saveTrigger() {
    const existing = (graph.value?.triggers ?? []).map((item) => item.triggerId)
    const pool =
      triggerEditIndex.value === null
        ? existing
        : existing.filter((_triggerId, index) => index !== triggerEditIndex.value)
    const errors = validateTriggerDraft(
      triggerDraft.value,
      pool,
      knownVarIds(),
      graphNodes.value.map((node) => node.id),
    )
    if (errors.length > 0) {
      triggerErrors.value = errors
      ElMessage.error(errors[0])
      return
    }
    const list = [...(graph.value?.triggers ?? [])]
    const config = buildTriggerConfig(triggerDraft.value)
    if (triggerEditIndex.value === null) {
      list.push(config)
    } else {
      list.splice(triggerEditIndex.value, 1, config)
    }
    graph.value = { ...(graph.value ?? {}), triggers: list } as DesignerGraph
    resetTriggerDraft()
    onModelChanged()
  }

  function removeTrigger(index: number) {
    const list = [...(graph.value?.triggers ?? [])]
    list.splice(index, 1)
    graph.value = { ...(graph.value ?? {}), triggers: list } as DesignerGraph
    onModelChanged()
  }

  function moveTrigger(index: number, offset: number) {
    const list = [...(graph.value?.triggers ?? [])]
    const target = index + offset
    if (target < 0 || target >= list.length) return
    const [item] = list.splice(index, 1)
    list.splice(target, 0, item)
    graph.value = { ...(graph.value ?? {}), triggers: list } as DesignerGraph
    onModelChanged()
  }

  /** B021-012：变量/触发器操作列复用统一组件（分隔线节奏 + ⋯ 收纳）；行对象按同一数组定位索引 */
  function variableActions(row: unknown): ListAction[] {
    const index = (graph.value?.variables ?? []).findIndex((item) => item === row)
    return [
      { key: 'edit', label: '编辑', onClick: () => editVariable(index) },
      { key: 'remove', label: '删除', type: 'danger', onClick: () => removeVariable(index) },
    ]
  }

  function triggerActions(row: unknown): ListAction[] {
    const list = graph.value?.triggers ?? []
    const index = list.findIndex((item) => item === row)
    return [
      { key: 'up', label: '上移', disabled: index <= 0, onClick: () => moveTrigger(index, -1) },
      {
        key: 'down',
        label: '下移',
        disabled: index < 0 || index === list.length - 1,
        onClick: () => moveTrigger(index, 1),
      },
      { key: 'edit', label: '编辑', onClick: () => editTrigger(index) },
      { key: 'remove', label: '删除', type: 'danger', onClick: () => removeTrigger(index) },
    ]
  }

  /** JSON 批量导入（模板/批量配置场景）：解析后整体替换，发布校验仍为权威。 */

  function addTriggerBranch() {
    triggerDraft.value.branches.push(emptyBranchDraft())
  }

  function addTriggerAction(branchIndex: number) {
    triggerDraft.value.branches[branchIndex]?.actions.push(emptyActionDraft())
  }
  /** P64 阶段Ⅱ：行级/主记录回写映射行增删（子流程配置面板）。 */
  function addChildWbField(branchIndex: number, actionIndex: number, kind: 'row' | 'main') {
    const action = triggerDraft.value.branches[branchIndex]?.actions[actionIndex]
    if (!action) return
    const target = kind === 'row' ? action.wbFields : action.wbMainFields
    target.push({ fromField: '', toField: '' })
  }

  function removeChildWbField(
    branchIndex: number,
    actionIndex: number,
    kind: 'row' | 'main',
    index: number,
  ) {
    const action = triggerDraft.value.branches[branchIndex]?.actions[actionIndex]
    if (!action) return
    const target = kind === 'row' ? action.wbFields : action.wbMainFields
    if (target.length <= 1) {
      target.splice(0, 1, { fromField: '', toField: '' })
      return
    }
    target.splice(index, 1)
  }

  function addTriggerMapping(branchIndex: number, actionIndex: number) {
    const action = triggerDraft.value.branches[branchIndex]?.actions[actionIndex]
    action?.mapping.push({ targetField: '', sourceVarId: '', itemField: '', literal: '' })
  }

  return {
    variablesVisible,
    triggersVisible,
    variableDraft,
    variableEditIndex,
    variableErrors,
    openVariables,
    resetVariableDraft,
    editVariable,
    saveVariable,
    removeVariable,
    VARIABLE_TYPE_LABELS,
    VARIABLE_SOURCE_LABELS,
    VARIABLE_AGGREGATION_LABELS,
    variableSourceFormKey,
    onVariableSourceFieldChange,
    onVariableSourceChange,
    onVariableSourceNodeChange,
    onVariableNodeFieldChange,
    TRIGGER_EVENT_LABELS,
    MATCH_TYPE_LABELS,
    ACTION_TYPE_LABELS,
    WAIT_POLICY_LABELS,
    labelOf,
    formFieldLabel,
    triggerDraft,
    triggerEditIndex,
    triggerErrors,
    publishedTargetOptions,
    loadPublishedTargetOptions,
    ensurePublishedTargets,
    openTriggers,
    resetTriggerDraft,
    editTrigger,
    saveTrigger,
    removeTrigger,
    moveTrigger,
    variableActions,
    triggerActions,
    addTriggerBranch,
    addTriggerAction,
    addChildWbField,
    removeChildWbField,
    addTriggerMapping,
  }
}
