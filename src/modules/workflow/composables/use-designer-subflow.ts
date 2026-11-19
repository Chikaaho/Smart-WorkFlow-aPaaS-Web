import { computed, ref, watch } from 'vue'
import type { ComputedRef, Ref, ShallowRef } from 'vue'
import { ElMessage } from 'element-plus'
import {
  buildTriggerConfig,
  compatibleVariableTypes,
  DEFAULT_MAX_DISPATCH,
} from '@/modules/workflow/utils/p64-orchestration'
import type { TriggerDraft } from '@/modules/workflow/utils/p64-orchestration'
import type { PositionedNode, DesignerModel } from '@/adapters/process-graph'
import type { DesignerGraph } from './designer-graph'

/** P64 BF20261013-019 / BF20261013-027：审批节点发起子流程（三步向导） */

type SubflowMappingSource = 'FIELD' | 'LITERAL' | 'SCRIPT'

export interface SubflowMappingDraft {
  targetField: string
  source: SubflowMappingSource
  /** 选字段=主表单字段时的变量 varId（同名自动取值）。 */
  sourceVarId: string
  /** 选字段=表格列时的列名（逐行/分组取值）。 */
  itemField: string
  /** 选字段=表格列时所属表格字段名（解析 ROWS 集合变量）。 */
  tableField: string
  literal: string
  script: string
}

export interface SubflowFormDraft {
  enabled: boolean
  targetProcessDefKey: string
  targetFormKey: string
  /** 触发方式：写脚本 / 选字段（字段值为真即发起）。 */
  triggerMode: 'SCRIPT' | 'FIELD' | 'ALWAYS'
  triggerField: string
  script: string
  mappings: SubflowMappingDraft[]
  /**
   * 派发粒度（由数据与「汇总/单独」选择决定，用户不配置条数）：
   * SINGLE=单条；EACH=表格行逐行单独；GROUPED=按列值同值汇总。
   */
  aggregate: 'SINGLE' | 'EACH' | 'GROUPED'
  groupBy: string
  /** 278:1719：编排方式/等待策略/结果回写，写回同一 TriggerAction。 */
  orchestration: 'CHILD' | 'INDEPENDENT'
  waitPolicy: 'ALL' | 'ANY' | 'COUNT' | 'NONE'
  waitCount: number
  wbEnabled: boolean
  wbResultNodeKey: string
  wbTableField: string
  wbRowKeyField: string
  wbParentTableField: string
  wbFields: Array<{ fromField: string; toField: string }>
  wbMainFields: Array<{ fromField: string; toField: string }>
}

function emptySubflowForm(): SubflowFormDraft {
  return {
    enabled: false,
    targetProcessDefKey: '',
    targetFormKey: '',
    triggerMode: 'SCRIPT',
    triggerField: '',
    script: '',
    mappings: [],
    aggregate: 'SINGLE',
    groupBy: '',
    orchestration: 'CHILD',
    waitPolicy: 'ALL',
    waitCount: 1,
    wbEnabled: false,
    wbResultNodeKey: '',
    wbTableField: '',
    wbRowKeyField: '',
    wbParentTableField: '',
    wbFields: [],
    wbMainFields: [],
  }
}

/** useDesignerSubflow 入参。 */
export interface DesignerSubflowOptions {
  /** 设计器图文档（触发规则与变量随图保存）。 */
  graph: Ref<DesignerGraph | null>
  /** 画布模型（非响应式实例）。 */
  model: ShallowRef<DesignerModel | null>
  /** 当前选中节点。 */
  selectedNode: ComputedRef<PositionedNode | null>
  /** 主表单字段（触发字段候选）。 */
  mainFormFields: () => Array<{
    name: string
    type: string
    label?: string
    multiple?: boolean
  }>
  /** 绑定表单已发布 schema（ROWS 集合变量命名回显）。 */
  formSchemaFields: () => Array<{ name: string; label?: string }>
  /** 已发布目标选项（触发器弹窗与审批节点面板共用）。 */
  publishedTargetOptions: Ref<{
    defs: Array<{ key: string; name: string; formKey?: string }>
    forms: Array<{ key: string; name: string }>
  }>
  /** 目标选项装载（进程内一次）。 */
  ensurePublishedTargets: () => void
  /** 模型变更（文档级配置变更）回调。 */
  onModelChanged: () => void
}

/**
 * BF20261013-027：发起子流程向导（触发方式 → 子流程 → 初始值）
 * （自 ProcessDesigner.vue 原地迁出，行为不变）。
 *
 * 「发起子流程」面板草稿。源头真值 = node.config.subflow；应用时同步两类生成物：
 *  1) 触发规则 subflow_<节点id>：本节点任务提交时按判断脚本决定是否发起（返回 1 = 发起）；
 *  2) SUBFLOW_WAIT 等待块（画布名「子流程」）：自动插入本节点出边之后，等本动作全部子流程
 *     完成才放行；判断为「不发起」时无批次，等待块到达即放行（不会卡住流程）。
 * 用户不接触动作 ID：等待引用由设计器自动接线。
 */
export function useDesignerSubflow(options: DesignerSubflowOptions) {
  const {
    graph,
    model,
    selectedNode,
    mainFormFields,
    formSchemaFields,
    publishedTargetOptions,
    ensurePublishedTargets,
    onModelChanged,
  } = options

  const subflowForm = ref<SubflowFormDraft>(emptySubflowForm())

  /** 回写映射回显：只接受对象行，空行保留给用户继续填写。 */
  function normalizeSubflowWbRows(value: unknown): Array<{ fromField: string; toField: string }> {
    if (!Array.isArray(value)) return []
    return value.map((entry) => {
      const row = (entry ?? {}) as Record<string, unknown>
      return { fromField: String(row.fromField ?? ''), toField: String(row.toField ?? '') }
    })
  }

  /** 节点配置 → 面板草稿（兼容 BF022⑧ 旧形状：mode/sourceVariable/取变量值/自由填写）。 */
  function buildSubflowFormDraft(raw: Record<string, unknown> | undefined): SubflowFormDraft {
    const draft = emptySubflowForm()
    if (!raw) return draft
    draft.enabled = Boolean(raw.enabled)
    draft.targetProcessDefKey = String(raw.targetProcessDefKey ?? '')
    draft.targetFormKey = String(raw.targetFormKey ?? '')
    draft.triggerMode =
      raw.triggerMode === 'FIELD' ? 'FIELD' : raw.triggerMode === 'ALWAYS' ? 'ALWAYS' : 'SCRIPT'
    draft.triggerField = String(raw.triggerField ?? '')
    draft.script = String(raw.script ?? '')
    const legacyMode = String(raw.mode ?? '')
    draft.aggregate =
      raw.aggregate === 'EACH' || raw.aggregate === 'GROUPED'
        ? raw.aggregate
        : legacyMode === 'EACH'
          ? 'EACH'
          : 'SINGLE'
    draft.groupBy = String(raw.groupBy ?? '')
    draft.orchestration = raw.orchestration === 'INDEPENDENT' ? 'INDEPENDENT' : 'CHILD'
    const waitPolicy = String(raw.waitPolicy ?? 'ALL')
    draft.waitPolicy =
      waitPolicy === 'ANY' || waitPolicy === 'COUNT' || waitPolicy === 'NONE' ? waitPolicy : 'ALL'
    draft.waitCount = Math.max(1, Number(raw.waitCount ?? 1) || 1)
    draft.wbEnabled = Boolean(raw.wbEnabled)
    draft.wbResultNodeKey = String(raw.wbResultNodeKey ?? '')
    draft.wbTableField = String(raw.wbTableField ?? '')
    draft.wbRowKeyField = String(raw.wbRowKeyField ?? '')
    draft.wbParentTableField = String(raw.wbParentTableField ?? '')
    draft.wbFields = normalizeSubflowWbRows(raw.wbFields)
    draft.wbMainFields = normalizeSubflowWbRows(raw.wbMainFields)
    const mappings = Array.isArray(raw.mappings) ? raw.mappings : []
    draft.mappings = mappings.map((entry) => {
      const mapping = (entry ?? {}) as Record<string, unknown>
      const sourceVarId = String(mapping.sourceVarId ?? '')
      const itemField = String(mapping.itemField ?? '')
      const tableField = String(mapping.tableField ?? '')
      const literal = mapping.literal == null ? '' : String(mapping.literal)
      const script = String(mapping.script ?? '')
      const source: SubflowMappingSource = script
        ? 'SCRIPT'
        : sourceVarId || itemField
          ? 'FIELD'
          : 'LITERAL'
      return {
        targetField: String(mapping.targetField ?? ''),
        source,
        sourceVarId,
        itemField,
        tableField,
        literal,
        script,
      }
    })
    return draft
  }

  function subflowTriggerId(nodeKey: string): string {
    return `subflow_${nodeKey}`
  }
  function subflowWaitNodeId(nodeKey: string): string {
    return `subflow_wait_${nodeKey}`
  }
  function subflowActionId(nodeKey: string): string {
    return `act_subflow_${nodeKey}`
  }

  /* ─────────── BF20261013-027：子流程向导（触发方式 → 子流程 → 初始值） ─────────── */

  const subflowWizardVisible = ref(false)
  const subflowWizardStep = ref(0)
  /** 三步共用表头（34 高）：与既有步骤状态一一对应，不改向导流程。 */
  const subflowStepTitles = ['触发方式', '子流程', '初始值'] as const
  /** 目标子流程绑定表单字段（第③步「子流程表单字段」候选）。 */
  const subflowTargetFields = ref<Array<{ name: string; type: string; label?: string }>>([])

  /** 面板摘要：目标流程名 + 初始值条数 + 派发粒度（条数由数据决定，无条数配置）。 */
  const subflowSummary = computed(() => {
    const form = subflowForm.value
    if (!form.enabled || !form.targetProcessDefKey) return ''
    const def = publishedTargetOptions.value.defs.find(
      (item) => item.key === form.targetProcessDefKey,
    )
    const aggregateLabel =
      form.aggregate === 'GROUPED' ? '同值汇总' : form.aggregate === 'EACH' ? '逐行单独' : ''
    return [
      def ? `${def.name}` : form.targetProcessDefKey,
      `初始值 ${form.mappings.filter((m) => m.targetField.trim()).length} 项`,
      aggregateLabel,
    ]
      .filter(Boolean)
      .join('｜')
  })

  function openSubflowWizard() {
    subflowWizardStep.value = 0
    subflowWizardVisible.value = true
    void loadSubflowTargetFields(subflowForm.value.targetProcessDefKey)
  }

  /** 目标子流程绑定表单字段：已发布流程定义 → formKey → 表单定义。 */
  async function loadSubflowTargetFields(defKey: string) {
    subflowTargetFields.value = []
    if (!defKey) return
    const def = publishedTargetOptions.value.defs.find((item) => item.key === defKey)
    const formKey = def?.formKey || subflowForm.value.targetFormKey
    if (!formKey) return
    try {
      const { getFormDefinition } = await import('@/adapters/form-runtime')
      const schema = await getFormDefinition(formKey)
      subflowTargetFields.value = (schema.fields ?? []) as Array<{
        name: string
        type: string
        label?: string
      }>
    } catch {
      subflowTargetFields.value = []
    }
  }

  /** 开关切换：开启即写入配置并进入向导（未配置完成时只保留开关态，不生成触发/等待块）。 */
  function onSubflowSwitch(value: string | number | boolean) {
    applySubflow()
    if (value) {
      openSubflowWizard()
    }
  }

  function onSubflowWizardClose() {
    // 向导关闭不隐式改开关：未配置完成时保留开关态与草稿，由用户继续配置或手动关闭
  }

  /** 第①步 选字段：确保字段变量存在（var_ 前缀；同名自动取值），并生成等价触发脚本。 */
  function ensureMainFieldVariable(fieldName: string): string | null {
    const field = mainFormFields().find((item) => item.name === fieldName)
    if (!field || !graph.value) return null
    const varId = `var_${field.name}`
    const list = [...(graph.value.variables ?? [])]
    if (!list.some((item) => item.varId === varId)) {
      const type = compatibleVariableTypes(field.type, Boolean(field.multiple))[0]
      if (!type) return null
      list.push({
        varId,
        name: field.label || field.name,
        type,
        source: 'MAIN_FORM',
        sourceField: field.name,
        roundRule: 'CURRENT',
        aggregation: type === 'USER_SET' || type === 'DEPT_SET' ? 'UNION' : 'NONE',
        nullable: true,
      })
      graph.value = { ...(graph.value ?? {}), variables: list } as DesignerGraph
      onModelChanged()
    }
    return varId
  }

  /** 表格列来源：确保 ROWS 集合变量存在（表格字段同名），逐行/汇总派发的集合来源。 */
  function ensureRowsVariable(tableField: string): string | null {
    if (!graph.value || !tableField) return null
    const table = formSchemaFields().find((item) => item.name === tableField)
    const varId = `var_${tableField}`
    const list = [...(graph.value.variables ?? [])]
    if (!list.some((item) => item.varId === varId)) {
      list.push({
        varId,
        name: table?.label || tableField,
        type: 'ROWS',
        source: 'MAIN_FORM',
        sourceField: tableField,
        roundRule: 'CURRENT',
        aggregation: 'NONE',
        nullable: true,
      })
      graph.value = { ...(graph.value ?? {}), variables: list } as DesignerGraph
      onModelChanged()
    }
    return varId
  }

  /** 第①步 选字段 → 触发脚本（字段值为真即发起；与「写脚本」同一执行语义）。 */
  function subflowFieldTriggerScript(fieldName: string): string {
    return `var v = #获取流程变量(var_${fieldName});\nreturn v ? 1 : 0;`
  }

  /** 第①步 选字段：草稿只记字段与等价脚本；变量在「完成」时统一补齐（取消即零改动）。 */
  function onSubflowTriggerFieldChange(fieldName: string) {
    const field = mainFormFields().find((item) => item.name === fieldName)
    if (!field || compatibleVariableTypes(field.type, Boolean(field.multiple)).length === 0) {
      // 字段类型无法映射为变量（如纯展示字段）：不静默降级为「总是发起」
      subflowForm.value.triggerField = ''
      subflowForm.value.script = ''
      ElMessage.warning('该字段类型不可作为触发字段，请换一个字段或改用脚本')
      return
    }
    subflowForm.value.script = subflowFieldTriggerScript(fieldName)
  }

  function addSubflowMapping() {
    subflowForm.value.mappings.push({
      targetField: '',
      source: 'FIELD',
      sourceVarId: '',
      itemField: '',
      tableField: '',
      literal: '',
      script: '',
    })
  }

  function removeSubflowMapping(index: number) {
    subflowForm.value.mappings.splice(index, 1)
  }

  /** 278:1719 结果回写映射行（行级/主记录共用）。 */
  function addSubflowWbRow(kind: 'row' | 'main') {
    const target = kind === 'row' ? subflowForm.value.wbFields : subflowForm.value.wbMainFields
    target.push({ fromField: '', toField: '' })
  }

  function removeSubflowWbRow(kind: 'row' | 'main', index: number) {
    const target = kind === 'row' ? subflowForm.value.wbFields : subflowForm.value.wbMainFields
    target.splice(index, 1)
  }

  /** 第③步 取值方式切换：清掉其他来源，避免多源并存。 */
  function onSubflowMappingSourceChange(mapping: SubflowMappingDraft) {
    mapping.sourceVarId = ''
    mapping.itemField = ''
    mapping.tableField = ''
    mapping.literal = ''
    mapping.script = ''
  }

  /** 第③步：当前行是否来自表格列（决定「汇总/单独」选择与逐行/汇总派发）。 */
  const subflowHasRowSource = computed(() =>
    subflowForm.value.mappings.some((m) => m.source === 'FIELD' && Boolean(m.itemField)),
  )

  /** 第③步：选字段来源的回显值（main:<字段> / table:<表>:<列>）。 */
  function subflowMappingSourceValue(mapping: SubflowMappingDraft): string {
    if (mapping.itemField && mapping.tableField) {
      return `table:${mapping.tableField}:${mapping.itemField}`
    }
    if (mapping.sourceVarId) {
      return `main:${mapping.sourceVarId.replace(/^var_/, '')}`
    }
    return ''
  }

  /** 第②步：选择子流程 → 解析绑定表单并装载初始值候选字段（草稿态，完成时才写回）。 */
  function onSubflowTargetChange(defKey: string) {
    const def = publishedTargetOptions.value.defs.find((item) => item.key === defKey)
    subflowForm.value.targetFormKey = def?.formKey ?? ''
    void loadSubflowTargetFields(defKey)
  }

  /** 向导步骤校验：①触发方式（始终/脚本/字段）②子流程 ③初始值可空。 */
  const subflowStepReady = computed(() => {
    const form = subflowForm.value
    if (subflowWizardStep.value === 0) {
      if (form.triggerMode === 'ALWAYS') return true
      return form.triggerMode === 'FIELD' ? Boolean(form.triggerField) : Boolean(form.script.trim())
    }
    if (subflowWizardStep.value === 1) return Boolean(form.targetProcessDefKey)
    return true
  })

  function finishSubflowWizard() {
    applySubflow()
    subflowWizardVisible.value = false
  }
  /** 第③步 选字段来源：主表单字段 → var（同名自动取值）；表格列 → itemField（逐行/汇总）。 */
  function onSubflowMappingFieldChange(mapping: SubflowMappingDraft, value: string) {
    mapping.sourceVarId = ''
    mapping.itemField = ''
    mapping.tableField = ''
    if (value.startsWith('table:')) {
      const [, tableField, column] = value.split(':')
      mapping.tableField = tableField
      mapping.itemField = column
      if (subflowForm.value.aggregate === 'SINGLE') subflowForm.value.aggregate = 'EACH'
    } else {
      mapping.sourceVarId = `var_${value.replace(/^main:/, '')}`
    }
  }

  /** 应用「发起子流程」：写回节点配置并同步触发规则与等待块（重复应用 = 原地更新）。 */
  function applySubflow() {
    if (!model.value || !graph.value) return
    const node = selectedNode.value
    if (!node || node.type !== 'APPROVAL') return
    const form = subflowForm.value
    // 引用到的来源字段/表格列在「完成」时统一补齐变量（取消向导则零改动）
    if (form.triggerMode === 'FIELD' && form.triggerField) {
      ensureMainFieldVariable(form.triggerField)
    }
    for (const mapping of form.mappings) {
      if (mapping.source !== 'FIELD') continue
      if (mapping.tableField) ensureRowsVariable(mapping.tableField)
      else if (mapping.sourceVarId)
        ensureMainFieldVariable(mapping.sourceVarId.replace(/^var_/, ''))
    }
    const rowMappings = form.mappings.filter((m) => m.source === 'FIELD' && m.itemField)
    // 派发粒度由数据来源决定：无表格列=单条；有表格列按「汇总/单独」选择
    const aggregate: SubflowFormDraft['aggregate'] =
      rowMappings.length === 0 ? 'SINGLE' : form.aggregate === 'GROUPED' ? 'GROUPED' : 'EACH'
    const sourceVariable =
      rowMappings.length === 0 ? '' : (ensureRowsVariable(rowMappings[0].tableField) ?? '')
    const groupBy = aggregate === 'GROUPED' ? (rowMappings[0]?.itemField ?? '') : ''
    model.value.updateNodeConfig(node.id, {
      subflow: {
        enabled: form.enabled,
        targetProcessDefKey: form.targetProcessDefKey,
        targetFormKey: form.targetFormKey,
        triggerMode: form.triggerMode,
        triggerField: form.triggerField,
        script: form.script,
        aggregate,
        groupBy,
        orchestration: form.orchestration,
        waitPolicy: form.waitPolicy,
        waitCount: form.waitPolicy === 'COUNT' ? Math.max(1, form.waitCount) : 1,
        wbEnabled: form.orchestration === 'CHILD' && form.wbEnabled,
        wbResultNodeKey: form.wbResultNodeKey,
        wbTableField: form.wbTableField,
        wbRowKeyField: form.wbRowKeyField,
        wbParentTableField: form.wbParentTableField,
        wbFields: form.wbFields.map((row) => ({ ...row })),
        wbMainFields: form.wbMainFields.map((row) => ({ ...row })),
        mappings: form.mappings.map((m) => ({ ...m })),
      },
    })
    const triggerId = subflowTriggerId(node.id)
    const triggers = (graph.value.triggers ?? []).filter((item) => item.triggerId !== triggerId)
    const configured = form.enabled && Boolean(form.targetProcessDefKey)
    if (configured) {
      const draft: TriggerDraft = {
        triggerId,
        name: `子流程发起·${node.label || node.id}`,
        enabled: true,
        event: 'TASK_SUBMITTED',
        nodeKey: node.id,
        script: form.triggerMode === 'ALWAYS' ? 'return 1;' : form.script.trim() || 'return 1;',
        // BF20261013-027：触发脚本变量授权=全部已定义变量（与节点触发器同口径，免手工勾选）
        variables: (graph.value.variables ?? []).map((item) => item.varId),
        branches: [
          {
            branchId: 'b1',
            name: 'b1',
            matchType: 'NUMBER',
            matchValue: '1',
            actions: [
              {
                actionId: subflowActionId(node.id),
                name: `发起子流程·${node.label || node.id}`,
                type:
                  aggregate === 'GROUPED'
                    ? 'START_GROUPED'
                    : aggregate === 'EACH'
                      ? 'START_EACH'
                      : 'START_SINGLE',
                sourceVariable,
                groupBy,
                targetProcessDefKey: form.targetProcessDefKey,
                targetFormKey: form.targetFormKey,
                maxDispatch: DEFAULT_MAX_DISPATCH,
                mapping: form.mappings
                  .filter((m) => m.targetField.trim())
                  .map((m) => ({
                    targetField: m.targetField,
                    sourceVarId: m.source === 'FIELD' ? m.sourceVarId : '',
                    itemField: m.source === 'FIELD' ? m.itemField : '',
                    literal: m.source === 'LITERAL' ? m.literal : '',
                    script: m.source === 'SCRIPT' ? m.script : '',
                  })),
                orchestration: form.orchestration === 'INDEPENDENT' ? '' : 'CHILD',
                waitPolicy: form.waitPolicy,
                waitCount: form.waitPolicy === 'COUNT' ? Math.max(1, form.waitCount) : 1,
                wbEnabled: form.orchestration === 'CHILD' && form.wbEnabled,
                wbResultNodeKey: form.wbResultNodeKey,
                wbTableField: form.wbTableField,
                wbRowKeyField: form.wbRowKeyField,
                wbParentTableField: form.wbParentTableField,
                wbFields: form.wbFields.map((row) => ({ ...row })),
                wbMainFields: form.wbMainFields.map((row) => ({ ...row })),
              },
            ],
          },
        ],
        unmatchedDisposition: 'HALT',
        errorDisposition: 'HALT',
      }
      triggers.push(buildTriggerConfig(draft))
    }
    graph.value = { ...graph.value, triggers }
    syncSubflowWaitNode(node, configured)
  }

  /** 同步等待块：开启=出边自动插入「子流程」等待节点并引用本动作；关闭=移除并回连原走向。 */
  function syncSubflowWaitNode(node: { id: string; x: number; y: number }, enabled: boolean) {
    if (!model.value) return
    const SNAP_X = 20
    const state = model.value.state()
    const waitId = subflowWaitNodeId(node.id)
    const actionId = subflowActionId(node.id)
    // 不能只按预期 id 找：insertNodeOnEdge 实际生成 node_N；重复应用会插入多个等待块。
    const existing = state.nodes.filter((item) => {
      if (item.id === waitId) return true
      if (item.type !== 'SUBFLOW_WAIT') return false
      const config = item.config as Record<string, unknown> | undefined
      return Array.isArray(config?.waitActionIds) && config.waitActionIds.includes(actionId)
    })
    if (!enabled) {
      if (existing.length > 0) {
        const first = existing[0]
        const nextId = state.edges.find((edge) => edge.sourceId === first.id)?.targetId
        for (const item of existing) {
          model.value!.select(item.id)
          model.value!.removeSelection()
        }
        if (nextId) model.value!.connect(node.id, nextId)
      }
      return
    }
    if (existing.length > 0) {
      const [keep, ...extras] = existing
      for (const extra of extras) {
        model.value!.select(extra.id)
        model.value!.removeSelection()
      }
      model.value!.updateNodeConfig(keep.id, { name: '子流程', waitActionIds: [actionId] })
      return
    }
    const edge = state.edges.find((item) => item.sourceId === node.id)
    if (!edge) return
    const waitNodeId = model.value!.insertNodeOnEdge(
      edge.id,
      'SUBFLOW_WAIT',
      '子流程',
      Math.round((node.x + 160) / SNAP_X) * SNAP_X,
      node.y,
    )
    if (waitNodeId)
      model.value!.updateNodeConfig(waitNodeId, { name: '子流程', waitActionIds: [actionId] })
  }

  /** 选中节点 → 面板草稿回显（原统一 watch 的子流程切片；BF20261013-019/027）。 */
  watch(selectedNode, (node) => {
    if (!node) return
    if (node.type === 'APPROVAL') {
      const raw = (node.config as Record<string, unknown> | undefined)?.subflow as
        | Record<string, unknown>
        | undefined
      subflowForm.value = buildSubflowFormDraft(raw)
      ensurePublishedTargets()
    } else {
      subflowForm.value = emptySubflowForm()
    }
  })

  return {
    subflowForm,
    subflowWizardVisible,
    subflowWizardStep,
    subflowStepTitles,
    subflowTargetFields,
    subflowSummary,
    subflowHasRowSource,
    subflowStepReady,
    openSubflowWizard,
    onSubflowSwitch,
    onSubflowWizardClose,
    onSubflowTriggerFieldChange,
    onSubflowTargetChange,
    addSubflowMapping,
    removeSubflowMapping,
    onSubflowMappingSourceChange,
    subflowMappingSourceValue,
    onSubflowMappingFieldChange,
    addSubflowWbRow,
    removeSubflowWbRow,
    finishSubflowWizard,
    applySubflow,
  }
}
