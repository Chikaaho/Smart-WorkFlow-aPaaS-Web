import { computed, ref, watch } from 'vue'
import type { ComputedRef, Ref, ShallowRef } from 'vue'
import { useI18n } from '@/locales'
import type { BpmNodeCapability, BpmNodeConfigField } from '@/contracts/bpm-node'
import type { PositionedNode, DesignerModel } from '@/adapters/process-graph'
import {
  NODE_ALLOWED_ACTION_VALUES,
  resolveNodeAllowedActions,
} from '@/modules/workflow/utils/node-capabilities'
import {
  effectiveFieldState,
  setFieldState,
  type NodeFieldState,
  type NodeFieldStates,
} from '@/modules/workflow/utils/node-field-states'
import type { DesignerGraph, GraphAdvancedConfig } from './designer-graph'
import { isApproverSelectionField } from './use-designer-participant'

/** useDesignerPropsForm 入参。 */
export interface DesignerPropsFormOptions {
  /** 当前选中节点。 */
  selectedNode: ComputedRef<PositionedNode | null>
  /** 选中节点对应的服务端能力（configFields 契约）。 */
  selectedCapability: ComputedRef<BpmNodeCapability | null>
  /** 节点业务表单可绑定（高级页签承载条件之一）。 */
  nodeFormCapable: () => boolean
  /** 画布节点清单（可退回节点候选）。 */
  canvasNodes: () => PositionedNode[]
  /** 当前选中元素 id。 */
  selectionId: Ref<string | null>
  /** 版本预览态（预览只读，禁用配置写入）。 */
  isVersionPreview: ComputedRef<boolean>
  /** 参与人面板字段（propForm 草稿排除该键；高级页签承载条件之一）。 */
  participantField: () => BpmNodeConfigField | null
  /** 动态并行面板激活（通用字段清单排除整表）。 */
  dynamicParallelActive: () => boolean
  /** 主表单字段（字段三态页签清单）。 */
  mainFormFields: () => Array<{ name: string; type: string; label?: string }>
  /** 设计器图文档（高级配置元数据 advancedConfig 来源）。 */
  graph: Ref<DesignerGraph | null>
  /** 画布模型（非响应式实例）。 */
  model: ShallowRef<DesignerModel | null>
  /** 画布变更后的快照回调。 */
  snapshot: () => void
  /** 保存草稿（高级配置弹窗保存按钮沿用既有链路）。 */
  save: () => Promise<boolean>
}

/**
 * 节点属性面板通用状态：propForm 草稿 / 会签结算 / 字段三态 / 操作设置 820 面 /
 * 监听器元数据 / 高级配置元数据（自 ProcessDesigner.vue 原地迁出，行为不变）。
 */
export function useDesignerPropsForm(options: DesignerPropsFormOptions) {
  const {
    selectedNode,
    selectedCapability,
    nodeFormCapable,
    canvasNodes,
    selectionId,
    isVersionPreview,
    participantField,
    dynamicParallelActive,
    mainFormFields,
    graph,
    model,
    snapshot,
    save,
  } = options
  const { t } = useI18n()

  /* ── BF20261013-013：节点「字段属性」页签（必填/编辑/隐藏三态） ── */

  /** 节点属性面板页签；切换节点时回到「基础属性」。 */
  const nodePropsTab = ref<'basic' | 'fields' | 'advanced'>('basic')

  /** 字段属性仅对非结束节点开放（Owner：流程图除结束的所有节点）。 */
  const fieldConfigCapable = computed(
    () => selectedNode.value != null && selectedNode.value.type !== 'END',
  )

  /** BF20261013-022①：节点触发器支持的节点（排除网关/开始/结束/校验等非业务节点）。 */
  const NODE_TRIGGER_EXCLUDED_TYPES = ['START', 'END', 'CONDITION', 'GATEWAY', 'P57_VERIFY']
  const nodeTriggerCapable = computed(
    () =>
      selectedNode.value != null &&
      !NODE_TRIGGER_EXCLUDED_TYPES.includes(selectedNode.value.type ?? ''),
  )

  /** 高级页签承载节点脚本、子流程、审批意见表单与 allowedActions 操作设置。 */
  const allowedActionsField = computed(
    () =>
      selectedCapability.value?.configFields?.find((field) => field.key === 'allowedActions') ??
      null,
  )
  const advancedConfigCapable = computed(
    () =>
      selectedNode.value != null &&
      selectedNode.value.type !== 'END' &&
      (nodeTriggerCapable.value ||
        nodeFormCapable() ||
        selectedNode.value.type === 'APPROVAL' ||
        !!allowedActionsField.value),
  )

  /* 审查23 D08-F：字段页签顶部字段搜索（仅过滤列表，不改变权限绑定） */
  const fieldPermKeyword = ref('')

  const fieldPermVisibleFields = computed(() => {
    const keyword = fieldPermKeyword.value.trim().toLowerCase()
    if (!keyword) return mainFormFields()
    return mainFormFields().filter(
      (f) =>
        f.name.toLowerCase().includes(keyword) || (f.label || '').toLowerCase().includes(keyword),
    )
  })

  const nodeFieldStates = computed<NodeFieldStates>(() => {
    const config = (selectedNode.value?.config ?? {}) as { fieldStates?: NodeFieldStates }
    return config.fieldStates ?? {}
  })

  function fieldStateOf(field: { name: string; required?: boolean }): NodeFieldState {
    return effectiveFieldState(nodeFieldStates.value, field)
  }

  function onFieldStateChange(
    field: { name: string; required?: boolean },
    key: keyof NodeFieldState,
    value: unknown,
  ) {
    if (!selectedNode.value || !model.value || isVersionPreview.value) return
    model.value.updateNodeConfig(selectedNode.value.id, {
      fieldStates: setFieldState(nodeFieldStates.value, field, key, Boolean(value)),
    })
    snapshot()
  }

  /** 选中节点 config 元数据（节点编号/审批方式/监听器；定义下发，只读展示）。 */
  interface NodeListenerMeta {
    phase: 'before' | 'after'
    label: string
    bean: string
    note: string
  }
  const nodeMeta = computed<{
    nodeKey: string
    approveMode: string
    approveModeLabel: string
    approverName: string
    listeners: NodeListenerMeta[]
  }>(() => {
    const config = (selectedNode.value?.config ?? {}) as Record<string, unknown>
    const listeners = Array.isArray(config.listeners)
      ? (config.listeners as NodeListenerMeta[])
      : []
    const mode = typeof config.approveMode === 'string' ? config.approveMode : ''
    const modeLabels: Record<string, string> = {
      ALL: '全部同意',
      ANY: '任一同意',
      RATIO: '比例通过',
      VETO: '一票否决',
    }
    return {
      nodeKey: typeof config.nodeKey === 'string' ? config.nodeKey : '',
      approveMode: mode,
      approveModeLabel: modeLabels[mode] ?? (mode ? '会签' : ''),
      approverName: typeof config.approverName === 'string' ? config.approverName : '',
      listeners,
    }
  })

  /* ─────────── 面板/属性 ─────────── */

  /** 能力 configFields → 表单草稿（object 类型拆 participant.strategy/value） */
  const propForm = ref<Record<string, unknown>>({})

  /**
   * 节点名称逐字写入：ElInput 的 input 事件早于 v-model 回写，
   * 若直接读 propForm 会晚一拍；这里以事件值为准立即同步画布标签。
   */
  function onNodeNameInput(value: string) {
    propForm.value = { ...propForm.value, name: value }
    applyProps()
  }

  function applyProps() {
    if (!selectedNode.value || !model.value || isVersionPreview.value) return
    const patch: Record<string, unknown> = { ...propForm.value }
    // object 类型字段以 JSON 文本编辑，提交前解析回对象（服务端契约要求对象形态）
    for (const field of selectedCapability.value?.configFields ?? []) {
      const raw = patch[field.key]
      if (field.type === 'object' && typeof raw === 'string') {
        try {
          patch[field.key] = JSON.parse(raw) as unknown
        } catch {
          // 保留字符串，由服务端校验报错（错误定位回画布）
        }
      }
    }
    model.value.updateNodeConfig(selectedNode.value.id, patch)
    // 模型非响应式：属性变更后推进快照 serial，画布标签/配置立即重绘。
    snapshot()
  }

  /* ─────────── 会签结算：人数 / 比例（0.1.10） ─────────── */
  const CONSENSUS_MODE_OPTIONS = [
    { label: '人数', value: 'COUNT' },
    { label: '比例', value: 'RATIO' },
    { label: '全部通过', value: 'ALL' },
    { label: '一票否决', value: 'VETO' },
    { label: '任一通过', value: 'ANY' },
  ] as const

  function isPositiveInteger(value: unknown) {
    return typeof value === 'number' && Number.isInteger(value) && value >= 1
  }

  function onConsensusModeChange(value: string) {
    const next: Record<string, unknown> = { ...propForm.value, mode: value }
    // 切换口径时把另一口径的越界值收敛到合法缺省，避免把 67 人当 67% 或反之。
    if (value === 'COUNT' && !isPositiveInteger(next.ratio)) next.ratio = 1
    if (value === 'RATIO' && !isPositiveInteger(next.ratio)) next.ratio = 100
    if (value === 'RATIO' && typeof next.ratio === 'number' && next.ratio > 100) next.ratio = 100
    propForm.value = next
    applyProps()
  }

  function onConsensusRatioChange(value: number | null | undefined) {
    propForm.value = { ...propForm.value, ratio: value ?? 1 }
    applyProps()
  }

  const consensusRatioLabel = computed(() =>
    propForm.value.mode === 'COUNT' ? '通过人数' : '通过比例',
  )

  /* ─────────── P63 参与人/动态并行面板共用的分段排序（会签通过条件同构） ─────────── */

  const CONSENSUS_MODE_SEGMENT_ORDER = ['ALL', 'RATIO', 'COUNT'] as const
  type ConsensusModeOption = { label: string; value: string }
  const consensusModeSegments = computed<ConsensusModeOption[]>(() => {
    const all: ConsensusModeOption[] = CONSENSUS_MODE_OPTIONS.map((option) => ({
      label: option.label,
      value: option.value,
    }))
    const head = CONSENSUS_MODE_SEGMENT_ORDER.map((value) =>
      all.find((option) => option.value === value),
    ).filter((option): option is ConsensusModeOption => Boolean(option))
    const tail = all.filter(
      (option) => !(CONSENSUS_MODE_SEGMENT_ORDER as readonly string[]).includes(option.value),
    )
    return [...head, ...tail]
  })

  /** BF20261013-027：可退回节点候选=本流程内其它人工节点（审批/会签），值=节点编号。 */
  const returnTargetCandidates = computed(() =>
    (canvasNodes() ?? [])
      .filter((item) => item.type === 'APPROVAL' || item.type === 'CONSENSUS')
      .filter((item) => item.id !== selectionId.value)
      .map((item) => ({ id: item.id, label: item.label || item.id })),
  )

  /** 可退回节点已选值（数组；兼容旧图逗号分隔文本）。 */
  const returnTargetsValue = computed<string[]>(() => {
    const raw = propForm.value['returnTargets']
    if (Array.isArray(raw)) return raw.map((item) => String(item))
    if (typeof raw === 'string' && raw.trim()) {
      return raw
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    }
    return []
  })

  function onReturnTargetsChange(value: string[]) {
    propForm.value['returnTargets'] = value
    applyProps()
  }

  function isArrayConfigField(field: BpmNodeConfigField): boolean {
    const type = field.type.toLowerCase()
    return field.key === 'allowedActions' || type === 'array' || type === 'multiselect'
  }

  function configArrayValues(field: BpmNodeConfigField): unknown {
    return (
      field.validation?.['values'] ??
      field.validation?.['options'] ??
      field.validation?.['allowedActions']
    )
  }

  function configArrayOptions(field: BpmNodeConfigField): Array<{ value: string; label: string }> {
    const declared = configArrayValues(field)
    const values =
      Array.isArray(declared) && declared.length > 0
        ? declared.map((item) => String(item))
        : field.key === 'allowedActions'
          ? [...NODE_ALLOWED_ACTION_VALUES]
          : []
    return values.map((value) => ({
      value,
      label: field.key === 'allowedActions' ? allowedActionLabel(value) : value,
    }))
  }

  function allowedActionLabel(action: string): string {
    const labels: Record<string, string> = {
      APPROVE: t('common.approve'),
      DISAPPROVE: t('workflow.disapprove'),
      REJECT: t('common.reject'),
      RETURN: t('common.returnBack'),
      TRANSFER: t('workflow.transferOwnTask'),
      DELEGATE: t('workflow.delegateAction'),
      COMMUNICATE: t('workflow.consultTask'),
      ADD_SIGN: t('workflow.addSign'),
    }
    return labels[action] ?? action
  }

  function configArrayValue(fieldKey: string): string[] {
    const raw = propForm.value[fieldKey]
    if (Array.isArray(raw)) return raw.map((item) => String(item))
    if (typeof raw === 'string' && raw.trim()) {
      return raw
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    }
    return []
  }

  function onConfigArrayChange(fieldKey: string, value: unknown): void {
    propForm.value = {
      ...propForm.value,
      [fieldKey]: Array.isArray(value) ? value.map((item) => String(item)) : [],
    }
    applyProps()
  }

  /* ── Q12（278:1567）：节点操作 820 设置面，弹窗内只维护本地草稿 ── */
  const opSettingsVisible = ref(false)
  const opDraft = ref<string[]>([])
  const opOpenValue = ref<string[]>([])
  const opOptions = computed<Array<{ value: string; label: string }>>(() =>
    allowedActionsField.value ? configArrayOptions(allowedActionsField.value) : [],
  )
  /** 高级面板回显：真实选中项或未设置（空集合不冒充默认值）。 */
  const allowedActionSummary = computed(() => {
    const values = configArrayValue('allowedActions')
    if (!values.length) return '未设置'
    return `允许${values.map((value) => allowedActionLabel(value)).join('、')}`
  })

  function openOpSettings(): void {
    if (!allowedActionsField.value || isVersionPreview.value) return
    opOpenValue.value = [...configArrayValue('allowedActions')]
    opDraft.value = [...opOpenValue.value]
    opSettingsVisible.value = true
  }

  function confirmOpSettings(): void {
    const next = [...opDraft.value]
    const opened = opOpenValue.value
    const changed = next.length !== opened.length || next.some((value) => !opened.includes(value))
    opSettingsVisible.value = false
    // 未改动时不写回，保留既有“未设置沿用现有操作”的配置语义
    if (changed) onConfigArrayChange('allowedActions', next)
  }

  /** 通用字段渲染清单：name 由顶部承载；参与人字段由结构化面板承载；动态并行整表由专属面板承载；
   * nodeForm 由 P64 节点业务表单选择器承载；waitActionIds 不再手工配置（BF20261013-019，由设计器自动接线）。 */
  const genericConfigFields = computed(() => {
    const fields = selectedCapability.value?.configFields ?? []
    if (dynamicParallelActive()) return []
    // 1.2.0 P67 / E1-1 修复：绑定与映射由 Graph 执行器专属面板承载（下拉选图/版本/映射），
    // name/inputMappings/outputMappings 也从通用渲染中剔除（review-120-02：重复字段）
    if (selectedNode.value?.type === 'GRAPH_EXEC') {
      return fields.filter(
        (field) =>
          !['graphDefId', 'graphDefVersion', 'name', 'inputMappings', 'outputMappings'].includes(
            field.key,
          ),
      )
    }
    const participantKey = participantField()?.key
    return fields.filter(
      (field) =>
        field.key !== 'name' &&
        field.key !== participantKey &&
        field.key !== 'nodeForm' &&
        field.key !== 'waitActionIds' &&
        field.key !== 'allowedActions' &&
        // BF20261013-022③④：object 型 JSON 文本配置与「审批人（兼容）」不再渲染
        field.type !== 'object' &&
        !isApproverSelectionField(field),
    )
  })

  /* ─────────── P53 流程高级配置弹窗（只读呈现定义元数据） ─────────── */

  /** 流程高级配置弹窗（P53 节点13）：只读呈现已加载定义的真实信息，不新增任何端点。 */
  const advancedConfigVisible = ref(false)
  const advConfig = computed<GraphAdvancedConfig | undefined>(
    () => (graph.value as { advancedConfig?: GraphAdvancedConfig } | null)?.advancedConfig,
  )
  const advChannels = computed(() => advConfig.value?.notifyChannels ?? [])

  /** 保存配置（设计13 footer）：走既有流程草稿保存链路，关闭弹窗。 */
  function onSaveAdvancedConfig() {
    advancedConfigVisible.value = false
    void save()
  }

  /**
   * 选中节点 → 面板草稿回显：
   * - object 类型字段（configFields.type === 'object'）回显为 JSON 文本，
   *   避免输入框显示 [object Object]；applyProps 提交前解析回对象；
   * - 参与人字段由结构化面板承载（participantForm），不进入通用 JSON 文本草稿；
   * - 动态并行节点 config 整体进入专属面板草稿。
   */
  watch(selectedNode, (node, prev) => {
    // 仅切换节点时回到「基础属性」（同节点重选/保存回流不打断当前页签）
    if ((node?.id ?? null) !== (prev?.id ?? null)) nodePropsTab.value = 'basic'
    if (!node) {
      propForm.value = {}
      return
    }
    const fields = selectedCapability.value?.configFields ?? []
    const participantKey = participantField()?.key
    const draft: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(node.config ?? {})) {
      if (key === participantKey) continue
      const field = fields.find((f) => f.key === key)
      draft[key] =
        field?.type === 'object' && value !== null && typeof value === 'object'
          ? JSON.stringify(value)
          : value
    }
    const allowedActionsFieldLocal = fields.find((field) => field.key === 'allowedActions')
    if (allowedActionsFieldLocal && !('allowedActions' in (node.config ?? {}))) {
      draft.allowedActions = resolveNodeAllowedActions(
        undefined,
        configArrayValues(allowedActionsFieldLocal),
      )
    }
    // 会签：旧图缺 mode 时按后端 ALL 缺省回显；人数模式缺人数时给合法缺省
    if (node.type === 'CONSENSUS') {
      if (draft.mode == null) draft.mode = 'ALL'
      if (draft.mode === 'COUNT' && !isPositiveInteger(draft.ratio)) draft.ratio = 1
    }
    propForm.value = draft
  })

  return {
    nodePropsTab,
    fieldConfigCapable,
    nodeTriggerCapable,
    advancedConfigCapable,
    fieldPermKeyword,
    fieldPermVisibleFields,
    fieldStateOf,
    onFieldStateChange,
    nodeMeta,
    propForm,
    onNodeNameInput,
    applyProps,
    consensusModeSegments,
    consensusRatioLabel,
    onConsensusModeChange,
    onConsensusRatioChange,
    returnTargetCandidates,
    returnTargetsValue,
    onReturnTargetsChange,
    isArrayConfigField,
    configArrayValue,
    configArrayOptions,
    onConfigArrayChange,
    allowedActionsField,
    opSettingsVisible,
    opDraft,
    opOptions,
    allowedActionSummary,
    openOpSettings,
    confirmOpSettings,
    genericConfigFields,
    advancedConfigVisible,
    advConfig,
    advChannels,
    onSaveAdvancedConfig,
  }
}
