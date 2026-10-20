<script setup lang="ts">
import ApproverCandidatesDialog from './ApproverCandidatesDialog.vue'
import HintTip from '@/components/HintTip.vue'
import { useI18n } from '@/locales'

const { t } = useI18n()
/* global HTMLElement,
  ResizeObserver,
  SVGElement,
  SVGSVGElement,
  WheelEvent,
  PointerEvent,
  DragEvent,
  KeyboardEvent,
  MouseEvent,
  window,
  document */
/**
 * ProcessDesigner — 第一方流程设计器页（I3 §4.1：节点拖入/移动/连线/选择/删除/
 * 属性配置/缩放平移适配/撤销/保存/校验/发布/错误定位）。
 *
 * 节点面板与配置字段全部来自统一节点能力端点的服务端契约；
 * 前端不维护平行节点目录，也不解释引擎私有格式。
 * 图契约 = ProcessGraph（contractVersion=2 显式坐标），保存/校验/发布/查看同权威。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, Document, EditPen, Monitor, Setting } from '@element-plus/icons-vue'
import {
  getProcessDefDefinition,
  getProcessNodeCapabilities,
  saveProcessDefGraph,
  publishProcessDef,
  validateProcessDefGraph,
  publishedFormDefinition,
  pageProcessDefs,
  previewProcessScript,
} from '@/modules/workflow/api'
import { pageFormDefs } from '@/adapters/form-catalog'
import ScriptDialog from '@/components/ScriptDialog.vue'
import { PROCESS_SCRIPT_FUNCTIONS } from '@/components/script-catalog'
import type {
  FormSchemaField,
  GraphValidationError,
  ApproverCandidate,
} from '@/modules/workflow/api'
import type { ProcessDef } from '@/contracts/bpm'
import type {
  BpmNodeCapability,
  BpmNodeCategory,
  BpmNodeConfigField,
  ParticipantStrategy,
} from '@/contracts/bpm-node'
import { PARTICIPANT_STRATEGIES } from '@/contracts/bpm-node'
import {
  buildDynamicParallelConfig,
  buildDynamicParallelFormDraft,
  buildParticipantConfig,
  buildParticipantFormDraft,
  emptyParticipantFormDraft,
  validateNodeConfigSemantics,
} from '@/modules/workflow/utils/node-capabilities'
import type {
  DynamicParallelFormDraft,
  ParticipantFormDraft,
  ParticipantShapeKind,
} from '@/modules/workflow/utils/node-capabilities'
import type { ProcessGraphDocument, ProcessGraphWaypoint } from '@/contracts/process-graph'
import {
  createDesignerModel,
  buildEdgePath,
  edgeDragCursor,
  edgeSegmentHandles,
  hitTestEdgeAtPoint,
  portSideOf,
  previewEdgePath,
  sideAxis,
  moveEdgeSegment,
  parsePathPoints,
  pointsToWaypoints,
} from '@/adapters/process-graph'
import {
  effectiveFieldState,
  setFieldState,
  type NodeFieldState,
  type NodeFieldStates,
} from '@/modules/workflow/utils/node-field-states'
import type {
  DesignerModel,
  EdgeSegmentHandle,
  PositionedEdge,
  PositionedNode,
} from '@/adapters/process-graph'
import FormSelectDialog from './FormSelectDialog.vue'
import type { BpmVariableDef, TriggerConfig } from '@/contracts/p64'
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
  CHILD_WAIT_POLICIES,
  DEFAULT_MAX_DISPATCH,
  compatibleVariableTypes,
} from '@/modules/workflow/utils/p64-orchestration'
import type { TriggerDraft, VariableDraft } from '@/modules/workflow/utils/p64-orchestration'

const route = useRoute()
const router = useRouter()
const defId = computed(() => String(route.params.defId))
/** 从表单工作台进入时，左上角返回该表单的「关联流程」页签。 */
const returnFormId = computed(() =>
  route.query?.from === 'form-workbench' && typeof route.query?.formId === 'string'
    ? route.query.formId
    : '',
)
/** 从应用管理「表单上下文」进入时，返回同一上下文（应用/表单级）。 */
const returnAppForm = computed(() =>
  route.query?.from === 'app-form' &&
  typeof route.query?.appId === 'string' &&
  typeof route.query?.formId === 'string'
    ? { appId: route.query.appId, formId: route.query.formId }
    : null,
)

const loading = ref(false)
const errorMsg = ref('')
/** 设计器图文档 + 定义级展示元数据（formName/formDefId 节点13 advancedConfig，均由下发 payload 承载）。 */
type DesignerGraph = ProcessGraphDocument & {
  formName?: string
  formDefId?: string
  advancedConfig?: GraphAdvancedConfig
  /** P64 阶段Ⅰ：BPM 变量与触发器（文档级；随图保存/发布冻结）。 */
  variables?: BpmVariableDef[]
  triggers?: TriggerConfig[]
}
const graph = ref<DesignerGraph | null>(null)
const capabilities = ref<BpmNodeCapability[]>([])
let model: DesignerModel | null = null
const version = ref(0) // 触发视图刷新的快照 serial

const SNAP_X = 20
const SNAP_Y = 20

/** P53 设计稿专用节点几何；其它流程图继续使用适配器默认尺寸。 */
const P53_NODE_WIDTH = 160
const P53_NODE_HEIGHT = 50
const P53_GATEWAY_RADIUS = 18

/**
 * 网关类节点（菱形渲染）：GATEWAY 为既有口径；P63 将 CONDITION 与
 * PARALLEL_GATEWAY（并行网关，1入多出分叉/多入1出到齐汇合）归入同一菱形分支。
 */
function isGatewayShape(type: string): boolean {
  return type === 'GATEWAY' || type === 'CONDITION' || type === 'PARALLEL_GATEWAY'
}

function snapshot() {
  version.value++
}

/* ─────────── 0.1.7 重构：节点面板分组 / 整理布局（上下） / 画布框 ─────────── */

/** 节点面板分组（能力契约 category → 面板分组标题）。 */
const PALETTE_GROUP_KEYS: ReadonlyArray<readonly [BpmNodeCategory, string]> = [
  ['EVENT', 'workflow.nodeCategoryEvent'],
  ['TASK', 'workflow.nodeCategoryTask'],
  ['GATEWAY', 'workflow.nodeCategoryGateway'],
  ['OTHER', 'workflow.nodeCategoryOther'],
]
const paletteGroups = computed(() =>
  PALETTE_GROUP_KEYS.map(([category, labelKey]) => ({
    category,
    label: t(labelKey),
    items: capabilities.value.filter((cap) => cap.category === category),
  })).filter((group) => group.items.length > 0),
)

/** 撤销可用性（version 每次画布变更自增，用于驱动按钮态）。 */
const undoAvailable = computed(() => {
  void version.value
  return model?.canUndo() ?? false
})

/** 撤销上一次画布编辑（与快捷键同源：模型内部历史）。 */
function undoLast() {
  if (!model?.canUndo()) return
  model.undo()
  snapshot()
}

/** 整理布局：默认走向「自上而下」重排全部节点（一次撤销单元；不同连线允许交叉）。 */
function arrangeTopDown() {
  if (!model) return
  model.layoutTopDown()
  snapshot()
  fitViewport()
}

/** 事件型节点（开始/结束）：小图标呈现，不使用卡片盒。 */
function isEventShape(type: string): boolean {
  return type === 'START' || type === 'END'
}

/* ─────────── 画布视口 ─────────── */
const CANVAS_W = 1200
const CANVAS_H = 620
const viewBox = ref({ x: -40, y: -40, w: CANVAS_W, h: CANVAS_H })
const panSession = ref<{
  px: number
  py: number
  vb: { x: number; y: number; w: number; h: number }
} | null>(null)

function screenToGraph(event: MouseEvent): { x: number; y: number } {
  const svgEl = svgRef.value
  if (!svgEl) return { x: 0, y: 0 }
  const rect = svgEl.getBoundingClientRect()
  return {
    x: viewBox.value.x + ((event.clientX - rect.left) / rect.width) * viewBox.value.w,
    y: viewBox.value.y + ((event.clientY - rect.top) / rect.height) * viewBox.value.h,
  }
}

function zoomView(factor: number) {
  fitZoom.value = Math.min(4, Math.max(0.2, fitZoom.value / factor))

  const current = viewBox.value
  const cx = current.x + current.w / 2
  const cy = current.y + current.h / 2
  const w = Math.min(6000, Math.max(240, current.w * factor))
  const h = (w / current.w) * current.h
  viewBox.value = { x: cx - w / 2, y: cy - h / 2, w, h }
}

function fitViewport() {
  if (!model) return
  const state0 = model.state()
  const xs = state0.nodes.map((n) => n.x)
  const ys = state0.nodes.map((n) => n.y)
  if (!xs.length) {
    viewBox.value = { x: -40, y: -40, w: CANVAS_W, h: CANVAS_H }
    return
  }
  // 适应画布 = 内容包围盒在视口内等比缩放并居中；避免左侧固定锚位在大画布上偏右。
  const svgEl = svgRef.value
  const elW = svgEl ? svgEl.clientWidth || CANVAS_W : CANVAS_W
  const elH = svgEl ? svgEl.clientHeight || CANVAS_H : CANVAS_H
  const margin = 40
  const minX = Math.min(...xs) - P53_NODE_WIDTH / 2
  const minY = Math.min(...ys) - P53_NODE_HEIGHT / 2
  const bw = Math.max(Math.max(...xs) - Math.min(...xs) + P53_NODE_WIDTH, 1)
  const bh = Math.max(Math.max(...ys) - Math.min(...ys) + P53_NODE_HEIGHT, 1)
  const ratio = Math.min(1, (elW - margin * 2) / bw, (elH - margin * 2) / bh)
  const zoom = Math.max(ratio, 0.2)
  const viewportW = elW / zoom
  const viewportH = elH / zoom
  fitZoom.value = zoom
  viewBox.value = {
    x: minX - (viewportW - bw) / 2,
    y: minY - (viewportH - bh) / 2,
    w: viewportW,
    h: viewportH,
  }
}

const svgRef = ref<SVGSVGElement | null>(null)

/* ─────────── P53 设计还原展示态（纯展示，无业务逻辑） ─────────── */

/** 画布缩放百分比（由视口宽度换算，CANVAS_W = 100%）。 */
const fitZoom = ref(1)
const zoomPercent = computed(() => Math.round(fitZoom.value * 100))

/** 流程高级配置弹窗（P53 节点13）：只读呈现已加载定义的真实信息，不新增任何端点。 */
const advancedConfigVisible = ref(false)

/** 草稿保存状态（复核02 G6a 修复）：头部只反映真实保存结果——加载时刻不再假报
 * "草稿已保存"；模型变更为脏状态并防抖自动保存（1.5s），保存成功后刷新时钟。 */
const savedAtText = ref('')
const dirty = ref(false)
let lastSavedJson = ''
function formatClock(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return pad(d.getHours()) + ':' + pad(d.getMinutes())
}
function currentGraphJson(): string {
  try {
    return JSON.stringify(model?.serialize() ?? {})
  } catch {
    return ''
  }
}
function onModelChanged() {
  const json = currentGraphJson()
  if (!json || json === lastSavedJson) return
  // BF20261013-022⑤：关闭自动保存，仅标记未保存状态（离开时提醒）
  dirty.value = true
}

/** BF20261013-022⑤：未保存离开提醒——路由离开弹确认框；刷新/关闭走浏览器原生确认。 */
// DOM 全局类型按仓库约定用结构类型（.vue 内不裸引 DOM 全局）
function beforeUnloadGuard(event: { preventDefault(): void; returnValue: string }) {
  if (!dirty.value) return
  event.preventDefault()
  event.returnValue = ''
}
async function confirmLeaveIfDirty(): Promise<boolean> {
  if (!dirty.value) return true
  try {
    await ElMessageBox.confirm('您还有未保存的内容，是否退出', '提示', {
      confirmButtonText: '退出',
      cancelButtonText: '继续编辑',
      type: 'warning',
    })
    dirty.value = false
    return true
  } catch {
    return false
  }
}
onBeforeRouteLeave(() => confirmLeaveIfDirty())

/** 高级配置元数据（定义 payload 的 advancedConfig 扩展；缺省展示占位符）。 */
interface GraphAdvancedConfig {
  startListener?: string
  completeListener?: string
  notifyTargets?: string
  notifyChannels?: string[]
  notifyTemplate?: string
  preMode?: string
  preHandler?: string
  prePurpose?: string
  preFailure?: string
  postMode?: string
  postHandler?: string
  postPurpose?: string
  postFailure?: string
}
const advConfig = computed<GraphAdvancedConfig | undefined>(
  () => (graph.value as { advancedConfig?: GraphAdvancedConfig } | null)?.advancedConfig,
)
const advChannels = computed(() => advConfig.value?.notifyChannels ?? [])

/** 保存配置（设计13 footer）：走既有流程草稿保存链路，关闭弹窗。 */
function onSaveAdvancedConfig() {
  advancedConfigVisible.value = false
  void save()
}

/* ─────────── P64 阶段Ⅰ：节点业务表单绑定 / BPM 变量 / 触发器 ─────────── */

/** 可绑定节点业务表单的人工节点类型（与后端 NODE_FORM_CAPABLE_TYPES 一致）。 */
const NODE_FORM_CAPABLE_TYPES = ['APPROVAL', 'CONSENSUS', 'DYNAMIC_PARALLEL']
const nodeFormCapable = computed(
  () =>
    selectedNode.value != null && NODE_FORM_CAPABLE_TYPES.includes(selectedNode.value.type ?? ''),
)
const nodeFormSelectVisible = ref(false)
/** BF20261013-022①：节点触发器支持的节点（排除网关/开始/结束/校验等非业务节点）。 */
const NODE_TRIGGER_EXCLUDED_TYPES = ['START', 'END', 'CONDITION', 'GATEWAY', 'P57_VERIFY']
const nodeTriggerCapable = computed(
  () =>
    selectedNode.value != null &&
    !NODE_TRIGGER_EXCLUDED_TYPES.includes(selectedNode.value.type ?? ''),
)

/** 选中节点已绑定的节点业务表单 formKey（回显）。 */
const selectedNodeFormKey = computed(() => {
  const config = selectedNode.value?.config as Record<string, unknown> | undefined
  const nodeForm = config?.nodeForm as { formKey?: string } | undefined
  return nodeForm?.formKey ?? ''
})

/** formKey → 业务表单名称：界面只展示名称，不向业务人员暴露内部标识。 */
const nodeFormNames = ref<Record<string, string>>({})

async function resolveNodeFormName(formKey?: string) {
  if (!formKey || nodeFormNames.value[formKey]) return
  try {
    const schema = await publishedFormDefinition(formKey)
    nodeFormNames.value = {
      ...nodeFormNames.value,
      [formKey]: schema.title?.trim() || '已绑定表单',
    }
  } catch {
    nodeFormNames.value = { ...nodeFormNames.value, [formKey]: '已绑定表单' }
  }
}

const selectedNodeFormName = computed(() =>
  selectedNodeFormKey.value
    ? (nodeFormNames.value[selectedNodeFormKey.value] ?? '已绑定表单')
    : '未绑定',
)

function applyNodeForm(formKey: string) {
  if (!selectedNode.value) return
  model?.updateNodeConfig(selectedNode.value.id, {
    nodeForm: formKey ? { formKey } : {},
  })
  snapshot()
  onModelChanged()
}

function onNodeFormSelected(formKey: string, formName: string) {
  nodeFormSelectVisible.value = false
  if (formName.trim()) {
    nodeFormNames.value = { ...nodeFormNames.value, [formKey]: formName.trim() }
  } else {
    void resolveNodeFormName(formKey)
  }
  applyNodeForm(formKey)
}

function clearNodeForm() {
  applyNodeForm('')
}

/** 主表单字段（变量来源选择器；经动态 import 读表单定义，模块边界惯例）。 */
const mainFormFields = ref<
  Array<{ name: string; type: string; label?: string; multiple?: boolean; required?: boolean }>
>([])
watch(
  () => graph.value?.formKey,
  async (formKey) => {
    mainFormFields.value = []
    if (!formKey) return
    try {
      const { getFormDefinition } = await import('@/adapters/form-runtime')
      // BF20261013-013：草稿表单 by-key 端点不可用（仅发布后可用），
      // 从表单工作台进入时按 formId 直取草稿定义（by-id），否则回退 by-key。
      const workbenchFormId = graph.value?.formDefId || returnFormId.value
      let schema
      if (workbenchFormId) {
        const { getFormDefinitionById } = await import('@/adapters/form-catalog')
        schema = await getFormDefinitionById(workbenchFormId)
      } else {
        schema = await getFormDefinition(formKey)
      }
      mainFormFields.value = (schema.fields ?? []) as Array<{
        name: string
        type: string
        label?: string
        multiple?: boolean
        required?: boolean
      }>
    } catch {
      mainFormFields.value = []
    }
  },
  { immediate: true },
)

/* ── BF20261013-013：节点「字段属性」页签（必填/编辑/隐藏三态） ── */

/** 节点属性面板页签；切换节点时回到「基础属性」。 */
const nodePropsTab = ref<'basic' | 'fields'>('basic')

/** 字段属性仅对非结束节点开放（Owner：流程图除结束的所有节点）。 */
const fieldConfigCapable = computed(
  () => selectedNode.value != null && selectedNode.value.type !== 'END',
)

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
  if (!selectedNode.value || !model) return
  model.updateNodeConfig(selectedNode.value.id, {
    fieldStates: setFieldState(nodeFieldStates.value, field, key, Boolean(value)),
  })
  snapshot()
}

/** 节点业务表单绑定清单（nodeKey → formKey）：NODE_FORM 来源候选。 */
const nodeFormBindings = computed<Array<{ nodeKey: string; formKey: string; nodeName: string }>>(
  () => {
    void version.value // model 非响应式：依赖快照 serial 驱动重算
    const result: Array<{ nodeKey: string; formKey: string; nodeName: string }> = []
    for (const node of model?.serialize().elements ?? []) {
      if (node.kind !== 'node') continue
      const config = node.config as Record<string, unknown> | undefined
      const nodeForm = config?.nodeForm as { formKey?: string } | undefined
      if (nodeForm?.formKey) {
        // 变量来源节点按业务名展示（节点名优先，未命名回退节点 ID）
        const nodeName =
          typeof config?.name === 'string' && config.name.trim() ? config.name.trim() : node.id
        result.push({ nodeKey: node.id, formKey: nodeForm.formKey, nodeName })
      }
    }
    return result
  },
)

/** 表单字段缓存（节点表单/主表/动作目标表单的字段选择器共用；按 formKey 惰性加载）。 */
const formFieldCache = ref<Record<string, Array<{ name: string; type: string; label?: string }>>>(
  {},
)
const loadingFormKeys = new Set<string>()

async function ensureFormFields(formKey?: string) {
  if (!formKey || formFieldCache.value[formKey] || loadingFormKeys.has(formKey)) return
  loadingFormKeys.add(formKey)
  try {
    const { getFormDefinition } = await import('@/adapters/form-runtime')
    const schema = await getFormDefinition(formKey)
    formFieldCache.value = {
      ...formFieldCache.value,
      [formKey]: (schema.fields ?? []) as Array<{ name: string; type: string; label?: string }>,
    }
  } catch {
    // 失败不写缓存：瞬时失败（网络/会话刷新/HMR）下次仍可重试，避免空白选项被固化
  } finally {
    loadingFormKeys.delete(formKey)
  }
}

watch(
  nodeFormBindings,
  (bindings) => {
    for (const binding of bindings) void ensureFormFields(binding.formKey)
  },
  { immediate: true },
)

function formFieldOptions(formKey?: string) {
  return (formKey ? formFieldCache.value[formKey] : undefined) ?? []
}

function formFieldLabel(field: { name: string; label?: string }) {
  return field.label || '未命名字段'
}

const graphNodes = computed(() => {
  void version.value // model 非响应式：依赖快照 serial 驱动重算
  return (model?.serialize().elements ?? [])
    .filter((element) => element.kind === 'node')
    .map((element) => {
      const config = element.config as Record<string, unknown> | undefined
      // 触发器源节点按业务名展示（节点名优先，未命名回退节点 ID）
      const name = typeof config?.name === 'string' && config.name.trim() ? config.name.trim() : ''
      return { id: element.id, type: element.type ?? '', name }
    })
})

/** 触发器源节点选项文案：业务名(nodeId)，未命名仅 nodeId。 */
function graphNodeLabel(node: { id: string; name: string }) {
  return node.name && node.name !== node.id ? node.name : '未命名节点'
}

/** 触发器表源节点列：节点业务名（未命名回退 nodeId）。 */
function graphNodeName(nodeKey?: string) {
  if (!nodeKey) return ''
  const hit = graphNodes.value.find((item) => item.id === nodeKey)
  return hit ? graphNodeLabel(hit) : nodeKey
}

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
  const listeners = Array.isArray(config.listeners) ? (config.listeners as NodeListenerMeta[]) : []
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

/* ─────────── 节点/连线交互状态 ─────────── */

const selectionId = ref<string | null>(null)
const dragState = ref<{ id: string; dx: number; dy: number; type: 'node' | 'edge' } | null>(null)
const pendingConnectNode = ref<string | null>(null)
const pendingConnectPos = ref<{ x: number; y: number } | null>(null)
const pendingConnectTarget = ref<{ x: number; y: number } | null>(null)
/** 点选式连线的起点屏幕坐标（区分“点了锚”与“拖了线”）。 */
const pendingConnectStartScreen = ref<{ x: number; y: number } | null>(null)

function onWheel(event: WheelEvent) {
  event.preventDefault()
  // V011-BUG-024：滚轮/触控板滑动=平移画布（Shift=横向、deltaX 跟随触控板）；
  // Ctrl/Cmd+滚轮（触控板捏合合成 ctrlKey）=缩放，与缩放控件/适应画布并存。
  if (event.ctrlKey || event.metaKey) {
    zoomView(event.deltaY > 0 ? 1.1 : 1 / 1.1)
    return
  }
  const svgEl = svgRef.value
  if (!svgEl) return
  const rect = svgEl.getBoundingClientRect()
  const ratio = viewBox.value.w / rect.width
  const dx = event.shiftKey ? event.deltaY : event.deltaX
  const dy = event.shiftKey ? 0 : event.deltaY
  viewBox.value = {
    ...viewBox.value,
    x: viewBox.value.x + dx * ratio,
    y: viewBox.value.y + dy * ratio,
  }
}

function onBgPointerDown(event: PointerEvent) {
  const target = event.target as SVGElement
  if (target.tagName === 'svg' || target.classList.contains('pg-bg')) {
    pendingConnectNode.value = null
    pendingConnectTarget.value = null
    pendingConnectStartScreen.value = null
    // BF20261013-030：空白处按下与模型同口径取消选中（此前视觉选中态残留，连线手柄不消失）
    selectionId.value = null
    model?.select(null)
    panSession.value = { px: event.clientX, py: event.clientY, vb: { ...viewBox.value } }
  }
}

function onPointerMove(event: PointerEvent) {
  if (panSession.value) {
    const svgEl = svgRef.value
    if (!svgEl) return
    const rect = svgEl.getBoundingClientRect()
    const ratio = panSession.value.vb.w / rect.width
    viewBox.value = {
      ...panSession.value.vb,
      x: panSession.value.vb.x - (event.clientX - panSession.value.px) * ratio,
      y: panSession.value.vb.y - (event.clientY - panSession.value.py) * ratio,
    }
    return
  }
  // 拖动节点
  if (dragState.value && model) {
    const point = screenToGraph(event)
    const snapped = {
      x: Math.round(point.x / SNAP_X) * SNAP_X,
      y: Math.round(point.y / SNAP_Y) * SNAP_Y,
    }
    model.moveNode(dragState.value?.id ?? '', snapped.x, snapped.y)
    snapshot()
    return
  }
  // 连线拖拽：跟随指针更新预览终点
  if (pendingConnectNode.value) {
    pendingConnectTarget.value = screenToGraph(event)
  }
  // BF20261013-030 连线编辑：端点拖拽预览 / 内段拖动实时改形（移动超阈值才生效，单击不改形）
  if (edgeEdit.value && model) {
    const edit = edgeEdit.value
    if (!edit.armed) {
      if (Math.hypot(event.clientX - edit.startScreen.x, event.clientY - edit.startScreen.y) < 3) {
        return
      }
      edit.armed = true
    }
    const p = screenToGraph(event)
    if (edit.kind === 'segment') {
      const edge = model.state().edges.find((candidate) => candidate.id === edit.edgeId)
      if (!edge) return
      const points = pathPoints(edge.path)
      const moved = moveEdgeSegment(
        points,
        edit.segmentIndex,
        edit.axis,
        edit.axis === 'x' ? p.x : p.y,
        edgeDragContext(edge, points),
      )
      if (moved === points) return
      // 直线首次拖动生成滑移折返（jog）：后续拖动接管其中段（下标 2）
      if (points.length === 2 && moved.length === 6) edit.segmentIndex = 2
      // BF20261013-033：端口腿拖动在端口旁生成固定小段+折（折数 +2），后续拖动接管被拖段
      // （源/目标两侧的被拖段都落在新折线的倒数第 4 段下标：newLen-4）
      if (moved.length === points.length + 2) {
        edit.segmentIndex = moved.length - 4
      }
      model.setEdgeWaypoints(edge.id, pointsToWaypoints(moved))
      snapshot()
      return
    }
    edgeEditPoint.value = p
    edgeEditHoverId.value = resolveConnectDropTarget(event)
  }
}

function clickedOnSourcePort(start: { x: number; y: number } | null, event: PointerEvent): boolean {
  return !!start && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 6
}

/** 统一落点判定：DOM 命中优先，透明命中路径遮挡时回退图坐标就近节点（60px）。 */
function resolveConnectDropTarget(event: PointerEvent): string | null {
  if (!model) return null
  const element = document.elementFromPoint(event.clientX, event.clientY)
  const domTarget = element?.closest('g[data-node-id]')?.getAttribute('data-node-id') ?? null
  if (domTarget) return domTarget
  const svgEl = svgRef.value
  if (!svgEl) return null
  const rect = svgEl.getBoundingClientRect()
  const point = {
    x: viewBox.value.x + ((event.clientX - rect.left) / rect.width) * viewBox.value.w,
    y: viewBox.value.y + ((event.clientY - rect.top) / rect.height) * viewBox.value.h,
  }
  let bestDistance = Number.MAX_SAFE_INTEGER
  let target: string | null = null
  for (const node of model.state().nodes) {
    const distance = Math.hypot(node.x - point.x, node.y - point.y)
    if (distance < 60 && distance < bestDistance) {
      bestDistance = distance
      target = node.id
    }
  }
  return target
}

function onPointerUp(event: PointerEvent) {
  // V011-BUG-025：连线编辑收尾——端点落点改接（未拖动/自环/重复边/空放均不改动），内段已实时落模型
  if (edgeEdit.value && model) {
    const edit = edgeEdit.value
    if (edit.kind === 'endpoint' && edit.armed) {
      // BF20261013-034：落下即按落点所在边切换端口侧（同节点换端口也生效）
      const targetId = resolveConnectDropTarget(event)
      const nodes = new Map(canvasNodes.value.map((node) => [node.id, node] as const))
      const targetNode = targetId ? nodes.get(targetId) : undefined
      const applied =
        targetId && targetId !== edit.otherEndId && targetNode
          ? model.setEdgeEndpoint(
              edit.edgeId,
              edit.which ?? 'target',
              targetId,
              nearestPortSide(screenToGraph(event), targetNode),
            )
          : null
      if (applied) snapshot()
    }
    edgeEdit.value = null
    edgeEditPoint.value = null
    edgeEditHoverId.value = null
    panSession.value = null
    dragState.value = null
    return
  }
  // 连线落点统一判定（拖放与 sticky 点选共用）：
  // 命中其他节点 → 建立连线；仍点在源锚上 → sticky 挂起；其余 → 取消
  if (pendingConnectNode.value && model) {
    const onSourcePort = clickedOnSourcePort(pendingConnectStartScreen.value, event)
    const targetId = resolveConnectDropTarget(event)
    if (targetId && targetId !== pendingConnectNode.value) {
      model.connect(pendingConnectNode.value, targetId)
      pendingConnectNode.value = null
      pendingConnectTarget.value = null
      pendingConnectStartScreen.value = null
      snapshot()
    } else if (onSourcePort) {
      // sticky：保持挂起，等待目标节点点击
    } else {
      pendingConnectNode.value = null
      pendingConnectTarget.value = null
      pendingConnectStartScreen.value = null
    }
  }
  panSession.value = null
  dragState.value = null
}

function selectNode(id: string | null) {
  selectionId.value = id
  model?.select(id)
}

const canvasNodes = computed(() => {
  void version.value
  return (model?.state().nodes ?? []) as PositionedNode[]
})
const canvasEdges = computed(() => {
  void version.value
  return model?.state().edges ?? []
})

function startNodeDrag(event: PointerEvent, node: PositionedNode) {
  const point = screenToGraph(event)
  dragState.value = { id: node.id, dx: point.x - node.x, dy: point.y - node.y, type: 'node' }
  selectNode(node.id)
}

function onNodePointerUp(event: PointerEvent, node: PositionedNode) {
  // 连线拖拽（pending 模式）结束时落到节点 → connect
  if (pendingConnectNode.value && pendingConnectNode.value !== node.id && model) {
    model.connect(pendingConnectNode.value, node.id)
    pendingConnectNode.value = null
    pendingConnectPos.value = null
    pendingConnectTarget.value = null
    pendingConnectStartScreen.value = null
    snapshot()
  }
  void event
}

/** 节点四向锚点坐标（V011-BUG-023）：上下左右缘中点。 */
function sidePoint(node: PositionedNode, side: 'left' | 'right' | 'top' | 'bottom') {
  switch (side) {
    case 'left':
      return { x: node.x - P53_NODE_WIDTH / 2, y: node.y }
    case 'right':
      return { x: node.x + P53_NODE_WIDTH / 2, y: node.y }
    case 'top':
      return { x: node.x, y: node.y - P53_NODE_HEIGHT / 2 }
    default:
      return { x: node.x, y: node.y + P53_NODE_HEIGHT / 2 }
  }
}

/** 从节点四向锚点发起连线（V011-BUG-023，ProcessOn 口径）。
 * 双模式：拖到目标节点放下，或点击锚后（sticky）再点击目标节点完成连接；
 * 预览/连线端点侧由 edgeEndpoints 按几何方向自动选择。 */
function startConnect(
  event: PointerEvent,
  node: PositionedNode,
  side: 'left' | 'right' | 'top' | 'bottom',
) {
  event.stopPropagation()
  const point = screenToGraph(event)
  pendingConnectNode.value = node.id
  pendingConnectPos.value = sidePoint(node, side)
  pendingConnectTarget.value = point
  pendingConnectStartScreen.value = { x: event.clientX, y: event.clientY }
}

/** 点击连线选中（删除所选可移除）。 */
function selectEdge(event: PointerEvent, edgeId: string) {
  event.stopPropagation()
  selectionId.value = edgeId
  model?.select(edgeId)
}

/* ── V011-BUG-025 连线编辑：端点拖拽改接 / 线上按住拖动插入·移动拐点 ── */

type PathPoint = { x: number; y: number }

/** 折线 path 解析统一走适配器（命中检测/手柄/拖拽同一几何口径）。 */
const pathPoints = parsePathPoints

function pointDist(a: PathPoint, b: PathPoint) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/**
 * BF20261013-029：连线渲染路径——端点拖拽中按固定端端口 → 命中节点端口（无命中则指针）
 * 实时重算曼哈顿路由，真实连线跟随指针改形（不再虚线预览）；其余情况用模型路径。
 */
function edgePathOf(edge: PositionedEdge): string {
  const edit = edgeEdit.value
  if (
    !edit ||
    edit.kind !== 'endpoint' ||
    edit.edgeId !== edge.id ||
    !edgeEditPoint.value ||
    !canvasNodes.value.length
  ) {
    return edge.path
  }
  const byId = new Map(canvasNodes.value.map((node) => [node.id, node] as const))
  const fixedNode = byId.get(edit.otherEndId)
  if (!fixedNode) return edge.path
  const size = { width: P53_NODE_WIDTH, height: P53_NODE_HEIGHT }
  const pointer = edgeEditPoint.value
  const path = pathPoints(edge.path)
  const fixedPort = edit.which === 'source' ? path[path.length - 1] : path[0]
  const hovered = edgeEditHoverId.value ? byId.get(edgeEditHoverId.value) : undefined
  // BF20261013-035：预览与落下同源（命中节点 → 该节点 + 落点最近边；未命中 → 指针作为落点），
  // 且端口腿轴向稳定（不随指针来回切换折向），避免拖动中整条线「漂移」。
  if (hovered && hovered.id !== edit.otherEndId) {
    // 只指定被拖端端口侧，固定端沿用其配置/自动侧 —— 与落下后的重排完全同源
    // BF20261013-036：被拖端是 target 时必须把 hovered 传在 target 位——此前一律按 source 传入，
    // 预览被镜像成「命中节点 → 固定端」（甚至绕出画布），与松手后的实际改接方向相反。
    const movingSide = nearestPortSide(pointer, hovered)
    return edit.which === 'source'
      ? previewEdgePath(edge, hovered, fixedNode, size, P53_GATEWAY_RADIUS, { source: movingSide })
      : previewEdgePath(edge, fixedNode, hovered, size, P53_GATEWAY_RADIUS, { target: movingSide })
  }
  const fixedSide = portSideOf(fixedPort, fixedNode, size)
  const axis = sideAxis(fixedSide)
  if (edit.which === 'source') {
    return buildEdgePath(pointer, fixedPort, [], { sourceAxis: axis, targetAxis: axis })
  }
  return buildEdgePath(fixedPort, pointer, [], { sourceAxis: axis, targetAxis: axis })
}

/** 点到线段距离与所在段下标（points[i]→points[i+1] 为第 i 段）。 */
function nearestSegment(points: PathPoint[], p: PathPoint) {
  let best = Number.MAX_SAFE_INTEGER
  let idx = 0
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    const abx = b.x - a.x
    const aby = b.y - a.y
    const len2 = abx * abx + aby * aby
    const t =
      len2 === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2))
    const d = Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + t * aby))
    if (d < best) {
      best = d
      idx = i
    }
  }
  return idx
}

const edgeEdit = ref<null | {
  edgeId: string
  kind: 'endpoint' | 'segment'
  which?: 'source' | 'target'
  otherEndId: string
  originalWaypoints: ProcessGraphWaypoint[]
  segmentIndex: number
  axis: 'x' | 'y'
  /** BF20261013-032：被拖的是端口腿时标记所属端口——拖动即沿节点边框滑动端口落点。 */
  port: 'source' | 'target' | null
  startScreen: { x: number; y: number }
  /** 拖动阈值（≥3px 才生效）：点击选中连线不再改变形状。 */
  armed: boolean
}>(null)
/** BF20261013-029：端点拖拽实时改形——固定端节点 + 指针 + 命中节点（真实连线跟随，不再是虚线预览）。 */
const edgeEditPoint = ref<PathPoint | null>(null)
const edgeEditHoverId = ref<string | null>(null)

/**
 * BF20261013-036：拖动会话期间固定光标。拖动中预览几何每帧重算，指针下方的元素在
 * 「节点盒(move) / 命中路径(pointer) / 空白(default) / 端点圆(grab)」之间不断切换，
 * 光标就跟着乱跳；拖动期间改为整个画布统一用一个会话光标（吸附时不再闪烁）。
 */
const activeDragCursor = computed(() =>
  edgeEdit.value ? edgeDragCursor(edgeEdit.value.kind, edgeEdit.value.axis) : null,
)

/**
 * BF20261013-036：连线拖动期间捕获指针——指针滑出画布（如到右侧属性面板）时仍能收到
 * pointermove/pointerup，拖动会话不会悬空（松手不生效、光标停在拖动态）。
 * 合成事件没有活动指针，setPointerCapture 会抛 NotFoundError，忽略即可。
 */
function captureEdgeDragPointer(event: PointerEvent) {
  try {
    svgRef.value?.setPointerCapture(event.pointerId)
  } catch {
    // 无活动指针（合成事件）时无需捕获
  }
}

function beginEndpointDrag(event: PointerEvent, edge: PositionedEdge, which: 'source' | 'target') {
  const points = pathPoints(edge.path)
  if (points.length < 2) return
  captureEdgeDragPointer(event)
  edgeEdit.value = {
    edgeId: edge.id,
    kind: 'endpoint',
    which,
    otherEndId: which === 'source' ? edge.targetId : edge.sourceId,
    originalWaypoints: [...edge.waypoints],
    segmentIndex: -1,
    axis: 'x',
    port: null,
    startScreen: { x: event.clientX, y: event.clientY },
    armed: false,
  }
  edgeEditPoint.value = screenToGraph(event)
  edgeEditHoverId.value = null
}

/**
 * BF20261013-030/032 段拖动：按住任意一段——垂直段左右拖、水平段上下拖。
 * 内段移动该段本身；端口腿（贴节点的一段）沿节点边框滑动端口落点。
 * 形状只在指针移动超过阈值后实时落模型；单击（含再次点击已选中连线）不改形。
 */
function beginSegmentDrag(
  event: PointerEvent,
  edge: PositionedEdge,
  index: number,
  axis: 'x' | 'y',
  port: 'source' | 'target' | null = null,
) {
  captureEdgeDragPointer(event)
  edgeEdit.value = {
    edgeId: edge.id,
    kind: 'segment',
    otherEndId: '',
    originalWaypoints: edge.waypoints.map((point) => ({ ...point })),
    segmentIndex: index,
    axis,
    port,
    startScreen: { x: event.clientX, y: event.clientY },
    armed: false,
  }
}

/** 选中连线段手柄（每一段都可拖；整条直线给合成中点手柄）。 */
function edgeSegmentHandlesOf(edge: PositionedEdge): EdgeSegmentHandle[] {
  return edgeSegmentHandles(pathPoints(edgePathOf(edge)))
}

/** 命中最近的可拖段手柄（每段都有，含端口腿）。 */
function edgeHandleAt(points: PathPoint[], point: PathPoint): EdgeSegmentHandle | null {
  const index = nearestSegment(points, point)
  return edgeSegmentHandles(points).find((handle) => handle.index === index) ?? null
}

/**
 * BF20261013-031 拖动上下文：端口腿外向取自**端口几何**（节点中心 → 端口方向），
 * 不再取自折线当前方向——节点移动后折线方向可能已反向，会把可拖区间锁成单向。
 */
function edgeDragContext(edge: PositionedEdge, points: PathPoint[]) {
  const nodes = new Map(canvasNodes.value.map((node) => [node.id, node] as const))
  const source = nodes.get(edge.sourceId)
  const target = nodes.get(edge.targetId)
  if (!source || !target || points.length < 2) return {}
  const outward = (port: PathPoint, node: PositionedNode, axis: 'x' | 'y') => {
    const delta = axis === 'x' ? port.x - node.x : port.y - node.y
    return delta >= 0 ? 1 : -1
  }
  const last = points[points.length - 1]
  const beforeLast = points[points.length - 2]
  return {
    sourceOutward: outward(points[0], source, points[0].x === points[1].x ? 'y' : 'x'),
    targetOutward: outward(last, target, beforeLast.x === last.x ? 'y' : 'x'),
  }
}

/** BF20261013-034：落点最近的端口侧（拖端点换到节点其他端口）。 */
function nearestPortSide(
  point: PathPoint,
  node: PositionedNode,
): 'left' | 'right' | 'top' | 'bottom' {
  const halfWidth = P53_NODE_WIDTH / 2
  const halfHeight = P53_NODE_HEIGHT / 2
  const distances = {
    left: Math.abs(point.x - (node.x - halfWidth)),
    right: Math.abs(point.x - (node.x + halfWidth)),
    top: Math.abs(point.y - (node.y - halfHeight)),
    bottom: Math.abs(point.y - (node.y + halfHeight)),
  }
  let best: 'left' | 'right' | 'top' | 'bottom' = 'left'
  for (const side of ['right', 'top', 'bottom'] as const) {
    if (distances[side] < distances[best]) best = side
  }
  return best
}

function beginSegmentDragFromHandle(
  event: PointerEvent,
  edge: PositionedEdge,
  handle: EdgeSegmentHandle,
) {
  beginSegmentDrag(event, edge, handle.index, handle.axis, handle.port)
}

/** 连线按下：未选中→仅选中（不改形）；已选中→端点改接 / 内段拖动会话，点击本身不产生形状变化。 */
function onEdgePointerDown(event: PointerEvent, edge: PositionedEdge) {
  if (selectionId.value !== edge.id) {
    selectEdge(event, edge.id)
    return
  }
  if (!model) return
  const p = screenToGraph(event)
  const points = pathPoints(edge.path)
  if (points.length < 2) return
  if (pointDist(p, points[0]) < 12) {
    beginEndpointDrag(event, edge, 'source')
    return
  }
  if (pointDist(p, points[points.length - 1]) < 12) {
    beginEndpointDrag(event, edge, 'target')
    return
  }
  const handle = edgeHandleAt(points, p)
  if (!handle) return
  beginSegmentDrag(event, edge, handle.index, handle.axis, handle.port)
}

/** 选中连线上悬停可拖段 → 按拖动轴展示方向光标（左右可拖=ew-resize / 上下可拖=ns-resize）。 */
const edgeHoverAxis = ref<{ edgeId: string; axis: 'x' | 'y' } | null>(null)

function onEdgeHoverMove(event: PointerEvent, edge: PositionedEdge) {
  if (selectionId.value !== edge.id) {
    edgeHoverAxis.value = null
    return
  }
  const points = pathPoints(edge.path)
  const handle = edgeHandleAt(points, screenToGraph(event))
  if (!handle) {
    edgeHoverAxis.value = null
    return
  }
  if (edgeHoverAxis.value?.edgeId !== edge.id || edgeHoverAxis.value.axis !== handle.axis) {
    edgeHoverAxis.value = { edgeId: edge.id, axis: handle.axis }
  }
}

function onEdgeHoverLeave(edge: PositionedEdge) {
  if (edgeHoverAxis.value?.edgeId === edge.id) edgeHoverAxis.value = null
}

function edgeHitCursor(edge: PositionedEdge): string {
  const edit = edgeEdit.value
  if (edit?.kind === 'segment' && edit.edgeId === edge.id) {
    return edit.axis === 'x' ? 'ew-resize' : 'ns-resize'
  }
  const hover = edgeHoverAxis.value
  if (hover?.edgeId === edge.id) {
    return hover.axis === 'x' ? 'ew-resize' : 'ns-resize'
  }
  return 'pointer'
}

/* ─────────── 面板/属性 ─────────── */

// P53 节点 12：审批人候选选择（受限真实组件，候选来自服务端接口）。
// 字段识别只依据服务端能力契约的 validation.approverTypes 标记：
// 同时覆盖 mock 结构化 APPROVER 类型与真实契约的兼容 object 字段（审批人（兼容）），
// 不在前端维护平行节点目录，也不硬编码候选用户。
function isApproverSelectionField(field: Pick<BpmNodeConfigField, 'type' | 'validation'>): boolean {
  const approverTypes = field.validation?.['approverTypes']
  return field.type === 'APPROVER' || (Array.isArray(approverTypes) && approverTypes.length > 0)
}

const selectedNode = computed(() =>
  selectionId.value ? (canvasNodes.value.find((n) => n.id === selectionId.value) ?? null) : null,
)
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
  if (!selectedNode.value || !model) return
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
  model.updateNodeConfig(selectedNode.value.id, patch)
  // 模型非响应式：属性变更后推进快照 serial，画布标签/配置立即重绘。
  snapshot()
}

function removeSelected() {
  if (!model || !selectionId.value) return
  model.removeSelection()
  selectionId.value = null
  snapshot()
}

function undoEdit() {
  model?.undo()
  selectionId.value = null
  snapshot()
}

interface PaletteDrag {
  capability: BpmNodeCapability
}

function onPaletteDragStart(event: DragEvent, capability: BpmNodeCapability) {
  if (!capability.supports.design) {
    event.preventDefault()
    return
  }
  const drag: PaletteDrag = { capability }
  event.dataTransfer?.setData('application/json', JSON.stringify(drag))
}

function onCanvasDrop(event: DragEvent) {
  event.preventDefault()
  const raw = event.dataTransfer?.getData('application/json')
  if (!raw) return
  let capability: BpmNodeCapability | null
  try {
    capability = (JSON.parse(raw) as PaletteDrag).capability ?? null
  } catch {
    capability = null
  }
  if (!capability || !model) return
  const point = screenToGraph(event)
  const x = Math.round(point.x / SNAP_X) * SNAP_X
  const y = Math.round(point.y / SNAP_Y) * SNAP_Y
  // V011-BUG-020：拖放到连线上 = 在该连线中间插入节点（初始 START→END 线可直接
  // 「拖入节点」建流程，无需先选中节点再连线）
  const element = document.elementFromPoint(event.clientX, event.clientY)
  const edgeId = element?.closest('path[data-edge-id]')?.getAttribute('data-edge-id') ?? null
  const nodeId = edgeId
    ? model.insertNodeOnEdge(edgeId, capability.type, capability.displayName, x, y)
    : model.addNode(capability.type, capability.displayName, x, y)
  if (nodeId) selectNode(nodeId)
  snapshot()
}

/** V011-BUG-020：组件库点击添加（拖拽之外的可见创建路径），落点为画布中心。 */
function onWorkbarClick(cap: BpmNodeCapability) {
  if (!cap.supports.design || !model) return
  const x = Math.round((viewBox.value.x + viewBox.value.w / 2) / SNAP_X) * SNAP_X
  const y = Math.round((viewBox.value.y + viewBox.value.h / 2) / SNAP_Y) * SNAP_Y
  // P62 FD01：点击落点命中既有连线时与拖放同语义（插入该连线），避免产生
  // 视觉压线而图中断连的节点（此前固定 addNode 导致发布校验 2004/2005）。
  const state = model.state()
  const edgeId = hitTestEdgeAtPoint(state.nodes, state.edges, x, y)
  const id = edgeId
    ? model.insertNodeOnEdge(edgeId, cap.type, cap.displayName, x, y)
    : model.addNode(cap.type, cap.displayName, x, y)
  selectNode(id)
  snapshot()
}

/* ─────────── 保存 / 校验 / 发布 ─────────── */

const saving = ref(false)
const validating = ref(false)
const publishing = ref(false)
const validationErrors = ref<GraphValidationError[]>([])

function markSaved() {
  dirty.value = false
  savedAtText.value = formatClock(new Date())
  lastSavedJson = currentGraphJson()
}

/** P63 保存前语义校验：FORM_FIELD/动态并行配置错误以中文提示直接展示（对齐服务端口径）。 */
function assertNodeSemantics(): boolean {
  if (!model) return true
  const semanticErrors = validateNodeConfigSemantics(model.serialize())
  if (semanticErrors.length === 0) return true
  errorMsg.value = semanticErrors.join('；')
  ElMessage.error(semanticErrors[0])
  return false
}

/** 保存载荷：serialize() 只含画布契约字段，文档级 P64 配置（变量/触发器）在此合并。 */
function buildGraphPayload(): Record<string, unknown> {
  const payload = { ...(model?.serialize() ?? {}) } as Record<string, unknown>
  payload.variables = graph.value?.variables ?? []
  payload.triggers = graph.value?.triggers ?? []
  return payload
}

/** 保存草稿；返回是否真实保存成功（发布前依赖该结果避免“发布旧图”）。 */
async function save(): Promise<boolean> {
  if (!model || !graph.value || !defId.value) return false
  if (!assertNodeSemantics()) return false
  saving.value = true
  errorMsg.value = ''
  try {
    await saveProcessDefGraph(defId.value, buildGraphPayload())
    // 复核02 G6a：以真实保存成功为准刷新状态（脏清零 + 时钟 + 基线快照）
    markSaved()
    ElMessage.success(t('common.draftSaved'))
    return true
  } catch (err) {
    errorMsg.value = (err as { msg?: string }).msg ?? t('common.saveFailed')
    return false
  } finally {
    saving.value = false
  }
}

async function validate() {
  if (!model || !defId.value) return
  // 本地语义校验未通过时不再请求服务端（错误口径一致且可先定位画布节点）
  if (!assertNodeSemantics()) {
    validationErrors.value = []
    return
  }
  validating.value = true
  validationErrors.value = []
  try {
    // 先保存草稿再校验，保证服务端查询到最新图
    await saveProcessDefGraph(defId.value, buildGraphPayload())
    markSaved()
    validationErrors.value = await validateProcessDefGraph(defId.value)
    if (validationErrors.value.length === 0) {
      ElMessage.success(t('workflow.validationPassedNoErrors'))
    }
  } catch (err) {
    errorMsg.value = (err as { msg?: string }).msg ?? t('workflow.graphValidationFailed')
  } finally {
    validating.value = false
  }
}

async function publish() {
  if (!defId.value) return
  try {
    await ElMessageBox.confirm(
      t('workflow.publishConfirmMessage'),
      t('common.publishConfirmTitle'),
      {
        get confirmButtonText() {
          return t('workflow.confirmPublishButton')
        },
        get cancelButtonText() {
          return t('common.cancel')
        },
        type: 'warning',
      },
    )
  } catch {
    return
  }
  publishing.value = true
  try {
    // 复核02 G6a：发布消费的是服务端持久化图——存在未保存更改时先真实保存，杜绝"发布旧图"；
    // P63：保存被语义校验拦截时中止发布，避免带着旧图继续走发布链路
    if (dirty.value) {
      const saved = await save()
      if (!saved) return
    }
    await publishProcessDef(defId.value)
    ElMessage.success(t('workflow.publishSucceeded'))
    await load()
  } catch (err) {
    ElMessage.error((err as { msg?: string }).msg ?? t('workflow.publishFailedZeroDeploy'))
  } finally {
    publishing.value = false
  }
}

/** 错误定位：聚焦错误对象（节点/边居中并高亮选择）。 */
function focusError(error: GraphValidationError) {
  const elementId = error.nodeKey ?? error.edgeKey ?? error.elementId ?? ''
  if (!elementId) return
  if (error.edgeKey) {
    selectionId.value = null
    return
  }
  selectNode(elementId)
  const node = canvasNodes.value.find((n) => n.id === elementId)
  if (node) {
    const current = viewBox.value
    viewBox.value = {
      ...current,
      x: node.x - current.w / 2,
      y: node.y - current.h / 2,
    }
  }
}

/* ─────────── 参与人策略（来源：服务端能力 validation.strategies，非前端手抄） ─────────── */

const selectedCapability = computed(() => {
  const node = selectedNode.value as PositionedNode | null
  return node ? (capabilities.value.find((cap) => cap.type === node.type) ?? null) : null
})

/* ─────────── P63 参与人结构化面板（APPROVAL/CONSENSUS） ─────────── */

/** 参与人结构化面板覆盖的节点类型；其余节点保持既有 approver/object 渲染路径。 */
const PARTICIPANT_PANEL_NODE_TYPES = ['APPROVAL', 'CONSENSUS']

/** 参与人策略展示名（本批改动文件域不含 locale 资源，文案先落在设计器，后续可迁 locale 键）。 */
const PARTICIPANT_STRATEGY_LABELS: Record<ParticipantStrategy, string> = {
  FIXED_USER: '选择人员',
  ROLE: '选择角色',
  DEPT_LEADER: '选择部门',
  POST: '选择岗位',
  DEPT_POST: '部门岗位',
  EXPRESSION: '表达式',
  ADAPTER: '外部适配器',
  FORM_FIELD: '表单字段',
  NODE_FORM_AGGREGATE: '节点表单聚合',
}

/** BF20261013-022④：参与人策略收敛为五项（其余仅作旧数据回显，不再提供新选）。 */
const ALLOWED_PARTICIPANT_STRATEGIES = ['FIXED_USER', 'DEPT_LEADER', 'ROLE', 'POST', 'EXPRESSION']

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
watch(
  () => graph.value?.formKey,
  (key) => {
    void loadBoundFormSchema(key ?? '')
  },
  { immediate: true },
)
/** 打开节点时检测到的参与人数据形态（旧数据兼容展示提示的依据）。 */
const participantShape = ref<ParticipantShapeKind>('empty')

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
  if (!selectedNode.value || !model || !participantField.value) return
  model.updateNodeConfig(selectedNode.value.id, {
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

/* ─────────── P63 动态并行专属面板 ─────────── */

const dynamicParallelActive = computed(() => selectedNode.value?.type === 'DYNAMIC_PARALLEL')
const dynamicParallelForm = ref<DynamicParallelFormDraft>(buildDynamicParallelFormDraft(null))

/** 动态并行面板提交：勾选新语义写 semanticVersion:2，旧语义不写该键（透传语义不受影响）。 */
function applyDynamicParallel() {
  if (!selectedNode.value || !model) return
  model.updateNodeConfig(selectedNode.value.id, {
    ...buildDynamicParallelConfig(dynamicParallelForm.value),
  })
}

/* 动态并行「固定值」直接选择：复用审批人候选弹窗（人员多选/部门树），保存稳定对象 ID。 */
const dynamicUserPickerVisible = ref(false)
const dynamicDeptPickerVisible = ref(false)
const dynamicFixedSelectedIdList = computed(() =>
  dynamicParallelForm.value.sourceValue
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== ''),
)
const dynamicFixedSelectedIds = computed(() =>
  dynamicFixedSelectedIdList.value.map(Number).filter((id) => Number.isFinite(id)),
)
function openDynamicUserPicker() {
  dynamicUserPickerVisible.value = true
}
function openDynamicDeptPicker() {
  dynamicDeptPickerVisible.value = true
}
function onDynamicUsersPicked(candidates: ApproverCandidate[]) {
  dynamicParallelForm.value.sourceValue = candidates
    .map((candidate) => String(candidate.id))
    .join(',')
  applyDynamicParallel()
}
function onDynamicDeptsPicked(depts: Array<{ id: string; name: string }>) {
  dynamicParallelForm.value.sourceValue = depts.map((dept) => dept.id).join(',')
  applyDynamicParallel()
}
/** 对象类型切换：人员/部门 ID 命名空间不同，清空旧取值避免把人员 ID 当部门 ID 保存。 */
function onDynamicObjectTypeChange() {
  dynamicParallelForm.value.sourceValue = ''
  applyDynamicParallel()
}

/* ─────────── P64 BF20261013-019 / BF20261013-027：审批节点发起子流程（三步向导） ─────────── */

/**
 * 「发起子流程」面板草稿。源头真值 = node.config.subflow；应用时同步两类生成物：
 *  1) 触发规则 subflow_<节点id>：本节点任务提交时按判断脚本决定是否发起（返回 1 = 发起）；
 *  2) SUBFLOW_WAIT 等待块（画布名「子流程」）：自动插入本节点出边之后，等本动作全部子流程
 *     完成才放行；判断为「不发起」时无批次，等待块到达即放行（不会卡住流程）。
 * 用户不接触动作 ID：等待引用由设计器自动接线。
 *
 * BF20261013-027 向导化：面板只留开关+入口，配置在弹窗内三步完成
 * （触发方式 → 子流程 → 初始值）；发起条数由数据与「汇总/单独」选择决定，不设条数配置。
 */
type SubflowMappingSource = 'FIELD' | 'LITERAL' | 'SCRIPT'

interface SubflowMappingDraft {
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

interface SubflowFormDraft {
  enabled: boolean
  targetProcessDefKey: string
  targetFormKey: string
  /** 触发方式：写脚本 / 选字段（字段值为真即发起）。 */
  triggerMode: 'SCRIPT' | 'FIELD'
  triggerField: string
  script: string
  mappings: SubflowMappingDraft[]
  /**
   * 派发粒度（由数据与「汇总/单独」选择决定，用户不配置条数）：
   * SINGLE=单条；EACH=表格行逐行单独；GROUPED=按列值同值汇总。
   */
  aggregate: 'SINGLE' | 'EACH' | 'GROUPED'
  groupBy: string
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
  }
}

const subflowForm = ref<SubflowFormDraft>(emptySubflowForm())

/** 节点配置 → 面板草稿（兼容 BF022⑧ 旧形状：mode/sourceVariable/取变量值/自由填写）。 */
function buildSubflowFormDraft(raw: Record<string, unknown> | undefined): SubflowFormDraft {
  const draft = emptySubflowForm()
  if (!raw) return draft
  draft.enabled = Boolean(raw.enabled)
  draft.targetProcessDefKey = String(raw.targetProcessDefKey ?? '')
  draft.targetFormKey = String(raw.targetFormKey ?? '')
  draft.triggerMode = raw.triggerMode === 'FIELD' ? 'FIELD' : 'SCRIPT'
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

/* ─────────── BF20261013-022②：统一脚本编辑弹窗 ─────────── */

const scriptDialogVisible = ref(false)
const scriptDialogTitle = ref('编辑脚本')
const scriptDialogCode = ref('')
/** 弹窗应用目标：触发器草稿 / 子流程判断脚本 / 子流程初始值 / 审批人表达式 / 节点触发器。 */
type ScriptDialogTarget =
  | { kind: 'triggerDraft' }
  | { kind: 'subflow' }
  | { kind: 'subflowMapping'; mapping: SubflowMappingDraft }
  | { kind: 'expression' }
  | { kind: 'nodeTrigger'; event: string }
let scriptDialogTarget: ScriptDialogTarget | null = null

function openProcessScriptDialog(title: string, code: string, target: ScriptDialogTarget) {
  scriptDialogTitle.value = title
  scriptDialogCode.value = code ?? ''
  scriptDialogTarget = target
  scriptDialogVisible.value = true
}

/**
 * 流程脚本模拟运行：交给服务端脚本引擎（与运行期同一 GraalJS + # 语法糖），
 * 变量按图定义声明传给服务端，由其按类型生成示例值并加载真实组织目录。
 */
async function simulateProcessScript(code: string) {
  const variables = (graph.value?.variables ?? []).map((item) => ({
    name: item.varId,
    type: item.type,
  }))
  const result = await previewProcessScript(code, variables)
  if (result.kind === 'OK') {
    return { ok: true, value: result.value, log: [] }
  }
  return {
    ok: false,
    log: [] as string[],
    error: result.errorMessage || `脚本执行失败（${result.kind}）`,
  }
}

function onScriptDialogSave(code: string) {
  const target = scriptDialogTarget
  if (!target) return
  if (target.kind === 'triggerDraft') {
    triggerDraft.value.script = code
  } else if (target.kind === 'subflow') {
    subflowForm.value.script = code
    applySubflow()
  } else if (target.kind === 'subflowMapping') {
    target.mapping.script = code
    applySubflow()
  } else if (target.kind === 'expression') {
    participantForm.value.genericValue = code
    applyParticipant()
  } else if (target.kind === 'nodeTrigger') {
    upsertNodeTriggerScript(target.event as TriggerConfig['event'], code)
  }
}

/** ①节点触发器：取该节点指定事件的触发器（不存在即未配置）。 */
function nodeTriggerOf(event: string): TriggerConfig | null {
  const node = selectedNode.value
  if (!node) return null
  const found = (graph.value?.triggers ?? []).find(
    (item) => item.event === event && item.nodeKey === node.id,
  )
  return found ?? null
}

/** ①节点触发器：状态文案（已配置仅显示业务状态，不展示脚本片段）。 */
function nodeTriggerSummary(event: string): string {
  const trigger = nodeTriggerOf(event)
  if (!trigger || !trigger.script?.trim()) return '未配置'
  return '已配置'
}

/** ①节点触发器：打开脚本弹窗（无则应用时创建；变量授权=全部已定义变量）。 */
function openNodeTriggerScriptDialog(event: string) {
  const node = selectedNode.value
  if (!node) return
  const existing = nodeTriggerOf(event)
  const title = event === 'NODE_ENTERING' ? '节点开始前触发脚本' : '节点结束触发脚本'
  openProcessScriptDialog(title, existing?.script ?? '', { kind: 'nodeTrigger', event })
}

/** ①节点触发器：应用脚本（存在则更新；不存在则创建无动作触发器——脚本副作用即用途）。 */
function upsertNodeTriggerScript(event: TriggerConfig['event'], code: string) {
  const node = selectedNode.value
  if (!graph.value || !node) return
  const triggerId = event === 'NODE_ENTERING' ? `node_enter_${node.id}` : `node_end_${node.id}`
  const triggers = (graph.value.triggers ?? []).filter((item) => item.triggerId !== triggerId)
  const trimmed = code.trim()
  const existing = nodeTriggerOf(event)
  if (!trimmed && !existing) {
    // 清空脚本且原无触发器：无需创建
    return
  }
  const name = event === 'NODE_ENTERING' ? '节点开始前触发' : '节点结束触发'
  triggers.push({
    triggerId,
    name,
    event,
    nodeKey: node.id,
    script: trimmed || 'return null;',
    variables: (graph.value.variables ?? []).map((item) => item.varId),
    branches: [],
    // 节点触发器无动作分支：脚本副作用即用途，返回值不参与匹配（执行记录 UNMATCHED 属正常）
    unmatchedDisposition: 'IGNORE',
    errorDisposition: 'IGNORE',
  })
  graph.value = { ...(graph.value ?? {}), triggers } as DesignerGraph
  dirty.value = true
}

/** ④参与人表达式：打开脚本弹窗（表达式=脚本，运行期由 SCRIPT 解析器求值）。 */
function openExpressionScriptDialog() {
  openProcessScriptDialog('审批人表达式脚本', participantForm.value.genericValue, {
    kind: 'expression',
  })
}

/* ─────────── BF20261013-027：子流程向导（触发方式 → 子流程 → 初始值） ─────────── */

const subflowWizardVisible = ref(false)
const subflowWizardStep = ref(0)
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
  const field = mainFormFields.value.find((item) => item.name === fieldName)
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
  const table = formSchemaFields.value.find((item) => item.name === tableField)
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
  const field = mainFormFields.value.find((item) => item.name === fieldName)
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

/** 向导步骤校验：①触发方式（脚本或字段）②子流程 ③初始值可空。 */
const subflowStepReady = computed(() => {
  const form = subflowForm.value
  if (subflowWizardStep.value === 0) {
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
  if (!model || !graph.value) return
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
    else if (mapping.sourceVarId) ensureMainFieldVariable(mapping.sourceVarId.replace(/^var_/, ''))
  }
  const rowMappings = form.mappings.filter((m) => m.source === 'FIELD' && m.itemField)
  // 派发粒度由数据来源决定：无表格列=单条；有表格列按「汇总/单独」选择
  const aggregate: SubflowFormDraft['aggregate'] =
    rowMappings.length === 0 ? 'SINGLE' : form.aggregate === 'GROUPED' ? 'GROUPED' : 'EACH'
  const sourceVariable =
    rowMappings.length === 0 ? '' : (ensureRowsVariable(rowMappings[0].tableField) ?? '')
  const groupBy = aggregate === 'GROUPED' ? (rowMappings[0]?.itemField ?? '') : ''
  model.updateNodeConfig(node.id, {
    subflow: {
      enabled: form.enabled,
      targetProcessDefKey: form.targetProcessDefKey,
      targetFormKey: form.targetFormKey,
      triggerMode: form.triggerMode,
      triggerField: form.triggerField,
      script: form.script,
      aggregate,
      groupBy,
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
      event: 'TASK_SUBMITTED',
      nodeKey: node.id,
      script: form.script.trim() || 'return 1;',
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
  if (!model) return
  const state = model.state()
  const waitId = subflowWaitNodeId(node.id)
  const existing = state.nodes.find((n) => n.id === waitId)
  if (!enabled) {
    if (existing) {
      const nextId = state.edges.find((edge) => edge.sourceId === waitId)?.targetId
      model.select(waitId)
      model.removeSelection()
      if (nextId) model.connect(node.id, nextId)
    }
    return
  }
  const actionId = subflowActionId(node.id)
  if (existing) {
    model.updateNodeConfig(waitId, { name: '子流程', waitActionIds: [actionId] })
    return
  }
  const edge = state.edges.find((item) => item.sourceId === node.id)
  if (!edge) return
  const waitNodeId = model.insertNodeOnEdge(
    edge.id,
    'SUBFLOW_WAIT',
    '子流程',
    Math.round((node.x + 160) / SNAP_X) * SNAP_X,
    node.y,
  )
  if (waitNodeId) model.updateNodeConfig(waitNodeId, { name: '子流程', waitActionIds: [actionId] })
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
    participantShape.value = 'empty'
    return
  }
  const fields = selectedCapability.value?.configFields ?? []
  const participantKey = participantField.value?.key
  const draft: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(node.config ?? {})) {
    if (key === participantKey) continue
    const field = fields.find((f) => f.key === key)
    draft[key] =
      field?.type === 'object' && value !== null && typeof value === 'object'
        ? JSON.stringify(value)
        : value
  }
  propForm.value = draft
  if (participantKey) {
    // 旧图可能只有 legacy approver 键：面板回显兜底读取，写入仍走 participantKey
    const config = node.config as Record<string, unknown> | undefined
    const legacyKey = participantKey === 'participant' ? 'approver' : 'participant'
    const raw =
      config?.[participantKey] ?? (config?.[legacyKey] as Record<string, unknown> | undefined)
    const built = buildParticipantFormDraft(raw)
    participantForm.value = built.draft
    participantShape.value = built.shape
  } else {
    participantShape.value = 'empty'
  }
  dynamicParallelForm.value = buildDynamicParallelFormDraft(node.config)
  // BF20261013-019/027：发起子流程面板回显（兼容旧形状）+ 目标选项装载（已发布流程，一次即可）
  if (node.type === 'APPROVAL') {
    const raw = (node.config as Record<string, unknown> | undefined)?.subflow as
      | Record<string, unknown>
      | undefined
    subflowForm.value = buildSubflowFormDraft(raw)
    if (!publishedTargetsLoaded) {
      publishedTargetsLoaded = true
      void loadPublishedTargetOptions()
    }
  } else {
    subflowForm.value = emptySubflowForm()
  }
})

/** BF20261013-027：可退回节点候选=本流程内其它人工节点（审批/会签），值=节点编号。 */
const returnTargetCandidates = computed(() =>
  (canvasNodes.value ?? [])
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

/** 通用字段渲染清单：name 由顶部承载；参与人字段由结构化面板承载；动态并行整表由专属面板承载；
 * nodeForm 由 P64 节点业务表单选择器承载；waitActionIds 不再手工配置（BF20261013-019，由设计器自动接线）。 */
const genericConfigFields = computed(() => {
  const fields = selectedCapability.value?.configFields ?? []
  if (dynamicParallelActive.value) return []
  const participantKey = participantField.value?.key
  return fields.filter(
    (field) =>
      field.key !== 'name' &&
      field.key !== participantKey &&
      field.key !== 'nodeForm' &&
      field.key !== 'waitActionIds' &&
      // BF20261013-022③④：object 型 JSON 文本配置与「审批人（兼容）」不再渲染
      field.type !== 'object' &&
      !isApproverSelectionField(field),
  )
})

/* ─────────── 加载 ─────────── */

async function load() {
  loading.value = true
  errorMsg.value = ''
  try {
    const [definition, caps] = await Promise.all([
      getProcessDefDefinition(defId.value),
      getProcessNodeCapabilities(),
    ])
    // BF20261013-019：子流程不再是独立节点——发起子流程配置在审批节点上，等待块由设计器自动生成
    capabilities.value = caps.filter((cap) => cap.type !== 'SUBFLOW_WAIT')
    graph.value = {
      processKey: definition.processKey,
      name: definition.name ?? '',
      formKey: definition.formKey ?? '',
      version: definition.version,
      contractVersion: (definition as { contractVersion?: number }).contractVersion,
      formName: (definition as { formName?: string }).formName,
      formDefId: (definition as { formDefId?: string }).formDefId,
      advancedConfig: (definition as { advancedConfig?: GraphAdvancedConfig }).advancedConfig,
      variables: (definition as { variables?: BpmVariableDef[] }).variables ?? [],
      triggers: (definition as { triggers?: TriggerConfig[] }).triggers ?? [],
      elements: (definition.elements ??
        []) as import('@/contracts/process-graph').ProcessGraphElement[],
      canvas: definition.canvas ?? {},
    } as ProcessGraphDocument
    await nextTick()
    if (!graph.value) {
      errorMsg.value = t('workflow.graphDataEmpty')
      return
    }
    model = createDesignerModel(
      graph.value,
      { width: P53_NODE_WIDTH, height: P53_NODE_HEIGHT },
      P53_GATEWAY_RADIUS,
    )
    // 复核02 G6a：订阅模型变更驱动脏状态与自动保存；加载时刻重置为真实未保存前状态
    model.subscribe(onModelChanged)
    lastSavedJson = currentGraphJson()
    dirty.value = false
    savedAtText.value = ''
    // 已绑定审批意见表单的节点：预先解析业务名称，属性面板不展示 formKey
    for (const element of graph.value.elements ?? []) {
      const nodeForm = (element.config as Record<string, unknown> | undefined)?.nodeForm as
        | { formKey?: string }
        | undefined
      void resolveNodeFormName(nodeForm?.formKey)
    }
    selectNode(null)
    snapshot()
    fitViewport()
  } catch (err) {
    errorMsg.value = (err as { msg?: string }).msg ?? t('workflow.processDefLoadFailed')
  } finally {
    loading.value = false
  }
}

watch(defId, () => void load(), { immediate: true })

let canvasObserver: ResizeObserver | null = null
onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  // BF20261013-022⑤：未保存时刷新/关闭走浏览器原生确认
  window.addEventListener('beforeunload', beforeUnloadGuard)
  // 画布尺寸变化时重新锚定适配（字体/布局就绪后初适配有偏差）
  canvasObserver = new ResizeObserver(() => {
    if (svgRef.value && svgRef.value.clientWidth > 0) fitViewport()
  })
  if (svgRef.value) canvasObserver.observe(svgRef.value)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('beforeunload', beforeUnloadGuard)
  canvasObserver?.disconnect()
  canvasObserver = null
})

function onKeydown(event: KeyboardEvent) {
  if ((event.target as HTMLElement)?.tagName?.match?.(/input|textarea|select/i)) return
  if (event.key === 'Delete' || event.key === 'Backspace') {
    if (selectionId.value) {
      event.preventDefault()
      removeSelected()
    }
  }
  // 设计09：撤销入口收敛为快捷键（工具栏按设计稿只保留草稿历史/保存/发布）
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault()
    undoEdit()
  }
}

function backToList() {
  if (returnAppForm.value) {
    void router.push({
      name: 'form-app-manage-form',
      params: { appId: returnAppForm.value.appId, formId: returnAppForm.value.formId },
    })
    return
  }
  if (returnFormId.value) {
    void router.push({ path: `/form/designer/${returnFormId.value}`, query: { tab: 'processes' } })
    return
  }
  void router.push('/workflow/defs')
}

function nodeLabelLines(label: string) {
  return label.length > 8 ? [label.slice(0, 8), label.slice(8)] : [label]
}
</script>

<template>
  <div class="designer-page">
    <div class="designer-toolbar">
      <el-button class="toolbar-settings" @click="backToList">
        <el-icon><ArrowLeft /></el-icon>
        <span>
          {{ returnFormId ? t('workflow.backToProcessList') : t('form.workbenchSettings') }}
        </span>
      </el-button>
      <span class="designer-crumb">
        / {{ graph?.formName || graph?.name || t('router.processDesigner') }} /
        {{ graph?.name || t('router.processDesigner')
        }}{{ graph?.version ? ` v${graph.version}` : '' }}
      </span>
      <span class="spacer" />
      <span class="designer-saved">{{
        dirty
          ? t('form.unsavedChanges')
          : savedAtText
            ? t('form.draftSavedAt', { time: savedAtText })
            : ''
      }}</span>
      <!-- 设计09：右侧操作组 = 草稿历史 + 保存 + 发布（撤销/删除/适配保留在画布缩放控件与快捷键） -->
      <div class="toolbar-actions">
        <el-button size="small" class="toolbar-drafts">{{ t('form.draftHistory') }}</el-button>
        <el-button size="small" :loading="saving" @click="save">{{ t('common.save') }}</el-button>
        <el-button size="small" type="primary" :loading="publishing" @click="publish">{{
          t('common.publish')
        }}</el-button>
      </div>
    </div>

    <el-alert
      v-if="errorMsg"
      :title="errorMsg"
      type="error"
      :closable="false"
      show-icon
      class="designer-alert"
    />

    <!-- 0.1.7 重构：第二行工具栏（撤销 / 整理布局 / 变量 / 触发器 / 高级配置 / 校验） -->
    <div class="designer-toolbar2">
      <el-button size="small" :disabled="!undoAvailable" @click="undoLast">{{
        t('common.undo')
      }}</el-button>
      <el-button size="small" @click="arrangeTopDown">{{ t('workflow.arrangeTopDown') }}</el-button>
      <span class="spacer" />
      <el-button size="small" class="workbar-advance" @click="openVariables">变量</el-button>
      <el-button size="small" class="workbar-advance" @click="openTriggers">触发器</el-button>
      <el-button size="small" class="workbar-advance" @click="advancedConfigVisible = true">{{
        t('workflow.advancedConfig')
      }}</el-button>
      <el-button size="small" class="workbar-verify" :loading="validating" @click="validate">{{
        t('workflow.validateFlow')
      }}</el-button>
    </div>

    <div class="designer-main">
      <!-- 0.1.7 重构：节点面板移到左侧竖栏（分组 + 图标块，拖拽/点击添加） -->
      <aside class="designer-palette">
        <section v-for="group in paletteGroups" :key="group.category" class="palette-group">
          <h4 class="palette-group__title">{{ group.label }}</h4>
          <div class="palette-group__grid">
            <button
              v-for="cap in group.items"
              :key="cap.type"
              type="button"
              class="palette-item"
              :class="{ 'palette-item--disabled': !cap.supports.design }"
              :draggable="cap.supports.design"
              @dragstart="onPaletteDragStart($event, cap)"
              @click="onWorkbarClick(cap)"
            >
              <svg
                class="workbar-icon"
                width="20"
                height="20"
                viewBox="0 0 20 20"
                aria-hidden="true"
              >
                <template v-if="cap.type === 'START'">
                  <path d="M6.667 3.333L16.667 10L6.667 16.667V3.333Z" />
                </template>
                <template v-else-if="cap.type === 'DRAFT'">
                  <path
                    d="M11.667 2.5H3.333V17.5H16.667V7.5H11.667V2.5ZM9.167 13.333L15.833 6.667L17.5 8.333L10.833 15L8.333 15.833L9.167 13.333Z"
                  />
                </template>
                <template v-else-if="cap.type === 'APPROVAL'">
                  <path
                    d="M17.5 11.667C18.881 11.667 20 10.547 20 9.167C20 7.786 18.881 6.667 17.5 6.667C16.119 6.667 15 7.786 15 9.167C15 10.547 16.119 11.667 17.5 11.667Z"
                  />
                  <path
                    d="M10.833 18.333C10.833 17.228 11.272 16.168 12.054 15.387C12.835 14.606 13.895 14.167 15 14.167C16.105 14.167 17.165 14.606 17.946 15.387C18.728 16.168 19.167 17.228 19.167 18.333"
                  />
                </template>
                <template v-else-if="cap.type === 'CONSENSUS'">
                  <path
                    d="M12.5 9.167C14.341 9.167 15.833 7.674 15.833 5.833C15.833 3.992 14.341 2.5 12.5 2.5C10.659 2.5 9.167 3.992 9.167 5.833C9.167 7.674 10.659 9.167 12.5 9.167Z"
                  />
                  <path
                    d="M3.333 17.5C3.333 15.732 4.036 14.036 5.286 12.786C6.536 11.536 8.232 10.833 10 10.833C11.768 10.833 13.464 11.536 14.714 12.786C15.964 14.036 16.667 15.732 16.667 17.5"
                  />
                </template>
                <template v-else-if="cap.type === 'CONDITION'">
                  <path d="M12 1.667L20.333 10L12 18.333L3.667 10L12 1.667Z" />
                </template>
                <!-- P63 并行网关与条件分支同为菱形语义（分叉/汇合） -->
                <template v-else-if="cap.type === 'PARALLEL_GATEWAY'">
                  <path d="M10 1.667L18.333 10L10 18.333L1.667 10L10 1.667Z" />
                  <path d="M10 6.667V13.333M6.667 10H13.333" />
                </template>
                <template v-else-if="cap.type === 'NOTIFICATION'">
                  <path d="M11.667 1.667H4.167V18.333H15.833V5.833L11.667 1.667V1.667Z" />
                </template>
                <template v-else-if="cap.type === 'IOT_COMMAND'">
                  <path
                    d="M13.333 5H6.667C5.746 5 5 5.746 5 6.667V13.333C5 14.254 5.746 15 6.667 15H13.333C14.254 15 15 14.254 15 13.333V6.667C15 5.746 14.254 5 13.333 5Z"
                  />
                  <path
                    d="M7.5 1.667V5M12.5 1.667V5M7.5 15V18.333M12.5 15V18.333M1.667 7.5H5M1.667 12.5H5M15 7.5H18.333M15 12.5H18.333"
                  />
                </template>
                <template v-else-if="cap.type === 'AGENT'">
                  <path
                    d="M15 4.167H5C3.619 4.167 2.5 5.286 2.5 6.667V14.167C2.5 15.547 3.619 16.667 5 16.667H15C16.381 16.667 17.5 15.547 17.5 14.167V6.667C17.5 5.286 16.381 4.167 15 4.167Z"
                  />
                  <path
                    d="M10 1.667V4.167M6.667 8.333H6.75M13.333 8.333H13.417M6.667 12.5H13.333"
                  />
                </template>
                <template v-else>
                  <path
                    d="M15 3.333H5C4.079 3.333 3.333 4.08 3.333 5V15.833C3.333 16.754 4.079 17.5 5 17.5H15C15.92 17.5 16.667 16.754 16.667 15.833V5C16.667 4.08 15.92 3.333 15 3.333Z"
                  />
                  <path d="M6.667 10L9.167 12.5L13.333 7.5M7.5 1.667H12.5V5H7.5V1.667Z" />
                </template>
              </svg>
              <span class="palette-item__name">{{ cap.displayName }}</span>
            </button>
          </div>
        </section>
      </aside>

      <div class="designer-body">
        <!-- 画布（P53 节点09：24px 网格底 + 缩放控件 + 底部操作提示） -->
        <div class="designer-canvas-wrap">
          <svg
            ref="svgRef"
            class="pg-svg"
            :class="{ 'pg-svg-dragging': activeDragCursor !== null }"
            :style="activeDragCursor ? { '--pg-drag-cursor': activeDragCursor } : undefined"
            :width="'100%'"
            :height="'100%'"
            :viewBox="`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`"
            @wheel="onWheel"
            @pointerdown="onBgPointerDown"
            @pointermove="onPointerMove"
            @pointerup="onPointerUp"
            @pointercancel="onPointerUp"
            @dragover.prevent
            @drop="onCanvasDrop"
          >
            <defs>
              <pattern id="designer-grid" width="24" height="24" patternUnits="userSpaceOnUse">
                <path d="M24 0H0V24" fill="none" stroke="#eef2f8" stroke-width="1" />
              </pattern>
              <marker
                id="designer-edge-arrow"
                markerUnits="userSpaceOnUse"
                markerWidth="8.5"
                markerHeight="7"
                refX="8.2"
                refY="3.5"
                orient="auto"
              >
                <path d="M0,0 L8.5,3.5 L0,7 z" class="designer-edge-arrow" />
              </marker>
              <marker
                id="designer-edge-arrow-selected"
                markerUnits="userSpaceOnUse"
                markerWidth="8.5"
                markerHeight="7"
                refX="8.2"
                refY="3.5"
                orient="auto"
              >
                <path d="M0,0 L8.5,3.5 L0,7 z" class="designer-edge-arrow-selected" />
              </marker>
            </defs>
            <rect class="pg-bg" x="-100000" y="-100000" width="200000" height="200000" />
            <template v-for="edge in canvasEdges" :key="edge.id">
              <path
                :d="edgePathOf(edge)"
                fill="none"
                class="designer-edge"
                :class="{ 'designer-edge-selected': selectionId === edge.id }"
                stroke-width="10"
                stroke="transparent"
                :style="{ cursor: edgeHitCursor(edge) }"
                :data-edge-id="edge.id"
                @pointerdown.stop="onEdgePointerDown($event, edge)"
                @pointermove="onEdgeHoverMove($event, edge)"
                @pointerleave="onEdgeHoverLeave(edge)"
              />
              <path
                :d="edgePathOf(edge)"
                fill="none"
                class="designer-edge-visual"
                :class="{ 'designer-edge-selected': selectionId === edge.id }"
                stroke-width="1.6"
                pointer-events="none"
              />
            </template>
            <path
              v-if="pendingConnectTarget"
              :d="
                buildEdgePath(
                  { x: pendingConnectPos?.x ?? 0, y: pendingConnectPos?.y ?? 0 },
                  { x: pendingConnectTarget.x, y: pendingConnectTarget.y },
                  [],
                )
              "
              fill="none"
              class="designer-edge-pending"
              stroke-dasharray="6 4"
            />
            <g
              v-for="node in canvasNodes"
              :key="node.id"
              :transform="
                isGatewayShape(node.type)
                  ? `translate(${node.x - P53_GATEWAY_RADIUS}, ${node.y - P53_GATEWAY_RADIUS})`
                  : `translate(${node.x - P53_NODE_WIDTH / 2}, ${node.y - P53_NODE_HEIGHT / 2})`
              "
              class="designer-node"
              :class="{
                'designer-node-selected': selectionId === node.id,
                'designer-node-error': validationErrors.some((e) => e.nodeKey === node.id),
                'designer-node-start': node.type === 'START',
                'designer-node-end': node.type === 'END',
                'designer-node-draft': node.config?.nodeClass === 'draft',
              }"
              :data-node-id="node.id"
              @pointerdown="startNodeDrag($event, node)"
              @pointerup="onNodePointerUp($event, node)"
            >
              <rect
                v-if="!isGatewayShape(node.type) && !isEventShape(node.type)"
                :width="P53_NODE_WIDTH"
                :height="P53_NODE_HEIGHT"
                rx="8"
                class="designer-node-rect"
              />
              <!-- 0.1.7：开始/结束为小圆形图标节点，名称置于图标下方 -->
              <circle
                v-else-if="isEventShape(node.type)"
                :cx="P53_NODE_WIDTH / 2"
                :cy="P53_NODE_HEIGHT / 2"
                r="18"
                class="designer-node-rect designer-node-event"
              />
              <!-- 网关为小菱形（+号），名称置于菱形下方 -->
              <template v-else>
                <polygon
                  points="18,0 36,18 18,36 0,18"
                  class="designer-node-rect designer-node-gateway"
                />
                <path d="M18 9 V27 M9 18 H27" class="designer-node-gateway-plus" />
              </template>
              <!-- V011-BUG-023：四向锚点（上下左右缘中点）均可拖拽/点选拉线（ProcessOn 口径） -->
              <circle
                v-if="selectionId === node.id && !isGatewayShape(node.type)"
                :cx="isEventShape(node.type) ? P53_NODE_WIDTH / 2 - 18 : 0"
                :cy="P53_NODE_HEIGHT / 2"
                r="3"
                class="designer-node-port"
                @pointerdown.stop="startConnect($event, node, 'left')"
              />
              <circle
                v-if="selectionId === node.id && !isGatewayShape(node.type)"
                :cx="isEventShape(node.type) ? P53_NODE_WIDTH / 2 + 18 : P53_NODE_WIDTH"
                :cy="P53_NODE_HEIGHT / 2"
                r="3"
                class="designer-node-port"
                @pointerdown.stop="startConnect($event, node, 'right')"
              />
              <circle
                v-if="selectionId === node.id && !isGatewayShape(node.type)"
                :cx="P53_NODE_WIDTH / 2"
                :cy="isEventShape(node.type) ? P53_NODE_HEIGHT / 2 - 18 : 0"
                r="3"
                class="designer-node-port"
                @pointerdown.stop="startConnect($event, node, 'top')"
              />
              <circle
                v-if="selectionId === node.id && !isGatewayShape(node.type)"
                :cx="P53_NODE_WIDTH / 2"
                :cy="isEventShape(node.type) ? P53_NODE_HEIGHT / 2 + 18 : P53_NODE_HEIGHT"
                r="3"
                class="designer-node-port"
                @pointerdown.stop="startConnect($event, node, 'bottom')"
              />
              <!-- 设计09：节点图标为锁定 SVG 矢量字形（22×22，起点 (12,14)） -->
              <g
                v-if="!isGatewayShape(node.type)"
                class="designer-node-icon"
                :transform="
                  isEventShape(node.type)
                    ? `translate(${P53_NODE_WIDTH / 2 - 11} ${P53_NODE_HEIGHT / 2 - 11})`
                    : 'translate(12 14)'
                "
              >
                <template v-if="node.type === 'START'">
                  <path d="M7.333 3.667L18.333 11L7.333 18.333V3.667Z" />
                </template>
                <template v-else-if="node.type === 'END'">
                  <path
                    d="M16.5 3.667H5.5C4.488 3.667 3.667 4.488 3.667 5.5V17.417C3.667 18.429 4.488 19.25 5.5 19.25H16.5C17.513 19.25 18.333 18.429 18.333 17.417V5.5C18.333 4.488 17.513 3.667 16.5 3.667Z"
                  />
                  <path d="M7.333 11L10.083 13.75L14.667 8.25M8.25 1.833H13.75V5.5H8.25V1.833Z" />
                </template>
                <template v-else-if="node.config?.nodeClass === 'draft'">
                  <path
                    d="M12.833 2.75H3.667V19.25H18.333V8.25H12.833V2.75ZM10.083 14.667L17.417 7.333L19.25 9.167L11.917 16.5L9.167 17.417L10.083 14.667Z"
                  />
                </template>
                <template v-else>
                  <path
                    d="M15.583 2.75H3.667C3.16 2.75 2.75 3.16 2.75 3.667V18.333C2.75 18.84 3.16 19.25 3.667 19.25H15.583C16.09 19.25 16.5 18.84 16.5 18.333V3.667C16.5 3.16 16.09 2.75 15.583 2.75Z"
                  />
                  <path d="M5.5 6.417H12.833M5.5 10.083H11M5.5 13.75H9.167" />
                  <path
                    d="M16.5 15.583C18.019 15.583 19.25 14.352 19.25 12.833C19.25 11.315 18.019 10.083 16.5 10.083C14.981 10.083 13.75 11.315 13.75 12.833C13.75 14.352 14.981 15.583 16.5 15.583Z"
                  />
                  <path
                    d="M11.917 20.167C11.917 18.951 12.4 17.785 13.259 16.926C14.119 16.066 15.285 15.583 16.5 15.583C17.716 15.583 18.881 16.066 19.741 16.926C20.601 17.785 21.083 18.951 21.083 20.167"
                  />
                </template>
              </g>
              <text
                v-if="isEventShape(node.type)"
                :x="P53_NODE_WIDTH / 2"
                :y="P53_NODE_HEIGHT / 2 + 40"
                text-anchor="middle"
                class="designer-node-label"
              >
                {{ node.label }}
              </text>
              <text
                v-else-if="!isGatewayShape(node.type)"
                :x="42"
                :y="P53_NODE_HEIGHT / 2 + (nodeLabelLines(node.label).length > 1 ? -5 : 2)"
                text-anchor="start"
                class="designer-node-label"
              >
                <tspan
                  v-for="(line, lineIndex) in nodeLabelLines(node.label)"
                  :key="lineIndex"
                  :x="42"
                  :dy="lineIndex === 0 ? 0 : 17"
                >
                  {{ line }}
                </tspan>
              </text>
              <text
                v-else
                x="18"
                y="52"
                text-anchor="middle"
                class="designer-node-label designer-node-label--gateway"
              >
                {{ node.label }}
              </text>
            </g>
            <!-- V011-BUG-025 / BF20261013-030：把连线编辑手柄放在节点之后，确保端点不被节点盒遮挡。 -->
            <template v-for="edge in canvasEdges" :key="'handles-' + edge.id">
              <template v-if="selectionId === edge.id">
                <!-- BF20261013-030：内段中点手柄（垂直段左右拖 / 水平段上下拖，方向光标随轴） -->
                <rect
                  v-for="handle in edgeSegmentHandlesOf(edge)"
                  :key="'seg-' + edge.id + '-' + handle.index"
                  :x="handle.x - 4.5"
                  :y="handle.y - 4.5"
                  width="9"
                  height="9"
                  rx="1.5"
                  class="designer-edge-segment-handle"
                  :style="{ cursor: handle.cursor }"
                  @pointerdown.stop="beginSegmentDragFromHandle($event, edge, handle)"
                />
                <circle
                  :cx="pathPoints(edge.path)[0]?.x ?? 0"
                  :cy="pathPoints(edge.path)[0]?.y ?? 0"
                  r="5"
                  class="designer-edge-endpoint"
                  @pointerdown.stop="beginEndpointDrag($event, edge, 'source')"
                />
                <circle
                  :cx="pathPoints(edge.path)[pathPoints(edge.path).length - 1]?.x ?? 0"
                  :cy="pathPoints(edge.path)[pathPoints(edge.path).length - 1]?.y ?? 0"
                  r="5"
                  class="designer-edge-endpoint"
                  @pointerdown.stop="beginEndpointDrag($event, edge, 'target')"
                />
              </template>
            </template>
          </svg>
          <div class="canvas-zoom">
            <button type="button" class="zoom-btn" @click="zoomView(1 / 1.1)">−</button>
            <span class="zoom-value">{{ zoomPercent }}%</span>
            <button type="button" class="zoom-btn" @click="zoomView(1.1)">＋</button>
            <button type="button" class="zoom-fit" @click="fitViewport">
              {{ t('workflow.fitView') }}
            </button>
          </div>
        </div>

        <!-- 属性面板：字段由服务端能力 configFields + 参与人策略驱动 -->
        <div class="designer-props">
          <template v-if="selectedNode">
            <div class="props-heading">
              <span class="props-title">{{ t('workflow.nodePropsTitle') }}</span>
            </div>

            <!-- BF20261013-013：页签（字段属性仅非结束节点） -->
            <div v-if="fieldConfigCapable" class="props-tabs">
              <button
                type="button"
                class="props-tab"
                :class="{ 'is-active': nodePropsTab === 'basic' }"
                @click="nodePropsTab = 'basic'"
              >
                {{ t('workflow.basicPropsSection') }}
              </button>
              <button
                type="button"
                class="props-tab"
                :class="{ 'is-active': nodePropsTab === 'fields' }"
                @click="nodePropsTab = 'fields'"
              >
                {{ t('workflow.fieldPropsTab') }}
              </button>
            </div>

            <template v-if="nodePropsTab === 'basic' || !fieldConfigCapable">
              <div v-if="!fieldConfigCapable" class="props-section">
                {{ t('workflow.basicPropsSection') }}
              </div>
              <!-- 0.1.7 #36（Owner）：面板内不再混用 small 尺寸——输入框/选择器/按钮统一 32px 高 -->
              <el-form label-position="top">
                <el-form-item :label="t('workflow.nodeName')">
                  <el-input
                    :model-value="propForm.name as string"
                    @input="onNodeNameInput"
                    @change="applyProps"
                    @blur="applyProps"
                    @keyup.enter="applyProps"
                  />
                </el-form-item>
                <!-- 节点编号 / 审批方式（定义 config 元数据；只读展示） -->
                <el-form-item v-if="nodeMeta.approveMode" :label="t('workflow.approveModeLabel')">
                  <el-input :model-value="nodeMeta.approveModeLabel" disabled />
                </el-form-item>
                <!-- ═══ P63 参与人结构化面板（APPROVAL/CONSENSUS）：策略下拉 + 按策略取值编辑 ═══ -->
                <template v-if="participantField">
                  <el-form-item label="审批人策略">
                    <el-select v-model="participantForm.strategy" @change="applyParticipant">
                      <el-option
                        v-for="option in participantStrategyOptions"
                        :key="option.value"
                        :label="option.label"
                        :value="option.value"
                      />
                    </el-select>
                  </el-form-item>
                  <!-- FIXED_USER：人员多选（复用审批人候选弹窗人员页签；id 数组保持精度） -->
                  <el-form-item v-if="participantForm.strategy === 'FIXED_USER'" label="指定人员">
                    <div class="participant-picker-row">
                      <el-button @click="openParticipantUserPicker">
                        {{
                          participantForm.userIds.length > 0
                            ? `已选 ${participantForm.userIds.length} 人（点击修改）`
                            : '选择审批人'
                        }}
                      </el-button>
                      <small v-if="nodeMeta.approverName" class="participant-hint">
                        {{ nodeMeta.approverName }}
                      </small>
                    </div>
                  </el-form-item>
                  <!-- DEPT_LEADER：部门多选（复用弹窗部门树勾选，运行期服务端解析唯一负责人） -->
                  <el-form-item
                    v-else-if="participantForm.strategy === 'DEPT_LEADER'"
                    label="部门多选"
                  >
                    <el-button @click="openParticipantDeptPicker">
                      {{
                        participantForm.deptIds.length > 0
                          ? `已选 ${participantForm.deptIds.length} 个部门（点击修改）`
                          : '选择部门'
                      }}
                    </el-button>
                  </el-form-item>
                  <!-- FORM_FIELD：来源表单（objectType + scope + 字段绑定） -->
                  <template v-else-if="participantForm.strategy === 'FORM_FIELD'">
                    <el-form-item label="对象类型">
                      <el-radio-group
                        v-model="participantForm.formField.objectType"
                        @change="applyParticipant"
                      >
                        <el-radio value="USER">人员（所选人员审批）</el-radio>
                        <el-radio value="DEPT">部门（解析唯一负责人）</el-radio>
                      </el-radio-group>
                    </el-form-item>
                    <el-form-item label="取值范围">
                      <el-radio-group
                        v-model="participantForm.formField.scope"
                        @change="applyParticipant"
                      >
                        <el-radio value="MAIN">主表字段</el-radio>
                        <el-radio value="TABLE">表格字段</el-radio>
                      </el-radio-group>
                    </el-form-item>
                    <el-form-item label="主字段">
                      <el-select
                        v-model="participantForm.formField.field"
                        filterable
                        placeholder="选择主表字段"
                        @change="applyParticipant"
                      >
                        <el-option
                          v-for="option in mainFieldOptionsFor(
                            participantForm.formField.objectType,
                          )"
                          :key="option.name"
                          :label="option.label || '未命名字段'"
                          :value="option.name"
                        />
                      </el-select>
                    </el-form-item>
                    <template v-if="participantForm.formField.scope === 'TABLE'">
                      <el-form-item label="表格字段">
                        <el-select
                          v-model="participantForm.formField.tableField"
                          filterable
                          placeholder="选择表格字段"
                          @change="
                            () => {
                              participantForm.formField.column = ''
                              applyParticipant()
                            }
                          "
                        >
                          <el-option
                            v-for="option in tableFieldOptions"
                            :key="option.name"
                            :label="option.label || '未命名字段'"
                            :value="option.name"
                          />
                        </el-select>
                      </el-form-item>
                      <el-form-item label="表格列">
                        <el-select
                          v-model="participantForm.formField.column"
                          filterable
                          placeholder="选择表格列"
                          @change="applyParticipant"
                        >
                          <el-option
                            v-for="option in tableColumnOptionsFor(
                              participantForm.formField.tableField,
                              participantForm.formField.objectType,
                            )"
                            :key="option.name"
                            :label="option.label || '未命名字段'"
                            :value="option.name"
                          />
                        </el-select>
                      </el-form-item>
                    </template>
                  </template>
                  <!-- NODE_FORM_AGGREGATE：来源节点 + 人员字段 + 轮次口径（P64 A07 聚合会签） -->
                  <template v-else-if="participantForm.strategy === 'NODE_FORM_AGGREGATE'">
                    <el-form-item label="来源节点">
                      <el-select
                        v-model="participantForm.aggregate.nodeKey"
                        filterable
                        placeholder="选择来源节点（读取该节点本轮全部有效最终提交）"
                        @change="applyParticipant"
                      >
                        <el-option
                          v-for="node in graphNodes"
                          :key="node.id"
                          :label="graphNodeLabel(node)"
                          :value="node.id"
                        />
                      </el-select>
                    </el-form-item>
                    <el-form-item label="人员字段">
                      <el-select
                        v-model="participantForm.aggregate.formField"
                        filterable
                        allow-create
                        placeholder="选择或填写人员字段名（并集去重生成下一轮参与人）"
                        @change="applyParticipant"
                      >
                        <el-option
                          v-for="option in mainFieldOptionsFor('USER')"
                          :key="option.name"
                          :label="option.label || '未命名字段'"
                          :value="option.name"
                        />
                      </el-select>
                    </el-form-item>
                    <el-form-item label="轮次口径">
                      <el-radio-group
                        v-model="participantForm.aggregate.round"
                        @change="applyParticipant"
                      >
                        <el-radio value="">当前轮（缺省）</el-radio>
                        <el-radio value="PREVIOUS">上一轮</el-radio>
                      </el-radio-group>
                    </el-form-item>
                  </template>
                  <!-- BF20261013-022②④：表达式走脚本弹窗；ROLE/POST 保留逗号取值 -->
                  <el-form-item
                    v-else-if="participantForm.strategy === 'EXPRESSION'"
                    label="表达式（脚本）"
                  >
                    <div class="participant-picker-row">
                      <el-button @click="openExpressionScriptDialog">
                        {{ participantForm.genericValue ? '编辑脚本' : '编写脚本' }}
                      </el-button>
                      <small v-if="participantForm.genericValue" class="participant-hint">
                        已配置
                      </small>
                    </div>
                  </el-form-item>
                  <el-form-item v-else label="取值">
                    <el-input
                      v-model="participantForm.genericValue"
                      placeholder="多个取值用英文逗号分隔"
                      @change="applyParticipant"
                      @blur="applyParticipant"
                    />
                  </el-form-item>
                  <el-alert
                    v-if="participantLegacyNote"
                    :title="participantLegacyNote"
                    type="info"
                    :closable="false"
                    class="participant-legacy-note"
                  />
                </template>
                <!-- ═══ P64 阶段Ⅰ：节点业务表单绑定（APPROVAL/CONSENSUS/DYNAMIC_PARALLEL）；
                   BF20261013-020：节点绑定的是审批意见表单（独立类型，流程管理单独维护） ═══ -->
                <el-form-item v-if="nodeFormCapable" label="审批意见表单">
                  <div class="nodeform-row">
                    <el-input :model-value="selectedNodeFormName" disabled />
                    <el-button @click="nodeFormSelectVisible = true">
                      {{ selectedNodeFormKey ? '更换' : '选择表单' }}
                    </el-button>
                    <el-button v-if="selectedNodeFormKey" @click="clearNodeForm">清除</el-button>
                  </div>
                </el-form-item>
                <!-- ═══ BF20261013-022①：节点触发器（开始前 / 结束），脚本经统一弹窗编写 ═══ -->
                <template v-if="nodeTriggerCapable">
                  <div class="props-section props-section--advanced">节点触发器</div>
                  <el-form-item label="节点开始前">
                    <div class="participant-picker-row">
                      <el-button @click="openNodeTriggerScriptDialog('NODE_ENTERING')">
                        {{
                          nodeTriggerOf('NODE_ENTERING')?.script?.trim() ? '编辑脚本' : '编写脚本'
                        }}
                      </el-button>
                      <small class="participant-hint">{{
                        nodeTriggerSummary('NODE_ENTERING')
                      }}</small>
                    </div>
                  </el-form-item>
                  <el-form-item label="节点结束">
                    <div class="participant-picker-row">
                      <el-button @click="openNodeTriggerScriptDialog('NODE_ROUND_COMPLETED')">
                        {{
                          nodeTriggerOf('NODE_ROUND_COMPLETED')?.script?.trim()
                            ? '编辑脚本'
                            : '编写脚本'
                        }}
                      </el-button>
                      <small class="participant-hint">{{
                        nodeTriggerSummary('NODE_ROUND_COMPLETED')
                      }}</small>
                    </div>
                  </el-form-item>
                </template>
                <!-- ═══ BF20261013-019/027：发起子流程（开关 + 向导弹窗；等待块由设计器自动生成） ═══ -->
                <template v-if="selectedNode.type === 'APPROVAL'">
                  <el-form-item label="发起子流程">
                    <div class="participant-picker-row">
                      <el-switch v-model="subflowForm.enabled" @change="onSubflowSwitch" />
                      <el-button v-if="subflowForm.enabled" @click="openSubflowWizard">
                        {{ subflowForm.targetProcessDefKey ? '修改配置' : '配置子流程' }}
                      </el-button>
                      <small v-if="subflowSummary" class="participant-hint">{{
                        subflowSummary
                      }}</small>
                    </div>
                  </el-form-item>
                </template>
                <!-- ═══ P63 动态并行专属面板（semanticVersion 开关 = 新语义按对象分支） ═══ -->
                <template v-if="dynamicParallelActive">
                  <el-form-item label="分支来源类型">
                    <el-select
                      v-model="dynamicParallelForm.sourceType"
                      @change="applyDynamicParallel"
                    >
                      <el-option label="表单字段" value="FORM_FIELD" />
                      <el-option label="流程变量" value="VARIABLE" />
                      <el-option label="固定值" value="FIXED" />
                    </el-select>
                  </el-form-item>
                  <el-form-item v-if="dynamicParallelForm.sourceType === 'FIXED'" label="固定值">
                    <!-- 新语义下直接选择人员/部门对象（稳定 ID）；旧语义保留手填取值形状 -->
                    <div v-if="dynamicParallelForm.objectSemantic" class="participant-picker-row">
                      <el-button
                        v-if="dynamicParallelForm.objectType === 'USER'"
                        @click="openDynamicUserPicker"
                      >
                        {{
                          dynamicFixedSelectedIdList.length > 0
                            ? `已选 ${dynamicFixedSelectedIdList.length} 人（点击修改）`
                            : '选择人员'
                        }}
                      </el-button>
                      <el-button v-else @click="openDynamicDeptPicker">
                        {{
                          dynamicFixedSelectedIdList.length > 0
                            ? `已选 ${dynamicFixedSelectedIdList.length} 个部门（点击修改）`
                            : '选择部门'
                        }}
                      </el-button>
                    </div>
                    <el-input
                      v-else
                      v-model="dynamicParallelForm.sourceValue"
                      placeholder="多个取值用英文逗号分隔"
                      @change="applyDynamicParallel"
                      @blur="applyDynamicParallel"
                    />
                  </el-form-item>
                  <el-form-item
                    v-else-if="dynamicParallelForm.sourceType === 'VARIABLE'"
                    label="变量名"
                  >
                    <el-input
                      v-model="dynamicParallelForm.sourceValue"
                      placeholder="请输入变量名"
                      @change="applyDynamicParallel"
                      @blur="applyDynamicParallel"
                    />
                  </el-form-item>
                  <el-form-item v-else-if="dynamicParallelForm.scope === 'MAIN'" label="主字段">
                    <el-select
                      v-model="dynamicParallelForm.sourceValue"
                      filterable
                      placeholder="选择主表字段"
                      @change="applyDynamicParallel"
                    >
                      <el-option
                        v-for="option in mainFieldOptionsFor(dynamicParallelForm.objectType)"
                        :key="option.name"
                        :label="option.label || '未命名字段'"
                        :value="option.name"
                      />
                    </el-select>
                  </el-form-item>
                  <!-- 对象类型仅新语义（按对象分支）下有意义，随 semanticVersion 开关显示 -->
                  <el-form-item v-if="dynamicParallelForm.objectSemantic" label="对象类型">
                    <el-radio-group
                      v-model="dynamicParallelForm.objectType"
                      @change="onDynamicObjectTypeChange"
                    >
                      <el-radio value="USER">人员（逐人分支）</el-radio>
                      <el-radio value="DEPT">部门（逐部门分支）</el-radio>
                    </el-radio-group>
                  </el-form-item>
                  <el-form-item label="取值范围">
                    <el-radio-group
                      v-model="dynamicParallelForm.scope"
                      @change="applyDynamicParallel"
                    >
                      <el-radio value="MAIN">主表字段</el-radio>
                      <el-radio value="TABLE">表格字段</el-radio>
                    </el-radio-group>
                  </el-form-item>
                  <template v-if="dynamicParallelForm.scope === 'TABLE'">
                    <el-form-item label="表格字段">
                      <el-select
                        v-model="dynamicParallelForm.tableField"
                        filterable
                        placeholder="选择表格字段"
                        @change="
                          () => {
                            dynamicParallelForm.column = ''
                            applyDynamicParallel()
                          }
                        "
                      >
                        <el-option
                          v-for="option in tableFieldOptions"
                          :key="option.name"
                          :label="option.label || '未命名字段'"
                          :value="option.name"
                        />
                      </el-select>
                    </el-form-item>
                    <el-form-item label="表格列">
                      <el-select
                        v-model="dynamicParallelForm.column"
                        filterable
                        placeholder="选择表格列"
                        @change="
                          () => {
                            dynamicParallelForm.sourceValue = dynamicParallelForm.column
                            applyDynamicParallel()
                          }
                        "
                      >
                        <el-option
                          v-for="option in tableColumnOptionsFor(
                            dynamicParallelForm.tableField,
                            dynamicParallelForm.objectType,
                          )"
                          :key="option.name"
                          :label="option.label || '未命名字段'"
                          :value="option.name"
                        />
                      </el-select>
                    </el-form-item>
                  </template>
                  <el-form-item label="完成模式">
                    <el-select v-model="dynamicParallelForm.mode" @change="applyDynamicParallel">
                      <el-option label="全部通过（ALL）" value="ALL" />
                      <el-option label="任一通过（ANY）" value="ANY" />
                      <el-option label="按比例通过（RATIO）" value="RATIO" />
                      <el-option label="一票否决（VETO）" value="VETO" />
                    </el-select>
                  </el-form-item>
                  <el-form-item v-if="dynamicParallelForm.mode === 'RATIO'" label="通过比例（%）">
                    <el-input-number
                      v-model="dynamicParallelForm.ratio"
                      :min="1"
                      :max="100"
                      @change="applyDynamicParallel"
                    />
                  </el-form-item>
                  <el-form-item label="最大分支数">
                    <el-input-number
                      v-model="dynamicParallelForm.maxBranches"
                      :min="1"
                      @change="applyDynamicParallel"
                    />
                  </el-form-item>
                  <el-form-item label="空来源处置">
                    <el-select
                      v-model="dynamicParallelForm.emptyStrategy"
                      @change="applyDynamicParallel"
                    >
                      <el-option label="阻断" value="BLOCK" />
                      <el-option label="放行" value="PROCEED" />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="无效值处置">
                    <el-select
                      v-model="dynamicParallelForm.invalidStrategy"
                      @change="applyDynamicParallel"
                    >
                      <el-option label="阻断" value="BLOCK" />
                      <el-option label="跳过" value="SKIP" />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="分支语义">
                    <div class="participant-picker-row">
                      <el-checkbox
                        v-model="dynamicParallelForm.objectSemantic"
                        @change="applyDynamicParallel"
                      >
                        新语义（按对象分支）
                      </el-checkbox>
                    </div>
                  </el-form-item>
                </template>
                <template v-for="field in genericConfigFields" :key="field.key">
                  <!-- BF20261013-022③④：object 型 JSON 配置与「审批人（兼容）」不再渲染
                     （审批人统一由「审批人策略」结构化面板承载） -->
                  <!-- BF20261013-027：可退回节点=本流程节点多选（不手填） -->
                  <el-form-item v-if="field.key === 'returnTargets'" :label="field.label">
                    <el-select
                      :model-value="returnTargetsValue"
                      multiple
                      filterable
                      clearable
                      placeholder="选择节点"
                      style="width: 100%"
                      @update:model-value="onReturnTargetsChange"
                    >
                      <el-option
                        v-for="item in returnTargetCandidates"
                        :key="item.id"
                        :label="item.label"
                        :value="item.id"
                      />
                    </el-select>
                  </el-form-item>
                  <el-form-item v-else-if="field.type === 'string'" :label="field.label">
                    <el-input
                      v-model="propForm[field.key] as string"
                      @change="applyProps"
                      @blur="applyProps"
                    />
                  </el-form-item>
                  <el-form-item v-else :label="field.label">
                    <el-input
                      v-model="propForm[field.key] as string"
                      @change="applyProps"
                      @blur="applyProps"
                    />
                  </el-form-item>
                </template>
                <el-form-item
                  v-if="validationErrors.some((e) => e.nodeKey === selectionId)"
                  :label="t('workflow.validationIssues')"
                >
                  <el-alert
                    v-for="err in validationErrors.filter((e) => e.nodeKey === selectionId)"
                    :key="String(err.nodeKey) + err.errorCode"
                    type="error"
                    :closable="false"
                    :title="err.message"
                  />
                </el-form-item>
              </el-form>

              <!-- 高级属性 · 监听器配置（定义 config.listeners 元数据；只读展示） -->
              <template v-if="nodeMeta.listeners.length">
                <div class="props-section props-section--advanced">
                  {{ t('workflow.listenerSectionTitle') }}
                </div>
                <div
                  v-for="(listener, index) in nodeMeta.listeners"
                  :key="listener.phase + String(index)"
                  class="listener-row"
                >
                  <span
                    class="listener-row__phase"
                    :class="'listener-row__phase--' + listener.phase"
                  >
                    {{
                      listener.phase === 'before'
                        ? t('workflow.listenerBefore')
                        : t('workflow.listenerAfter')
                    }}
                  </span>
                  <span class="listener-row__desc">{{ listener.label }}</span>
                  <span v-if="listener.bean" class="listener-row__bean">{{ listener.bean }}</span>
                  <span class="listener-row__note">{{ listener.note }}</span>
                </div>
                <div class="listener-add">{{ t('workflow.listenerAdd') }}</div>
              </template>
            </template>

            <!-- BF20261013-013：字段属性——该节点对每个表单字段的必填/编辑/隐藏三态 -->
            <template v-else>
              <table v-if="mainFormFields.length" class="field-states__table">
                <thead>
                  <tr>
                    <th>{{ t('workflow.fieldStatesFieldName') }}</th>
                    <th>{{ t('workflow.fieldStatesRequired') }}</th>
                    <th>{{ t('workflow.fieldStatesEditable') }}</th>
                    <th>{{ t('workflow.fieldStatesHidden') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="f in mainFormFields" :key="f.name">
                    <td class="field-states__name">{{ f.label || f.name }}</td>
                    <td>
                      <el-checkbox
                        :model-value="fieldStateOf(f).required"
                        @update:model-value="(v: unknown) => onFieldStateChange(f, 'required', v)"
                      />
                    </td>
                    <td>
                      <el-checkbox
                        :model-value="fieldStateOf(f).editable"
                        @update:model-value="(v: unknown) => onFieldStateChange(f, 'editable', v)"
                      />
                    </td>
                    <td>
                      <el-checkbox
                        :model-value="fieldStateOf(f).hidden"
                        @update:model-value="(v: unknown) => onFieldStateChange(f, 'hidden', v)"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
              <p v-else class="field-states__empty">{{ t('workflow.fieldStatesEmptyHint') }}</p>
            </template>
          </template>
          <el-empty v-else :description="t('workflow.selectNodeToConfigure')" />
        </div>
      </div>
    </div>

    <!-- 流程高级配置弹窗（P53 节点13 · 只读呈现定义元数据：统一监听器/通知/前置/后置） -->
    <el-dialog
      v-model="advancedConfigVisible"
      class="advanced-config-dialog"
      :title="t('workflow.advancedConfigTitle')"
      width="1054px"
      modal-class="p53-dialog-overlay-37"
    >
      <template #header>
        <div class="advanced-config-heading">
          <h2>{{ t('workflow.advancedConfigTitle') }}</h2>
          <p>{{ t('workflow.advancedConfigSubtitle') }}</p>
        </div>
      </template>
      <div class="advanced-config-grid">
        <section class="advanced-card">
          <div class="advanced-card__head">
            <div class="advanced-card__title">
              <el-icon class="advanced-card__icon"><Setting /></el-icon>
              <h3>{{ t('workflow.advListenersTitle') }}</h3>
            </div>
            <span class="advanced-card__badge">{{ t('workflow.advEnabledBadge') }}</span>
          </div>
          <div class="advanced-rows">
            <span class="advanced-rows__cap">{{ t('workflow.advProcessEvent') }}</span>
            <span>{{ t('workflow.advExecutorListener') }}</span>
            <span class="advanced-rows__cap">{{ t('workflow.advBeforeStart') }}</span>
            <span class="advanced-rows__bean">{{ advConfig?.startListener || '—' }}</span>
            <span class="advanced-rows__cap">{{ t('workflow.advAfterComplete') }}</span>
            <span class="advanced-rows__bean">{{ advConfig?.completeListener || '—' }}</span>
          </div>
          <div class="advanced-card__add">{{ t('workflow.advAddListener') }}</div>
        </section>
        <section class="advanced-card">
          <div class="advanced-card__head">
            <div class="advanced-card__title">
              <el-icon class="advanced-card__icon"><Document /></el-icon>
              <h3>{{ t('workflow.advNotifyTitle') }}</h3>
            </div>
          </div>
          <label>{{ t('workflow.advNotifyTargets') }}</label>
          <div class="static-value">{{ advConfig?.notifyTargets || '—' }}</div>
          <label>{{ t('workflow.advNotifyChannels') }}</label>
          <div class="advanced-chips">
            <span v-for="c in advChannels" :key="c" class="advanced-chips__item">{{ c }}</span>
          </div>
          <p class="advanced-card__meta">{{ t('workflow.advTriggerMoments') }}</p>
          <p class="advanced-card__meta">
            {{ t('workflow.advTemplateLabel', { template: advConfig?.notifyTemplate || '—' }) }}
          </p>
        </section>
        <section class="advanced-card">
          <div class="advanced-card__head">
            <div class="advanced-card__title">
              <el-icon class="advanced-card__icon"><EditPen /></el-icon>
              <h3>{{ t('workflow.advPreProcessTitle') }}</h3>
            </div>
          </div>
          <label>{{ t('workflow.advExecMode') }}</label>
          <div class="static-value">{{ advConfig?.preMode || '—' }}</div>
          <label>{{ t('workflow.advHandler') }}</label>
          <div class="static-value">{{ advConfig?.preHandler || '—' }}</div>
          <p class="advanced-card__meta">{{ advConfig?.prePurpose || '—' }}</p>
          <p class="advanced-card__meta">{{ advConfig?.preFailure || '—' }}</p>
        </section>
        <section class="advanced-card">
          <div class="advanced-card__head">
            <div class="advanced-card__title">
              <el-icon class="advanced-card__icon"><Monitor /></el-icon>
              <h3>{{ t('workflow.advPostProcessTitle') }}</h3>
            </div>
          </div>
          <label>{{ t('workflow.advExecMode') }}</label>
          <div class="static-value">{{ advConfig?.postMode || '—' }}</div>
          <label>{{ t('workflow.advHandler') }}</label>
          <div class="static-value">{{ advConfig?.postHandler || '—' }}</div>
          <p class="advanced-card__meta">{{ advConfig?.postPurpose || '—' }}</p>
          <p class="advanced-card__meta">{{ advConfig?.postFailure || '—' }}</p>
        </section>
      </div>
      <template #footer>
        <div class="advanced-config-footer">
          <el-button size="small" @click="advancedConfigVisible = false"
            >&nbsp;&nbsp;&nbsp;&nbsp;{{
              t('common.cancel')
            }}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</el-button
          >
          <el-button
            size="small"
            type="primary"
            class="advanced-config-save"
            :loading="saving"
            @click="onSaveAdvancedConfig"
            >&nbsp;&nbsp;&nbsp;&nbsp;{{
              t('workflow.advSaveConfig')
            }}&nbsp;&nbsp;&nbsp;&nbsp;</el-button
          >
        </div>
      </template>
    </el-dialog>

    <!-- ═══ BF20261013-022②：统一脚本编辑弹窗（流程脚本函数目录） ═══ -->
    <ScriptDialog
      v-model:visible="scriptDialogVisible"
      :title="scriptDialogTitle"
      :code="scriptDialogCode"
      :functions="PROCESS_SCRIPT_FUNCTIONS"
      :simulate="simulateProcessScript"
      @save="onScriptDialogSave"
    />

    <!-- ═══ BF20261013-027：发起子流程向导（触发方式 → 子流程 → 初始值） ═══ -->
    <el-dialog
      v-model="subflowWizardVisible"
      title="发起子流程"
      width="min(780px, 94vw)"
      class="p64-dialog"
      append-to-body
      @close="onSubflowWizardClose"
    >
      <el-steps :active="subflowWizardStep" simple style="margin-bottom: 16px">
        <el-step title="触发方式" />
        <el-step title="子流程" />
        <el-step title="初始值" />
      </el-steps>

      <!-- 第①步：触发方式（写脚本 / 选字段） -->
      <el-form v-show="subflowWizardStep === 0" label-position="top" size="small">
        <el-form-item label="触发方式">
          <el-radio-group v-model="subflowForm.triggerMode">
            <el-radio value="SCRIPT">写脚本</el-radio>
            <el-radio value="FIELD">选字段</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="subflowForm.triggerMode === 'SCRIPT'" label="是否发起判断脚本">
          <div class="participant-picker-row">
            <el-button
              @click="
                openProcessScriptDialog('是否发起判断脚本', subflowForm.script, { kind: 'subflow' })
              "
            >
              {{ subflowForm.script?.trim() ? '编辑脚本' : '编写脚本' }}
            </el-button>
            <small v-if="subflowForm.script?.trim()" class="participant-hint"> 已配置 </small>
          </div>
        </el-form-item>
        <el-form-item v-else label="触发字段（字段值为真即发起）">
          <el-select
            v-model="subflowForm.triggerField"
            filterable
            placeholder="选择主表单字段"
            style="width: 100%"
            @change="onSubflowTriggerFieldChange"
          >
            <el-option
              v-for="field in mainFormFields"
              :key="field.name"
              :label="field.label || '未命名字段'"
              :value="field.name"
            />
          </el-select>
        </el-form-item>
      </el-form>

      <!-- 第②步：选择子流程 -->
      <el-form v-show="subflowWizardStep === 1" label-position="top" size="small">
        <el-form-item label="子流程">
          <el-select
            v-model="subflowForm.targetProcessDefKey"
            filterable
            placeholder="选择流程"
            style="width: 100%"
            @change="onSubflowTargetChange"
          >
            <el-option
              v-for="item in publishedTargetOptions.defs"
              :key="item.key"
              :label="item.name || '未命名流程'"
              :value="item.key"
            />
          </el-select>
        </el-form-item>
      </el-form>

      <!-- 第③步：初始值（脚本 / 选字段 / 自由填写）+ 汇总/单独 -->
      <div v-show="subflowWizardStep === 2">
        <div class="p64-toolbar">
          <span class="p64-subtitle">初始值（带入子流程表单）</span>
          <el-button size="small" @click="addSubflowMapping">添加一行</el-button>
        </div>
        <div
          v-for="(mapping, mappingIndex) in subflowForm.mappings"
          :key="mappingIndex"
          class="subflow-mapping-row"
        >
          <el-form-item label="子流程表单字段" size="small">
            <el-select v-model="mapping.targetField" filterable placeholder="选择字段">
              <el-option
                v-for="field in subflowTargetFields"
                :key="field.name"
                :label="field.label || '未命名字段'"
                :value="field.name"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="取值方式" size="small">
            <el-select v-model="mapping.source" @change="onSubflowMappingSourceChange(mapping)">
              <el-option label="选字段" value="FIELD" />
              <el-option label="自由填写" value="LITERAL" />
              <el-option label="脚本" value="SCRIPT" />
            </el-select>
          </el-form-item>
          <el-form-item label="取值" size="small">
            <el-select
              v-if="mapping.source === 'FIELD'"
              :model-value="subflowMappingSourceValue(mapping)"
              filterable
              placeholder="选择来源字段"
              @change="(value: string) => onSubflowMappingFieldChange(mapping, value)"
            >
              <el-option-group label="主表单字段">
                <el-option
                  v-for="field in mainFormFields"
                  :key="`main:${field.name}`"
                  :label="field.label || '未命名字段'"
                  :value="`main:${field.name}`"
                />
              </el-option-group>
              <el-option-group
                v-for="table in tableFieldOptions"
                :key="table.name"
                :label="table.label || '未命名表格'"
              >
                <el-option
                  v-for="column in table.subFields ?? []"
                  :key="`table:${table.name}:${column.name}`"
                  :label="column.label || '未命名字段'"
                  :value="`table:${table.name}:${column.name}`"
                />
              </el-option-group>
            </el-select>
            <el-input
              v-else-if="mapping.source === 'LITERAL'"
              v-model="mapping.literal"
              placeholder="自由填写"
            />
            <div v-else class="participant-picker-row">
              <el-button
                @click="
                  openProcessScriptDialog('初始值脚本', mapping.script, {
                    kind: 'subflowMapping',
                    mapping,
                  })
                "
              >
                {{ mapping.script.trim() ? '编辑脚本' : '编写脚本' }}
              </el-button>
            </div>
          </el-form-item>
          <el-button link type="danger" @click="removeSubflowMapping(mappingIndex)">删除</el-button>
        </div>
        <el-form-item v-if="subflowHasRowSource" label="派发粒度">
          <el-radio-group v-model="subflowForm.aggregate">
            <el-radio value="EACH">单独（逐行各发一条）</el-radio>
            <el-radio value="GROUPED">汇总（相同值合并一条）</el-radio>
          </el-radio-group>
        </el-form-item>
      </div>

      <template #footer>
        <el-button @click="subflowWizardVisible = false">取消</el-button>
        <el-button v-if="subflowWizardStep > 0" @click="subflowWizardStep--">上一步</el-button>
        <el-button
          v-if="subflowWizardStep < 2"
          type="primary"
          :disabled="!subflowStepReady"
          @click="subflowWizardStep++"
          >下一步</el-button
        >
        <el-button v-else type="primary" @click="finishSubflowWizard">完成</el-button>
      </template>
    </el-dialog>

    <!-- ═══ P64 阶段Ⅰ：流程变量配置弹窗 ═══ -->
    <el-dialog
      v-model="variablesVisible"
      title="流程变量"
      width="min(860px, 94vw)"
      class="p64-dialog"
      append-to-body
    >
      <div class="p64-toolbar">
        <el-button size="small" type="primary" @click="resetVariableDraft">新增变量</el-button>
      </div>
      <el-table :data="graph?.variables ?? []" size="small" class="p64-table">
        <el-table-column prop="name" label="变量名称" min-width="200" />
        <el-table-column label="操作" width="140">
          <template #default="{ $index }">
            <el-button size="small" link type="primary" @click="editVariable($index)"
              >编辑</el-button
            >
            <el-button size="small" link type="danger" @click="removeVariable($index)"
              >删除</el-button
            >
          </template>
        </el-table-column>
      </el-table>
      <el-divider />
      <el-form label-position="top" size="small">
        <div class="p64-grid">
          <el-form-item label="变量标识">
            <el-input
              v-model="variableDraft.varId"
              placeholder="var_example"
              :disabled="variableEditIndex !== null"
            />
          </el-form-item>
          <el-form-item label="变量名称">
            <el-input v-model="variableDraft.name" />
          </el-form-item>
        </div>
        <div v-if="variableErrors.length" class="p64-errors">
          <p v-for="item in variableErrors" :key="item" role="alert">{{ item }}</p>
        </div>
        <el-button size="small" type="primary" @click="saveVariable">
          {{ variableEditIndex === null ? '添加' : '保存修改' }}
        </el-button>
      </el-form>
    </el-dialog>

    <!-- ═══ P64 阶段Ⅰ：触发规则配置弹窗 ═══ -->
    <el-dialog
      v-model="triggersVisible"
      title="触发器"
      width="min(980px, 94vw)"
      class="p64-dialog"
      append-to-body
    >
      <div class="p64-toolbar">
        <el-button size="small" type="primary" @click="resetTriggerDraft">新增触发器</el-button>
        <HintTip
          content="流程发起和流程结束时自动执行；节点的开始前/结束触发器在节点属性中配置。"
        />
      </div>
      <el-table :data="graph?.triggers ?? []" size="small" class="p64-table">
        <el-table-column prop="name" label="名称" width="150" />
        <el-table-column label="触发时机" width="190">
          <template #default="{ row }">{{ labelOf(TRIGGER_EVENT_LABELS, row.event) }}</template>
        </el-table-column>
        <el-table-column label="源节点" width="140">
          <template #default="{ row }">{{ graphNodeName(row.nodeKey) }}</template>
        </el-table-column>
        <el-table-column label="分支" min-width="160">
          <template #default="{ row }">
            {{
              (row.branches ?? [])
                .map(
                  (b: { branchId: string; matchType: string; matchValue: string }) =>
                    `${b.branchId}（${labelOf(MATCH_TYPE_LABELS, b.matchType)}=${b.matchValue}）`,
                )
                .join('；')
            }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="140">
          <template #default="{ $index }">
            <el-button size="small" link type="primary" @click="editTrigger($index)"
              >编辑</el-button
            >
            <el-button size="small" link type="danger" @click="removeTrigger($index)"
              >删除</el-button
            >
          </template>
        </el-table-column>
      </el-table>
      <el-divider />
      <el-form label-position="top" size="small">
        <div class="p64-grid">
          <el-form-item label="规则标识">
            <el-input
              v-model="triggerDraft.triggerId"
              :disabled="triggerEditIndex !== null"
              placeholder="trg_example"
            />
          </el-form-item>
          <el-form-item label="名称">
            <el-input v-model="triggerDraft.name" />
          </el-form-item>
          <el-form-item label="触发时机">
            <el-select v-model="triggerDraft.event">
              <el-option
                v-for="item in ['PROCESS_START', 'PROCESS_COMPLETED']"
                :key="item"
                :label="labelOf(TRIGGER_EVENT_LABELS, item)"
                :value="item"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="可读取变量">
            <el-select v-model="triggerDraft.variables" multiple filterable>
              <el-option
                v-for="item in graph?.variables ?? []"
                :key="item.varId"
                :label="item.name || '未命名变量'"
                :value="item.varId"
              />
            </el-select>
          </el-form-item>
        </div>
        <el-form-item label="判断脚本">
          <div class="participant-picker-row">
            <el-button
              @click="
                openProcessScriptDialog('触发器判断脚本', triggerDraft.script, {
                  kind: 'triggerDraft',
                })
              "
            >
              {{ triggerDraft.script?.trim() ? '编辑脚本' : '编写脚本' }}
            </el-button>
            <small v-if="triggerDraft.script?.trim()" class="p64-hint"> 已配置 </small>
          </div>
        </el-form-item>
        <div class="p64-toolbar">
          <span class="p64-subtitle">结果分支</span>
          <el-button size="small" @click="addTriggerBranch">添加分支</el-button>
        </div>
        <div
          v-for="(branch, branchIndex) in triggerDraft.branches"
          :key="branchIndex"
          class="p64-branch-card"
        >
          <div class="p64-grid">
            <el-form-item label="分支标识">
              <el-input v-model="branch.branchId" />
            </el-form-item>
            <el-form-item label="结果类型">
              <el-select v-model="branch.matchType">
                <el-option
                  v-for="item in ['NUMBER', 'STRING', 'BOOLEAN']"
                  :key="item"
                  :label="labelOf(MATCH_TYPE_LABELS, item)"
                  :value="item"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="结果值">
              <el-input v-model="branch.matchValue" />
            </el-form-item>
          </div>
          <div class="p64-toolbar">
            <span class="p64-subtitle">命中后执行的动作</span>
            <el-button size="small" @click="addTriggerAction(branchIndex)">添加动作</el-button>
          </div>
          <div
            v-for="(action, actionIndex) in branch.actions"
            :key="actionIndex"
            class="p64-action-card"
          >
            <div class="p64-grid">
              <el-form-item label="动作标识">
                <el-input v-model="action.actionId" />
              </el-form-item>
              <el-form-item label="发起方式">
                <el-select v-model="action.type">
                  <el-option
                    v-for="item in ['START_SINGLE', 'START_EACH', 'START_GROUPED']"
                    :key="item"
                    :label="labelOf(ACTION_TYPE_LABELS, item)"
                    :value="item"
                  />
                </el-select>
              </el-form-item>
              <el-form-item v-if="action.type !== 'START_SINGLE'" label="集合变量">
                <el-select v-model="action.sourceVariable" filterable>
                  <el-option
                    v-for="item in graph?.variables ?? []"
                    :key="item.varId"
                    :label="item.name || '未命名变量'"
                    :value="item.varId"
                  />
                </el-select>
              </el-form-item>
              <el-form-item
                v-if="action.type === 'START_GROUPED'"
                label="分组字段（按该字段值分组）"
              >
                <el-input v-model="action.groupBy" placeholder="id" />
              </el-form-item>
            </div>
            <div class="p64-grid">
              <el-form-item label="目标流程">
                <el-select
                  v-model="action.targetProcessDefKey"
                  filterable
                  allow-create
                  default-first-option
                  placeholder="选择流程"
                >
                  <el-option
                    v-for="item in publishedTargetOptions.defs"
                    :key="item.key"
                    :label="item.name || '未命名表单'"
                    :value="item.key"
                  />
                </el-select>
              </el-form-item>
              <el-form-item label="目标表单">
                <el-select
                  v-model="action.targetFormKey"
                  filterable
                  allow-create
                  default-first-option
                  placeholder="选择已发布表单（或输入表单标识）"
                >
                  <el-option
                    v-for="item in publishedTargetOptions.forms"
                    :key="item.key"
                    :label="item.name || '未命名表单'"
                    :value="item.key"
                  />
                </el-select>
              </el-form-item>
              <el-form-item label="单次最多发起（1-200）">
                <el-input-number v-model="action.maxDispatch" :min="1" :max="200" />
              </el-form-item>
            </div>
            <div class="p64-toolbar">
              <span class="p64-subtitle">带入目标流程的数据</span>
              <el-button size="small" @click="addTriggerMapping(branchIndex, actionIndex)"
                >添加映射</el-button
              >
            </div>
            <div
              v-for="(mapping, mappingIndex) in action.mapping"
              :key="mappingIndex"
              class="p64-grid"
            >
              <el-form-item label="目标表单字段">
                <el-select
                  v-model="mapping.targetField"
                  filterable
                  allow-create
                  default-first-option
                  placeholder="选择目标表单字段"
                  @visible-change="
                    (visible: boolean) => visible && ensureFormFields(action.targetFormKey)
                  "
                >
                  <el-option
                    v-for="field in formFieldOptions(action.targetFormKey)"
                    :key="field.name"
                    :label="formFieldLabel(field)"
                    :value="field.name"
                  />
                </el-select>
              </el-form-item>
              <el-form-item label="取变量值">
                <el-select v-model="mapping.sourceVarId" clearable filterable>
                  <el-option
                    v-for="item in graph?.variables ?? []"
                    :key="item.varId"
                    :label="item.name || '未命名变量'"
                    :value="item.varId"
                  />
                </el-select>
              </el-form-item>
              <el-form-item label="取集合行字段">
                <el-input v-model="mapping.itemField" placeholder="如 id（集合行的字段名）" />
              </el-form-item>
              <el-form-item label="固定值">
                <el-input v-model="mapping.literal" placeholder="与上面两种来源任选一种" />
              </el-form-item>
            </div>
            <!-- P64 阶段Ⅱ：子流程（主子流程）配置 -->
            <div class="p64-grid">
              <el-form-item label="子流程模式">
                <el-checkbox
                  :model-value="action.orchestration === 'CHILD'"
                  @update:model-value="
                    (v: boolean | string | number) => {
                      action.orchestration = v === true ? 'CHILD' : ''
                    }
                  "
                >
                  按主子流程编排（发起后按「继续条件」推进，并可把子流程结果回填到本表单）
                </el-checkbox>
              </el-form-item>
              <template v-if="action.orchestration === 'CHILD'">
                <el-form-item label="继续条件">
                  <el-select v-model="action.waitPolicy">
                    <el-option
                      v-for="item in CHILD_WAIT_POLICIES"
                      :key="item"
                      :label="labelOf(WAIT_POLICY_LABELS, item)"
                      :value="item"
                    />
                  </el-select>
                </el-form-item>
                <el-form-item v-if="action.waitPolicy === 'COUNT'" label="完成数量（达到即继续）">
                  <el-input-number v-model="action.waitCount" :min="1" :max="action.maxDispatch" />
                </el-form-item>
                <el-form-item label="结果回填">
                  <el-checkbox v-model="action.wbEnabled">把子流程结果回填到本表单</el-checkbox>
                </el-form-item>
              </template>
            </div>
            <template v-if="action.orchestration === 'CHILD' && action.wbEnabled">
              <div class="p64-grid">
                <el-form-item label="结果节点">
                  <el-input
                    v-model="action.wbResultNodeKey"
                    placeholder="子流程中产出结果的节点（如 node_result）"
                  />
                </el-form-item>
                <el-form-item label="子表单结果表">
                  <el-input
                    v-model="action.wbTableField"
                    placeholder="行级回填时填写（子表单里的表格字段）"
                  />
                </el-form-item>
                <el-form-item label="来源行标识列">
                  <el-input v-model="action.wbRowKeyField" placeholder="记录来源行标识的列名" />
                </el-form-item>
                <el-form-item label="本表单的来源表">
                  <el-input
                    v-model="action.wbParentTableField"
                    placeholder="本表单承载来源行的表格字段"
                  />
                </el-form-item>
              </div>
              <div class="p64-toolbar">
                <span class="p64-subtitle">行级回填对应（子表列 → 本表单列）</span>
                <el-button size="small" @click="addChildWbField(branchIndex, actionIndex, 'row')"
                  >添加一行</el-button
                >
              </div>
              <div v-for="(f, fi) in action.wbFields" :key="'wr' + fi" class="p64-grid">
                <el-form-item label="子表列">
                  <el-input v-model="f.fromField" />
                </el-form-item>
                <el-form-item label="本表单列">
                  <el-input v-model="f.toField" />
                </el-form-item>
                <el-form-item label=" ">
                  <el-button
                    size="small"
                    link
                    type="danger"
                    @click="removeChildWbField(branchIndex, actionIndex, 'row', fi)"
                    >删除</el-button
                  >
                </el-form-item>
              </div>
              <div class="p64-toolbar">
                <span class="p64-subtitle">主记录回填对应（子表单字段 → 本表单字段）</span>
                <el-button size="small" @click="addChildWbField(branchIndex, actionIndex, 'main')"
                  >添加一行</el-button
                >
              </div>
              <div v-for="(f, fi) in action.wbMainFields" :key="'wm' + fi" class="p64-grid">
                <el-form-item label="子表单字段">
                  <el-input v-model="f.fromField" />
                </el-form-item>
                <el-form-item label="本表单字段">
                  <el-input v-model="f.toField" />
                </el-form-item>
                <el-form-item label=" ">
                  <el-button
                    size="small"
                    link
                    type="danger"
                    @click="removeChildWbField(branchIndex, actionIndex, 'main', fi)"
                    >删除</el-button
                  >
                </el-form-item>
              </div>
            </template>
          </div>
        </div>
        <div v-if="triggerErrors.length" class="p64-errors">
          <p v-for="item in triggerErrors" :key="item" role="alert">{{ item }}</p>
        </div>
        <el-button size="small" type="primary" @click="saveTrigger">
          {{ triggerEditIndex === null ? '添加' : '保存修改' }}
        </el-button>
      </el-form>
    </el-dialog>

    <!-- ═══ P64 阶段Ⅰ：节点业务表单选择弹窗（复用已发布表单选择器） ═══ -->
    <FormSelectDialog
      v-model:visible="nodeFormSelectVisible"
      :current-form-key="selectedNodeFormKey"
      @select="onNodeFormSelected"
    />

    <!-- P63 参与人策略「部门负责人」部门多选弹窗（复用同一组件的部门勾选模式） -->
    <div class="approver-dialog-host">
      <ApproverCandidatesDialog
        v-model:visible="participantDeptPickerVisible"
        picker-mode="dept"
        :initial-dept-ids="participantForm.deptIds"
        @pick-depts="onParticipantDeptsPicked"
      />
    </div>
    <!-- P63 参与人策略「指定人员」人员多选弹窗（与既有选择器并存，互不回填） -->
    <div class="approver-dialog-host">
      <ApproverCandidatesDialog
        v-model:visible="participantUserPickerVisible"
        :initial-ids="participantUserIds"
        @pick="onParticipantUsersPicked"
      />
    </div>

    <!-- P63 动态并行「固定值」直接人员选择（新语义逐人分支） -->
    <div class="approver-dialog-host">
      <ApproverCandidatesDialog
        v-model:visible="dynamicUserPickerVisible"
        :initial-ids="dynamicFixedSelectedIds"
        @pick="onDynamicUsersPicked"
      />
    </div>
    <!-- P63 动态并行「固定值」直接部门选择（新语义逐部门分支） -->
    <div class="approver-dialog-host">
      <ApproverCandidatesDialog
        v-model:visible="dynamicDeptPickerVisible"
        picker-mode="dept"
        :initial-dept-ids="dynamicFixedSelectedIdList"
        @pick-depts="onDynamicDeptsPicked"
      />
    </div>

    <!-- 校验错误面板（含 nodeKey/edgeKey 定位入口） -->
    <el-card v-if="validationErrors.length" class="designer-errors">
      <template #header
        ><span>{{
          t('workflow.validationSummary', { count: validationErrors.length })
        }}</span></template
      >
      <div v-for="(err, index) in validationErrors" :key="index" class="designer-error-row">
        <el-tag size="small" type="danger">{{ err.errorCode }}</el-tag>
        <span class="error-message">{{ err.message }}</span>
        <el-button size="small" link type="primary" @click="focusError(err)">
          {{ t('workflow.validationLocateLabel', { target: err.nodeKey ?? err.edgeKey ?? '-' }) }}
        </el-button>
      </div>
    </el-card>
  </div>
</template>

<style scoped>
/* ==================================================================
   P53 节点09/12/13 设计还原（按 P53 设计包几何移植；
   色值原样搬运：#6F2DFF/#8393B5/#A4ADBE/#E8EDF6/#F8FAFE 等）。
   ================================================================== */
.designer-page {
  display: flex;
  flex-direction: column;
  /* 页面从一级顶栏下方开始；二级导航和工作条属于页面自身，画布必须铺到视口底。 */
  height: calc(100vh - 64px);
  min-height: 560px;
  background: #f7fafc;
  color: #1f2a44;
  font-family: Arial, 'Microsoft YaHei', sans-serif;
  font-size: 14px;
}

/* ── 顶栏（fixture workbar：56px 白底 + 紧凑操作组） ── */
.designer-toolbar {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 20px;
  flex: 0 0 56px;
  box-sizing: border-box;
  background: #fff;
  border-bottom: 1px solid #dde3ef;
  color: #8b98af;
  font-size: 12px;
}
/* 设计09：右侧操作组 = 草稿历史 88 / 保存 64 / 发布 64，高 28，间距 8 */
.designer-saved {
  line-height: 16px;
  color: #7e89a1;
}
/* R5/G6b：窄视口面包屑单行省略，不逐字竖排挤压工具栏 */
.designer-crumb {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.toolbar-actions :deep(.el-button) {
  width: 64px;
  height: 28px;
  padding: 0 8px;
  line-height: 16px;
}
.toolbar-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}
.toolbar-actions :deep(.toolbar-drafts) {
  width: 88px;
}
.designer-toolbar :deep(.el-divider--vertical) {
  border-left-color: #d7deed;
}
.designer-title {
  font-size: 13px;
  font-weight: 600;
  color: #344164;
}
.designer-key {
  color: #8393b5;
  font-size: 12px;
}
.designer-version.el-tag {
  background: #f0eaff;
  color: #6f2dff;
  border-color: transparent;
  border-radius: 6px;
  font-size: 11px;
}
.toolbar-validation {
  color: var(--el-color-danger);
  font-size: 12px;
}
.designer-toolbar :deep(.el-button.toolbar-iconbtn) {
  width: 28px;
  padding: 0;
}
.designer-toolbar :deep(.el-button) {
  height: 28px;
  padding: 0 12px;
  border: 1px solid #cbd6e8;
  border-radius: 6px;
  background: #fff;
  color: #344164;
  font-size: 12px;
}
.designer-toolbar :deep(.el-button.toolbar-back) {
  height: 32px;
  padding: 0 16px;
}
.designer-toolbar :deep(.el-button--primary) {
  background: #6f2dff;
  border-color: #6f2dff;
  color: #fff;
}
.designer-toolbar :deep(.el-button--primary:hover),
.designer-toolbar :deep(.el-button--primary:focus) {
  background: #5f24e0;
  border-color: #5f24e0;
  color: #fff;
}
.spacer {
  flex: 1;
}
.designer-alert {
  margin: 8px 12px;
}

/* ── 左栏节点面板（条目 = 服务端能力契约的真实节点类型） ── */
.designer-body {
  display: flex;
  flex: 1;
  min-height: 0;
}
/* ── 0.1.7 重构：第二行工具栏（撤销 / 整理布局 / 文档级配置 / 校验） ── */
.designer-toolbar2 {
  display: flex;
  align-items: center;
  gap: 8px;
  box-sizing: border-box;
  padding: 8px 18px;
  background: #fff;
  border-bottom: 1px solid #e1e5ef;
}
.designer-toolbar2 :deep(.el-button--small) {
  height: 30px;
  padding: 0 12px;
  border: 1px solid #cbd6e8;
  border-radius: 6px;
  background: #fff;
  color: #344164;
  font-size: 12px;
}
.designer-toolbar2 :deep(.workbar-advance) {
  min-width: 76px;
}
.designer-toolbar2 :deep(.el-button.workbar-verify) {
  margin-left: 4px;
}

/* ── 0.1.7 重构：左栏节点面板（分组 + 双列图标块） ── */
.designer-main {
  display: flex;
  flex: 1;
  min-height: 0;
}
.designer-palette {
  box-sizing: border-box;
  flex: 0 0 196px;
  width: 196px;
  padding: 12px 10px 20px;
  overflow-y: auto;
  background: #fff;
  border-right: 1px solid #e1e5ef;
}
.palette-group + .palette-group {
  margin-top: 14px;
}
.palette-group__title {
  margin: 0 0 8px 4px;
  font-size: 12px;
  font-weight: 600;
  color: #7e89a1;
}
.palette-group__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.palette-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  box-sizing: border-box;
  min-height: 62px;
  padding: 8px 4px;
  border: 1px solid #e0e6f2;
  border-radius: 8px;
  background: #fbfcff;
  color: #344164;
  font-size: 12px;
  line-height: 16px;
  cursor: grab;
}
.palette-item:hover {
  border-color: #b9a4ff;
  background: #f7f4ff;
}
.palette-item:active {
  cursor: grabbing;
}
.palette-item--disabled {
  cursor: default;
  opacity: 0.55;
}
.palette-item__name {
  font-weight: 500;
  white-space: nowrap;
}
.palette-item .workbar-icon {
  flex: 0 0 20px;
  display: block;
}
.palette-item .workbar-icon path {
  fill: none;
  stroke: #6f2dff;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* 0.1.7：开始/结束小圆形图标节点（无卡片盒） */
.designer-node-event {
  stroke-width: 1.6;
}

/* ── 画布（24px 网格 + 缩放控件 + 底部提示条） ── */
.designer-canvas-wrap {
  position: relative;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  /* P53 节点09：画布底 #F8FAFE + 24px 网格线 #E8EDF6 */
  background: #f8fafe;
}
.pg-bg {
  fill: url(#designer-grid);
}
.canvas-zoom {
  position: absolute;
  right: 24px;
  top: 16px;
  display: flex;
  align-items: center;
  gap: 16px;
  width: 225px;
  height: 44px;
  box-sizing: border-box;
  padding: 0 15px;
  background: #fff;
  border: 1px solid #d8e0ee;
  border-radius: 8px;
  color: #8190aa;
}
.zoom-btn {
  border: 0;
  background: transparent;
  padding: 0;
  color: #8190aa;
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
}
.zoom-value {
  min-width: 38px;
  text-align: center;
  font-size: 13px;
  color: #8190aa;
}
.zoom-fit {
  border: 0;
  background: transparent;
  padding: 0;
  color: #8190aa;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.zoom-btn:hover,
.zoom-fit:hover {
  color: #6f2dff;
}
.canvas-hint {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 50px;
  box-sizing: border-box;
  padding: 17px 24px;
  background: #f4f7fc;
  border-top: 1px solid #d7deed;
  color: #8a98b0;
  font-size: 12px;
  line-height: 16px;
}

/* ── 节点卡片（fixture 终版几何：158.8×48.8 / 胶囊 24.4 / 选中 #F7F2FF+#6F2DFF） ── */
.designer-node {
  cursor: move;
}
.designer-node-rect {
  x: 0.6px;
  y: 0.6px;
  width: 158.8px;
  height: 48.8px;
  rx: 8px;
  fill: #fff;
  stroke: #d7dfec;
  stroke-width: 1.4;
}
.designer-node-start .designer-node-rect {
  fill: #eefaf3;
  stroke: #16a77b;
}
.designer-node-end .designer-node-rect {
  fill: #fdf0f1;
  stroke: #ef5d71;
}
.designer-node-start .designer-node-icon {
  color: #16a77b;
}
.designer-node-end .designer-node-icon {
  color: #ef5d71;
}
/* 设计09：起草节点（发起人填写）浅橙底、灰描边 */
.designer-node-draft .designer-node-rect {
  fill: #fff6f1;
  stroke: #7e8799;
}
.designer-node-selected .designer-node-rect {
  fill: #f7f2ff;
  stroke: #6f2dff;
  stroke-width: 2;
}
.designer-node-error .designer-node-rect {
  stroke: var(--el-color-danger);
  stroke-width: 2.5;
}
.designer-node-label {
  font-size: 12px;
  font-weight: 500;
  line-height: 17px;
  fill: #19233b;
  pointer-events: none;
}
.designer-node-label--gateway {
  fill: #8a98b0;
  font-weight: 400;
}
.designer-node-icon {
  color: #8393b5;
  pointer-events: none;
}
.designer-node-icon path {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.designer-node-selected .designer-node-icon {
  color: var(--sw-color-primary);
}
.designer-node-gateway {
  fill: #f7a92c;
  stroke: #e79a1f;
  stroke-width: 1.4;
}
.designer-node-gateway-plus {
  fill: none;
  stroke: #fff;
  stroke-width: 1.8;
  stroke-linecap: round;
}
.designer-node-type {
  font-size: 11px;
  fill: #8393b5;
  pointer-events: none;
}
.designer-node-selected .designer-node-label {
  fill: #6f2dff;
}
.designer-node-port {
  fill: #a4adbe;
  stroke: #6f2dff;
  stroke-width: 1.5;
  cursor: crosshair;
}
/* BF20261013-030：内段中点手柄——实心方块（方向光标由拖动轴内联给出） */
.designer-edge-segment-handle {
  fill: #6f2dff;
  stroke: #fff;
  stroke-width: 1.5;
  pointer-events: all;
}
.designer-edge-endpoint {
  fill: #f7f2ff;
  stroke: #6f2dff;
  stroke-width: 2;
  pointer-events: all;
  cursor: grab;
}
.designer-edge-endpoint:active {
  cursor: grabbing;
}
/* BF20261013-036：拖动会话期间统一光标——拖动中预览几何每帧变化，命中检测会让光标在
   小手/箭头/移动之间来回闪；拖动期间整块画布固定用会话光标（端点=grabbing，内段=按轴方向）。 */
.pg-svg-dragging,
.pg-svg-dragging :deep(*) {
  cursor: var(--pg-drag-cursor, grabbing) !important;
}

/* ── 连线（fixture：#A4ADBE 1.6 + 同色箭头） ── */
.designer-edge {
  cursor: pointer;
  /* stroke="transparent" 不参与 visiblePainted 命中；显式按描边命中 */
  pointer-events: stroke;
}
.designer-edge.designer-edge-selected {
  stroke: transparent;
}
.designer-edge-visual {
  stroke: #c3ccdb;
  stroke-width: 1.4;
  marker-end: url(#designer-edge-arrow);
  pointer-events: none;
}
.designer-edge-visual.designer-edge-selected {
  stroke: #6f2dff;
  stroke-width: 2;
  marker-end: url(#designer-edge-arrow-selected);
}
.designer-edge-arrow {
  fill: #c3ccdb;
  stroke: none;
}
.designer-edge-arrow-selected {
  fill: #6f2dff;
  stroke: none;
}
.designer-edge-pending {
  stroke: var(--el-color-warning);
}

/* ── 右侧属性面板（fixture props：336px 白底 + 18px 标题 + 类型徽标；几何按设计09像素实测） ── */
.designer-props {
  width: 336px;
  flex: 0 0 336px;
  box-sizing: border-box;
  background: #fff;
  border-left: 1px solid #d7deed;
  padding: 19px 24px 22px;
  overflow: auto;
  /* 0.1.7 #36（Owner）：属性面板内所有选择/填写框统一 32px 高（含曾用 small 的控件），
     与 .el-input__inner 30px + 上下各 1px 的行盒口径一致 */
  --el-component-size: 32px;
  --el-component-size-small: 32px;
}

/* 节点13设计：监听器行（before/after 徽标 + bean 名）与添加框 */
.listener-row {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 10px 12px;
  padding: 13px 12px 21px;
  margin-bottom: 0;
  border: 1px solid #dde3ef;
  border-radius: 8px;
  background: #fff;
}

.listener-row + .listener-row {
  margin-top: 14px;
}

.listener-row__phase {
  min-width: 74px;
  box-sizing: border-box;
  padding: 3.5px 9px;
  font-size: 12px;
  line-height: 15px;
  text-align: left;
  border-radius: 5px;
}

.listener-row__phase--before {
  color: var(--sw-color-primary);
  background: #f0eaff;
}

.listener-row__phase--after {
  color: #15a77f;
  background: #e6f8f2;
}

.listener-row__desc {
  font-size: 13px;
  line-height: 17px;
  color: #5f6f92;
}

.listener-row__bean {
  grid-column: 1 / -1;
  font-size: 13px;
  line-height: 18px;
  color: #1f2a44;
}

.listener-row__note {
  grid-column: 1 / -1;
  font-size: 12px;
  line-height: 16px;
  color: #8c9ab1;
}

.listener-add {
  padding: 7px 12px;
  margin-top: 17px;
  border: 1px solid #ccd5e5;
  border-radius: 7px;
  font-size: 13px;
  line-height: 17px;
  color: #303a55;
}
.props-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 31px;
}
.props-title {
  font-size: 18px;
  font-weight: 600;
  color: #19233b;
}
.props-section {
  font-size: 13px;
  line-height: 19px;
  color: #344164;
  margin: 0 0 14px;
  padding-bottom: 12px;
  border-bottom: 1px solid #d7deed;
}
.props-section--advanced {
  margin-bottom: 15px;
}

/* BF20261013-014：节点属性页签——一行占满的分段式切换（替代独立药丸按钮） */
.props-tabs {
  display: flex;
  width: 100%;
  margin: 0 0 16px;
  border: 1px solid #e3e8f4;
  border-radius: 6px;
  overflow: hidden;
  background: #f7f9fe;
}
.props-tab {
  flex: 1 1 0;
  padding: 7px 0;
  border: 0;
  background: transparent;
  color: #8795ad;
  font-size: 13px;
  line-height: 18px;
  cursor: pointer;
  transition:
    background 0.15s,
    color 0.15s;
}
.props-tab + .props-tab {
  border-left: 1px solid #e3e8f4;
}
.props-tab.is-active {
  background: var(--el-color-primary-light-9, #ece9ff);
  color: var(--sw-color-primary);
  font-weight: 500;
}
.field-states__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.field-states__table th,
.field-states__table td {
  padding: 6px 4px;
  border-bottom: 1px solid #eef1f8;
  text-align: left;
  vertical-align: middle;
}
.field-states__table th {
  color: #8795ad;
  font-weight: 500;
  white-space: nowrap;
}
.field-states__name {
  color: #19233b;
}
.field-states__empty {
  margin: 12px 0 0;
  color: #99a5bb;
  font-size: 12px;
}
.designer-props :deep(.el-form-item) {
  margin-bottom: 17.5px;
}
.designer-props :deep(.el-form-item__label) {
  color: #8795ad !important;
  font-size: 12px !important;
  font-weight: 400 !important;
  line-height: 17px;
  padding-bottom: 4px;
  margin-bottom: 4px;
}
.designer-props :deep(.el-input.is-disabled .el-input__inner) {
  color: #19233b;
  -webkit-text-fill-color: #19233b;
}
.designer-props :deep(.el-input__wrapper) {
  background: #fbfcff;
  border-radius: 6px;
  box-shadow: 0 0 0 1px #cbd6e8 inset;
}
.designer-props :deep(.el-input__inner) {
  height: 30px;
  color: #19233b;
}

/* ── P63 参与人结构化面板 / 动态并行专属面板 ── */
.participant-picker-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}
.participant-picker-row :deep(.el-button) {
  border-color: #cbd6e8;
  color: #6f2dff;
  background: #fff;
}
.participant-hint {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  line-height: 16px;
  color: #99a5bb;
  white-space: normal;
}
.participant-legacy-note {
  margin-bottom: 15px;
}
/* 面板内选择/单选组占满 336px 面板宽（与既有输入框对齐） */
.designer-props :deep(.el-select),
.designer-props :deep(.el-radio-group) {
  width: 100%;
}
.designer-props :deep(.el-radio) {
  margin-right: 14px;
}

/* ── 校验错误面板 ── */
.designer-errors {
  max-height: 180px;
  overflow: auto;
  margin: 0 12px 8px;
  border-color: #d7deed;
  border-radius: 8px;
}
.designer-error-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  border-bottom: 1px dashed #e2e8f4;
  font-size: 13px;
}
.error-message {
  color: #344164;
}

/* ── P53 节点13：流程高级配置弹窗（1054 宽 / 94px 头 / 双栏 488 区块 / 53px 底栏） ── */
.designer-page :deep(.advanced-config-dialog) {
  --el-dialog-margin-top: 110px;
  width: 1056px !important;
  height: 804px;
  max-width: calc(100vw - 48px);
  padding: 0;
  border: 1px solid #dde3ef;
  border-radius: 14px;
  box-shadow: 0 12px 32px rgba(19, 31, 58, 0.18);
  overflow: hidden;
  color: #19233b;
}
.designer-page :deep(.advanced-config-dialog .el-dialog__header) {
  box-sizing: border-box;
  min-height: 94px;
  padding: 22px 27px 18px;
  border-bottom: 1px solid #dde3ef;
}
.designer-page :deep(.advanced-config-dialog .el-dialog__headerbtn) {
  top: 24px;
  right: 28px;
  font-size: 20px;
}
.advanced-config-heading h2 {
  margin: 0;
  font-size: 22px;
  line-height: 29px;
  color: #19233b;
}
.advanced-config-heading p {
  margin: 8px 0 0;
  color: #8c9ab1;
  font-size: 12px;
  position: relative;
  top: -1px;
}
.designer-page :deep(.advanced-config-dialog .el-dialog__body) {
  padding: 23px 27px;
}
.advanced-config-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 268px 276px;
  column-gap: 24px;
  row-gap: 24px;
}
.advanced-config-grid section {
  box-sizing: border-box;
  min-height: 0;
  height: 100%;
  border: 1px solid #dde3ef;
  border-radius: 9.5px;
  padding: 20px;
}

/* 节点13 四卡组内部元素 */
.advanced-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.advanced-card__title {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  gap: 10px;
}

.advanced-card__icon {
  flex: 0 0 22px;
  width: 22px;
  height: 22px;
  color: var(--sw-color-primary);
  font-size: 22px;
  position: relative;
  top: -2px;
}

.advanced-card__title h3 {
  flex: 1;
  position: relative;
  top: -5px;
}
.advanced-config-grid section:nth-child(n + 3) .advanced-card__title h3 {
  top: -5px;
}
.advanced-config-grid section:nth-child(2) .advanced-card__title,
.advanced-config-grid section:nth-child(4) .advanced-card__title {
  position: relative;
  left: -1px;
}

.advanced-card__badge {
  box-sizing: border-box;
  width: 82px;
  height: 24px;
  padding: 2px 9px;
  font-size: 12px;
  color: var(--sw-color-primary);
  background: #f0eaff;
  border-radius: 6px;
  position: relative;
  left: 3px;
  top: -14px;
}

.advanced-rows {
  display: grid;
  grid-template-columns: 143px 1fr;
  /* 设计（节点13）：监听器行距 51 */
  gap: 29px 18px;
  align-items: center;
  font-size: 13px;
  color: var(--sw-text-primary, #303a55);
  transform: translate(-3px, -3px);
}
.advanced-rows > :nth-child(3),
.advanced-rows > :nth-child(4) {
  position: relative;
  top: -9px;
}
.advanced-rows > :nth-child(5),
.advanced-rows > :nth-child(6) {
  position: relative;
  top: -3px;
}

.advanced-rows__cap {
  color: #8393b5;
}

.advanced-rows__bean {
  color: var(--sw-color-primary);
}

.advanced-card__note {
  margin: 12px 0 0;
  font-size: 12px;
  color: #8c99b0;
  position: relative;
  left: -3px;
  top: 0;
}

.advanced-card__add {
  margin-top: 17px;
  padding: 9px 12px;
  border: 1px solid #ccd5e5;
  border-radius: 7px;
  font-size: 13px;
  color: #303a55;
  transform: translateX(-3px);
  position: relative;
  top: -1px;
}

.advanced-chips {
  display: flex;
  gap: 8px;
}

.advanced-chips__item {
  flex: 1 1 0;
  padding: 5px 0;
  padding-left: 7px;
  box-sizing: border-box;
  text-align: left;
  font-size: 12px;
  color: var(--sw-color-primary);
  background: #f0eaff;
  border-radius: 5px;
}

.advanced-card__meta {
  margin: 10px 0 0;
  font-size: 12px;
  color: #5f6f92;
  position: relative;
  left: -3px;
}

.advanced-config-footnote {
  margin: 27px 0 0;
  font-size: 12px;
  color: #8c9ab1;
}
.advanced-config-grid h3 {
  margin: 0 0 14px;
  padding-bottom: 12px;
  border-bottom: 1px solid #ccd5e5;
  font-size: 16px;
  color: #19233b;
}
.advanced-config-grid section:nth-child(n + 3) h3 {
  margin-bottom: 1px;
}
.advanced-config-grid label {
  display: block;
  color: #8393b5;
  font-size: 12px;
  margin: 12px 0 6px;
}
.advanced-config-grid section:nth-child(2) label,
.advanced-config-grid section:nth-child(2) .static-value {
  position: relative;
  left: -3px;
  width: calc(100% + 6px);
}
.advanced-config-grid section:nth-child(2) label:first-of-type {
  top: -15px;
}
.advanced-config-grid section:nth-child(2) .static-value {
  top: -12px;
}
.advanced-config-grid section:nth-child(2) label:nth-of-type(2) {
  position: relative;
  top: -8px;
}
.advanced-config-grid section:nth-child(2) .advanced-chips {
  position: relative;
  top: -2px;
}
.advanced-config-grid section:nth-child(2) .advanced-card__meta:last-child {
  top: 1px;
}
.advanced-config-grid section:nth-child(2) .advanced-card__meta:first-of-type {
  top: -2px;
}
.advanced-config-grid section:nth-child(n + 3) .static-value + label {
  margin-top: 23px;
}
.advanced-config-grid section:nth-child(n + 3) .static-value {
  top: 2px;
}
.advanced-config-grid section:nth-child(n + 3) > label:first-of-type {
  top: -1px;
}
.advanced-config-grid section:nth-child(n + 3) .static-value + label {
  top: -2px;
}
.advanced-config-grid section:nth-child(n + 3) .static-value + label + .static-value {
  top: 1px;
}
.advanced-config-grid section:nth-child(n + 3) .advanced-card__meta {
  top: 7px;
}
.advanced-config-grid section:nth-child(n + 3) label,
.advanced-config-grid section:nth-child(n + 3) .static-value,
.advanced-config-grid section:nth-child(n + 3) .advanced-card__meta {
  position: relative;
  left: -3px;
  width: calc(100% + 6px);
}
.advanced-config-grid .static-value {
  box-sizing: border-box;
  width: 100%;
  height: 36px;
  border: 1px solid #dde3ef;
  border-radius: 6px;
  background: #fafbfe;
  color: #19233b;
  padding: 7px 10px 0;
  display: flex;
  align-items: flex-start;
  font-size: 13px;
}
.designer-page :deep(.advanced-config-dialog .el-dialog__footer) {
  padding: 0;
  border-top: 1px solid #dde3ef;
}
.advanced-config-footer {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 12px;
  height: 53px;
  box-sizing: border-box;
  padding: 0 27px;
}
.advanced-config-footer :deep(.el-button) {
  height: 36px;
  min-width: 88px;
  border: 1px solid #cbd6e8;
  border-radius: 6px;
  background: #fff;
  color: #344164;
  position: relative;
  top: 7.5px;
  font-size: 14px;
  line-height: 17px;
}
.advanced-config-footer :deep(.advanced-config-save) {
  width: 110px;
  min-width: 110px;
}
.advanced-config-footer :deep(.el-button > span) {
  position: relative;
  top: -3px;
}
.advanced-config-footer :deep(.el-button:first-child > span) {
  position: relative;
  left: 11.5px;
}
@media (max-height: 980px) {
  .designer-page :deep(.advanced-config-dialog) {
    --el-dialog-margin-top: 40px;
  }
}

/* ── P53 节点12：审批人候选弹窗（容器层几何覆盖，不改组件 script） ── */
.approver-dialog-host :deep(.el-dialog) {
  --el-dialog-width: min(1018px, calc(100vw - 40px)) !important;
  padding: 0;
  border: 1px solid #dde3ef;
  border-radius: 14px;
  box-shadow: 0 12px 32px rgba(19, 31, 58, 0.18);
  overflow: hidden;
  color: #19233b;
}
.approver-dialog-host :deep(.el-dialog__header) {
  box-sizing: border-box;
  min-height: 94px;
  padding: 24px 28px 18px;
  border-bottom: 1px solid #dde3ef;
}
.approver-dialog-host :deep(.el-dialog__title) {
  font-size: 22px;
  color: #19233b;
}
.approver-dialog-host :deep(.el-dialog__headerbtn) {
  top: 24px;
  right: 28px;
  font-size: 20px;
}
.approver-dialog-host :deep(.el-dialog__body) {
  padding: 16px 28px 24px;
}
/* 搜索框：设计 36px 高 / #FBFCFF 底 / #CBD6E8 描边 */
.approver-dialog-host :deep(.el-input__wrapper) {
  background: #fbfcff;
  border-radius: 6px;
  box-shadow: 0 0 0 1px #cbd6e8 inset;
}
.approver-dialog-host :deep(.el-input__inner) {
  height: 36px;
  color: #19233b;
}
/* 候选列表：卡片化行（60px 行高、奇数行 #FAF5FF），设计稿无列头 */
.approver-dialog-host :deep(.el-table__header-wrapper) {
  display: none;
}
.approver-dialog-host :deep(.el-table td.el-table__cell) {
  padding: 14px 0;
  border-bottom: 1px solid #eef1f8;
}
.approver-dialog-host :deep(.el-table__row:nth-child(odd) .el-table__cell) {
  background-color: #faf5ff;
}
.approver-dialog-host :deep(.el-table .el-table__cell) {
  color: #344164;
}
.approver-dialog-host :deep(.el-table .el-button.is-link) {
  color: #6f2dff;
}
.approver-dialog-host :deep(.approver-picker__empty),
.approver-dialog-host :deep(.approver-picker__note) {
  color: #8393b5;
}
.approver-dialog-host :deep(.approver-picker__picked) {
  color: #6f2dff;
}

/*
 * Element Plus 将候选人弹窗 teleport 到 body；因此容器前缀选择器不能
 * 覆盖传送后的根节点。节点 12 的结构尺寸必须直接落在实际弹窗上。
 */
:global(.el-dialog.approver-dialog) {
  width: 1020px !important;
  height: 732px !important;
  margin-top: 146px !important;
  box-sizing: border-box;
  padding: 0 !important;
  border: 1px solid #dde3ef;
  border-radius: 14px;
  box-shadow: 0 12px 32px rgba(19, 31, 58, 0.18);
  overflow: hidden;
  color: #19233b;
}
:global(.el-dialog.approver-dialog .el-dialog__header) {
  box-sizing: border-box;
  height: 96px;
  min-height: 96px;
  padding: 22px 27px 18px;
  border-bottom: 1px solid #dde3ef;
}
:global(.el-dialog.approver-dialog .el-dialog__headerbtn) {
  top: 24px;
  right: 28px;
  font-size: 20px;
}
:global(.el-dialog.approver-dialog .el-dialog__body) {
  padding: 16px 27px 16px;
}
:global(.el-dialog.approver-dialog .el-dialog__footer) {
  box-sizing: border-box;
  padding: 20px 27px 12px;
  border-top: 1px solid #dde3ef;
}
:global(.el-dialog.approver-dialog .approver-dialog__tabs) {
  position: relative;
  top: -3px;
  margin-left: 0;
  margin-bottom: 23px;
}
:global(.el-dialog.approver-dialog .approver-dialog__tab) {
  min-width: 102px;
}
:global(.el-dialog.approver-dialog .approver-pane__workspace) {
  position: relative;
  top: 8px;
  left: 0;
}
:global(.el-dialog.approver-dialog .approver-dialog__footnote) {
  position: relative;
  top: 5px;
  left: -2px;
}
:global(.el-dialog.approver-dialog .approver-dialog__panes) {
  grid-template-columns: 236px 406px 290px;
  gap: 16px;
}
:global(.el-dialog.approver-dialog .approver-pane) {
  padding: 17px 15px 14px;
}
:global(.el-dialog.approver-dialog .approver-pane__workspace) {
  top: 8px;
}
:global(.el-dialog.approver-dialog .approver-pane--tree .el-tree) {
  margin-top: 22.5px;
  margin-left: -8px;
}
:global(.el-dialog.approver-dialog .el-tree-node__content) {
  height: 36px;
}
:global(.el-dialog.approver-dialog .approver-pane--list .approver-pane__rows) {
  margin-top: 18px;
}
:global(.el-dialog.approver-dialog .approver-pane--list .approver-user) {
  width: calc(100% + 8px);
  margin-left: -4px;
}
:global(.el-dialog.approver-dialog .approver-pane--list .approver-user__body) {
  position: relative;
  left: 4px;
  top: -2.5px;
}
:global(.el-dialog.approver-dialog .approver-pane--list .approver-user__body b) {
  position: relative;
  top: -4px;
}
:global(.el-dialog.approver-dialog .approver-pane--list .el-input__inner) {
  position: relative;
  left: -11px;
  width: calc(100% + 11px);
  padding-left: 12px !important;
}
:global(.el-dialog.approver-dialog .approver-user) {
  height: 60px;
  box-sizing: border-box;
  margin-bottom: 8px;
  gap: 12px;
}
:global(.el-dialog.approver-dialog .approver-user__avatar) {
  width: 26px;
  height: 26px;
  font-size: 26px;
}
:global(.el-dialog.approver-dialog .approver-picked) {
  height: 60px;
  box-sizing: border-box;
  margin-bottom: 14px;
  gap: 16px;
}
:global(.el-dialog.approver-dialog .approver-picked .approver-user__avatar) {
  width: 24px;
  height: 24px;
  font-size: 24px;
}
:global(.el-dialog.approver-dialog .approver-picked > .el-button) {
  position: relative;
  left: 10px;
  top: -2px;
}
:global(.el-dialog.approver-dialog .approver-pane--picked .approver-pane__title) {
  margin-bottom: 24px;
}
:global(.el-dialog.approver-dialog .approver-dialog__footer > .el-button:first-child) {
  width: 88px;
}
:global(.el-dialog.approver-dialog .approver-dialog__confirm) {
  width: 108px;
  min-width: 108px;
}
:global(.el-dialog.approver-dialog .approver-dialog__confirm > span) {
  white-space: nowrap;
}
:global(.el-dialog.approver-dialog .approver-dialog__footer > .el-button + .el-button) {
  margin-left: 0;
}
:global(.el-dialog.approver-dialog .approver-dialog__footer > .el-button > span) {
  position: relative;
  top: -2px;
}

/* ─────────── P64 阶段Ⅰ：节点表单绑定 / 变量 / 触发器 ─────────── */
.nodeform-row {
  display: flex;
  gap: 8px;
  width: 100%;
}
/* 0.1.7 #36（Owner）：值框占满整行、动作按钮靠右定宽（不再出现「窄框 + 悬浮按钮」） */
.nodeform-row :deep(.el-input) {
  flex: 1;
  min-width: 0;
}
.nodeform-row :deep(.el-button) {
  flex: none;
  margin: 0;
}
.p64-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}
/* P64 宽/矮视口可达性（审查02 P1-03b）：弹窗不超出视口，内容区滚动，
   关闭/保存/映射等控件在大变量与多分支配置下仍可到达。append-to-body 传送后
   弹窗不带 scoped 属性，规则见文件末尾的全局样式块。 */
.p64-hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.p64-subtitle {
  font-size: 13px;
  font-weight: 600;
  color: #7e306b;
}
/* BF20261013-021：脚本内置函数参考（触发器判断脚本下方） */
.script-help {
  margin: -6px 0 10px;
  padding: 8px 10px;
  border-radius: 6px;
  background: #f6f4fb;
  border: 1px solid #e8e3f5;
}
.script-help__title {
  margin: 0 0 4px;
  font-size: 12px;
  color: #5b5470;
  line-height: 18px;
}
.script-help__item {
  margin: 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 18px;
}
.script-help__item code {
  color: #6d5bd0;
}
.p64-table {
  width: 100%;
}
.p64-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  column-gap: 16px;
}
/* BF20261013-027：子流程向导初始值行（字段/取值方式/取值/删除 一行三列） */
.subflow-mapping-row {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) 130px minmax(200px, 1.2fr) 44px;
  column-gap: 12px;
  align-items: start;
}
.p64-branch-card,
.p64-action-card {
  border: 1px solid var(--el-border-color-lighter, #e4e7ed);
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 12px;
}
.p64-errors {
  margin: 8px 0;
  color: var(--el-color-danger, #f56c6c);
  font-size: 12px;
}
.p64-errors p {
  margin: 2px 0;
}
</style>

<!-- P64 弹窗可达性全局规则：append-to-body 传送后不带 scoped 属性，需全局选择器。 -->
<style>
.el-dialog.p64-dialog {
  display: flex;
  flex-direction: column;
  max-height: 88vh;
  margin-top: 6vh;
  margin-bottom: 6vh;
}
.el-dialog.p64-dialog .el-dialog__body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}
</style>
