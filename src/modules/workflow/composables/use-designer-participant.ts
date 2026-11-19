import { computed, ref, watch } from 'vue'
import type { ComputedRef, Ref, ShallowRef } from 'vue'
import { publishedFormDefinition } from '@/modules/workflow/api'
import type { FormSchemaField, ApproverCandidate } from '@/modules/workflow/api'
import type {
  BpmNodeCapability,
  BpmNodeConfigField,
  ParticipantStrategy,
} from '@/contracts/bpm-node'
import { PARTICIPANT_STRATEGIES } from '@/contracts/bpm-node'
import type { PositionedNode, DesignerModel } from '@/adapters/process-graph'
import {
  buildParticipantConfig,
  buildParticipantFormDraft,
  emptyParticipantFormDraft,
} from '@/modules/workflow/utils/node-capabilities'
import type {
  ParticipantFormDraft,
  ParticipantShapeKind,
} from '@/modules/workflow/utils/node-capabilities'
import type { DesignerGraph } from './designer-graph'

/** 参与人字段识别：服务端能力契约的 validation.approverTypes 标记（导出供通用字段清单复用）。 */
export function isApproverSelectionField(
  field: Pick<BpmNodeConfigField, 'type' | 'validation'>,
): boolean {
  const approverTypes = field.validation?.['approverTypes']
  return field.type === 'APPROVER' || (Array.isArray(approverTypes) && approverTypes.length > 0)
}

/** useDesignerParticipant 入参。 */
export interface DesignerParticipantOptions {
  /** 设计器图文档（绑定表单 schema 来源）。 */
  graph: Ref<DesignerGraph | null>
  /** 当前选中节点。 */
  selectedNode: ComputedRef<PositionedNode | null>
  /** 选中节点对应的服务端能力（configFields 契约）。 */
  selectedCapability: ComputedRef<BpmNodeCapability | null>
  /** 画布模型（非响应式实例）。 */
  model: ShallowRef<DesignerModel | null>
  /** 版本预览态（预览只读）。 */
  isVersionPreview: ComputedRef<boolean>
}

/**
 * P63 参与人结构化面板（APPROVAL/CONSENSUS）：策略分段 + 按策略取值编辑
 * （自 ProcessDesigner.vue 原地迁出，行为不变）。
 */
export function useDesignerParticipant(options: DesignerParticipantOptions) {
  const { graph, selectedNode, selectedCapability, model, isVersionPreview } = options

  /* ─────────── P63 参与人结构化面板（APPROVAL/CONSENSUS） ─────────── */

  /** 参与人结构化面板覆盖的节点类型；其余节点保持既有 approver/object 渲染路径。 */
  const PARTICIPANT_PANEL_NODE_TYPES = ['APPROVAL', 'CONSENSUS']

  /** 参与人策略展示名（本批改动文件域不含 locale 资源，文案先落在设计器，后续可迁 locale 键）。
   *  审查28 D08-B：主分段前两项按设计原图命名（指定人员/表单组件）；
   *  表达式与 JS 脚本是两种真实来源，独立表达式不得冒充 JS，第三主分段保留真实名「表达式」。 */
  const PARTICIPANT_STRATEGY_LABELS: Record<ParticipantStrategy, string> = {
    FIXED_USER: '指定人员',
    ROLE: '选择角色',
    DEPT_LEADER: '选择部门',
    POST: '选择岗位',
    DEPT_POST: '部门岗位',
    EXPRESSION: '表达式',
    ADAPTER: '外部适配器',
    FORM_FIELD: '表单组件',
    NODE_FORM_AGGREGATE: '节点表单聚合',
  }

  /** 设计 42:4：提供选择人员/表单字段/表达式等业务策略；旧数据仍可回显其他策略。 */
  const ALLOWED_PARTICIPANT_STRATEGIES = [
    'FIXED_USER',
    'DEPT_LEADER',
    'ROLE',
    'POST',
    'FORM_FIELD',
    'EXPRESSION',
  ]

  /** 参与人字段：真实契约的 participant、mock APPROVAL 的 approver，或带 approverTypes 的兼容 object 字段。 */
  const participantField = computed<BpmNodeConfigField | null>(() => {
    const node = selectedNode.value
    const capability = selectedCapability.value
    if (!node || !capability) return null
    if (!PARTICIPANT_PANEL_NODE_TYPES.includes(node.type)) return null
    // P63：结构化参与人面板写 participant（服务端新契约，strategy=ALL）；
    // approver 是旧单选兼容键，仅作回显兜底，不再作为面板写入目标。
    return (
      capability.configFields.find((field) => field.key === 'participant') ??
      capability.configFields.find((field) => field.key === 'approver') ??
      capability.configFields.find((field) => isApproverSelectionField(field)) ??
      null
    )
  })

  const participantForm = ref<ParticipantFormDraft>(emptyParticipantFormDraft())

  /* ── G01a 字段选择器：绑定表单已发布 schema，替代手填字段名 ── */
  const formSchemaFields = ref<FormSchemaField[]>([])
  async function loadBoundFormSchema(formKey: string) {
    if (!formKey) {
      formSchemaFields.value = []
      return
    }
    try {
      const schema = await publishedFormDefinition(formKey)
      formSchemaFields.value = schema.fields
    } catch {
      formSchemaFields.value = []
    }
  }
  /** 主表字段候选：按对象类型过滤（人员/部门） */
  function mainFieldOptionsFor(objectType: string): FormSchemaField[] {
    return formSchemaFields.value.filter((f) => f.type === objectType)
  }
  /** 表格字段候选：schema 中 TABLE 类型字段 */
  const tableFieldOptions = computed(() => formSchemaFields.value.filter((f) => f.type === 'TABLE'))
  /** 选中表格的列候选：按对象类型过滤 */
  function tableColumnOptionsFor(tableField: string, objectType: string): FormSchemaField[] {
    const table = formSchemaFields.value.find((f) => f.name === tableField)
    return (table?.subFields ?? []).filter((sf) => sf.type === objectType)
  }

  /* 提示32 Q17（574:27788）：主字段改 680 分组选择窗——主表 + 各明细表；
     候选仍按当前对象类型过滤，选择明细列时同步表/列绑定，不扩大候选业务。 */
  const participantFieldPickerVisible = ref(false)

  function toPickerField(field: FormSchemaField) {
    return { name: field.name, label: field.label || field.name || '未命名字段', type: field.type }
  }

  const participantFieldPickerGroups = computed(() => {
    const objectType = participantForm.value.formField.objectType
    const groups = [
      {
        key: 'MAIN',
        label: '主表',
        tag: undefined as string | undefined,
        fields: mainFieldOptionsFor(objectType).map(toPickerField),
      },
    ]
    for (const table of tableFieldOptions.value) {
      groups.push({
        key: table.name,
        label: table.label || table.name || '未命名明细表',
        tag: '明细表',
        fields: (table.subFields ?? [])
          .filter((subField) => subField.type === objectType)
          .map((subField) =>
            toPickerField({ name: subField.name, label: subField.label, type: subField.type }),
          ),
      })
    }
    return groups
  })

  const participantFieldDisplay = computed(() => {
    const formField = participantForm.value.formField
    if (formField.scope === 'TABLE' && formField.tableField) {
      const table = formSchemaFields.value.find((f) => f.name === formField.tableField)
      const column = (table?.subFields ?? []).find((sf) => sf.name === formField.column)
      const tableLabel = table?.label || formField.tableField
      const columnLabel = column?.label || formField.column
      return columnLabel ? `${tableLabel} / ${columnLabel}` : tableLabel
    }
    const field = formSchemaFields.value.find((f) => f.name === formField.field)
    return field?.label || formField.field || ''
  })

  const participantFieldHint = computed(() =>
    participantForm.value.formField.objectType === 'DEPT'
      ? '使用该组件中填写的部门，按部门负责人审批。'
      : '使用该组件中填写的人员作为审批人。',
  )

  function openParticipantFieldPicker(): void {
    if (isVersionPreview.value) return
    participantFieldPickerVisible.value = true
  }

  function onParticipantFieldPicked(fieldName: string, groupKey: string): void {
    const formField = participantForm.value.formField
    if (groupKey === 'MAIN') {
      formField.field = fieldName
    } else {
      // 明细列：值对象按 TABLE 口径携带表格与列，field 同步为列名
      formField.field = fieldName
      formField.scope = 'TABLE'
      formField.tableField = groupKey
      formField.column = fieldName
    }
    applyParticipant()
  }

  /* 提示32 Q54（572:26514）：EXPRESSION 基本面板 288×32 只读摘要/状态槽，
     读取实际已存表达式；未配置如实显示，不伪造示例代码。 */
  const participantExpressionConfigured = computed(
    () => participantForm.value.genericValue.trim().length > 0,
  )

  const participantExpressionSummary = computed(() => {
    if (!participantExpressionConfigured.value) return '未配置'
    const text = participantForm.value.genericValue.replace(/\s+/g, ' ').trim()
    return text.length > 42 ? `${text.slice(0, 42)}…` : text
  })
  watch(
    () => graph.value?.formKey,
    (key) => {
      void loadBoundFormSchema(key ?? '')
    },
    { immediate: true },
  )
  /** 打开节点时检测到的参与人数据形态（旧数据兼容展示提示的依据）。 */
  const participantShape = ref<ParticipantShapeKind>('empty')

  /* 审查28 D08-B：主行收为设计原图三项主分段（指定人员/表单组件/表达式），单行 32 高；
   * 角色/部门/岗位等额外合法策略整体移入次级切换，展开后仍可达（32 高），
   * 来源策略契约本身零改动——仅展示分组。 */
  const PARTICIPANT_SOURCE_SEGMENT_ORDER = ['FIXED_USER', 'FORM_FIELD', 'EXPRESSION']
  const participantSourceSegments = computed(() => {
    const options = participantStrategyOptions.value
    const head = PARTICIPANT_SOURCE_SEGMENT_ORDER.map((value) =>
      options.find((option) => option.value === value),
    ).filter((option): option is { value: string; label: string } => Boolean(option))
    const tail = options.filter(
      (option) => !PARTICIPANT_SOURCE_SEGMENT_ORDER.includes(option.value),
    )
    return [...head, ...tail]
  })
  /** 主分段：严格按主行顺序取前三（缺省策略未下发时自动缺项，不补假项）。 */
  const participantMainSourceSegments = computed(() =>
    participantSourceSegments.value.filter((option) =>
      PARTICIPANT_SOURCE_SEGMENT_ORDER.includes(option.value),
    ),
  )
  /** 次级分段：主分段之外的额外合法策略（保持服务端下发的相对顺序）。 */
  const participantExtraSourceSegments = computed(() =>
    participantSourceSegments.value.filter(
      (option) => !PARTICIPANT_SOURCE_SEGMENT_ORDER.includes(option.value),
    ),
  )
  /** 次级来源切换：当前策略命中次级时自动展开（保证已选来源回显可达），其余默认收起。 */
  const participantExtraSourcesOpen = ref(false)
  function syncParticipantExtraSourcesOpen(strategy: string) {
    participantExtraSourcesOpen.value =
      strategy !== '' && !PARTICIPANT_SOURCE_SEGMENT_ORDER.includes(strategy)
  }
  watch(
    () => participantForm.value.strategy,
    (strategy) => syncParticipantExtraSourcesOpen(strategy),
    { immediate: true },
  )

  const participantStrategyOptions = computed(() => {
    // 策略全集以服务端 validation.strategies 优先；未下发时回退契约常量（含 P63 FORM_FIELD）
    const declared = participantField.value?.validation?.['strategies']
    const declaredList =
      Array.isArray(declared) && declared.length > 0
        ? declared.map((item) => String(item))
        : [...PARTICIPANT_STRATEGIES]
    // BF20261013-022④：只提供五项业务策略
    const strategies = declaredList.filter((item) => ALLOWED_PARTICIPANT_STRATEGIES.includes(item))
    return strategies.map((strategy) => ({
      value: strategy,
      label: PARTICIPANT_STRATEGY_LABELS[strategy as ParticipantStrategy] ?? strategy,
    }))
  })

  const participantLegacyNote = computed(() => {
    switch (participantShape.value) {
      case 'legacy':
        return '当前审批人来自旧版配置，保存后按新配置生效。'
      case 'unparsed':
        return '当前审批人配置无法识别，请重新选择审批人策略。'
      default:
        return ''
    }
  })

  /** 参与人面板提交：写入 {strategy, value} 对象（object 字段 JSON 序列化路径既有）。 */
  function applyParticipant() {
    if (!selectedNode.value || !model.value || !participantField.value || isVersionPreview.value)
      return
    model.value.updateNodeConfig(selectedNode.value.id, {
      [participantField.value.key]: buildParticipantConfig(participantForm.value),
    })
  }

  /* FIXED_USER 人员多选：复用 ApproverCandidatesDialog 人员页签（id 十进制字符串保持精度）。 */
  const participantUserPickerVisible = ref(false)
  const participantUserIds = computed(() =>
    participantForm.value.userIds.map(Number).filter((id) => Number.isFinite(id)),
  )
  function openParticipantUserPicker() {
    participantUserPickerVisible.value = true
  }
  function onParticipantUsersPicked(candidates: ApproverCandidate[]) {
    participantForm.value = {
      ...participantForm.value,
      userIds: candidates.map((candidate) => String(candidate.id)),
    }
    applyParticipant()
  }

  /* DEPT_LEADER 部门多选：复用同一弹窗的部门多选模式（部门树勾选）。 */
  const participantDeptPickerVisible = ref(false)
  function openParticipantDeptPicker() {
    participantDeptPickerVisible.value = true
  }
  function onParticipantDeptsPicked(depts: Array<{ id: string; name: string }>) {
    participantForm.value = { ...participantForm.value, deptIds: depts.map((dept) => dept.id) }
    applyParticipant()
  }

  /** 选中节点 → 面板草稿回显（原统一 watch 的参与人切片）。 */
  watch(selectedNode, (node) => {
    if (!node) {
      participantShape.value = 'empty'
      return
    }
    const participantKey = participantField.value?.key
    if (participantKey) {
      // 旧图可能只有 legacy approver 键：面板回显兜底读取，写入仍走 participantKey
      const config = node.config as Record<string, unknown> | undefined
      const legacyKey = participantKey === 'participant' ? 'approver' : 'participant'
      const raw =
        config?.[participantKey] ?? (config?.[legacyKey] as Record<string, unknown> | undefined)
      const built = buildParticipantFormDraft(raw)
      participantForm.value = built.draft
      participantShape.value = built.shape
      // 审查28 D08-B：换节点后按新策略重置次级来源展开态（同策略不触发 watch，需显式同步）
      syncParticipantExtraSourcesOpen(participantForm.value.strategy)
    } else {
      participantShape.value = 'empty'
    }
  })

  return {
    participantField,
    participantForm,
    participantShape,
    formSchemaFields,
    mainFieldOptionsFor,
    tableFieldOptions,
    tableColumnOptionsFor,
    participantFieldPickerVisible,
    participantFieldPickerGroups,
    participantFieldHint,
    participantFieldDisplay,
    openParticipantFieldPicker,
    onParticipantFieldPicked,
    participantExpressionConfigured,
    participantExpressionSummary,
    participantMainSourceSegments,
    participantExtraSourceSegments,
    participantExtraSourcesOpen,
    participantStrategyOptions,
    participantLegacyNote,
    applyParticipant,
    participantUserPickerVisible,
    participantUserIds,
    openParticipantUserPicker,
    onParticipantUsersPicked,
    participantDeptPickerVisible,
    openParticipantDeptPicker,
    onParticipantDeptsPicked,
  }
}
